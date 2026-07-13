/**
 * Space Blaster — side-scrolling shooter with waves, bosses, and combo system
 *
 * Uses FreeArcadeEngine via `this.engine` in init()
 *
 * Game feel:
 *  - Invincibility frames (1.5s) with visual blink after being hit
 *  - Screen shake on explosions
 *  - Consecutive kill combo bonus
 *  - Enemy hit flash
 *  - Boss enemies every 5 waves
 *  - Progressive difficulty: more enemies, faster, tougher
 *  - Dual/triple shot upgrades at waves 3 and 5
 */
(function () {
  'use strict';

  var E; // engine reference, set in init()
  var player, bullets, enemies, particles, stars;
  var state;           // 'ready' | 'playing' | 'gameover' | 'levelComplete'
  var waveSize;
  var enemiesSpawned, enemiesKilled;
  var fireCooldown, enemySpawnTimer;
  var waveCount;

  // Invincibility after hit
  var invincibleTimer = 0;
  var INVINCIBLE_DURATION = 1.5;

  // Combo system
  var comboCount = 0;
  var comboTimer = 0;

  // Enemy cap
  var MAX_ENEMIES = 20;

  // ── Enemy type definitions ──
  var ENEMY_TYPES = [
    // type 0: basic 1HP (always available)
    { w: 20, h: 16, hp: 1, speed: 90, score: 100, color: '#ff4444', pattern: 'straight' },
    // type 1: sine wave 2HP (from wave 2)
    { w: 24, h: 20, hp: 2, speed: 70, score: 200, color: '#ff8800', pattern: 'sine' },
    // type 2: zigzag 3HP (from wave 4)
    { w: 28, h: 24, hp: 3, speed: 60, score: 350, color: '#cc44ff', pattern: 'zigzag' },
    // type 3: swooper 2HP (from wave 3)
    { w: 26, h: 18, hp: 2, speed: 130, score: 250, color: '#ffcc00', pattern: 'swoop' },
    // type 4: tank 4HP (from wave 6)
    { w: 34, h: 28, hp: 4, speed: 40, score: 500, color: '#44ff88', pattern: 'straight' },
  ];

  var BOSS_TYPES = [
    // wave 5 boss
    { w: 70, h: 50, hp: 15, speed: 30, score: 2000, color: '#ff2222', pattern: 'boss1' },
    // wave 10 boss
    { w: 80, h: 60, hp: 25, speed: 25, score: 5000, color: '#ff44ff', pattern: 'boss2' },
    // wave 15 boss
    { w: 90, h: 70, hp: 40, speed: 20, score: 10000, color: '#ffdd00', pattern: 'boss3' },
  ];

  function init() {
    E = this.engine;
    waveCount = E.getLevel();

    player = { x: 60, y: E.H / 2, w: 24, h: 18, speed: 220 };
    bullets = [];
    enemies = [];
    particles = [];
    stars = [];

    // Starfield with parallax layers
    for (var i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * E.W,
        y: Math.random() * E.H,
        speed: 30 + Math.random() * 100,
        size: 0.5 + Math.random() * 2.5,
        bright: 0.3 + Math.random() * 0.7
      });
    }

    state = 'ready';
    waveSize = Math.min(4 + waveCount * 2, 30);
    enemiesSpawned = 0;
    enemiesKilled = 0;
    fireCooldown = 0;
    enemySpawnTimer = 0;
    invincibleTimer = 0;
    comboCount = 0;
    comboTimer = 0;

    E.setScore(0);
    E.setLives(3);
  }

  // ── Spawning ──
  function spawnEnemy() {
    var availableTypes = [0];
    if (waveCount >= 2) availableTypes.push(1);
    if (waveCount >= 3) availableTypes.push(3);
    if (waveCount >= 4) availableTypes.push(2);
    if (waveCount >= 6) availableTypes.push(4);

    // Higher waves bias toward tougher enemies
    var idx;
    if (waveCount >= 8 && Math.random() < 0.3) {
      idx = 4; // tank
    } else {
      idx = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }
    var t = ENEMY_TYPES[idx];

    // Speed scales with wave
    var speedScale = 1 + (waveCount - 1) * 0.06;

    var enemy = {
      x: E.W + 20,
      y: 30 + Math.random() * (E.H - 90),
      w: t.w, h: t.h,
      hp: t.hp,
      maxHp: t.hp,
      speed: t.speed * speedScale,
      baseSpeed: t.speed * speedScale,
      score: t.score,
      color: t.color,
      pattern: t.pattern,
      shootTimer: 1 + Math.random() * 1.5,
      // Sine wave params
      sinePhase: Math.random() * Math.PI * 2,
      sineAmp: 30 + Math.random() * 30,
      // Hit flash
      flashTimer: 0,
      // Swoop params
      swoopPhase: 0,
      swoopDir: 1,
    };
    enemies.push(enemy);
    enemiesSpawned++;
  }

  function spawnBoss() {
    var bossIdx = Math.min(Math.floor((waveCount - 5) / 5), BOSS_TYPES.length - 1);
    if (bossIdx < 0) bossIdx = 0;
    var t = BOSS_TYPES[bossIdx];

    var boss = {
      x: E.W + 20,
      y: E.H / 2 - t.h / 2,
      w: t.w, h: t.h,
      hp: t.hp,
      maxHp: t.hp,
      speed: t.speed,
      baseSpeed: t.speed,
      score: t.score,
      color: t.color,
      pattern: t.pattern,
      shootTimer: 0.5,
      sinePhase: 0,
      sineAmp: 40,
      flashTimer: 0,
      swoopPhase: 0,
      swoopDir: 1,
      isBoss: true,
      attackPhase: 0,
      attackTimer: 0,
    };
    enemies.push(boss);
    enemiesSpawned++;
  }

  function spawnBullet(x, y, vx, vy, isEnemy) {
    bullets.push({ x: x, y: y, w: 6, h: 6, vx: vx, vy: vy, isEnemy: isEnemy, life: 3 });
  }

  // ── Update ──
  function update(dt, input) {
    // Parallax stars
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.x -= s.speed * dt;
      if (s.x < -5) {
        s.x = E.W + 5;
        s.y = Math.random() * E.H;
      }
    }

    // Combo timer decay
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) comboCount = 0;
    }

    // Invincibility decay
    if (invincibleTimer > 0) {
      invincibleTimer -= dt;
    }

    // State screens
    if (state === 'ready') {
      if (input.action) {
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
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
        E.setLevel(waveCount + 1);
        init.call({ engine: E });
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── PLAYING ──

    // Player movement
    if (input.left)  player.x -= player.speed * dt;
    if (input.right) player.x += player.speed * dt;
    if (input.up)    player.y -= player.speed * dt;
    if (input.down)  player.y += player.speed * dt;

    player.x = Math.max(10, Math.min(E.W - player.w - 10, player.x));
    player.y = Math.max(10, Math.min(E.H - player.h - 10, player.y));

    // Shooting
    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'] || input.touchTapped)) {
      var fireRate = waveCount >= 6 ? 0.13 : (waveCount >= 3 ? 0.18 : 0.24);
      fireCooldown = fireRate;

      if (waveCount >= 5) {
        // Triple spread shot
        spawnBullet(player.x + player.w, player.y + 3, 420, -60, false);
        spawnBullet(player.x + player.w, player.y + player.h / 2 - 3, 440, 0, false);
        spawnBullet(player.x + player.w, player.y + player.h - 3, 420, 60, false);
      } else if (waveCount >= 3) {
        // Dual shot
        spawnBullet(player.x + player.w, player.y + 2, 410, -40, false);
        spawnBullet(player.x + player.w, player.y + player.h - 2, 410, 40, false);
      } else {
        // Single shot
        spawnBullet(player.x + player.w, player.y + player.h / 2 - 3, 400, 0, false);
      }
      E.playShoot();
    }

    // Update bullets + collisions
    updateBullets(dt);

    // Update enemies
    updateEnemies(dt, input);

    // Spawn enemies in waves
    if (enemiesSpawned < waveSize + (Math.floor(waveCount / 5) > 0 ? 4 : 0)) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        // Wave 5, 10, 15 → boss wave
        if (waveCount % 5 === 0 && enemiesSpawned === 0 && enemies.length === 0) {
          spawnBoss();
          enemySpawnTimer = 2.0;
        } else if (enemies.length < MAX_ENEMIES) {
          spawnEnemy();
          enemySpawnTimer = Math.max(0.25, 1.0 - waveCount * 0.04);
        } else {
          enemySpawnTimer = 0.5;
        }
      }
    }

    // Remove off-screen enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].x < -100) {
        enemies.splice(i, 1);
      }
    }

    // Clean dead bullets that fell behind
    for (var i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].life <= 0) bullets.splice(i, 1);
    }

    // Particles
    E.updateParticles(particles, dt);

    // Win condition
    if (enemiesKilled >= waveSize + (Math.floor(waveCount / 5) > 0 ? 4 : 0) && enemies.length === 0) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function updateBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Out of bounds
      if (b.x < -20 || b.x > E.W + 20 || b.y < -20 || b.y > E.H + 20) {
        bullets.splice(i, 1);
        continue;
      }

      if (!b.isEnemy) {
        // Player bullet → hit enemies
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
            bullets.splice(i, 1);
            e.hp--;
            e.flashTimer = 0.08;

            if (e.hp <= 0) {
              // Combo
              comboCount++;
              comboTimer = 2.0;
              var comboMultiplier = 1 + Math.floor(comboCount / 5) * 0.5;
              var points = Math.floor(e.score * comboMultiplier);

              // Big explosion for boss, small for normal
              var count = e.isBoss ? 40 : 12;
              E.emitParticles(particles, e.x + e.w / 2, e.y + e.h / 2, e.color, count,
                { speedMin: 20, speedMax: e.isBoss ? 200 : 100, sizeMin: 2, sizeMax: e.isBoss ? 8 : 4, lifeMax: 0.6 });
              if (e.isBoss) E.shake(8, 0.4);

              enemies.splice(j, 1);
              E.addScore(points);
              enemiesKilled++;
              E.playExplode();
            } else {
              E.playHit();
            }
            // Player bullet can only hit one enemy per frame
            break;
          }
        }
      } else {
        // Enemy bullet → hit player
        if (invincibleTimer <= 0 &&
            b.x < player.x + player.w && b.x + b.w > player.x &&
            b.y < player.y + player.h && b.y + b.h > player.y) {
          bullets.splice(i, 1);
          E.emitParticles(particles, player.x + player.w / 2, player.y + player.h / 2, '#00ffff', 15,
            { speedMin: 30, speedMax: 100, lifeMax: 0.4 });
          invincibleTimer = INVINCIBLE_DURATION;
          if (!E.loseLife()) {
            state = 'gameover';
            E.playGameOver();
            return;
          } else {
            E.shake(4, 0.2);
            E.playExplode();
          }
        }
      }
    }
  }

  function updateEnemies(dt, input) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      e.flashTimer = Math.max(0, e.flashTimer - dt);
      e.shootTimer -= dt;

      // Movement by pattern
      switch (e.pattern) {
        case 'straight':
          e.x -= e.speed * dt;
          break;
        case 'sine':
          e.x -= e.speed * dt;
          e.sinePhase += dt * 3;
          e.y += Math.sin(e.sinePhase) * e.sineAmp * dt;
          break;
        case 'zigzag':
          e.x -= e.speed * dt;
          e.y += e.swoopDir * 100 * dt;
          if (e.y < 20 || e.y > E.H - e.h - 20) e.swoopDir *= -1;
          break;
        case 'swoop':
          e.swoopPhase += dt * 2.5;
          e.x -= e.speed * 0.6 * dt;
          // Swoop toward player
          var targetY = player.y + player.h / 2 - e.h / 2;
          if (e.x < E.W * 0.7) {
            e.y += (targetY - e.y) * 2.5 * dt;
          } else {
            e.y += Math.sin(e.swoopPhase) * 60 * dt;
          }
          break;
        case 'boss1':
        case 'boss2':
        case 'boss3':
          bossMovement(e, dt);
          break;
      }

      // Clamp Y
      e.y = Math.max(10, Math.min(E.H - e.h - 10, e.y));

      // Boss enters from right, stops in center
      if (e.isBoss && e.x > E.W - e.w - 60) {
        e.x -= e.speed * dt * 0.5;
      }

      // Shooting
      if (e.shootTimer <= 0) {
        if (e.isBoss) {
          bossShoot(e);
        } else {
          // Aim at player with accuracy that increases with wave
          var aimError = Math.max(0.1, 0.6 - waveCount * 0.03);
          var dx = (player.x + player.w / 2) - (e.x + e.w / 2);
          var dy = (player.y + player.h / 2) - (e.y + e.h / 2);
          dy += (Math.random() - 0.5) * aimError * Math.abs(dy);
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          spawnBullet(e.x, e.y + e.h / 2 - 3, dx / dist * 200, dy / dist * 200, true);
          e.shootTimer = 1.2 + Math.random() * 1.5 - waveCount * 0.04;
          e.shootTimer = Math.max(0.5, e.shootTimer);
        }
      }

      // Enemy collides with player
      if (invincibleTimer <= 0 &&
          e.x < player.x + player.w && e.x + e.w > player.x &&
          e.y < player.y + player.h && e.y + e.h > player.y) {
        E.emitParticles(particles, e.x + e.w / 2, e.y + e.h / 2, e.color, 15, { lifeMax: 0.4 });
        E.emitParticles(particles, player.x + player.w / 2, player.y + player.h / 2, '#00ffff', 15, { lifeMax: 0.4 });
        if (e.isBoss) {
          e.hp = Math.max(0, e.hp - 2);
          if (e.hp <= 0) {
            enemies.splice(i, 1);
            enemiesKilled++;
          }
        } else {
          enemies.splice(i, 1);
          i--;
        }
        invincibleTimer = INVINCIBLE_DURATION;
        if (!E.loseLife()) {
          state = 'gameover';
          E.playGameOver();
          return;
        } else {
          E.shake(5, 0.25);
          E.playExplode();
        }
      }
    }
  }

  function bossMovement(e, dt) {
    e.attackTimer += dt;
    e.x -= e.speed * dt * 0.3;

    // Attack pattern phases
    switch (e.attackPhase) {
      case 0: // Move to position
        if (e.x <= E.W - e.w - 80) e.attackPhase = 1;
        break;
      case 1: // Sine sweep
        e.sinePhase += dt * 1.5;
        e.y += Math.sin(e.sinePhase) * 50 * dt;
        if (e.attackTimer > 3) { e.attackPhase = 2; e.attackTimer = 0; }
        break;
      case 2: // Dive toward player
        var targetY = player.y + player.h / 2 - e.h / 2;
        e.y += (targetY - e.y) * 1.5 * dt;
        e.x -= e.speed * dt * 0.5;
        if (e.attackTimer > 2) { e.attackPhase = 0; e.attackTimer = 0; }
        break;
    }
    e.y = Math.max(15, Math.min(E.H - e.h - 15, e.y));
  }

  function bossShoot(e) {
    // Boss has different attack patterns
    var r = Math.random();
    if (r < 0.4) {
      // Aimed shot
      var dx = (player.x + player.w / 2) - (e.x + e.w / 2);
      var dy = (player.y + player.h / 2) - (e.y + e.h / 2);
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      spawnBullet(e.x, e.y + e.h / 2 - 3, dx / dist * 220, dy / dist * 220, true);
    } else if (r < 0.7) {
      // Spread shot
      spawnBullet(e.x, e.y + 2, -220, -80, true);
      spawnBullet(e.x, e.y + e.h / 2 - 3, -240, 0, true);
      spawnBullet(e.x, e.y + e.h - 2, -220, 80, true);
    } else {
      // Fan burst
      for (var a = -60; a <= 60; a += 30) {
        var rad = a * Math.PI / 180;
        spawnBullet(e.x, e.y + e.h / 2 - 3, Math.cos(rad) * 180 - 100, Math.sin(rad) * 180, true);
      }
    }
    e.shootTimer = 0.8 + Math.random() * 1.0;
    E.playBeep(200, 0.06, 'square', 0.06);
  }

  // ── Render ──
  function render(ctx) {
    // Stars
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var alpha = s.bright * 0.8;
      ctx.globalAlpha = alpha;
      E.circle(s.x, s.y, s.size, 'rgba(200,200,255,' + alpha + ')');
    }
    ctx.globalAlpha = 1;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('SPACE BLASTER', E.W / 2, 70, 20, '#ff4444', '#000');
      E.textCenterShadow('WAVE ' + waveCount, E.W / 2, 110, 14, '#ffaa00', '#000');
      if (waveCount % 5 === 0) {
        E.textCenter('⚠ BOSS WAVE ⚠', E.W / 2, 140, 10, '#ff2222');
      }
      E.textCenter('← → ↑ ↓ to move', E.W / 2, 180, 9, '#aaa');
      E.textCenter('SPACE / Z to shoot', E.W / 2, 205, 9, '#aaa');
      E.textCenter('P to pause', E.W / 2, 230, 8, '#666');
      E.textCenter('PRESS ENTER TO START', E.W / 2, 270, 11, '#00ff88');
      return;
    }

    if (state === 'gameover') {
      renderWorld(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', E.W / 2, E.H / 2 - 45, 22, '#ff2222', '#000');
      E.textCenterShadow('WAVE ' + waveCount, E.W / 2, E.H / 2 - 10, 10, '#ff8800', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 15, 12, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER TO RETRY', E.W / 2, E.H / 2 + 50, 9, '#aaa');
      return;
    }

    if (state === 'levelComplete') {
      renderWorld(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('WAVE ' + waveCount + ' CLEAR!', E.W / 2, E.H / 2 - 45, 16, '#00ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 - 5, 12, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR WAVE ' + (waveCount + 1), E.W / 2, E.H / 2 + 40, 9, '#aaa');
      return;
    }

    renderWorld(ctx);
  }

  function renderWorld(ctx) {
    // Player ship (with invincibility blink)
    var showPlayer = true;
    if (invincibleTimer > 0) {
      showPlayer = Math.floor(invincibleTimer * 10) % 2 === 0;
    }
    if (showPlayer) {
      ctx.fillStyle = '#00ddff';
      ctx.beginPath();
      ctx.moveTo(player.x + player.w, player.y + player.h / 2);
      ctx.lineTo(player.x, player.y);
      ctx.lineTo(player.x, player.y + player.h);
      ctx.closePath();
      ctx.fill();
      // Engine glow
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(player.x - 4, player.y + player.h / 2 - 2, 4, 4);
      // Cockpit
      ctx.fillStyle = 'rgba(0,200,255,0.4)';
      ctx.fillRect(player.x + 6, player.y + player.h / 2 - 2, 6, 4);
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      // Hit flash overlay
      if (e.flashTimer > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(e.x, e.y, e.w, e.h);
      } else {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.w, e.h);
      }
      // Details
      if (!e.isBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
        ctx.fillRect(e.x + e.w - 8, e.y + 4, 4, 4);
      } else {
        // Boss details
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(e.x + 10, e.y + 8, 8, 8);
        ctx.fillRect(e.x + e.w - 18, e.y + 8, 8, 8);
        ctx.fillRect(e.x + e.w / 2 - 4, e.y + e.h / 2 - 4, 8, 8);
        // Boss HP bar
        E.rect(e.x, e.y - 10, e.w, 5, '#333');
        var hpRatio = e.hp / e.maxHp;
        E.rect(e.x, e.y - 10, e.w * hpRatio, 5, hpRatio > 0.5 ? '#00ff88' : (hpRatio > 0.25 ? '#ffaa00' : '#ff4444'));
      }
      // HP bar for multi-HP enemies
      if (!e.isBoss && e.maxHp > 1) {
        E.rect(e.x, e.y - 6, e.w, 3, 'rgba(0,0,0,0.4)');
        E.rect(e.x, e.y - 6, e.w * (e.hp / e.maxHp), 3, '#44ff44');
      }
    }

    // Bullets
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      if (b.isEnemy) {
        E.rect(b.x, b.y, b.w, b.h, '#ff4444');
      } else {
        E.rect(b.x, b.y, b.w, b.h, '#ffff44');
      }
    }

    // Particles
    E.drawParticles(ctx, particles);

    // HUD
    E.text('SCORE: ' + E.getScore(), 8, 8, 9, '#ffaa00');
    E.text('WAVE: ' + waveCount, 8, 22, 9, '#00ff88');
    var livesStr = '';
    for (var i = 0; i < E.getLives(); i++) livesStr += '♥ ';
    E.text(livesStr, 8, 36, 9, '#ff6666');

    // Combo display
    if (comboCount >= 3) {
      E.text('COMBO x' + (1 + Math.floor(comboCount / 5) * 0.5).toFixed(1),
             E.W - 8, 8, 8, '#ffdd00', 'right');
    }

    // Boss warning
    if (waveCount % 5 === 0 && enemies.length > 0) {
      var hasBoss = false;
      for (var i = 0; i < enemies.length; i++) {
        if (enemies[i].isBoss) hasBoss = true;
      }
      if (hasBoss) {
        ctx.fillStyle = 'rgba(255,0,0,' + (0.3 + Math.sin(Date.now() / 200) * 0.2) + ')';
        ctx.fillRect(0, 0, E.W, 3);
        ctx.fillRect(0, E.H - 3, E.W, 3);
      }
    }
  }

  function destroy() {}

  window.SpaceBlaster = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
