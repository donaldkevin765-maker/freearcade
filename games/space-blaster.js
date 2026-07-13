/**
 * Space Blaster — infinite side-scrolling shooter with permanent upgrades
 *
 * Infinite waves that scale forever. Play until you die.
 * Earn coins to buy permanent upgrades between runs.
 * Boss every 5 waves, enemy variety scales infinitely.
 *
 * Key features for long sessions:
 *  - No win condition: the game only ends when you run out of lives
 *  - Wave count = primary progression metric
 *  - Enemy HP/speed/count scale with a formula that stays fair
 *  - Boss every 5 waves with increasing HP
 *  - Coins dropped by enemies, used for permanent upgrades
 *  - High score saved to localStorage
 */
(function () {
  'use strict';

  var E;
  var player, bullets, enemies, particles, stars, coinDrops;
  var state;
  var wave;
  var enemiesSpawnedThisWave, enemiesKilledThisWave;
  var waveSpawnCount;
  var fireCooldown, enemySpawnTimer;
  var invincibleTimer = 0;
  var INVINCIBLE_DURATION = 1.5;
  var comboCount = 0;
  var comboTimer = 0;
  var MAX_ENEMIES = 22;
  var coinsThisRun = 0;
  var totalEnemiesKilledThisRun = 0;

  // Boss tracking
  var hasBossThisWave = false;
  var bossSpawned = false;

  // Permanent upgrades (from save system)
  var upgradeLevels = {
    fireRate: 0,
    shield: 0,
    damage: 0,
    speed: 0,
  };

  var ENEMY_TYPES = [
    { w: 20, h: 16, hp: 1, speed: 90, score: 100, coins: 2, color: '#ff4444', pattern: 'straight' },
    { w: 24, h: 20, hp: 2, speed: 70, score: 200, coins: 4, color: '#ff8800', pattern: 'sine' },
    { w: 28, h: 24, hp: 3, speed: 60, score: 350, coins: 6, color: '#cc44ff', pattern: 'zigzag' },
    { w: 26, h: 18, hp: 2, speed: 130, score: 250, coins: 5, color: '#ffcc00', pattern: 'swoop' },
    { w: 34, h: 28, hp: 4, speed: 40, score: 500, coins: 10, color: '#44ff88', pattern: 'straight' },
    { w: 22, h: 20, hp: 2, speed: 100, score: 300, coins: 6, color: '#ff66ff', pattern: 'teleport' },
  ];

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = {
      x: 60, y: E.H / 2,
      w: 24, h: 18,
      speed: 220,
      maxShield: 0,  // set from upgrades
      shield: 0,
    };

    bullets = [];
    enemies = [];
    particles = [];
    stars = [];
    coinDrops = [];

    // Load permanent upgrades
    try {
      upgradeLevels.fireRate = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'fireRate') || 0;
      upgradeLevels.shield = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'shield') || 0;
      upgradeLevels.damage = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'damage') || 0;
      upgradeLevels.speed = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'speed') || 0;
    } catch (e) {}

    // Apply upgrades
    player.speed = 220 + upgradeLevels.speed * 30;
    player.maxShield = upgradeLevels.shield;
    player.shield = upgradeLevels.shield;

    // Stars with parallax
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
    enemiesSpawnedThisWave = 0;
    enemiesKilledThisWave = 0;
    waveSpawnCount = Math.min(6 + wave * 2, 45);
    fireCooldown = 0;
    enemySpawnTimer = 0;
    invincibleTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    coinsThisRun = 0;
    totalEnemiesKilledThisRun = 0;
    hasBossThisWave = (wave % 5 === 0);
    bossSpawned = false;

    E.setScore(0);
    E.setLives(3);
  }

  // ── Enemy spawning ──
  function spawnEnemy() {
    var typeCount = Math.min(ENEMY_TYPES.length, 2 + Math.floor(wave / 3));
    var idx = Math.floor(Math.random() * Math.min(typeCount, ENEMY_TYPES.length));
    var t = ENEMY_TYPES[idx];

    var scale = 1 + (wave - 1) * 0.07;
    var hpBonus = Math.floor((wave - 1) / 8);
    var scoreBonus = Math.floor(wave / 3) * 50;
    var coinBonus = Math.floor(wave / 5);

    // Higher waves spawn more dangerous enemies
    if (wave > 10 && Math.random() < 0.2) idx = 4;
    if (wave > 20 && Math.random() < 0.15) idx = 5;

    var e = {
      x: E.W + 20,
      y: 25 + Math.random() * (E.H - 80),
      w: t.w, h: t.h,
      hp: t.hp + hpBonus,
      maxHp: t.hp + hpBonus,
      speed: (t.speed + Math.random() * 30) * scale,
      score: t.score + scoreBonus,
      coins: t.coins + coinBonus,
      color: t.color,
      pattern: t.pattern,
      shootTimer: 0.8 + Math.random() * 1.5 - wave * 0.02,
      sinePhase: Math.random() * Math.PI * 2,
      sineAmp: 25 + Math.random() * 30,
      flashTimer: 0,
      swoopPhase: 0,
      swoopDir: Math.random() > 0.5 ? 1 : -1,
      teleportTimer: 2,
    };
    e.shootTimer = Math.max(0.4, e.shootTimer);
    enemies.push(e);
    enemiesSpawnedThisWave++;
  }

  function spawnBoss() {
    var bossWave = Math.floor(wave / 5);
    var hp = 10 + bossWave * 8;
    var w = Math.min(60 + bossWave * 5, 100);
    var h = Math.min(40 + bossWave * 4, 70);

    var boss = {
      x: E.W + 20,
      y: E.H / 2 - h / 2,
      w: w, h: h,
      hp: hp,
      maxHp: hp,
      speed: Math.max(15, 35 - bossWave * 1.5),
      score: 1000 + bossWave * 500,
      coins: 20 + bossWave * 10,
      color: bossWave % 3 === 0 ? '#ff2222' : (bossWave % 3 === 1 ? '#ff44ff' : '#ffdd00'),
      pattern: 'boss',
      shootTimer: 0.5,
      flashTimer: 0,
      isBoss: true,
      attackPhase: 0,
      attackTimer: 0,
      sinePhase: 0,
    };
    enemies.push(boss);
    enemiesSpawnedThisWave++;
    bossSpawned = true;
  }

  function spawnBullet(x, y, vx, vy, isEnemy) {
    bullets.push({ x: x, y: y, w: 6, h: 6, vx: vx, vy: vy, isEnemy: isEnemy, life: 3 });
  }

  function spawnCoinDrop(x, y, amount) {
    for (var i = 0; i < Math.min(amount, 5); i++) {
      coinDrops.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vy: -30 - Math.random() * 30,
        life: 2 + Math.random(),
        amount: 1,
        size: 3 + Math.random() * 2,
      });
    }
  }

  // ── Update ──
  function update(dt, input) {
    // Stars
    for (var i = 0; i < stars.length; i++) {
      stars[i].x -= stars[i].speed * dt;
      if (stars[i].x < -5) {
        stars[i].x = E.W + 5;
        stars[i].y = Math.random() * E.H;
      }
    }

    // Combo decay
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboCount = 0; }
    if (invincibleTimer > 0) invincibleTimer -= dt;

    // Coin drops
    for (var i = coinDrops.length - 1; i >= 0; i--) {
      var c = coinDrops[i];
      c.y += c.vy * dt;
      c.vy += 60 * dt;
      c.life -= dt;
      if (c.life <= 0) { coinDrops.splice(i, 1); continue; }
      // Magnet: coins near player get pulled
      var dx = player.x + player.w / 2 - c.x;
      var dy = player.y + player.h / 2 - c.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 60) {
        c.x += dx / dist * 200 * dt;
        c.y += dy / dist * 200 * dt;
      }
      // Collect
      if (dist < 15) {
        coinsThisRun += c.amount;
        try { window.FreeArcadeSave.addCoins(c.amount); } catch(e) {}
        coinDrops.splice(i, 1);
        E.playSound('blip');
      }
    }

    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'gameover') {
      // Save high score
      try {
        window.FreeArcadeSave.setHighScore('SpaceBlaster', E.getScore());
        window.FreeArcadeSave.setBestWaves(wave);
        window.FreeArcadeSave.incrementStat('totalEnemiesKilled', totalEnemiesKilledThisRun);
      } catch (e) {}
      if (input.action) {
        E.setLevel(1);
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
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'])) {
      var baseRate = Math.max(0.08, 0.22 - upgradeLevels.fireRate * 0.025);
      var waveBonus = Math.max(0, 0.2 - wave * 0.008);
      var rate = Math.max(0.06, baseRate - waveBonus * 0.5);
      fireCooldown = rate;

      if (wave >= 5) {
        // Triple spread (wider at higher waves)
        var spread = 40 + wave * 0.5;
        spawnBullet(player.x + player.w, player.y + 2, 420, -spread, false);
        spawnBullet(player.x + player.w, player.y + player.h / 2 - 3, 440, 0, false);
        spawnBullet(player.x + player.w, player.y + player.h - 2, 420, spread, false);
        if (wave >= 10 && upgradeLevels.fireRate >= 2) {
          // Additional 5th bullet at high wave + upgrade
          spawnBullet(player.x + player.w, player.y + player.h / 4, 400, -spread * 0.6, false);
          spawnBullet(player.x + player.w, player.y + player.h * 0.75, 400, spread * 0.6, false);
        }
      } else if (wave >= 3) {
        spawnBullet(player.x + player.w, player.y + 2, 410, -35, false);
        spawnBullet(player.x + player.w, player.y + player.h - 2, 410, 35, false);
      } else {
        spawnBullet(player.x + player.w, player.y + player.h / 2 - 3, 400, 0, false);
      }
      E.playShoot();
    }

    var damageBonus = 1 + upgradeLevels.damage;

    // Update bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.x > E.W + 20 || b.y < -20 || b.y > E.H + 20) { bullets.splice(i, 1); continue; }

      if (!b.isEnemy) {
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
            bullets.splice(i, 1);
            e.hp -= damageBonus;
            e.flashTimer = 0.08;
            if (e.hp <= 0) {
              // Enemy killed
              comboCount++;
              comboTimer = 2;
              var mult = 1 + Math.floor(comboCount / 5) * 0.5;
              var points = Math.floor(e.score * mult);
              var count = e.isBoss ? 40 : 12;
              E.emitParticles(particles, e.x + e.w / 2, e.y + e.h / 2, e.color, count,
                { speedMin: 20, speedMax: e.isBoss ? 200 : 100, lifeMax: 0.6 });
              if (e.isBoss) E.shake(8, 0.4);

              // Coin drops
              if (!e.isBoss) spawnCoinDrop(e.x + e.w / 2, e.y + e.h / 2, e.coins);
              else spawnCoinDrop(e.x + e.w / 2, e.y + e.h / 2, e.coins);

              enemies.splice(j, 1);
              E.addScore(points);
              enemiesKilledThisWave++;
              totalEnemiesKilledThisRun++;
              E.playExplode();
            } else {
              E.playHit();
            }
            break;
          }
        }
      } else {
        // Enemy bullet hits player
        if (invincibleTimer <= 0 &&
            b.x < player.x + player.w && b.x + b.w > player.x &&
            b.y < player.y + player.h && b.y + b.h > player.y) {
          bullets.splice(i, 1);
          E.emitParticles(particles, player.x + player.w / 2, player.y + player.h / 2, '#00ffff', 12,
            { speedMin: 30, speedMax: 100, lifeMax: 0.4 });

          if (player.shield > 0) {
            player.shield--;
            E.playHit();
            E.shake(3, 0.15);
            invincibleTimer = 0.5;
          } else {
            invincibleTimer = INVINCIBLE_DURATION;
            if (!E.loseLife()) {
              state = 'gameover';
              E.playGameOver();
              return;
            }
            E.shake(5, 0.25);
            E.playExplode();
          }
        }
      }
    }

    // Update enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.flashTimer = Math.max(0, e.flashTimer - dt);
      e.shootTimer -= dt;

      // Movement patterns
      switch (e.pattern) {
        case 'straight':
          e.x -= e.speed * dt;
          break;
        case 'sine':
          e.x -= e.speed * dt;
          e.sinePhase += dt * (2.5 + wave * 0.05);
          e.y += Math.sin(e.sinePhase) * e.sineAmp * dt;
          break;
        case 'zigzag':
          e.x -= e.speed * dt;
          e.y += e.swoopDir * (100 + wave * 3) * dt;
          if (e.y < 20 || e.y > E.H - e.h - 20) e.swoopDir *= -1;
          break;
        case 'swoop':
          e.x -= e.speed * 0.6 * dt;
          if (e.x < E.W * 0.7) {
            var ty = player.y + player.h / 2 - e.h / 2;
            e.y += (ty - e.y) * 2.5 * dt;
          } else {
            e.y += Math.sin(e.swoopPhase) * 60 * dt;
          }
          break;
        case 'teleport':
          e.x -= e.speed * dt;
          e.teleportTimer -= dt;
          if (e.teleportTimer <= 0) {
            e.x = E.W * 0.5 + Math.random() * E.W * 0.4;
            e.y = 30 + Math.random() * (E.H - 80);
            e.teleportTimer = 2 + Math.random();
            E.emitParticles(particles, e.x + e.w / 2, e.y + e.h / 2, '#ff66ff', 8, { lifeMax: 0.3 });
          }
          break;
        case 'boss':
          bossMovement(e, dt);
          break;
      }

      e.y = Math.max(10, Math.min(E.H - e.h - 10, e.y));

      // Boss enter screen
      if (e.isBoss && e.x > E.W - e.w - 60) e.x -= e.speed * dt * 0.3;

      // Shooting
      if (e.shootTimer <= 0) {
        if (e.isBoss) bossShoot(e);
        else {
          var aimSpread = Math.max(0.1, 0.5 - wave * 0.015);
          var dx = (player.x + player.w / 2) - (e.x + e.w / 2);
          var dy = (player.y + player.h / 2) - (e.y + e.h / 2);
          dy += (Math.random() - 0.5) * aimSpread * Math.abs(dy);
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          spawnBullet(e.x, e.y + e.h / 2 - 3, dx / dist * (180 + wave * 3), dy / dist * (180 + wave * 3), true);
          e.shootTimer = Math.max(0.4, 1.2 + Math.random() * 1.2 - wave * 0.03);
        }
      }

      // Enemy-player collision
      if (invincibleTimer <= 0 &&
          e.x < player.x + player.w && e.x + e.w > player.x &&
          e.y < player.y + player.h && e.y + e.h > player.y) {
        E.emitParticles(particles, e.x + e.w / 2, e.y + e.h / 2, e.color, 15, { lifeMax: 0.4 });
        if (e.isBoss) {
          e.hp = Math.max(0, e.hp - 3);
          if (e.hp <= 0) { enemies.splice(i, 1); enemiesKilledThisWave++; spawnCoinDrop(e.x + e.w / 2, e.y + e.h / 2, e.coins); }
        } else {
          enemies.splice(i, 1);
        }
        if (player.shield > 0) {
          player.shield--;
          invincibleTimer = 0.5;
          E.playHit();
        } else {
          invincibleTimer = INVINCIBLE_DURATION;
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          E.shake(5, 0.25);
          E.playExplode();
        }
      }
    }

    // Spawn enemies
    if (enemiesSpawnedThisWave < waveSpawnCount) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        if (hasBossThisWave && !bossSpawned) {
          spawnBoss();
          enemySpawnTimer = 2.5;
        } else if (enemies.length < MAX_ENEMIES) {
          spawnEnemy();
          enemySpawnTimer = Math.max(0.18, 0.9 - wave * 0.025);
        } else enemySpawnTimer = 0.3;
      }
    }

    // Remove off-screen enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].x < -120) enemies.splice(i, 1);
    }

    // Wave transition: when all enemies for this wave are spawned AND killed
    if (enemiesSpawnedThisWave >= waveSpawnCount && enemies.length === 0 && enemiesKilledThisWave > 0) {
      wave++;
      enemiesSpawnedThisWave = 0;
      enemiesKilledThisWave = 0;
      waveSpawnCount = Math.min(6 + wave * 2, 48);
      hasBossThisWave = (wave % 5 === 0);
      bossSpawned = false;
      enemySpawnTimer = 0.5;
      E.playLevelUp();
      E.addScore(wave * 50); // wave completion bonus
    }

    E.updateParticles(particles, dt);
  }

  function bossMovement(e, dt) {
    e.attackTimer += dt;
    var speed = e.speed;
    if (e.x > E.W * 0.6) { e.x -= speed * dt; return; }

    var phase = Math.floor(e.attackTimer / 3) % 3;
    switch (phase) {
      case 0: // Sine sweep
        e.sinePhase += dt * 1.8;
        e.y += Math.sin(e.sinePhase) * 50 * dt;
        e.x -= speed * 0.3 * dt;
        break;
      case 1: // Move toward player
        var ty = player.y + player.h / 2 - e.h / 2;
        e.y += (ty - e.y) * 1.2 * dt;
        e.x -= speed * 0.5 * dt;
        break;
      case 2: // Hold position, fire heavily
        e.x -= speed * 0.2 * dt;
        break;
    }
    e.y = Math.max(15, Math.min(E.H - e.h - 15, e.y));
  }

  function bossShoot(e) {
    var r = Math.random();
    var bossWave = Math.floor(wave / 5);
    var bulletCount = Math.min(3 + bossWave, 8);

    if (r < 0.35) {
      // Aimed burst
      for (var k = 0; k < Math.min(1 + bossWave, 4); k++) {
        var dx = (player.x + player.w / 2) - (e.x + e.w / 2) + (Math.random() - 0.5) * 30;
        var dy = (player.y + player.h / 2) - (e.y + e.h / 2) + (Math.random() - 0.5) * 30;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        setTimeout(function (tdx, tdy) {
          spawnBullet(e.x, e.y + e.h / 2 - 3, tdx / Math.sqrt(tdx*tdx + tdy*tdy) * 220, tdy / Math.sqrt(tdx*tdx + tdy*tdy) * 220, true);
        }, k * 120, dx, dy);
      }
    } else if (r < 0.65) {
      // Spread fan
      var step = 180 / (bulletCount + 1);
      for (var a = -90 + step; a < 90; a += step) {
        var rad = a * Math.PI / 180;
        spawnBullet(e.x, e.y + e.h / 2, Math.cos(rad) * 200 - 100, Math.sin(rad) * 200, true);
      }
    } else {
      // Circle burst
      var count = bulletCount * 2;
      for (var a = 0; a < 360; a += 360 / count) {
        var rad = a * Math.PI / 180;
        spawnBullet(e.x + e.w / 2, e.y + e.h / 2, Math.cos(rad) * 150, Math.sin(rad) * 150, true);
      }
    }
    e.shootTimer = 0.6 + Math.random() * 0.8;
    E.playBeep(200, 0.06, 'square', 0.05);
  }

  // ── Render ──
  function render(ctx) {
    // Stars
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = s.bright * 0.8;
      E.circle(s.x, s.y, s.size, 'rgba(200,200,255,0.6)');
    }
    ctx.globalAlpha = 1;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('SPACE BLASTER', E.W / 2, 55, 20, '#ff4444', '#000');
      E.textCenterShadow('WAVE ' + wave, E.W / 2, 95, 14, '#ffaa00', '#000');
      if (hasBossThisWave) E.textCenter('⚠ BOSS WAVE ⚠', E.W / 2, 125, 10, '#ff2222');
      // Show upgrades
      E.textCenter('UPGRADES:', E.W / 2, 155, 8, '#888');
      var upStr = '❤x' + player.maxShield + '  DMG+' + upgradeLevels.damage + '  SPD+' + upgradeLevels.speed;
      E.textCenter(upStr, E.W / 2, 170, 7, '#aaa');
      E.textCenter('Coins: ' + window.FreeArcadeSave.getCoins(), E.W / 2, 190, 8, '#ffdd00');
      E.textCenter('Best Wave: ' + window.FreeArcadeSave.getBestWaves(), E.W / 2, 205, 7, '#888');
      E.textCenter('← → ↑ ↓ move · SPACE shoot · P pause', E.W / 2, 230, 7, '#666');
      if (upgradeLevels.fireRate > 0 || upgradeLevels.damage > 0) {
        E.textCenter('PRESS ENTER TO START', E.W / 2, 270, 10, '#00ff88');
      } else {
        E.textCenter('PRESS ENTER TO START', E.W / 2, 270, 10, '#00ff88');
      }
      return;
    }

    if (state === 'gameover') {
      renderWorld(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', E.W / 2, E.H / 2 - 55, 22, '#ff2222', '#000');
      E.textCenterShadow('WAVE ' + wave, E.W / 2, E.H / 2 - 20, 10, '#ff8800', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 5, 12, '#ffaa00', '#000');
      // Check if new high score
      var hs = window.FreeArcadeSave.getHighScore('SpaceBlaster');
      if (E.getScore() >= hs) E.textCenter('★ NEW HIGH SCORE ★', E.W / 2, E.H / 2 + 25, 9, '#ffdd00');
      E.textCenter('COINS THIS RUN: ' + coinsThisRun, E.W / 2, E.H / 2 + 42, 8, '#ffdd00');
      E.textCenter('PRESS ENTER TO RETRY', E.W / 2, E.H / 2 + 65, 8, '#aaa');
      return;
    }

    renderWorld(ctx);
  }

  function renderWorld(ctx) {
    // Player
    var showPlayer = true;
    if (invincibleTimer > 0) showPlayer = Math.floor(invincibleTimer * 10) % 2 === 0;
    if (showPlayer) {
      ctx.fillStyle = '#00ddff';
      ctx.beginPath();
      ctx.moveTo(player.x + player.w, player.y + player.h / 2);
      ctx.lineTo(player.x, player.y);
      ctx.lineTo(player.x, player.y + player.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(player.x - 4, player.y + player.h / 2 - 2, 4, 4);
      // Shield indicator
      if (player.shield > 0) {
        ctx.strokeStyle = 'rgba(0,221,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.flashTimer > 0) { ctx.fillStyle = '#ffffff'; }
      else { ctx.fillStyle = e.color; }
      ctx.fillRect(e.x, e.y, e.w, e.h);

      if (!e.isBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
        ctx.fillRect(e.x + e.w - 8, e.y + 4, 4, 4);
        if (e.maxHp > 1) {
          E.rect(e.x, e.y - 5, e.w, 3, 'rgba(0,0,0,0.4)');
          E.rect(e.x, e.y - 5, e.w * (e.hp / e.maxHp), 3, '#44ff44');
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(e.x + 10, e.y + 8, 8, 8);
        ctx.fillRect(e.x + e.w - 18, e.y + 8, 8, 8);
        // Boss HP bar
        E.rect(e.x, e.y - 10, e.w, 5, '#333');
        var hpR = e.hp / e.maxHp;
        E.rect(e.x, e.y - 10, e.w * hpR, 5, hpR > 0.5 ? '#00ff88' : (hpR > 0.25 ? '#ffaa00' : '#ff4444'));
      }
    }

    // Bullets
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      E.rect(b.x, b.y, b.w, b.h, b.isEnemy ? '#ff4444' : '#ffff44');
    }

    // Coin drops
    for (var i = 0; i < coinDrops.length; i++) {
      var c = coinDrops[i];
      ctx.globalAlpha = Math.min(1, c.life);
      E.circle(c.x, c.y, c.size, '#ffdd00');
      E.circle(c.x, c.y, c.size - 1, '#ffffff');
    }
    ctx.globalAlpha = 1;

    // Particles
    E.drawParticles(ctx, particles);

    // HUD
    E.text('SCORE: ' + E.getScore(), 8, 8, 8, '#ffaa00');
    E.text('WAVE: ' + wave, 8, 20, 8, '#00ff88');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, 8, 32, 8, '#ff6666');
    E.text('✦' + coinsThisRun, E.W - 8, 8, 8, '#ffdd00', 'right');

    if (comboCount >= 3) {
      E.text('COMBO x' + (1 + Math.floor(comboCount / 5) * 0.5).toFixed(1), E.W - 8, 20, 7, '#ffdd00', 'right');
    }

    // Boss warning border
    if (state === 'playing' && hasBossThisWave && enemies.length > 0) {
      var found = false;
      for (var i = 0; i < enemies.length; i++) { if (enemies[i].isBoss) found = true; }
      if (found) {
        ctx.fillStyle = 'rgba(255,0,0,' + (0.25 + Math.sin(Date.now() / 200) * 0.15) + ')';
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
