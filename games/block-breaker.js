/**
 * Block Breaker — infinite breakout with procedural level generation
 *
 * Every level is procedurally generated. No two are the same.
 * Brick HP, layout patterns, and special bricks scale with level.
 * Play until you run out of lives.
 *
 * Features for long sessions:
 *  - 8 procedural layout generators (rows, diamond, checker, fortress, stripes, rings, scattered, pyramid)
 *  - Brick HP scales with level (1-5)
 *  - Steel bricks (indestructible) appear at higher levels
 *  - Explosive bricks (destroy neighbors) appear at higher levels
 *  - Level number tracks progression indefinitely
 *  - High score saved to localStorage
 */
(function () {
  'use strict';

  var E;
  var paddle, balls, bricks, powerups, particles;
  var state;
  var level;
  var comboCount = 0;
  var hasCatchBall = false;
  var fireBallActive = false;
  var scoreMultiplier = 1;
  var totalBricksDestroyed = 0;

  // Layout constants
  var COLS = 8;
  var BRICK_W = 50;
  var BRICK_H = 20;
  var GAP = 5;
  var OFFSET_X = 14;
  var OFFSET_Y = 35;
  var PADDLE_Y = 360;

  // ── Procedural Bricks ──
  // Each generator returns an array of {x, y, w, h, hp, maxHp, color, type}
  // type: 'normal' | 'steel' | 'explosive'

  var generators = [
    // 0: Full rows
    function (lvl) {
      var bricks = [];
      var rows = Math.min(3 + Math.floor(lvl / 2), 7);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < COLS; c++) {
          bricks.push(makeBrick(c, r, lvl));
        }
      }
      return bricks;
    },
    // 1: Diamond pattern
    function (lvl) {
      var bricks = [];
      var rows = Math.min(5, 3 + Math.floor(lvl / 3));
      var mid = Math.floor(rows / 2);
      for (var r = 0; r < rows; r++) {
        var offset = Math.abs(mid - r);
        var count = COLS - offset * 2;
        if (count > 0) {
          for (var c = 0; c < count; c++) {
            bricks.push(makeBrick(offset + c, r, lvl));
          }
        }
      }
      return bricks;
    },
    // 2: Checkerboard
    function (lvl) {
      var bricks = [];
      var rows = Math.min(4 + Math.floor(lvl / 2), 7);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < COLS; c++) {
          if ((r + c) % 2 === 0) {
            bricks.push(makeBrick(c, r, lvl));
          }
        }
      }
      return bricks;
    },
    // 3: Fortress (walls + inner blocks)
    function (lvl) {
      var bricks = [];
      var rows = Math.min(5 + Math.floor(lvl / 2), 7);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < COLS; c++) {
          var isWall = (r === 0 || r === rows - 1 || c === 0 || c === COLS - 1);
          if (isWall) {
            bricks.push(makeBrick(c, r, lvl, 'steel'));
          }
        }
      }
      // Inner blocks
      for (var r2 = 2; r2 < rows - 2 && r2 < 5; r2++) {
        for (var c2 = 2; c2 < COLS - 2; c2++) {
          bricks.push(makeBrick(c2, r2, lvl));
        }
      }
      return bricks;
    },
    // 4: Vertical stripes
    function (lvl) {
      var bricks = [];
      var rows = Math.min(4 + Math.floor(lvl / 2), 7);
      for (var c = 0; c < COLS; c++) {
        var stripeHp = (c % 3 === 0) ? lvl * 2 : 1 + Math.floor(lvl / 3);
        for (var r = 0; r < rows; r++) {
          var b = makeBrick(c, r, lvl);
          b.hp = Math.min(stripeHp, 5);
          b.maxHp = b.hp;
          if (stripeHp > 2) b.type = 'steel';
          bricks.push(b);
        }
      }
      return bricks;
    },
    // 5: Rings / concentric
    function (lvl) {
      var bricks = [];
      var rows = Math.min(5 + Math.floor(lvl / 2), 7);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < COLS; c++) {
          if (r === 0 || r === rows - 1 || c === 0 || c === COLS - 1 || r === 2 || r === 3 || c === 3 || c === 4) {
            bricks.push(makeBrick(c, r, lvl));
          }
        }
      }
      return bricks;
    },
    // 6: Scattered clusters
    function (lvl) {
      var bricks = [];
      var rows = Math.min(4 + Math.floor(lvl / 2), 7);
      var clusters = 3 + Math.floor(lvl / 2);
      for (var cl = 0; cl < clusters; cl++) {
        var centerR = 1 + Math.floor(Math.random() * (rows - 2));
        var centerC = 1 + Math.floor(Math.random() * (COLS - 2));
        var size = 1 + Math.floor(Math.random() * 2);
        for (var dr = -size; dr <= size; dr++) {
          for (var dc = -size; dc <= size; dc++) {
            var r = centerR + dr;
            var c = centerC + dc;
            if (r >= 0 && r < rows && c >= 0 && c < COLS && Math.random() < 0.7) {
              bricks.push(makeBrick(c, r, lvl));
            }
          }
        }
      }
      return bricks;
    },
    // 7: Pyramid
    function (lvl) {
      var bricks = [];
      var rows = Math.min(5 + Math.floor(lvl / 2), 7);
      for (var r = 0; r < rows; r++) {
        var count = COLS - r * 2;
        if (count > 0) {
          for (var c = 0; c < count; c++) {
            var b = makeBrick(r + c, r, lvl);
            if (r === 0) b.hp = Math.min(3, lvl);
            bricks.push(b);
          }
        }
      }
      return bricks;
    }
  ];

  function makeBrick(col, row, level, forcedType) {
    var hp = 1;
    if (level > 3) hp = 1 + Math.floor(Math.random() * Math.min(level - 2, 4));
    hp = Math.min(hp, 5);

    var type = forcedType || 'normal';
    if (!forcedType && level > 5 && Math.random() < 0.08) type = 'steel';
    if (!forcedType && level > 8 && Math.random() < 0.06) type = 'explosive';

    var color;
    if (type === 'steel') color = '#666688';
    else if (type === 'explosive') color = '#ff6600';
    else {
      var hues = [0, 30, 60, 180, 240, 300, 360];
      color = 'hsl(' + hues[col % hues.length] + ', 70%, ' + (45 + row * 5) + '%)';
    }

    return {
      x: OFFSET_X + col * (BRICK_W + GAP),
      y: OFFSET_Y + row * (BRICK_H + GAP),
      w: BRICK_W, h: BRICK_H,
      hp: hp,
      maxHp: hp,
      color: color,
      type: type,
    };
  }

  function init() {
    E = this.engine;
    level = E.getLevel();
    if (level < 1) level = 1;

    paddle = { x: 200, y: PADDLE_Y, w: 80, h: 12, vx: 0 };
    balls = [{
      x: 240, y: PADDLE_Y - 6, r: 6,
      vx: 170, vy: -230,
      stuckOnPaddle: true,
      trail: [],
      fire: false,
    }];

    // Generate level
    var genIdx = (level - 1) % generators.length;
    bricks = generators[genIdx](level);

    powerups = [];
    particles = [];
    state = 'ready';
    comboCount = 0;
    hasCatchBall = false;
    fireBallActive = false;
    scoreMultiplier = 1 + Math.floor(level / 10) * 0.5;

    E.setScore(0);
    E.setLives(3);
  }

  var POWERUP_TYPES = [
    { id: 'wide',  label: 'W', color: '#00ff88' },
    { id: 'slow',  label: 'S', color: '#4488ff' },
    { id: 'multi', label: 'M', color: '#cc44ff' },
    { id: 'fire',  label: 'F', color: '#ff4444' },
    { id: 'catch', label: 'C', color: '#ffdd00' },
  ];

  function spawnPowerup(x, y) {
    var type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({ x: x - 12, y: y, w: 24, h: 14, vy: 90, type: type.id, label: type.label, color: type.color });
  }

  function splitBall(b) {
    for (var a = -30; a <= 30; a += 60) {
      if (a === 0) continue;
      var rad = a * Math.PI / 180;
      var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      balls.push({
        x: b.x, y: b.y, r: 6,
        vx: spd * Math.cos(Math.atan2(b.vy, b.vx) + rad),
        vy: spd * Math.sin(Math.atan2(b.vy, b.vx) + rad),
        stuckOnPaddle: false,
        trail: [],
        fire: b.fire || false,
      });
    }
  }

  // ── Procedural generation by pattern theme ──
  var genNames = ['Rows', 'Diamond', 'Checker', 'Fortress', 'Stripes', 'Rings', 'Scattered', 'Pyramid'];

  // ── Update ──
  function update(dt, input) {
    var ps = 340;
    var prevPaddleX = paddle.x;
    if (input.left)  paddle.x -= ps * dt;
    if (input.right) paddle.x += ps * dt;
    paddle.x = Math.max(10, Math.min(E.W - paddle.w - 10, paddle.x));
    paddle.vx = (paddle.x - prevPaddleX) / dt;

    if (state === 'ready') {
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
      if (input.action) {
        E.setLevel(1);
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

    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var b = balls[bi];
      if (b.stuckOnPaddle) {
        b.x = paddle.x + paddle.w / 2;
        b.y = paddle.y - b.r;
        continue;
      }

      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();

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
          balls.push({ x: paddle.x + paddle.w / 2, y: paddle.y - 6, r: 6, vx: 170, vy: -230, stuckOnPaddle: true, trail: [], fire: false });
          bricks = generateLevel(level); // regenerate bricks for new life
          state = 'ready';
          comboCount = 0;
          E.playExplode();
          return;
        }
        continue;
      }

      // Paddle
      if (b.vy > 0 && b.y + b.r >= paddle.y && b.y + b.r <= paddle.y + paddle.h + 6 &&
          b.x >= paddle.x - b.r && b.x <= paddle.x + paddle.w + b.r) {
        b.vy = -Math.abs(b.vy);
        var hp = Math.max(0, Math.min(1, (b.x - paddle.x) / paddle.w));
        b.vx = (hp - 0.5) * 2 * 200 + paddle.vx * 0.15;
        var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (spd < 160) { var r2 = 160 / spd; b.vx *= r2; b.vy *= r2; }
        if (spd > 400) { var r2 = 400 / spd; b.vx *= r2; b.vy *= r2; }
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
        if (dx * dx + dy * dy >= b.r * b.r) continue;

        comboCount++;
        var dmg = b.fire ? 3 : 1;
        brick.hp -= dmg;

        E.emitParticles(particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 5,
          { speedMin: 20, speedMax: 60, lifeMin: 0.2, lifeMax: 0.35 });

        if (brick.hp <= 0) {
          var bonus = Math.min(comboCount, 25) * 4;
          var pts = Math.floor((100 + brick.maxHp * 50 + bonus) * scoreMultiplier);
          E.addScore(pts);
          totalBricksDestroyed++;

          // Explosive brick
          if (brick.type === 'explosive') {
            var ex = brick.x, ey = brick.y;
            E.emitParticles(particles, ex + brick.w / 2, ey + brick.h / 2, '#ff6600', 30, { speedMin: 60, speedMax: 150, lifeMax: 0.5 });
            E.shake(6, 0.3);
            // Destroy nearby bricks
            for (var k = bricks.length - 1; k >= 0; k--) {
              var other = bricks[k];
              var dist = Math.abs(other.x - ex) + Math.abs(other.y - ey);
              if (dist < 100 && k !== j) {
                E.addScore(50);
                E.emitParticles(particles, other.x + other.w / 2, other.y + other.h / 2, other.color, 5, { lifeMax: 0.3 });
                bricks.splice(k, 1);
                if (k < j) j--;
              }
            }
          }

          bricks.splice(j, 1);
          E.playExplode();
          if (Math.random() < 0.14) spawnPowerup(brick.x + brick.w / 2, brick.y);
        } else {
          E.addScore(10 * scoreMultiplier);
          E.playHit();
        }

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

  function generateLevel(lvl) {
    var idx = Math.max(0, (lvl - 1) % generators.length);
    return generators[idx](lvl);
  }

  function applyPowerup(pu) {
    switch (pu.type) {
      case 'wide':
        paddle.w = Math.min(150, paddle.w + 20);
        break;
      case 'slow':
        for (var i = 0; i < balls.length; i++) {
          var spd = Math.sqrt(balls[i].vx * balls[i].vx + balls[i].vy * balls[i].vy);
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
      case 'catch':
        hasCatchBall = true;
        break;
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    var genIdx = Math.max(0, (level - 1) % generators.length);

    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      E.rect(b.x, b.y, b.w, b.h, b.color);
      if (b.type === 'steel') E.rectStroke(b.x, b.y, b.w, b.h, '#8888aa', 2);
      else E.rectStroke(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.1)');
      if (b.type === 'explosive') {
        ctx.fillStyle = 'rgba(255,100,0,0.3)';
        ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
      }
      if (b.hp > 1 && b.hp < 10) {
        E.text('' + b.hp, b.x + b.w / 2, b.y + 2, 7, 'rgba(0,0,0,0.5)', 'center');
      }
      if (b.hp > 1 && b.type !== 'steel') {
        E.rect(b.x, b.y - 3, b.w, 2, 'rgba(0,0,0,0.3)');
        E.rect(b.x, b.y - 3, b.w * (b.hp / b.maxHp), 2, '#44ff44');
      }
    }

    // Powerups
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
        ctx.globalAlpha = (t / b.trail.length) * 0.25;
        E.circle(b.trail[t].x, b.trail[t].y, b.r * (0.3 + 0.7 * t / b.trail.length), b.fire ? '#ffaa00' : '#aaddff');
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
    if (hasCatchBall) E.rectStroke(paddle.x, paddle.y, paddle.w, paddle.h, '#ffdd00', 2);
    if (fireBallActive) E.rectStroke(paddle.x - 2, paddle.y - 2, paddle.w + 4, paddle.h + 4, '#ff4400', 1);

    E.drawParticles(ctx, particles);

    // HUD
    E.text('LV.' + level + ' [' + genNames[genIdx] + ']', 8, 8, 7, '#00ff88');
    E.text('SCORE: ' + E.getScore(), E.W - 8, 8, 8, '#ffaa00', 'right');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, E.W / 2, 8, 8, '#ff6666', 'center');
    E.text('BRICKS: ' + bricks.length, 8, 20, 7, '#88aacc');
    if (comboCount >= 5) E.text('COMBO x' + comboCount, E.W / 2, 20, 7, '#ffdd00', 'center');

    if (scoreMultiplier > 1) {
      E.text('x' + scoreMultiplier.toFixed(1) + ' SCORE', E.W - 8, 20, 7, '#ff8800', 'right');
    }

    var cx = E.W / 2, cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('BLOCK BREAKER', cx, 80, 18, '#44ccff', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 115, 11, '#ffaa00', '#000');
      E.textCenter('Pattern: ' + genNames[genIdx], cx, 140, 8, '#888');
      E.textCenter('← → to move · P to pause', cx, 180, 8, '#aaa');
      E.textCenter('PRESS ENTER TO START', cx, 230, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 50, 18, '#ff4444', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, cy - 15, 9, '#ff8800', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 8, 11, '#ffaa00', '#000');
      var best = window.FreeArcadeSave.getHighScore('BlockBreaker');
      if (E.getScore() >= best) E.textCenter('★ NEW BEST ★', cx, cy + 28, 8, '#ffdd00');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 55, 8, '#aaa');
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

  window.BlockBreaker = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
