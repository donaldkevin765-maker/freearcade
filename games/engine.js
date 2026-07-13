/**
 * FreeArcade Game Engine — lightweight retro game framework
 * Provides: game loop, input, canvas rendering, simple audio, level system
 */
window.FreeArcadeEngine = (function () {
  'use strict';

  var canvas, ctx, W, H;

  // ── Input ──
  var keys = {};
  var keysJustPressed = {};
  var _prevKeys = {};

  function onKeyDown(e) {
    keys[e.code] = true;
    e.preventDefault();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    e.preventDefault();
  }

  // Touch → directional mapping
  var touchStartX = 0, touchStartY = 0;
  var touchDir = null;
  var touchJustTapped = false;
  var _prevTouchDir = null;

  function onTouchStart(e) {
    var t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchDir = null;
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

  // ── Audio (simple beep via Web Audio) ──
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playBeep(freq, duration, type, volume) {
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  }

  function playShoot()   { playBeep(800, 0.08, 'square', 0.08); }
  function playHit()     { playBeep(300, 0.15, 'sawtooth', 0.1); }
  function playExplode() { playBeep(100, 0.3, 'sawtooth', 0.15); }
  function playLevelUp() { playBeep(600, 0.1, 'square', 0.08); setTimeout(function() { playBeep(800, 0.1, 'square', 0.08); }, 100); setTimeout(function() { playBeep(1000, 0.15, 'square', 0.08); }, 200); }
  function playGameOver(){ playBeep(200, 0.3, 'sawtooth', 0.12); setTimeout(function() { playBeep(150, 0.4, 'sawtooth', 0.12); }, 300); }
  function playCoin()    { playBeep(1200, 0.06, 'square', 0.06); setTimeout(function() { playBeep(1600, 0.08, 'square', 0.06); }, 70); }

  // ── Rendering utilities ──
  function clear(color) {
    ctx.fillStyle = color || '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color || '#fff';
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function rectStroke(x, y, w, h, color, lw) {
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = lw || 2;
    ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(txt, x, y, size, color, align) {
    ctx.font = (size || 14) + 'px "Press Start 2P", monospace';
    ctx.fillStyle = color || '#fff';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(txt, Math.round(x), Math.round(y));
  }

  function textShadow(txt, x, y, size, color, shadowColor) {
    text(txt, x+2, y+2, size, shadowColor || 'rgba(0,0,0,0.5)');
    text(txt, x, y, size, color || '#fff');
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color || '#fff';
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Game module system ──
  var currentGame = null;
  var animFrameId = null;
  var lastTime = 0;
  var running = false;

  // Level tracking
  var _level = 1;
  var _score = 0;
  var _lives = 3;
  var _levelCallbacks = {};

  function getLevel() { return _level; }
  function setLevel(l) { _level = l; }
  function getScore() { return _score; }
  function addScore(pts) { _score += pts; }
  function setScore(s) { _score = s; }
  function getLives() { return _lives; }
  function setLives(l) { _lives = l; }
  function addLife() { _lives++; }
  function loseLife() { _lives--; return _lives >= 0; }

  function onLevelCleared(cb) { _levelCallbacks.onLevelCleared = cb; }
  function onGameOver(cb) { _levelCallbacks.onGameOver = cb; }
  function triggerLevelCleared() { if (_levelCallbacks.onLevelCleared) _levelCallbacks.onLevelCleared(_level); }
  function triggerGameOver() { if (_levelCallbacks.onGameOver) _levelCallbacks.onGameOver(_score); }

  var _canvasId = 'canvas';

  function loadGame(gameModule) {
    if (currentGame && currentGame.destroy) currentGame.destroy();
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
        circle: circle,
        playShoot: playShoot,
        playHit: playHit,
        playExplode: playExplode,
        playLevelUp: playLevelUp,
        playGameOver: playGameOver,
        playCoin: playCoin,
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
        playBeep: playBeep,
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

    keysJustPressed = {};
    for (var k in keys) {
      if (keys[k] && !_prevKeys[k]) keysJustPressed[k] = true;
    }
    _prevKeys = Object.assign({}, keys);

    var hadTap = touchJustTapped;
    var hadTouchDir = touchDir;
    touchJustTapped = false;

    if (currentGame && currentGame.update) {
      currentGame.update(dt, {
        keys: keys,
        keysPressed: keysJustPressed,
        touchDir: hadTouchDir,
        touchTapped: hadTap,
        left: keys['ArrowLeft'] || keys['KeyA'],
        right: keys['ArrowRight'] || keys['KeyD'],
        up: keys['ArrowUp'] || keys['KeyW'],
        down: keys['ArrowDown'] || keys['KeyS'],
        action: keysJustPressed['Space'] || keysJustPressed['Enter'] || hadTap,
        escape: keysJustPressed['Escape'],
      });
    }

    if (currentGame && currentGame.render) {
      currentGame.render(ctx);
    }
  }

  function init(canvasId) {
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
  }

  function destroy() {
    stopLoop();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    if (currentGame && currentGame.destroy) currentGame.destroy();
    currentGame = null;
  }

  return {
    init: init,
    destroy: destroy,
    loadGame: loadGame,
    startLoop: startLoop,
    stopLoop: stopLoop,
  };
})();
