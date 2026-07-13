/**
 * Block Breaker — breakout clone with power-ups and levels
 * Uses FreeArcadeEngine via `game.engine` object
 */
(function () {
  'use strict';

  var E; // engine reference

  var paddle, ball, bricks, powerups, particles;
  var state = 'ready';  // ready | playing | gameover | levelComplete
  var level = 1;

  // Brick layout templates by level
  var layouts = [
    // Level 1: simple rows
    function() {
      var b = [];
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 8; c++) {
          b.push({ x: 20 + c * 62, y: 30 + r * 28, w: 56, h: 22, hp: 1, color: r % 2 === 0 ? '#ff4444' : '#ff8844' });
        }
      }
      return b;
    },
    // Level 2: diamond
    function() {
      var b = [];
      var colors = ['#ff4444', '#ff8844', '#ffcc44', '#44ff44', '#44ccff'];
      for (var r = 0; r < 5; r++) {
        var offset = Math.abs(2 - r);
        var count = 8 - offset * 2;
        for (var c = 0; c < count; c++) {
          b.push({ x: 20 + offset * 31 + c * 62, y: 30 + r * 28, w: 56, h: 22, hp: r < 2 ? 2 : 1, color: colors[r] });
        }
      }
      return b;
    },
    // Level 3: checkerboard
    function() {
      var b = [];
      for (var r = 0; r < 6; r++) {
        for (var c = 0; c < 8; c++) {
          if ((r + c) % 2 === 0) {
            b.push({ x: 20 + c * 62, y: 25 + r * 26, w: 56, h: 20, hp: r < 2 ? 3 : (r < 4 ? 2 : 1), color: r < 2 ? '#cc44ff' : (r < 4 ? '#44aaff' : '#44ff88') });
          }
        }
      }
      return b;
    },
    // Level 4: fortress
    function() {
      var b = [];
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < 10; c++) {
          if (c > 0 && c < 9 || r > 0 && r < 6) {
            var hp = r < 2 ? 3 : (r < 5 ? 2 : 1);
            b.push({ x: 8 + c * 62, y: 20 + r * 26, w: 56, h: 20, hp: hp, color: hp === 3 ? '#ff4444' : (hp === 2 ? '#ffaa44' : '#44ff88') });
          }
        }
      }
      return b;
    },
    // Level 5: spiral
    function() {
      var b = [];
      for (var i = 0; i < 30; i++) {
        var angle = i * 0.8;
        var dist = 50 + i * 8;
        var cx = 260, cy = 150;
        var x = cx + Math.cos(angle) * dist - 28;
        var y = cy + Math.sin(angle) * dist - 10;
        b.push({ x: x, y: y, w: 56, h: 20, hp: 2, color: '#ff44' + (10 + i * 5).toString(16).padStart(2, '0') });
      }
      return b;
    }
  ];

  function init() {
    E = this.engine;
    level = E.getLevel();
    var layoutIdx = (level - 1) % layouts.length;
    var createBricks = layouts[layoutIdx];

    paddle = { x: 200, y: 360, w: 80, h: 12 };
    ball = { x: 240, y: 340, r: 6, vx: 180, vy: -220, speed: 180, stuck: true };
    bricks = createBricks();
    powerups = [];
    particles = [];
    state = 'ready';
    E.setScore(0);
    E.setLives(3);
  }

  function addParticles(x, y, color, count) {
    for (var i = 0; i < (count || 8); i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 30 + Math.random() * 80;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
        color: color || '#fff'
      });
    }
  }

  function ballBrickCollision(ball, brick) {
    // Find closest point on brick to ball center
    var cx = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
    var cy = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
    var dx = ball.x - cx;
    var dy = ball.y - cy;
    return dx * dx + dy * dy < ball.r * ball.r;
  }

  function update(dt, input) {
    // Paddle movement
    if (input.left)  paddle.x -= 300 * dt;
    if (input.right) paddle.x += 300 * dt;
    paddle.x = Math.max(10, Math.min(E.W - paddle.w - 10, paddle.x));

    if (state === 'ready') {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r;
      if (input.action) {
        state = 'playing';
        ball.stuck = false;
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      if (input.action) {
        E.setLevel(level);
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    if (state === 'levelComplete') {
      if (input.action) {
        E.setLevel(level + 1);
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── Playing ──

    // Ball movement
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Wall collisions
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = -ball.vx; E.playHit(); }
    if (ball.x + ball.r > E.W) { ball.x = E.W - ball.r; ball.vx = -ball.vx; E.playHit(); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = -ball.vy; E.playHit(); }

    // Bottom lose
    if (ball.y + ball.r > E.H) {
      if (!E.loseLife()) {
        state = 'gameover';
        E.playGameOver();
        return;
      }
      ball.stuck = true;
      state = 'ready';
      E.playExplode();
      return;
    }

    // Paddle collision
    if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 4 &&
        ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
      ball.vy = -ball.vy;
      // Angle based on hit position
      var hitPos = (ball.x - paddle.x) / paddle.w; // 0..1
      ball.vx = (hitPos - 0.5) * 2 * 220;
      // Keep min speed
      var spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (spd < 180) {
        var ratio = 180 / spd;
        ball.vx *= ratio;
        ball.vy *= ratio;
      }
      // Max speed cap
      spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (spd > 350) {
        var ratio = 350 / spd;
        ball.vx *= ratio;
        ball.vy *= ratio;
      }
      ball.y = paddle.y - ball.r;
      E.playShoot();
    }

    // Brick collisions
    for (var i = bricks.length - 1; i >= 0; i--) {
      var brick = bricks[i];
      if (!ballBrickCollision(ball, brick)) continue;

      brick.hp--;
      addParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 6);
      E.playHit();
      E.addScore(brick.hp <= 0 ? 100 : 25);

      if (brick.hp <= 0) {
        bricks.splice(i, 1);
        E.playExplode();
        // Chance for powerup
        if (Math.random() < 0.12) {
          powerups.push({
            x: brick.x + brick.w / 2 - 10,
            y: brick.y,
            w: 20, h: 12,
            vy: 100,
            type: Math.random() < 0.5 ? 'wide' : 'speed',
            color: Math.random() < 0.5 ? '#00ff88' : '#ffaa00'
          });
        }
      } else {
        // Show damage
        brick.color = brick.hp <= 1 ? '#aaa' : brick.color;
      }

      // Calculate bounce direction
      var overlapLeft = (ball.x + ball.r) - brick.x;
      var overlapRight = (brick.x + brick.w) - (ball.x - ball.r);
      var overlapTop = (ball.y + ball.r) - brick.y;
      var overlapBottom = (brick.y + brick.h) - (ball.y - ball.r);

      var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.vx = -ball.vx;
      } else {
        ball.vy = -ball.vy;
      }
      break; // Only one brick per frame
    }

    // Powerups
    for (var i = powerups.length - 1; i >= 0; i--) {
      var pu = powerups[i];
      pu.y += pu.vy * dt;
      if (pu.y > E.H) { powerups.splice(i, 1); continue; }

      // Catch powerup
      if (pu.y + pu.h >= paddle.y && pu.y <= paddle.y + paddle.h &&
          pu.x + pu.w >= paddle.x && pu.x <= paddle.x + paddle.w) {
        if (pu.type === 'wide') {
          paddle.w = Math.min(140, paddle.w + 15);
        } else if (pu.type === 'speed') {
          var spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          if (spd < 300) {
            var ratio = spd * 1.3 / spd;
            ball.vx *= ratio;
            ball.vy *= ratio;
          }
        }
        powerups.splice(i, 1);
        E.playCoin();
      }
    }

    // Particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size *= 0.97;
      if (p.life <= 0 || p.size < 0.5) particles.splice(i, 1);
    }

    // Win check
    if (bricks.length === 0) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function render(ctx) {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    // Bricks
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      E.rect(b.x, b.y, b.w, b.h, b.color);
      E.rectStroke(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.15)');
      if (b.hp > 1) {
        E.text(String(b.hp), b.x + b.w / 2, b.y + 4, 8, 'rgba(0,0,0,0.4)', 'center');
      }
    }

    // Powerups
    for (var i = 0; i < powerups.length; i++) {
      var pu = powerups[i];
      E.rect(pu.x, pu.y, pu.w, pu.h, pu.color);
      E.text(pu.type === 'wide' ? 'W' : 'S', pu.x + pu.w / 2, pu.y + 2, 8, '#000', 'center');
    }

    // Paddle
    E.rect(paddle.x, paddle.y, paddle.w, paddle.h, '#00ddff');
    E.rect(paddle.x, paddle.y - 3, paddle.w, 3, 'rgba(0,221,255,0.3)');

    // Ball
    E.circle(ball.x, ball.y, ball.r, '#ffffff');
    E.circle(ball.x, ball.y, ball.r - 2, '#aaddff');

    // Particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      E.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;

    // HUD
    E.text('LEVEL: ' + level, 10, 10, 9, '#00ff88');
    E.text('SCORE: ' + E.getScore(), E.W - 10, 10, 9, '#ffaa00', 'right');
    var livesStr = '';
    for (var i = 0; i < E.getLives(); i++) livesStr += '♥ ';
    E.text(livesStr, E.W / 2, 10, 9, '#ff6666', 'center');

    // Overlays
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('BLOCK BREAKER', E.W / 2, 100, 18, '#44ccff', '#000');
      E.textShadow('LEVEL ' + level, E.W / 2, 140, 12, '#ffaa00', '#000');
      E.text('← → to move paddle', E.W / 2, 200, 9, '#aaa', 'center');
      E.text('PRESS ENTER TO START', E.W / 2, 240, 10, '#00ff88', 'center');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('GAME OVER', E.W / 2, E.H / 2 - 40, 20, '#ff4444', '#000');
      E.textShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 10, 12, '#ffaa00', '#000');
      E.text('PRESS ENTER TO RETRY', E.W / 2, E.H / 2 + 50, 9, '#aaa', 'center');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('LEVEL ' + level + ' CLEAR!', E.W / 2, E.H / 2 - 40, 16, '#44ff88', '#000');
      E.textShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 10, 12, '#ffaa00', '#000');
      E.text('PRESS ENTER FOR LEVEL ' + (level + 1), E.W / 2, E.H / 2 + 50, 9, '#aaa', 'center');
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
