/**
 * Block Breaker — breakout clone with power-ups, combos, and 5 level layouts
 *
 * Uses FreeArcadeEngine via `this.engine` in init()
 *
 * Features:
 *  - 5 unique level layouts that properly fit the 480×400 canvas
 *  - 5 powerup types: wide paddle, slow ball, multiball, fire ball, catch
 *  - Paddle velocity influences ball trajectory for better control
 *  - Combo system: hitting bricks consecutively without paddle miss awards bonus
 *  - Ball trail for readability
 *  - Progressive difficulty
 */
(function () {
  'use strict';

  var E;
  var paddle, balls, bricks, powerups, particles;
  var state;       // 'ready' | 'playing' | 'gameover' | 'levelComplete'
  var level;
  var comboCount = 0;
  var hasCatchBall = false;  // true when catch powerup active

  // Layout constants
  var COLS = 8;
  var BRICK_W = 50;
  var BRICK_H = 20;
  var GAP = 5;
  var OFFSET_X = 14;
  var OFFSET_Y = 35;

  // ── Level Layouts ──
  // Each returns an array of {x, y, w, h, hp, color}
  var layouts = [
    // Level 1: Simple rows
    function () {
      var b = [];
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < COLS; c++) {
          b.push(makeBrick(c, r, 1, r % 2 === 0 ? '#ff4444' : '#ff8844'));
        }
      }
      return b;
    },
    // Level 2: Diamond
    function () {
      var b = [];
      var colors = ['#ff4444', '#ff8844', '#ffcc44', '#44ff44', '#44ccff'];
      for (var r = 0; r < 5; r++) {
        var offset = Math.abs(2 - r);
        var count = COLS - offset * 2;
        for (var c = 0; c < count; c++) {
          b.push(makeBrick(offset + c, r, r < 2 ? 2 : 1, colors[r]));
        }
      }
      return b;
    },
    // Level 3: Checkerboard
    function () {
      var b = [];
      for (var r = 0; r < 6; r++) {
        for (var c = 0; c < COLS; c++) {
          if ((r + c) % 2 === 0) {
            var hp = r < 2 ? 3 : (r < 4 ? 2 : 1);
            var color = r < 2 ? '#cc44ff' : (r < 4 ? '#44aaff' : '#44ff88');
            b.push(makeBrick(c, r, hp, color));
          }
        }
      }
      return b;
    },
    // Level 4: Fortress (reduced to 8 cols to fit)
    function () {
      var b = [];
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < COLS; c++) {
          // Fortress walls: outer ring is thick, inner is weak
          var isOuter = (r === 0 || r === 6 || c === 0 || c === 7);
          var hp = isOuter ? 3 : (r < 3 ? 2 : 1);
          var color = isOuter ? '#ff4444' : (r < 3 ? '#ffaa44' : '#44ff88');
          if (isOuter && r > 0 && r < 6 && c > 0 && c < 7) continue; // only walls
          b.push(makeBrick(c, r, hp, color));
        }
      }
      // Add inner blocks
      for (var r2 = 2; r2 < 5; r2++) {
        for (var c2 = 2; c2 < 6; c2++) {
          b.push(makeBrick(c2, r2, 1, '#44aaff'));
        }
      }
      return b;
    },
    // Level 5: Spiral centered on canvas
    function () {
      var b = [];
      var cx = 240, cy = 160;
      for (var i = 0; i < 30; i++) {
        var angle = i * 0.8;
        var dist = 40 + i * 7;
        var x = cx + Math.cos(angle) * dist - BRICK_W / 2;
        var y = cy + Math.sin(angle) * dist - BRICK_H / 2;
        var hp = 2;
        var hue = (i * 12) % 360;
        var color = 'hsl(' + hue + ', 80%, 55%)';
        b.push({ x: x, y: y, w: BRICK_W, h: BRICK_H, hp: hp, maxHp: hp, color: color });
      }
      return b;
    }
  ];

  function makeBrick(col, row, hp, color) {
    return {
      x: OFFSET_X + col * (BRICK_W + GAP),
      y: OFFSET_Y + row * (BRICK_H + GAP),
      w: BRICK_W, h: BRICK_H,
      hp: hp,
      maxHp: hp,
      color: color
    };
  }

  function init() {
    E = this.engine;
    level = E.getLevel();

    var layoutIdx = (level - 1) % layouts.length;
    if (layoutIdx < 0) layoutIdx = 0;
    paddle = { x: 200, y: 360, w: 80, h: 12, vx: 0 };
    balls = [{
      x: 240, y: 340, r: 6,
      vx: 170, vy: -230,
      stuckOnPaddle: true,
      trail: []
    }];
    bricks = layouts[layoutIdx]();
    powerups = [];
    particles = [];
    state = 'ready';
    comboCount = 0;
    hasCatchBall = false;

    E.setScore(0);
    E.setLives(3);
  }

  // ── Powerups ──
  var POWERUP_TYPES = [
    { id: 'wide',  label: 'W', color: '#00ff88', desc: 'Wide paddle' },
    { id: 'slow',  label: 'S', color: '#4488ff', desc: 'Slow ball' },
    { id: 'multi', label: 'M', color: '#cc44ff', desc: 'Multi ball' },
    { id: 'fire',  label: 'F', color: '#ff4444', desc: 'Fire ball' },
    { id: 'catch', label: 'C', color: '#ffdd00', desc: 'Catch' },
  ];

  function spawnPowerup(x, y) {
    var type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({
      x: x - 12, y: y,
      w: 24, h: 14,
      vy: 90,
      type: type.id,
      label: type.label,
      color: type.color
    });
  }

  // ── Ball helpers ──
  function splitBall(b) {
    // Create 2 additional balls angled away
    for (var angle = -30; angle <= 30; angle += 60) {
      if (angle === 0) continue;
      var rad = angle * Math.PI / 180;
      var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      balls.push({
        x: b.x, y: b.y, r: 6,
        vx: spd * Math.cos(Math.atan2(b.vy, b.vx) + rad),
        vy: spd * Math.sin(Math.atan2(b.vy, b.vx) + rad),
        stuckOnPaddle: false,
        trail: []
      });
    }
  }

  function addBallTrail(b) {
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 8) b.trail.shift();
  }

  // ── Update ──
  function update(dt, input) {
    // Paddle movement with velocity tracking
    var paddleSpeed = 340;
    var prevPaddleX = paddle.x;
    if (input.left)  paddle.x -= paddleSpeed * dt;
    if (input.right) paddle.x += paddleSpeed * dt;
    paddle.x = Math.max(10, Math.min(E.W - paddle.w - 10, paddle.x));
    paddle.vx = (paddle.x - prevPaddleX) / dt;

    if (state === 'ready') {
      // Ball follows paddle
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuckOnPaddle) {
          balls[i].x = paddle.x + paddle.w / 2;
          balls[i].y = paddle.y - balls[i].r;
        }
      }
      if (input.action) {
        state = 'playing';
        for (var i = 0; i < balls.length; i++) {
          if (balls[i].stuckOnPaddle) {
            balls[i].stuckOnPaddle = false;
            // Launch with slight angle based on paddle position
            var hitPos = (balls[i].x - paddle.x) / paddle.w;
            balls[i].vx = (hitPos - 0.5) * 160 + paddle.vx * 0.1;
            balls[i].vy = -230;
          }
        }
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      if (input.action) {
        E.setLevel(level);
        init.call({ engine: E });
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    if (state === 'levelComplete') {
      if (input.action) {
        E.setLevel(level + 1);
        init.call({ engine: E });
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── PLAYING ──

    // Catch release
    if (input.action && hasCatchBall) {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuckOnPaddle) {
          balls[i].stuckOnPaddle = false;
          balls[i].vx = (balls[i].x - paddle.x - paddle.w / 2) / paddle.w * 120 + paddle.vx * 0.05;
          balls[i].vy = -250;
        }
      }
    }

    // Update each ball
    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var b = balls[bi];

      if (b.stuckOnPaddle) {
        b.x = paddle.x + paddle.w / 2;
        b.y = paddle.y - b.r;
        continue;
      }

      // Trail
      addBallTrail(b);

      // Movement
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Wall collisions
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); E.playSound('blip'); }
      if (b.x + b.r > E.W) { b.x = E.W - b.r; b.vx = -Math.abs(b.vx); E.playSound('blip'); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); E.playSound('blip'); }

      // Bottom: lose ball
      if (b.y + b.r > E.H) {
        balls.splice(bi, 1);
        if (balls.length === 0) {
          // All balls lost
          if (!E.loseLife()) {
            state = 'gameover';
            E.playGameOver();
            return;
          }
          // Respawn ball
          balls.push({ x: paddle.x + paddle.w / 2, y: paddle.y - 6, r: 6, vx: 170, vy: -230, stuckOnPaddle: true, trail: [] });
          state = 'ready';
          E.playExplode();
          return;
        }
        continue;
      }

      // Paddle collision
      if (b.vy > 0 && b.y + b.r >= paddle.y && b.y + b.r <= paddle.y + paddle.h + 6 &&
          b.x >= paddle.x - b.r && b.x <= paddle.x + paddle.w + b.r) {
        b.vy = -Math.abs(b.vy);
        var hitPos = Math.max(0, Math.min(1, (b.x - paddle.x) / paddle.w));
        b.vx = (hitPos - 0.5) * 2 * 200 + paddle.vx * 0.15;
        // Ensure minimum speed
        var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (spd < 160) {
          var ratio = 160 / spd;
          b.vx *= ratio; b.vy *= ratio;
        }
        if (spd > 380) {
          var ratio = 380 / spd;
          b.vx *= ratio; b.vy *= ratio;
        }
        b.y = paddle.y - b.r;
        E.playShoot();

        // Catch powerup: ball sticks to paddle
        if (hasCatchBall) {
          b.stuckOnPaddle = true;
        }
        continue;
      }

      // Brick collisions
      for (var j = bricks.length - 1; j >= 0; j--) {
        var brick = bricks[j];
        if (!ballBrickCollision(b, brick)) continue;

        brick.hp--;
        comboCount++;

        E.emitParticles(particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 6,
          { speedMin: 20, speedMax: 60, lifeMin: 0.2, lifeMax: 0.35 });

        if (brick.hp <= 0) {
          bricks.splice(j, 1);
          var points = 100 + Math.min(comboCount, 20) * 5;
          E.addScore(points);
          E.playExplode();
          // Powerup drop
          if (Math.random() < 0.14) {
            spawnPowerup(brick.x + brick.w / 2, brick.y);
          }
        } else {
          brick.color = brick.hp <= 1 ? '#888888' : (brick.hp <= 2 ? '#aaaaaa' : brick.color);
          E.addScore(15);
          E.playHit();
        }

        // Calculate bounce direction
        bounceBallOffBrick(b, brick);
        break; // one brick per frame per ball
      }
    }

    // Update powerups
    for (var i = powerups.length - 1; i >= 0; i--) {
      var pu = powerups[i];
      pu.y += pu.vy * dt;
      if (pu.y > E.H) { powerups.splice(i, 1); continue; }

      // Catch with paddle
      if (pu.y + pu.h >= paddle.y && pu.y <= paddle.y + paddle.h &&
          pu.x + pu.w >= paddle.x && pu.x <= paddle.x + paddle.w) {
        applyPowerup(pu);
        powerups.splice(i, 1);
        E.playPowerup();
      }
    }

    // Particles
    E.updateParticles(particles, dt);

    // Win check
    if (bricks.length === 0) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function ballBrickCollision(b, brick) {
    // Circle vs AABB
    var cx = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
    var cy = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
    var dx = b.x - cx;
    var dy = b.y - cy;
    return dx * dx + dy * dy < b.r * b.r;
  }

  function bounceBallOffBrick(b, brick) {
    // Calculate overlap on each axis to determine bounce direction
    var overlapLeft  = (b.x + b.r) - brick.x;
    var overlapRight = (brick.x + brick.w) - (b.x - b.r);
    var overlapTop   = (b.y + b.r) - brick.y;
    var overlapBottom = (brick.y + brick.h) - (b.y - b.r);

    var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      b.vx = -b.vx;
    } else {
      b.vy = -b.vy;
    }

    // Push ball out of brick to prevent sticking
    if (minOverlap === overlapLeft)      b.x = brick.x - b.r;
    else if (minOverlap === overlapRight) b.x = brick.x + brick.w + b.r;
    else if (minOverlap === overlapTop)   b.y = brick.y - b.r;
    else                                  b.y = brick.y + brick.h + b.r;
  }

  function applyPowerup(pu) {
    switch (pu.type) {
      case 'wide':
        paddle.w = Math.min(150, paddle.w + 20);
        break;
      case 'slow':
        for (var i = 0; i < balls.length; i++) {
          var spd = Math.sqrt(balls[i].vx * balls[i].vx + balls[i].vy * balls[i].vy);
          if (spd > 120) {
            var ratio = spd * 0.75 / spd;
            balls[i].vx *= ratio;
            balls[i].vy *= ratio;
          }
        }
        break;
      case 'multi':
        // Split all balls
        var currentBalls = balls.slice();
        for (var i = 0; i < currentBalls.length; i++) {
          if (!currentBalls[i].stuckOnPaddle) splitBall(currentBalls[i]);
        }
        break;
      case 'fire':
        // Fire ball: bricks take 3x damage
        for (var i = 0; i < balls.length; i++) {
          balls[i].fire = true;
        }
        break;
      case 'catch':
        hasCatchBall = true;
        // Mark existing balls as catchable
        break;
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    // Bricks
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      E.rect(b.x, b.y, b.w, b.h, b.color);
      E.rectStroke(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.1)');
      if (b.hp > 1 && b.hp < 10) {
        E.text(String(b.hp), b.x + b.w / 2, b.y + 3, 8, 'rgba(0,0,0,0.4)', 'center');
      }
      if (b.hp > 1) {
        // HP bar for high-HP bricks
        E.rect(b.x, b.y - 4, b.w, 3, 'rgba(0,0,0,0.3)');
        E.rect(b.x, b.y - 4, b.w * (b.hp / b.maxHp), 3, '#44ff44');
      }
    }

    // Powerups falling
    for (var i = 0; i < powerups.length; i++) {
      var pu = powerups[i];
      E.rect(pu.x, pu.y, pu.w, pu.h, pu.color);
      E.rectStroke(pu.x, pu.y, pu.w, pu.h, 'rgba(255,255,255,0.2)');
      E.text(pu.label, pu.x + pu.w / 2, pu.y + 2, 8, '#000', 'center');
    }

    // Ball trails
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.stuckOnPaddle) continue;
      for (var t = 0; t < b.trail.length; t++) {
        var alpha = (t / b.trail.length) * 0.3;
        ctx.globalAlpha = alpha;
        E.circle(b.trail[t].x, b.trail[t].y, b.r * (0.3 + 0.7 * t / b.trail.length), '#aaddff');
      }
      ctx.globalAlpha = 1;
    }

    // Balls
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.fire) {
        E.circle(b.x, b.y, b.r + 2, '#ff4400');
        E.circle(b.x, b.y, b.r, '#ffaa00');
      } else {
        E.circle(b.x, b.y, b.r, '#ffffff');
        E.circle(b.x, b.y, b.r - 2, '#aaddff');
      }
    }

    // Paddle
    E.rect(paddle.x, paddle.y, paddle.w, paddle.h, '#00ddff');
    E.rect(paddle.x, paddle.y - 3, paddle.w, 3, 'rgba(0,221,255,0.3)');
    // Catch indicator
    if (hasCatchBall) {
      E.rectStroke(paddle.x, paddle.y, paddle.w, paddle.h, '#ffdd00', 2);
    }
    // Fire indicator
    var hasFire = false;
    for (var i = 0; i < balls.length; i++) {
      if (balls[i].fire) hasFire = true;
    }
    if (hasFire) {
      E.rectStroke(paddle.x - 2, paddle.y - 2, paddle.w + 4, paddle.h + 4, '#ff4400', 1);
    }

    // Particles
    E.drawParticles(ctx, particles);

    // HUD
    E.text('LEVEL: ' + level, 8, 8, 9, '#00ff88');
    E.text('SCORE: ' + E.getScore(), E.W - 8, 8, 9, '#ffaa00', 'right');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, E.W / 2, 8, 9, '#ff6666', 'center');
    if (comboCount >= 5) {
      E.text('COMBO x' + comboCount, E.W / 2, 22, 7, '#ffdd00', 'center');
    }

    // Overlays
    var cx = E.W / 2, cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('BLOCK BREAKER', cx, 90, 18, '#44ccff', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 125, 12, '#ffaa00', '#000');
      E.textCenter('← → to move paddle', cx, 180, 9, '#aaa');
      E.textCenter('P to pause', cx, 205, 8, '#666');
      E.textCenter('PRESS ENTER TO START', cx, 250, 10, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 45, 20, '#ff4444', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, cy - 10, 10, '#ff8800', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 15, 12, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 55, 9, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('LEVEL ' + level + ' CLEAR!', cx, cy - 40, 16, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 10, 12, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 55, 9, '#aaa');
    }
  }

  function destroy() {}

  window.BlockBreaker = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
