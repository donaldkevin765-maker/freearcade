/**
 * FreeArcade Game Engine — lightweight retro game framework
 * Provides: game loop, input, canvas rendering, simple audio, level system, screen shake, pause
 *
 * Performance design:
 *  - Single requestAnimationFrame loop with clamped delta (max 50ms)
 *  - Particle/object array cleanup via splice on reverse iteration
 *  - Audio context resumed on first user gesture (Chrome autoplay policy)
 *  - Canvas cleared per frame, no stacking or stale pixels
 */
window.FreeArcadeEngine = (function () {
  'use strict';

  var canvas, ctx, W, H;
  var _listenersAttached = false;
  var _audioResumed = false;

  // ── Input ──
  var keys = {};
  var keysJustPressed = {};
  var _prevKeys = {};

  function onKeyDown(e) {
    if (!keys[e.code]) {
      keysJustPressed[e.code] = true;
    }
    keys[e.code] = true;
    e.preventDefault();
    _resumeAudio();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    e.preventDefault();
  }

  // Touch → directional mapping
  var touchStartX = 0, touchStartY = 0;
  var touchDir = null;
  var touchJustTapped = false;

  function onTouchStart(e) {
    var t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchDir = null;
    _resumeAudio();
  }
  function onTouchEnd(e) {
    if (touchDir === null) touchJustTapped = true;
    touchDir = null;
  }
  function onTouchMove(e) {
    var t = e.touches[0];
    var dx = t.clientX - touchStartX;
    var dy = t.clientY - touchStartY;
    var threshold = 20;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      if (Math.abs(dx) > Math.abs(dy)) {
        touchDir = dx > 0 ? 'right' : 'left';
      } else {
        touchDir = dy > 0 ? 'down' : 'up';
      }
    }
  }

  // ── Audio ──
  var audioCtx = null;

  function _resumeAudio() {
    if (!_audioResumed && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
      _audioResumed = true;
    }
  }

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return audioCtx;
  }

  function playBeep(freq, duration, type, volume) {
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      // Slight random pitch variation for more organic sound
      var pFreq = freq * (0.95 + Math.random() * 0.1);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(pFreq, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  // Predefined sounds with slight randomization for richness
  var _soundDefs = {
    shoot:    { freq: 800,  dur: 0.08, type: 'square', vol: 0.08 },
    hit:      { freq: 300,  dur: 0.12, type: 'sawtooth', vol: 0.10 },
    explode:  { freq: 120,  dur: 0.30, type: 'sawtooth', vol: 0.14 },
    powerup:  { freq: 900,  dur: 0.08, type: 'square', vol: 0.07 },
    coin:     { freq: 1200, dur: 0.06, type: 'square', vol: 0.06 },
    blip:     { freq: 500,  dur: 0.04, type: 'square', vol: 0.05 },
    warning:  { freq: 400,  dur: 0.10, type: 'square', vol: 0.07 },
  };

  function playSound(name) {
    var s = _soundDefs[name];
    if (!s) { playBeep(440, 0.1, 'square', 0.05); return; }
    playBeep(s.freq, s.dur, s.type, s.vol);
  }

  function playShoot()   { playSound('shoot'); }
  function playHit()     { playSound('hit'); }
  function playExplode() { playSound('explode'); }
  function playPowerup() { playSound('powerup'); setTimeout(function () { playBeep(1400, 0.08, 'square', 0.06); }, 80); }
  function playLevelUp() { playBeep(600, 0.10, 'square', 0.08); setTimeout(function () { playBeep(800, 0.10, 'square', 0.08); }, 120); setTimeout(function () { playBeep(1000, 0.15, 'square', 0.08); }, 240); }
  function playGameOver(){ playBeep(200, 0.30, 'sawtooth', 0.12); setTimeout(function () { playBeep(150, 0.40, 'sawtooth', 0.12); }, 320); }
  function playCoin()    { playBeep(1200, 0.06, 'square', 0.06); setTimeout(function () { playBeep(1600, 0.08, 'square', 0.06); }, 70); }

  // ── Screen Shake ──
  var _shakeIntensity = 0;
  var _shakeDuration = 0;
  var _shakeX = 0, _shakeY = 0;

  function shake(intensity, duration) {
    _shakeIntensity = intensity || 4;
    _shakeDuration = duration || 0.2;
  }

  function _updateShake(dt) {
    if (_shakeDuration > 0) {
      _shakeDuration -= dt;
      _shakeX = (Math.random() - 0.5) * _shakeIntensity * 2;
      _shakeY = (Math.random() - 0.5) * _shakeIntensity * 2;
      if (_shakeDuration <= 0) {
        _shakeIntensity = 0;
        _shakeX = 0;
        _shakeY = 0;
      }
    }
  }

  // ── Pause ──
  var _paused = false;
  var _pauseCooldown = 0;

  function isPaused() { return _paused; }

  // ── Rendering utilities ──
  function clear(color) {
    ctx.fillStyle = color || '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color || '#fff';
    ctx.fillRect((x + _shakeX) | 0, (y + _shakeY) | 0, w | 0, h | 0);
  }

  function rectStroke(x, y, w, h, color, lw) {
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = lw || 2;
    ctx.strokeRect((x + _shakeX) | 0, (y + _shakeY) | 0, w | 0, h | 0);
  }

  function text(txt, x, y, size, color, align) {
    ctx.font = (size || 14) + 'px "Press Start 2P", monospace';
    ctx.fillStyle = color || '#fff';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(txt, (x + _shakeX) | 0, (y + _shakeY) | 0);
  }

  function textShadow(txt, x, y, size, color, shadowColor) {
    text(txt, x + 2, y + 2, size, shadowColor || 'rgba(0,0,0,0.5)');
    text(txt, x, y, size, color || '#fff');
  }

  function textCenter(txt, x, y, size, color) {
    text(txt, x, y, size, color, 'center');
  }

  function textCenterShadow(txt, x, y, size, color, shadowColor) {
    text(txt, x + 2, y + 2, size, shadowColor || 'rgba(0,0,0,0.6)', 'center');
    text(txt, x, y, size, color || '#fff', 'center');
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color || '#fff';
    ctx.beginPath();
    ctx.arc((x + _shakeX) | 0, (y + _shakeY) | 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Particle system helper (lightweight) ──
  var MAX_PARTICLES = 300;

  function emitParticles(list, x, y, color, count, opts) {
    if (!list) return;
    opts = opts || {};
    var speedMin = opts.speedMin || 30;
    var speedMax = opts.speedMax || 120;
    var sizeMin = opts.sizeMin || 2;
    var sizeMax = opts.sizeMax || 5;
    var lifeMin = opts.lifeMin || 0.3;
    var lifeMax = opts.lifeMax || 0.5;
    var count2 = Math.min(count || 10, MAX_PARTICLES - list.length);
    for (var i = 0; i < count2; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = speedMin + Math.random() * (speedMax - speedMin);
      list.push({
        x: x, y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 20, // slight upward bias
        life: lifeMin + Math.random() * (lifeMax - lifeMin),
        maxLife: lifeMax,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: color || '#ff6600'
      });
    }
  }

  function updateParticles(list, dt) {
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.life -= dt;
      p.size *= 0.97;
      if (p.life <= 0 || p.size < 0.3) {
        list.splice(i, 1);
      }
    }
  }

  function drawParticles(ctx, list) {
    var len = list.length;
    if (len === 0) return;
    for (var i = 0; i < len; i++) {
      var p = list[i];
      var alpha = Math.max(0, p.life / p.maxLife);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      var px = (p.x + _shakeX) | 0;
      var py = (p.y + _shakeY) | 0;
      var s = p.size | 0;
      ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ── Game module system ──
  var currentGame = null;
  var animFrameId = null;
  var lastTime = 0;
  var running = false;

  var _level = 1;
  var _score = 0;
  var _lives = 3;
  var _levelCallbacks = {};

  function getLevel()   { return _level; }
  function setLevel(l)  { _level = l; }
  function getScore()   { return _score; }
  function addScore(p)  { _score += p; }
  function setScore(s)  { _score = s; }
  function getLives()   { return _lives; }
  function setLives(l)  { _lives = l; }
  function addLife()    { _lives++; }
  function loseLife()   { _lives--; return _lives >= 0; }

  function onLevelCleared(cb) { _levelCallbacks.onLevelCleared = cb; }
  function onGameOver(cb)     { _levelCallbacks.onGameOver = cb; }
  function triggerLevelCleared() { if (_levelCallbacks.onLevelCleared) _levelCallbacks.onLevelCleared(_level); }
  function triggerGameOver()     { if (_levelCallbacks.onGameOver) _levelCallbacks.onGameOver(_score); }

  var _canvasId = 'canvas';

  function loadGame(gameModule) {
    if (currentGame && currentGame.destroy) {
      try { currentGame.destroy(); } catch (e) {}
    }
    stopLoop();

    canvas = document.getElementById(_canvasId);
    if (!canvas) return console.error('Canvas not found');
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;

    _level = 1;
    _score = 0;
    _lives = 3;
    _levelCallbacks = {};
    _paused = false;
    _pauseCooldown = 0;
    _shakeIntensity = 0;
    _shakeDuration = 0;
    _shakeX = 0;
    _shakeY = 0;
    currentGame = null;

    if (gameModule && gameModule.init) {
      currentGame = gameModule;
      gameModule.engine = {
        W: W, H: H,
        clear: clear,
        rect: rect,
        rectStroke: rectStroke,
        text: text,
        textShadow: textShadow,
        textCenter: textCenter,
        textCenterShadow: textCenterShadow,
        circle: circle,
        playShoot: playShoot,
        playHit: playHit,
        playExplode: playExplode,
        playLevelUp: playLevelUp,
        playGameOver: playGameOver,
        playCoin: playCoin,
        playPowerup: playPowerup,
        playBeep: playBeep,
        playSound: playSound,
        getLevel: getLevel,
        setLevel: setLevel,
        getScore: getScore,
        addScore: addScore,
        setScore: setScore,
        getLives: getLives,
        setLives: setLives,
        addLife: addLife,
        loseLife: loseLife,
        onLevelCleared: onLevelCleared,
        onGameOver: onGameOver,
        triggerLevelCleared: triggerLevelCleared,
        triggerGameOver: triggerGameOver,
        emitParticles: emitParticles,
        updateParticles: updateParticles,
        drawParticles: drawParticles,
        isPaused: isPaused,
        shake: shake,
      };
      gameModule.init();
    }
    startLoop();
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    loop(lastTime);
  }

  function stopLoop() {
    running = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function loop(now) {
    if (!running) return;
    animFrameId = requestAnimationFrame(loop);

    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Compute just-pressed keys (delta from previous frame)
    keysJustPressed = {};
    for (var k in keys) {
      if (keys[k] && !_prevKeys[k]) keysJustPressed[k] = true;
    }
    _prevKeys = {};
    for (var k in keys) {
      _prevKeys[k] = keys[k];
    }

    var hadTap = touchJustTapped;
    touchJustTapped = false;

    // ── Pause toggle ──
    _pauseCooldown -= dt;
    if (keysJustPressed['KeyP'] && _pauseCooldown <= 0) {
      _paused = !_paused;
      _pauseCooldown = 0.3;
    }

    // ── Build input frame ──
    var input = {
      keys: keys,
      keysPressed: keysJustPressed,
      touchDir: touchDir,
      touchTapped: hadTap,
      left:  keys['ArrowLeft']  || keys['KeyA'],
      right: keys['ArrowRight'] || keys['KeyD'],
      up:    keys['ArrowUp']    || keys['KeyW'],
      down:  keys['ArrowDown']  || keys['KeyS'],
      action: keysJustPressed['Space'] || keysJustPressed['Enter'] || hadTap,
      escape: keysJustPressed['Escape'],
    };

    // ── Clear canvas ──

    if (currentGame && currentGame.update && !_paused) {
      currentGame.update(dt, input);
    }

    // Update shake even when paused (so it decays)
    _updateShake(dt);

    if (currentGame && currentGame.render) {
      if (_paused) {
        // Render game state behind pause overlay
        currentGame.render(ctx);
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        textCenterShadow('PAUSED', W / 2, H / 2 - 20, 18, '#ffcc00', '#000');
        textCenter('P to resume', W / 2, H / 2 + 25, 9, 'rgba(255,255,255,0.5)');
      } else {
        currentGame.render(ctx);
      }
    } else if (!currentGame) {
      // No game loaded
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);
      textCenter('Select a game to play', W / 2, H / 2 - 10, 10, '#555');
    }
  }

  function init(canvasId) {
    if (_listenersAttached) return; // prevent double-wiring
    _canvasId = canvasId || 'canvas';
    canvas = document.getElementById(_canvasId);
    if (!canvas) return console.error('Canvas element not found');
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    _listenersAttached = true;

    // Pre-warm audio context (will be suspended, resumed on first gesture)
    getAudioCtx();
  }

  function destroy() {
    stopLoop();
    if (_listenersAttached) {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchend', onTouchEnd);
        canvas.removeEventListener('touchmove', onTouchMove);
      }
      _listenersAttached = false;
    }
    if (currentGame && currentGame.destroy) {
      try { currentGame.destroy(); } catch (e) {}
    }
    currentGame = null;
    _audioResumed = false;
  }

  return {
    init: init,
    destroy: destroy,
    loadGame: loadGame,
    startLoop: startLoop,
    stopLoop: stopLoop,
  };
})();
