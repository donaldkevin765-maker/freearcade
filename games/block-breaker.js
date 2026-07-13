/**
 * Block Breaker — breakout with chain reactions, special bricks & creative powerups
 *
 * Creative twists:
 *  - Chain reaction: destroying a brick can chain to adjacent same-color bricks
 *  - Special bricks: ice (slippery), fire (shoots back), gem (powerup), gold (score), bomb (explodes)
 *  - Creative powerups: piercing, black hole, laser paddle, chaos
 *  - Animated background with scrolling starfield
 *
 * 8 procedural generators rotate infinitely for unique levels every time.
 */
(function () {
  'use strict';

  var E;
  var paddle, balls, bricks, powerups, particles, bgStars;
  var state, level, comboCount;
  var hasCatchBall = false;
  var fireBallActive = false;
  var scoreMultiplier = 1;
  var totalBricksDestroyed = 0;
  var piercingActive = false;
  var blackHoleActive = false;
  var blackHoleX = 0, blackHoleY = 0, blackHoleTimer = 0;
  var laserCooldown = 0;
  var paddleSlipperyTimer = 0;
  var playTime = 0;

  var COLS = 8, BRICK_W = 50, BRICK_H = 20, GAP = 5;
  var OFFSET_X = 14, OFFSET_Y = 35, PADDLE_Y = 360;

  // ── Generator array (same 8 patterns) ──
  var generators = [
    function(lvl) { return fillRows(lvl); },
    function(lvl) { return diamondPattern(lvl); },
    function(lvl) { return checkerPattern(lvl); },
    function(lvl) { return fortressPattern(lvl); },
    function(lvl) { return stripePattern(lvl); },
    function(lvl) { return ringPattern(lvl); },
    function(lvl) { return scatteredPattern(lvl); },
    function(lvl) { return pyramidPattern(lvl); },
  ];

  function fillRows(lvl) {
    var bricks = [], rows = Math.min(3 + Math.floor(lvl/2), 7);
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++) bricks.push(makeBrick(c, r, lvl));
    return bricks;
  }
  function diamondPattern(lvl) {
    var bricks = [], rows = Math.min(5, 3 + Math.floor(lvl/3)), mid = Math.floor(rows/2);
    for (var r = 0; r < rows; r++) {
      var offset = Math.abs(mid - r), count = COLS - offset * 2;
      if (count > 0) for (var c = 0; c < count; c++) bricks.push(makeBrick(offset + c, r, lvl));
    }
    return bricks;
  }
  function checkerPattern(lvl) {
    var bricks = [], rows = Math.min(4 + Math.floor(lvl/2), 7);
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++)
      if ((r + c) % 2 === 0) bricks.push(makeBrick(c, r, lvl));
    return bricks;
  }
  function fortressPattern(lvl) {
    var bricks = [], rows = Math.min(5 + Math.floor(lvl/2), 7);
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++) {
      if (r === 0 || r === rows-1 || c === 0 || c === COLS-1) bricks.push(makeBrick(c, r, lvl, 'steel'));
    }
    for (var r2 = 2; r2 < rows-2 && r2 < 5; r2++)
      for (var c2 = 2; c2 < COLS-2; c2++) bricks.push(makeBrick(c2, r2, lvl));
    return bricks;
  }
  function stripePattern(lvl) {
    var bricks = [], rows = Math.min(4 + Math.floor(lvl/2), 7);
    for (var c = 0; c < COLS; c++) {
      for (var r = 0; r < rows; r++) {
        var b = makeBrick(c, r, lvl);
        if (c % 3 === 0) { b.hp = Math.min(lvl*2, 5); b.maxHp = b.hp; b.type = 'steel'; b.color = '#6666aa'; }
        bricks.push(b);
      }
    }
    return bricks;
  }
  function ringPattern(lvl) {
    var bricks = [], rows = Math.min(5 + Math.floor(lvl/2), 7);
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++)
      if (r === 0 || r === rows-1 || c === 0 || c === COLS-1 || r === 2 || r === 3 || c === 3 || c === 4)
        bricks.push(makeBrick(c, r, lvl));
    return bricks;
  }
  function scatteredPattern(lvl) {
    var bricks = [], rows = Math.min(4 + Math.floor(lvl/2), 7);
    var clusters = 3 + Math.floor(lvl/2);
    for (var cl = 0; cl < clusters; cl++) {
      var cr = 1 + Math.floor(Math.random() * (rows-2));
      var cc = 1 + Math.floor(Math.random() * (COLS-2));
      var sz = 1 + Math.floor(Math.random() * 2);
      for (var dr = -sz; dr <= sz; dr++) for (var dc = -sz; dc <= sz; dc++) {
        var r = cr+dr, c = cc+dc;
        if (r >= 0 && r < rows && c >= 0 && c < COLS && Math.random() < 0.7)
          bricks.push(makeBrick(c, r, lvl));
      }
    }
    return bricks;
  }
  function pyramidPattern(lvl) {
    var bricks = [], rows = Math.min(5 + Math.floor(lvl/2), 7);
    for (var r = 0; r < rows; r++) {
      var count = COLS - r * 2;
      if (count > 0) for (var c = 0; c < count; c++) {
        var b = makeBrick(r + c, r, lvl);
        if (r === 0) b.hp = Math.min(3, lvl);
        bricks.push(b);
      }
    }
    return bricks;
  }

  // ── Brick types ──
  var SPECIAL_TYPES = {
    normal: { weight: 60 },
    ice:    { weight: 8,  color: '#88ddff', label: 'ICE' },
    fire:   { weight: 8,  color: '#ff6622', label: 'FIRE' },
    gem:    { weight: 6,  color: '#ff44ff', label: 'GEM' },
    gold:   { weight: 5,  color: '#ffdd00', label: 'GOLD' },
    bomb:   { weight: 7,  color: '#ff3300', label: 'BOMB' },
    gravity:{ weight: 6,  color: '#6644ff', label: 'GRV' },
  };

  function pickSpecialType(lvl) {
    var r = Math.random() * 100;
    var cumulative = 0;
    for (var key in SPECIAL_TYPES) {
      var t = SPECIAL_TYPES[key];
      var w = t.weight + (key === 'ice' && lvl > 3 ? 5 : 0) + (key === 'fire' && lvl > 5 ? 5 : 0) + (key === 'gold' && lvl > 3 ? 3 : 0);
      cumulative += w;
      if (r < cumulative) return { id: key, color: t.color || '#fff', label: t.label || '' };
    }
    return { id: 'normal', color: '#fff', label: '' };
  }

  function makeBrick(col, row, level, forcedType) {
    var hp = 1;
    if (level > 3) hp = 1 + Math.floor(Math.random() * Math.min(level - 2, 4));
    hp = Math.min(hp, 5);

    var special = null;
    if (!forcedType && level > 2 && Math.random() < 0.25) {
      special = pickSpecialType(level);
    }
    if (forcedType === 'steel') {
      special = { id: 'steel', color: '#666688', label: 'STL' };
      hp = Math.min(3 + Math.floor(level/4), 8);
    }

    if (special && special.id === 'gold') hp = Math.min(hp + 2, 6);
    if (special && special.id === 'bomb') hp = 1;

    var color = special ? special.color : (function() {
      var hues = [0, 30, 60, 180, 240, 300, 360];
      return 'hsl(' + hues[col % hues.length] + ', 70%, ' + (45 + row * 5) + '%)';
    })();

    return {
      x: OFFSET_X + col * (BRICK_W + GAP), y: OFFSET_Y + row * (BRICK_H + GAP),
      w: BRICK_W, h: BRICK_H, hp: hp, maxHp: hp, color: color,
      type: special ? special.id : 'normal', label: special ? special.label : '',
      row: row, col: col,
    };
  }

  function init() {
    E = this.engine;
    level = E.getLevel();
    if (level < 1) level = 1;

    paddle = { x: 200, y: PADDLE_Y, w: 80, h: 12, vx: 0 };
    balls = [{ x: 240, y: PADDLE_Y - 6, r: 6, vx: 170, vy: -230, stuckOnPaddle: true, trail: [], fire: false }];
    bricks = generateLevel(level);
    powerups = [];
    particles = [];
    bgStars = [];

    for (var i = 0; i < 40; i++) {
      bgStars.push({ x: Math.random() * 480, y: Math.random() * 400, speed: 10 + Math.random() * 40, size: 0.5 + Math.random() * 2 });
    }

    state = 'ready';
    comboCount = 0;
    hasCatchBall = false;
    fireBallActive = false;
    scoreMultiplier = 1 + Math.floor(level / 10) * 0.5;
    totalBricksDestroyed = 0;
    piercingActive = false;
    blackHoleActive = false;
    laserCooldown = 0;
    paddleSlipperyTimer = 0;
    playTime = 0;

    E.setScore(0);
    E.setLives(3);
  }

  var POWERUP_TYPES = [
    { id: 'wide',  label: 'W', color: '#00ff88', desc: 'Wide Paddle' },
    { id: 'slow',  label: 'S', color: '#4488ff', desc: 'Slow Ball' },
    { id: 'multi', label: 'M', color: '#cc44ff', desc: 'Split Ball' },
    { id: 'fire',  label: 'F', color: '#ff4444', desc: 'Fire Ball' },
    { id: 'catch', label: 'C', color: '#ffdd00', desc: 'Catch' },
    { id: 'pierce',label: 'P', color: '#44ffaa', desc: 'Piercing' },
    { id: 'black', label: 'B', color: '#2222aa', desc: 'Black Hole' },
    { id: 'chaos', label: 'X', color: '#ff88ff', desc: 'Chaos' },
    { id: 'laser', label: 'L', color: '#ff4444', desc: 'Laser Paddle' },
  ];

  function spawnPowerup(x, y) {
    if (Math.random() > 0.13) return;
    var type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({ x: x - 12, y: y, w: 24, h: 14, vy: 90, type: type.id, label: type.label, color: type.color, desc: type.desc });
  }

  function splitBall(b) {
    for (var a = -30; a <= 30; a += 60) {
      if (a === 0) continue;
      var rad = a * Math.PI / 180;
      var spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
      balls.push({
        x: b.x, y: b.y, r: 6,
        vx: spd * Math.cos(Math.atan2(b.vy, b.vx) + rad),
        vy: spd * Math.sin(Math.atan2(b.vy, b.vx) + rad),
        stuckOnPaddle: false, trail: [], fire: b.fire || false,
      });
    }
  }

  function generateLevel(lvl) {
    var idx = Math.max(0, (lvl - 1) % generators.length);
    return generators[idx](lvl);
  }

  // ── Chain reaction flood-fill ──
  function chainReaction(brick, idx) {
    if (!brick || brick.type === 'steel') return 0;
    var count = 1;
    bricks.splice(idx, 1);
    // Flood fill to same-row/same-col adjacent bricks (check by position)
    for (var j = bricks.length - 1; j >= 0; j--) {
      var other = bricks[j];
      if (other.type === 'steel') continue;
      var sameRow = (other.y === brick.y && Math.abs(other.x - brick.x) <= BRICK_W + GAP);
      var sameCol = (other.x === brick.x && Math.abs(other.y - brick.y) <= BRICK_H + GAP);
      if (sameRow || sameCol) {
        E.emitParticles(particles, other.x + other.w/2, other.y + other.h/2, other.color, 6, { lifeMax: 0.3 });
        bricks.splice(j, 1);
        count++;
      }
    }
    return count;
  }

  // ── Update ──
  function update(dt, input) {
    playTime += dt;
    var ps = 360;

    // Background stars
    for (var i = 0; i < bgStars.length; i++) {
      bgStars[i].y += bgStars[i].speed * dt;
      if (bgStars[i].y > 400) { bgStars[i].y = -5; bgStars[i].x = Math.random() * 480; }
    }

    // Paddle movement
    var prevPaddleX = paddle.x;
    if (input.left)  paddle.x -= ps * dt;
    if (input.right) paddle.x += ps * dt;
    paddle.x = Math.max(10, Math.min(E.W - paddle.w - 10, paddle.x));
    paddle.vx = (paddle.x - prevPaddleX) / dt;

    // Paddle slippery timer
    if (paddleSlipperyTimer > 0) paddleSlipperyTimer -= dt;

    // Laser cooldown
    laserCooldown -= dt;

    // Black hole
    if (blackHoleActive) {
      blackHoleTimer -= dt;
      if (blackHoleTimer <= 0) blackHoleActive = false;
      // Suck nearby bricks
      if (blackHoleActive) {
        for (var j = bricks.length - 1; j >= 0; j--) {
          var brick = bricks[j];
          var dx = brick.x + brick.w/2 - blackHoleX;
          var dy = brick.y + brick.h/2 - blackHoleY;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 60 && dist > 5) {
            brick.x += dx / dist * 120 * dt;
            brick.y += dy / dist * 120 * dt;
          }
          if (dist < 25) {
            E.emitParticles(particles, brick.x + brick.w/2, brick.y + brick.h/2, '#8888ff', 8, { lifeMax: 0.3 });
            bricks.splice(j, 1);
            E.addScore(50 * scoreMultiplier);
            totalBricksDestroyed++;
            spawnPowerup(brick.x + brick.w/2, brick.y);
          }
        }
      }
    }

    if (state === 'ready') {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuckOnPaddle) { balls[i].x = paddle.x + paddle.w/2; balls[i].y = paddle.y - balls[i].r; }
      }
      if (input.action) {
        state = 'playing';
        for (var i = 0; i < balls.length; i++) {
          if (balls[i].stuckOnPaddle) {
            balls[i].stuckOnPaddle = false;
            var hp = (balls[i].x - paddle.x) / paddle.w;
            balls[i].vx = (hp - 0.5) * 160 + paddle.vx * 0.1;
            balls[i].vy = -230;
          }
        }
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      try {
        window.FreeArcadeSave.setHighScore('BlockBreaker', E.getScore());
        window.FreeArcadeSave.setBestLevels(level);
        window.FreeArcadeSave.incrementStat('totalBricksBroken', totalBricksDestroyed);
      } catch (e) {}
      if (input.action) { E.setLevel(1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'levelComplete') {
      if (input.action) { E.setLevel(level+1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    // ── PLAYING ──

    // Laser paddle shooting
    if (input.action && laserCooldown <= 0) {
      // Shoot laser upward from paddle center
      particles.push({
        x: paddle.x + paddle.w/2, y: paddle.y - 5, vx: 0, vy: -400,
        life: 0.3, maxLife: 0.3, size: 3, color: '#ff4444',
      });
      // Check laser hit on bricks
      for (var j = bricks.length - 1; j >= 0; j--) {
        var brick = bricks[j];
        if (paddle.x + paddle.w/2 > brick.x && paddle.x + paddle.w/2 < brick.x + brick.w) {
          destroyBrick(j);
          break;
        }
      }
      laserCooldown = 0.8;
      E.playShoot();
    }

    // Catch release
    if (input.keysPressed['Space'] && hasCatchBall) {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuckOnPaddle) {
          balls[i].stuckOnPaddle = false;
          balls[i].vx = (balls[i].x - paddle.x - paddle.w/2) / paddle.w * 120 + paddle.vx * 0.05;
          balls[i].vy = -250;
        }
      }
    }

    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var b = balls[bi];
      if (b.stuckOnPaddle) { b.x = paddle.x + paddle.w/2; b.y = paddle.y - b.r; continue; }

      b.trail.push({x: b.x, y: b.y});
      if (b.trail.length > 10) b.trail.shift();

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); E.playSound('blip'); }
      if (b.x + b.r > E.W) { b.x = E.W - b.r; b.vx = -Math.abs(b.vx); E.playSound('blip'); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); E.playSound('blip'); }

      // Bottom lose
      if (b.y + b.r > E.H) {
        balls.splice(bi, 1);
        if (balls.length === 0) {
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          balls.push({x: paddle.x + paddle.w/2, y: paddle.y - 6, r: 6, vx: 170, vy: -230, stuckOnPaddle: true, trail: [], fire: false});
          bricks = generateLevel(level);
          state = 'ready'; comboCount = 0; E.playExplode(); return;
        }
        continue;
      }

      // Paddle collision
      if (b.vy > 0 && b.y + b.r >= paddle.y && b.y + b.r <= paddle.y + paddle.h + 6 &&
          b.x >= paddle.x - b.r && b.x <= paddle.x + paddle.w + b.r) {
        b.vy = -Math.abs(b.vy);
        var hp = Math.max(0, Math.min(1, (b.x - paddle.x) / paddle.w));
        if (paddleSlipperyTimer > 0) {
          // Slippery: exaggerated angle
          b.vx = (hp - 0.5) * 3 * 200 + paddle.vx * 0.3;
        } else {
          b.vx = (hp - 0.5) * 2 * 200 + paddle.vx * 0.15;
        }
        var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (spd < 160) { var r2 = 160/spd; b.vx *= r2; b.vy *= r2; }
        if (spd > 400) { var r2 = 400/spd; b.vx *= r2; b.vy *= r2; }
        b.y = paddle.y - b.r;
        E.playShoot();
        if (hasCatchBall) b.stuckOnPaddle = true;
        continue;
      }

      // Brick collisions
      for (var j = bricks.length - 1; j >= 0; j--) {
        var brick = bricks[j];
        var cx = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
        var cy = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
        var dx = b.x - cx, dy = b.y - cy;
        if (dx*dx + dy*dy >= b.r*b.r) continue;

        comboCount++;
        var dmg = (b.fire ? 4 : 1) + (piercingActive ? 1 : 0);
        brick.hp -= dmg;

        E.emitParticles(particles, brick.x + brick.w/2, brick.y + brick.h/2, brick.color, 6,
          { speedMin: 20, speedMax: 60, lifeMin: 0.2, lifeMax: 0.35 });

        if (brick.hp <= 0) {
          destroyBrick(j, b);
          if (piercingActive) {
            // Don't bounce - keep going
          } else {
            // Bounce
            var ol = (b.x + b.r) - brick.x;
            var or2 = (brick.x + brick.w) - (b.x - b.r);
            var ot = (b.y + b.r) - brick.y;
            var ob = (brick.y + brick.h) - (b.y - b.r);
            var minO = Math.min(ol, or2, ot, ob);
            if (minO === ol || minO === or2) b.vx = -b.vx;
            else b.vy = -b.vy;
            if (minO === ol) b.x = brick.x - b.r;
            else if (minO === or2) b.x = brick.x + brick.w + b.r;
            else if (minO === ot) b.y = brick.y - b.r;
            else b.y = brick.y + brick.h + b.r;
          }
        } else {
          E.addScore(10 * scoreMultiplier);
          E.playHit();
          // Bounce
          var ol = (b.x + b.r) - brick.x;
          var or2 = (brick.x + brick.w) - (b.x - b.r);
          var ot = (b.y + b.r) - brick.y;
          var ob = (brick.y + brick.h) - (b.y - b.r);
          var minO = Math.min(ol, or2, ot, ob);
          if (minO === ol || minO === or2) b.vx = -b.vx;
          else b.vy = -b.vy;
          if (minO === ol) b.x = brick.x - b.r;
          else if (minO === or2) b.x = brick.x + brick.w + b.r;
          else if (minO === ot) b.y = brick.y - b.r;
          else b.y = brick.y + brick.h + b.r;
        }
        break;
      }
    }

    // Powerups
    for (var i = powerups.length - 1; i >= 0; i--) {
      var pu = powerups[i];
      pu.y += pu.vy * dt;
      if (pu.y > E.H) { powerups.splice(i, 1); continue; }
      if (pu.y + pu.h >= paddle.y && pu.y <= paddle.y + paddle.h &&
          pu.x + pu.w >= paddle.x && pu.x <= paddle.x + paddle.w) {
        applyPowerup(pu);
        powerups.splice(i, 1);
        E.playPowerup();
      }
    }

    E.updateParticles(particles, dt);

    if (bricks.length === 0) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function destroyBrick(idx, ball) {
    var brick = bricks[idx];
    if (!brick) return;

    var bonus = Math.min(comboCount, 25) * 4;
    var basePts = 100 + brick.maxHp * 50;
    if (brick.type === 'gold') basePts *= 3;
    if (brick.type === 'bomb') basePts *= 0;
    var pts = Math.floor((basePts + bonus) * scoreMultiplier);
    E.addScore(pts);
    totalBricksDestroyed++;

    // Special brick effects
    switch (brick.type) {
      case 'ice':
        paddleSlipperyTimer = 5;
        E.textCenter('SLIPPERY!', paddle.x + paddle.w/2, paddle.y - 20, 7, '#88ddff');
        break;
      case 'fire':
        // Shoots back at player
        for (var k = 0; k < 3; k++) {
          particles.push({
            x: brick.x + brick.w/2, y: brick.y + brick.h/2,
            vx: (Math.random() - 0.5) * 50, vy: 100 + Math.random() * 50,
            life: 0.6, maxLife: 0.6, size: 3, color: '#ff6622',
          });
        }
        // 20% chance to lose a life
        if (Math.random() < 0.2) {
          if (!E.loseLife()) { state = 'gameover'; return; }
          E.shake(4, 0.2);
        }
        break;
      case 'gem':
        // Random powerup
        var randP = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        applyPowerup(randP);
        break;
      case 'gold':
        // Massive points + extra coins
        E.shake(3, 0.15);
        try { window.FreeArcadeSave.addCoins(3); } catch(e) {}
        break;
      case 'bomb':
        // Big explosion
        E.shake(6, 0.3);
        E.emitParticles(particles, brick.x + brick.w/2, brick.y + brick.h/2, '#ff4400', 30, { speedMin: 60, speedMax: 150, lifeMax: 0.5 });
        // Destroy nearby bricks
        for (var k = bricks.length - 1; k >= 0; k--) {
          var other = bricks[k];
          var dist = Math.abs(other.x - brick.x) + Math.abs(other.y - brick.y);
          if (dist < 100 && k !== idx) {
            E.addScore(50 * scoreMultiplier);
            E.emitParticles(particles, other.x + other.w/2, other.y + other.h/2, other.color, 5, { lifeMax: 0.3 });
            bricks.splice(k, 1);
            if (k < idx) idx--;
          }
        }
        break;
      case 'gravity':
        // Reverse gravity on all balls for 3 seconds
        for (var k = 0; k < balls.length; k++) {
          balls[k].vy -= 200;
        }
        break;
    }

    // Chain reaction (adjacent bricks)
    if (brick.type !== 'steel' && Math.random() < 0.3) {
      var chained = chainReaction(brick, idx);
      if (chained > 1) {
        E.addScore(chained * 50);
        E.shake(3, 0.15);
        E.textCenter('CHAIN x' + chained, E.W/2, E.H/2 - 20, 9, '#ffdd00');
      }
    } else {
      bricks.splice(idx, 1);
    }

    // Special brick particle burst
    if (brick.type !== 'normal' && brick.type !== 'steel') {
      E.emitParticles(particles, brick.x + brick.w/2, brick.y + brick.h/2, brick.color, 10, { speedMax: 80, lifeMax: 0.4 });
    }

    E.playExplode();
    if (Math.random() < 0.14) spawnPowerup(brick.x + brick.w/2, brick.y);
  }

  function applyPowerup(pu) {
    switch (pu.type) {
      case 'wide':   paddle.w = Math.min(150, paddle.w + 20); break;
      case 'slow':
        for (var i = 0; i < balls.length; i++) {
          var spd = Math.sqrt(balls[i].vx*balls[i].vx + balls[i].vy*balls[i].vy);
          if (spd > 100) { var r = spd * 0.7 / spd; balls[i].vx *= r; balls[i].vy *= r; }
        }
        break;
      case 'multi':
        var cur = balls.slice();
        for (var i = 0; i < cur.length; i++) { if (!cur[i].stuckOnPaddle) splitBall(cur[i]); }
        break;
      case 'fire':
        for (var i = 0; i < balls.length; i++) balls[i].fire = true;
        fireBallActive = true;
        break;
      case 'catch':  hasCatchBall = true; break;
      case 'pierce': piercingActive = true; break;
      case 'black':
        blackHoleActive = true;
        blackHoleX = paddle.x + paddle.w/2;
        blackHoleY = 150 + Math.random() * 100;
        blackHoleTimer = 4;
        E.shake(5, 0.3);
        break;
      case 'chaos':
        // Random effect
        var effects = ['wide', 'multi', 'fire', 'slow', 'pierce'];
        applyPowerup({ type: effects[Math.floor(Math.random()*effects.length)] });
        break;
      case 'laser':  laserCooldown = 0; break;
    }
  }

  // ── Render ──
  function render(ctx) {
    // Background with starfield
    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, E.W, E.H);
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i];
      ctx.globalAlpha = 0.3 + Math.sin(playTime + i) * 0.15;
      E.circle(s.x, s.y, s.size, '#4466aa');
    }
    ctx.globalAlpha = 1;

    var genIdx = Math.max(0, (level - 1) % generators.length);

    // Black hole
    if (blackHoleActive) {
      var bhAlpha = 0.4 + Math.sin(playTime * 5) * 0.2;
      var grad = ctx.createRadialGradient(blackHoleX, blackHoleY, 0, blackHoleX, blackHoleY, 40);
      grad.addColorStop(0, 'rgba(80,80,255,0.6)');
      grad.addColorStop(1, 'rgba(0,0,50,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(blackHoleX, blackHoleY, 40, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(50,50,255,' + bhAlpha + ')';
      ctx.beginPath();
      ctx.arc(blackHoleX, blackHoleY, 8 + Math.sin(playTime * 4) * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bricks
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      E.rect(b.x, b.y, b.w, b.h, b.color);

      if (b.type === 'steel') {
        E.rectStroke(b.x, b.y, b.w, b.h, '#8888cc', 2);
        ctx.fillStyle = 'rgba(100,100,180,0.2)';
        ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      } else if (b.type !== 'normal') {
        // Special brick border
        E.rectStroke(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.3)', 1);
        if (b.label) E.textCenter(b.label, b.x + b.w/2, b.y + 4, 5, 'rgba(255,255,255,0.6)');
      } else {
        E.rectStroke(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.1)');
      }

      if (b.hp > 1 && b.type !== 'steel') {
        E.rect(b.x, b.y - 3, b.w, 2, 'rgba(0,0,0,0.3)');
        E.rect(b.x, b.y - 3, b.w * (b.hp/b.maxHp), 2, '#44ff44');
      }
      if (b.hp > 1) {
        E.text('' + b.hp, b.x + b.w/2, b.y + 1, 6, 'rgba(0,0,0,0.5)', 'center');
      }
    }

    // Powerups
    for (var i = 0; i < powerups.length; i++) {
      var pu = powerups[i];
      var pulse = 0.7 + Math.sin(playTime * 3 + i) * 0.3;
      ctx.globalAlpha = pulse;
      E.rect(pu.x, pu.y, pu.w, pu.h, pu.color);
      ctx.globalAlpha = 1;
      E.rectStroke(pu.x, pu.y, pu.w, pu.h, 'rgba(255,255,255,0.2)');
      E.textCenter(pu.label, pu.x + pu.w/2, pu.y + 2, 8, '#000');
    }

    // Ball trails
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.stuckOnPaddle) continue;
      for (var t = 0; t < b.trail.length; t++) {
        ctx.globalAlpha = (t / b.trail.length) * 0.25;
        E.circle(b.trail[t].x, b.trail[t].y, b.r * (0.3 + 0.7 * t/b.trail.length),
          b.fire ? '#ffaa00' : (piercingActive ? '#44ffaa' : '#aaddff'));
      }
      ctx.globalAlpha = 1;
    }

    // Balls
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.fire) {
        E.circle(b.x, b.y, b.r + 2, '#ff4400');
        E.circle(b.x, b.y, b.r, '#ffaa00');
      } else if (piercingActive) {
        E.circle(b.x, b.y, b.r + 1, '#44ffaa');
        E.circle(b.x, b.y, b.r, '#88ffcc');
      } else {
        E.circle(b.x, b.y, b.r, '#ffffff');
        E.circle(b.x, b.y, b.r - 2, '#aaddff');
      }
    }

    // Paddle
    var paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    paddleGrad.addColorStop(0, '#44eeff');
    paddleGrad.addColorStop(1, '#0088cc');
    ctx.fillStyle = paddleGrad;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

    // Paddle glow
    ctx.fillStyle = 'rgba(0,221,255,0.15)';
    ctx.fillRect(paddle.x - 4, paddle.y, paddle.w + 8, paddle.h);

    if (hasCatchBall) E.rectStroke(paddle.x - 1, paddle.y - 1, paddle.w + 2, paddle.h + 2, '#ffdd00', 2);
    if (fireBallActive) E.rectStroke(paddle.x - 2, paddle.y - 2, paddle.w + 4, paddle.h + 4, '#ff4400', 1);
    if (paddleSlipperyTimer > 0) E.rectStroke(paddle.x - 2, paddle.y - 2, paddle.w + 4, paddle.h + 4, '#88ddff', 1);
    if (laserCooldown > 0) {
      ctx.fillStyle = 'rgba(255,68,68,0.3)';
      ctx.fillRect(paddle.x + paddle.w/2 - 2, paddle.y - 8, 4, 8);
    }

    E.drawParticles(ctx, particles);

    // HUD
    var genNames = ['Rows','Diamond','Checker','Fortress','Stripes','Rings','Scattered','Pyramid'];
    E.text('LV.' + level + ' [' + genNames[genIdx] + ']', 8, 8, 7, '#00ff88');
    E.text('SCORE: ' + E.getScore(), E.W - 8, 8, 8, '#ffaa00', 'right');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, E.W/2, 8, 8, '#ff6666', 'center');
    E.text('BRICKS: ' + bricks.length, 8, 20, 7, '#88aacc');
    if (comboCount >= 5) E.text('COMBO x' + comboCount, E.W/2, 20, 7, '#ffdd00', 'center');
    E.text('x' + scoreMultiplier.toFixed(1), E.W - 8, 20, 7, '#ff8800', 'right');

    if (piercingActive) E.text('PIERCING', E.W/2, 32, 6, '#44ffaa', 'center');
    if (paddleSlipperyTimer > 0) {
      E.text('ICE ' + Math.ceil(paddleSlipperyTimer) + 's', E.W/2, 32, 6, '#88ddff', 'center');
    }

    var cx = E.W/2, cy = E.H/2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('BLOCK BREAKER', cx, 70, 18, '#44ccff', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 105, 11, '#ffaa00', '#000');
      E.textCenter('Pattern: ' + genNames[genIdx], cx, 130, 8, '#888');
      E.textCenter('← → move · SPACE laser · P pause', cx, 170, 7, '#aaa');
      E.textCenter('Special bricks: ICE FIRE GEM GOLD BOMB GRAVITY', cx, 195, 6, '#888');
      E.textCenter('PRESS ENTER TO START', cx, 240, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 50, 18, '#ff4444', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, cy - 15, 9, '#ff8800', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 8, 11, '#ffaa00', '#000');
      E.textCenter('Bricks: ' + totalBricksDestroyed, cx, cy + 28, 7, '#88aacc');
      var best = window.FreeArcadeSave ? window.FreeArcadeSave.getHighScore('BlockBreaker') : 0;
      if (E.getScore() >= best) E.textCenter('★ NEW BEST ★', cx, cy + 42, 8, '#ffdd00');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 60, 8, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('LEVEL ' + level + ' CLEAR!', cx, cy - 40, 14, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 5, 10, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 50, 8, '#aaa');
    }
  }

  function destroy() {}

  window.BlockBreaker = { init: init, update: update, render: render, destroy: destroy };
})();
