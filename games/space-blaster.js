/**
 * Space Blaster — infinite side-scrolling shooter with essence system & in-run shop
 *
 * Creative twist: enemies drop colored "essence" orbs that grant temporary buffs.
 * Between waves, spend coins on temporary upgrades.
 * Boss every 5 waves with visual phases and distinct attacks.
 *
 * Features for long sessions:
 *  - 8 enemy types with distinct behaviors (splitter, shield, bomber, etc.)
 *  - Boss with phase-based attacks and visual weak points
 *  - Colored essence: red (damage), blue (speed), green (shield), gold (score)
 *  - In-run wave shop between waves
 *  - Permanent upgrades from save system
 *  - Better particles, screen effects, engine trails
 */
(function () {
  'use strict';

  var E;
  var player, bullets, enemies, particles, stars, coinDrops, essenceDrops;
  var state;
  var wave;
  var enemiesSpawnedThisWave, enemiesKilledThisWave;
  var waveSpawnCount;
  var fireCooldown, enemySpawnTimer;
  var invincibleTimer = 0;
  var INVINCIBLE_DURATION = 1.5;
  var comboCount = 0;
  var comboTimer = 0;
  var MAX_ENEMIES = 28;
  var coinsThisRun = 0;
  var totalEnemiesKilledThisRun = 0;
  var playTime = 0;

  // Essence system
  var essenceBuffs = { damage: 0, speed: 0, shield: 0, scoreMult: 1 };
  var essenceTimers = { damage: 0, speed: 0, shield: 0, scoreMult: 0 };
  var ESSENCE_DURATION = 8;

  // In-run shop
  var inRunShopActive = false;
  var inRunShopItems = [];
  var inRunShopSelection = 0;

  // Boss tracking
  var hasBossThisWave = false;
  var bossSpawned = false;
  var bossPhase = 0;
  var bossPhaseTimer = 0;

  // Permanent upgrades
  var upgradeLevels = { fireRate: 0, shield: 0, damage: 0, speed: 0 };

  // Engine trail
  var engineTrail = [];

  // ── Enemy type definitions ──
  var ENEMY_TYPES = [
    { id: 'basic',    w: 20, h: 16, hp: 1, speed: 90,  score: 100, coins: 2, color: '#ff4444', pattern: 'straight', essence: 'red' },
    { id: 'sine',     w: 24, h: 20, hp: 2, speed: 70,  score: 200, coins: 4, color: '#ff8800', pattern: 'sine',     essence: 'gold' },
    { id: 'zigzag',   w: 28, h: 24, hp: 3, speed: 60,  score: 350, coins: 6, color: '#cc44ff', pattern: 'zigzag',   essence: 'blue' },
    { id: 'swoop',    w: 26, h: 18, hp: 2, speed: 130, score: 250, coins: 5, color: '#ffcc00', pattern: 'swoop',    essence: 'gold' },
    { id: 'tank',     w: 34, h: 28, hp: 5, speed: 35,  score: 600, coins: 12,color: '#44ff88', pattern: 'straight', essence: 'green' },
    { id: 'teleport', w: 22, h: 20, hp: 2, speed: 100, score: 300, coins: 6, color: '#ff66ff', pattern: 'teleport', essence: 'blue' },
    { id: 'splitter', w: 18, h: 14, hp: 1, speed: 110, score: 150, coins: 3, color: '#ffff44', pattern: 'straight', essence: 'red',
      onDeath: function(e) {
        for (var a = -30; a <= 30; a += 60) {
          if (a === 0) continue;
          var rad = a * Math.PI / 180;
          var s = { x: e.x + e.w/2, y: e.y + e.h/2, w: 10, h: 8, hp: 1, maxHp: 1, speed: 80,
            score: 50, coins: 0, color: '#ffaa44', pattern: 'straight', flashTimer: 0,
            isMini: true, essence: null };
          s.vy = Math.sin(rad) * 80;
          s.vx = Math.cos(rad) * 80 - 60;
          enemies.push(s);
          enemiesSpawnedThisWave++;
        }
      }
    },
    { id: 'bomber',   w: 22, h: 20, hp: 1, speed: 140, score: 200, coins: 8, color: '#ff2222', pattern: 'rush',     essence: 'green' },
  ];

  var ESSENCE_COLORS = { red: '#ff3333', blue: '#3388ff', green: '#33ff66', gold: '#ffdd00' };

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = {
      x: 60, y: E.H / 2, w: 24, h: 18, speed: 220, maxShield: 0, shield: 0,
      thrusterPhase: 0,
    };

    bullets = [];
    enemies = [];
    particles = [];
    stars = [];
    coinDrops = [];
    essenceDrops = [];
    engineTrail = [];

    // Load permanent upgrades
    try {
      upgradeLevels.fireRate = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'fireRate') || 0;
      upgradeLevels.shield = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'shield') || 0;
      upgradeLevels.damage = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'damage') || 0;
      upgradeLevels.speed = window.FreeArcadeSave.getUpgradeLevel('spaceBlaster', 'speed') || 0;
    } catch (e) {}

    player.speed = 220 + upgradeLevels.speed * 30;
    player.maxShield = upgradeLevels.shield;
    player.shield = upgradeLevels.shield;

    // Reset essence
    essenceBuffs = { damage: 0, speed: 0, shield: 0, scoreMult: 1 };
    essenceTimers = { damage: 0, speed: 0, shield: 0, scoreMult: 0 };

    // Stars with parallax + twinkle
    for (var i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * E.W, y: Math.random() * E.H,
        speed: 20 + Math.random() * 120, size: 0.5 + Math.random() * 2.5,
        bright: 0.2 + Math.random() * 0.8, twinkleSpeed: 1 + Math.random() * 3,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    state = 'ready';
    enemiesSpawnedThisWave = 0;
    enemiesKilledThisWave = 0;
    waveSpawnCount = Math.min(6 + wave * 2, 48);
    fireCooldown = 0;
    enemySpawnTimer = 0;
    invincibleTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    coinsThisRun = 0;
    totalEnemiesKilledThisRun = 0;
    playTime = 0;
    hasBossThisWave = (wave % 5 === 0);
    bossSpawned = false;
    bossPhase = 0;
    inRunShopActive = false;

    E.setScore(0);
    E.setLives(3);
  }

  // ── Spawn helpers ──
  function spawnEnemy() {
    var typeCount = Math.min(ENEMY_TYPES.length, 2 + Math.floor(wave / 2));
    var idx = Math.floor(Math.random() * Math.min(typeCount, ENEMY_TYPES.length));
    var t = ENEMY_TYPES[idx];

    var scale = 1 + (wave - 1) * 0.06;
    var hpBonus = Math.floor((wave - 1) / 8);
    var scoreBonus = Math.floor(wave / 3) * 50;
    var coinBonus = Math.floor(wave / 5);

    // Weight toward tougher enemies at high waves
    if (wave > 12 && Math.random() < 0.15) idx = 4; // tank
    if (wave > 18 && Math.random() < 0.12) idx = 6; // splitter
    if (wave > 8 && Math.random() < 0.1) idx = 7;   // bomber

    var e = {
      x: E.W + 20,
      y: 25 + Math.random() * (E.H - 80),
      w: t.w, h: t.h,
      hp: t.hp + hpBonus, maxHp: t.hp + hpBonus,
      speed: (t.speed + Math.random() * 30) * scale,
      score: t.score + scoreBonus,
      coins: t.coins + coinBonus,
      color: t.color, pattern: t.pattern,
      essence: t.essence,
      shootTimer: 0.8 + Math.random() * 1.5 - wave * 0.02,
      sinePhase: Math.random() * Math.PI * 2, sineAmp: 25 + Math.random() * 30,
      flashTimer: 0, swoopPhase: 0,
      swoopDir: Math.random() > 0.5 ? 1 : -1,
      teleportTimer: 2,
      isMini: false,
      onDeath: t.onDeath || null,
    };
    e.shootTimer = Math.max(0.35, e.shootTimer);
    enemies.push(e);
    enemiesSpawnedThisWave++;
  }

  function spawnBoss() {
    var bossNum = Math.floor(wave / 5);
    var hp = 12 + bossNum * 10;
    var w = Math.min(64 + bossNum * 6, 110);
    var h = Math.min(44 + bossNum * 5, 80);

    // Boss type cycles: 0=red(aggressive), 1=purple(patterns), 2=gold( defensive)
    var bossType = bossNum % 3;
    var colors = ['#ff2222', '#cc44ff', '#ffdd00'];
    var names = ['FURY', 'VOID', 'TITAN'];

    var boss = {
      x: E.W + 20, y: E.H / 2 - h / 2,
      w: w, h: h,
      hp: hp, maxHp: hp,
      speed: Math.max(12, 35 - bossNum * 1.5),
      score: 1000 + bossNum * 600,
      coins: 25 + bossNum * 12,
      color: colors[bossType],
      pattern: 'boss', flashTimer: 0,
      isBoss: true, essence: 'gold',
      shootTimer: 0.3,
      attackPhase: 0, attackTimer: 0, sinePhase: 0,
      bossType: bossType,
      bossName: names[bossType],
      // Weak point
      weakPoint: { active: true, hit: false, timer: 0 },
      phase: 0, phaseTimer: 0,
    };
    enemies.push(boss);
    enemiesSpawnedThisWave++;
    bossSpawned = true;
  }

  function spawnBullet(x, y, vx, vy, isEnemy, color) {
    bullets.push({
      x: x, y: y, w: 6, h: 6, vx: vx, vy: vy,
      isEnemy: isEnemy, life: 3 + (isEnemy ? 2 : 0),
      color: color || (isEnemy ? '#ff4444' : '#ffff44'),
      trail: [],
    });
  }

  function spawnCoinDrop(x, y, amount) {
    var count = Math.min(amount, 6);
    for (var i = 0; i < count; i++) {
      coinDrops.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 24,
        vy: -40 - Math.random() * 40, vx: (Math.random() - 0.5) * 30,
        life: 2.5 + Math.random(),
        amount: 1,
        size: 3 + Math.random() * 2,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnEssenceDrop(x, y, type) {
    if (!type) return;
    essenceDrops.push({
      x: x, y: y, vy: -20, vx: (Math.random() - 0.5) * 20,
      life: 1.5, type: type,
      size: 4, pulse: 0,
    });
  }

  // ── In-run shop ──
  function openInRunShop() {
    inRunShopActive = true;
    inRunShopSelection = 0;
    var items = [
      { label: '❤ +1 Shield', cost: 8, effect: function() { player.shield = Math.min(player.shield + 1, player.maxShield + 3); } },
      { label: '⚡ Rapid Fire', cost: 10, effect: function() { essenceBuffs.damage += 2; essenceTimers.damage = ESSENCE_DURATION * 2; } },
      { label: '✦ Score x2', cost: 6, effect: function() { essenceBuffs.scoreMult = 2; essenceTimers.scoreMult = ESSENCE_DURATION * 2; } },
      { label: '💨 Speed Boost', cost: 4, effect: function() { essenceBuffs.speed = 80; essenceTimers.speed = ESSENCE_DURATION * 2; } },
      { label: '❤ +1 Life', cost: 15, effect: function() { E.addLife(); } },
    ];
    // Filter affordable items
    inRunShopItems = items.filter(function(item) { return item.cost <= coinsThisRun; });
    if (inRunShopItems.length === 0) { inRunShopActive = false; return; }
  }

  function buyInRunItem(idx) {
    if (idx < 0 || idx >= inRunShopItems.length) return;
    var item = inRunShopItems[idx];
    if (coinsThisRun < item.cost) return;
    coinsThisRun -= item.cost;
    item.effect();
    E.playPowerup();
    inRunShopItems.splice(idx, 1);
    if (inRunShopItems.length === 0) inRunShopActive = false;
  }

  // ── Update ──
  function update(dt, input) {
    playTime += dt;

    // Stars
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.x -= s.speed * dt;
      s.bright = 0.3 + Math.sin(playTime * s.twinkleSpeed + s.twinklePhase) * 0.4;
      if (s.x < -5) { s.x = E.W + 5; s.y = Math.random() * E.H; s.bright = 0.5 + Math.random() * 0.5; }
    }

    // Combo decay
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboCount = 0; }
    if (invincibleTimer > 0) invincibleTimer -= dt;

    // Essence timer decay
    for (var k in essenceTimers) {
      if (essenceTimers[k] > 0) {
        essenceTimers[k] -= dt;
        if (essenceTimers[k] <= 0) essenceBuffs[k] = (k === 'scoreMult') ? 1 : 0;
      }
    }

    // Engine trail
    engineTrail.push({ x: player.x, y: player.y + player.h/2, life: 0.3 });
    for (var i = engineTrail.length - 1; i >= 0; i--) {
      engineTrail[i].life -= dt;
      if (engineTrail[i].life <= 0) engineTrail.splice(i, 1);
    }

    // Coin drops
    for (var i = coinDrops.length - 1; i >= 0; i--) {
      var c = coinDrops[i];
      c.y += c.vy * dt; c.x += (c.vx || 0) * dt;
      c.vy += 60 * dt; c.life -= dt;
      c.pulse += dt * 3;
      if (c.life <= 0) { coinDrops.splice(i, 1); continue; }
      var dx = player.x + player.w/2 - c.x;
      var dy = player.y + player.h/2 - c.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var magnetRange = 60 + (essenceBuffs.speed > 0 ? 40 : 0);
      if (dist < magnetRange) {
        c.x += dx / dist * (200 + essenceBuffs.speed) * dt;
        c.y += dy / dist * (200 + essenceBuffs.speed) * dt;
      }
      if (dist < 15) {
        coinsThisRun += c.amount;
        try { window.FreeArcadeSave.addCoins(c.amount); } catch(e) {}
        coinDrops.splice(i, 1);
        E.playSound('blip');
      }
    }

    // Essence drops
    for (var i = essenceDrops.length - 1; i >= 0; i--) {
      var ed = essenceDrops[i];
      ed.y += ed.vy * dt; ed.x += (ed.vx || 0) * dt;
      ed.vy += 40 * dt; ed.life -= dt;
      ed.pulse += dt * 4;
      if (ed.life <= 0) { essenceDrops.splice(i, 1); continue; }
      var dx = player.x + player.w/2 - ed.x;
      var dy = player.y + player.h/2 - ed.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40) {
        ed.x += dx / dist * 250 * dt;
        ed.y += dy / dist * 250 * dt;
      }
      if (dist < 14) {
        // Apply essence buff
        switch (ed.type) {
          case 'red':   essenceBuffs.damage += 2; essenceTimers.damage = ESSENCE_DURATION; break;
          case 'blue':  essenceBuffs.speed += 40; essenceTimers.speed = ESSENCE_DURATION; break;
          case 'green': player.shield = Math.min(player.shield + 1, player.maxShield + 5); break;
          case 'gold':  essenceBuffs.scoreMult = 2; essenceTimers.scoreMult = ESSENCE_DURATION; break;
        }
        E.playPowerup();
        // Pop visual
        for (var p = 0; p < 8; p++) {
          var ang = Math.random() * Math.PI * 2;
          var spd = 30 + Math.random() * 60;
          particles.push({
            x: ed.x, y: ed.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            life: 0.3 + Math.random() * 0.2, maxLife: 0.5,
            size: 2 + Math.random() * 3, color: ESSENCE_COLORS[ed.type] || '#fff',
          });
        }
        essenceDrops.splice(i, 1);
      }
    }

    // ── State machines ──
    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'gameover') {
      try {
        window.FreeArcadeSave.setHighScore('SpaceBlaster', E.getScore());
        window.FreeArcadeSave.setBestWaves(wave);
        window.FreeArcadeSave.incrementStat('totalEnemiesKilled', totalEnemiesKilledThisRun);
      } catch (e) {}
      if (input.action) {
        E.setLevel(1);
        init.call({ engine: E });
        state = 'playing'; E.playCoin();
      }
      return;
    }

    if (state === 'shop') {
      if (input.left || input.up) { inRunShopSelection = Math.max(0, inRunShopSelection - 1); }
      if (input.right || input.down) { inRunShopSelection = Math.min(inRunShopItems.length - 1, inRunShopSelection + 1); }
      if (input.action) { buyInRunItem(inRunShopSelection); }
      if (input.escape || input.keys['KeyQ']) { inRunShopActive = false; state = 'playing'; }
      // Re-check if shop closed
      if (!inRunShopActive) state = 'playing';
      return;
    }

    // ── PLAYING ──

    // Player movement
    var spd = player.speed + (essenceBuffs.speed || 0);
    if (input.left)  player.x -= spd * dt;
    if (input.right) player.x += spd * dt;
    if (input.up)    player.y -= spd * dt;
    if (input.down)  player.y += spd * dt;
    player.x = Math.max(10, Math.min(E.W - player.w - 10, player.x));
    player.y = Math.max(10, Math.min(E.H - player.h - 10, player.y));
    player.thrusterPhase += dt * 15;

    // Shooting
    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'])) {
      var dmg = 1 + upgradeLevels.damage + (essenceBuffs.damage || 0);
      var baseRate = Math.max(0.07, 0.22 - upgradeLevels.fireRate * 0.025 - (essenceBuffs.speed > 0 ? 0.03 : 0));
      fireCooldown = baseRate;

      if (wave >= 5) {
        var spread = 40 + wave * 0.5;
        spawnBullet(player.x + player.w, player.y + 2, 420 + dmg * 10, -spread, false, '#44ffff');
        spawnBullet(player.x + player.w, player.y + player.h/2 - 3, 440 + dmg * 10, 0, false, '#44ffff');
        spawnBullet(player.x + player.w, player.y + player.h - 2, 420 + dmg * 10, spread, false, '#44ffff');
        if (wave >= 10 && upgradeLevels.fireRate >= 2) {
          spawnBullet(player.x + player.w, player.y + player.h/4, 400 + dmg * 10, -spread * 0.6, false, '#88ffff');
          spawnBullet(player.x + player.w, player.y + player.h*0.75, 400 + dmg * 10, spread * 0.6, false, '#88ffff');
        }
      } else if (wave >= 3) {
        spawnBullet(player.x + player.w, player.y + 2, 410 + dmg * 10, -35, false, '#44ffff');
        spawnBullet(player.x + player.w, player.y + player.h - 2, 410 + dmg * 10, 35, false, '#44ffff');
      } else {
        spawnBullet(player.x + player.w, player.y + player.h/2 - 3, 400 + dmg * 10, 0, false, '#44ffff');
      }
      E.playShoot();
    }

    // ── Bullets ──
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      // Bullet trail
      if (!b.isEnemy && b.trail.length < 6) b.trail.push({ x: b.x, y: b.y });
      if (b.x < -20 || b.x > E.W + 20 || b.y < -20 || b.y > E.H + 20) { bullets.splice(i, 1); continue; }

      if (!b.isEnemy) {
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (!e) continue;
          // Weak point check for boss
          var hitWeakPoint = false;
          if (e.isBoss && e.weakPoint && e.weakPoint.active) {
            var wpX = e.x + e.w * 0.5 - 8, wpY = e.y + e.h * 0.3 - 8;
            if (b.x < wpX + 16 && b.x + b.w > wpX && b.y < wpY + 16 && b.y + b.h > wpY) {
              hitWeakPoint = true;
            }
          }
          if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
            bullets.splice(i, 1);
            var dmgTotal = 1 + upgradeLevels.damage + (essenceBuffs.damage || 0);
            if (hitWeakPoint) dmgTotal *= 2.5;
            e.hp -= dmgTotal;
            e.flashTimer = 0.08;
            if (e.hp <= 0) {
              // Killed
              comboCount++;
              comboTimer = 2;
              var mult = 1 + Math.floor(comboCount / 5) * 0.5;
              var points = Math.floor(e.score * mult * (essenceBuffs.scoreMult || 1));
              var pCount = e.isBoss ? 50 : 15;
              E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, e.color, pCount,
                { speedMin: 20, speedMax: e.isBoss ? 200 : 100, lifeMax: 0.6 });
              if (e.isBoss) { E.shake(10, 0.5); E.playExplode(); }
              else E.playExplode();

              // Death effect
              if (!e.isBoss) spawnCoinDrop(e.x + e.w/2, e.y + e.h/2, e.coins);
              else spawnCoinDrop(e.x + e.w/2, e.y + e.h/2, e.coins);

              // Essence drop
              if (e.essence && !e.isMini) spawnEssenceDrop(e.x + e.w/2, e.y + e.h/2, e.essence);

              // Splitter on-death
              if (e.onDeath) e.onDeath(e);

              enemies.splice(j, 1);
              E.addScore(points);
              enemiesKilledThisWave++;
              totalEnemiesKilledThisRun++;
            } else {
              if (hitWeakPoint) { E.shake(4, 0.15); E.playBeep(600, 0.1, 'square', 0.1); }
              else E.playHit();
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
          E.emitParticles(particles, player.x + player.w/2, player.y + player.h/2, '#00ffff', 12,
            { speedMin: 30, speedMax: 100, lifeMax: 0.4 });
          if (player.shield > 0) {
            player.shield--;
            E.playHit();
            E.shake(3, 0.15);
            invincibleTimer = 0.5;
          } else {
            invincibleTimer = INVINCIBLE_DURATION;
            if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
            E.shake(6, 0.3);
            E.playExplode();
          }
        }
      }
    }

    // ── Enemies ──
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.flashTimer = Math.max(0, e.flashTimer - dt);
      e.shootTimer -= dt;

      // Boss weak point
      if (e.isBoss && e.weakPoint) {
        e.weakPoint.timer += dt;
        e.weakPoint.active = true;
      }

      switch (e.pattern) {
        case 'straight': e.x -= e.speed * dt; break;
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
            var ty = player.y + player.h/2 - e.h/2;
            e.y += (ty - e.y) * 2.5 * dt;
          } else e.y += Math.sin(e.swoopPhase) * 60 * dt;
          break;
        case 'teleport':
          e.x -= e.speed * dt;
          e.teleportTimer -= dt;
          if (e.teleportTimer <= 0) {
            e.x = E.W * 0.5 + Math.random() * E.W * 0.4;
            e.y = 30 + Math.random() * (E.H - 80);
            e.teleportTimer = 2 + Math.random();
            E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, '#ff66ff', 8, { lifeMax: 0.3 });
          }
          break;
        case 'rush': // Bomber: rushes toward player then explodes
          var dx = (player.x + player.w/2) - e.x;
          var dy = (player.y + player.h/2) - e.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x += dx / dist * e.speed * dt;
          e.y += dy / dist * e.speed * dt;
          if (dist < 50) {
            // Self destruct
            E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, '#ff6600', 25, { speedMax: 150, lifeMax: 0.5 });
            enemies.splice(i, 1);
            E.shake(5, 0.2);
            E.playExplode();
          }
          break;
        case 'boss': bossMovement(e, dt); break;
      }
      e.y = Math.max(10, Math.min(E.H - e.h - 10, e.y));
      if (e.isBoss && e.x > E.W - e.w - 60) e.x -= e.speed * dt * 0.3;

      // Enemy shooting
      if (e.shootTimer <= 0) {
        if (e.isBoss) bossShoot(e);
        else if (!e.isMini) {
          var aimSpread = Math.max(0.1, 0.5 - wave * 0.015);
          var dx = (player.x + player.w/2) - (e.x + e.w/2);
          var dy = (player.y + player.h/2) - (e.y + e.h/2);
          dy += (Math.random() - 0.5) * aimSpread * Math.abs(dy);
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          spawnBullet(e.x, e.y + e.h/2 - 3,
            dx / dist * (180 + wave * 3), dy / dist * (180 + wave * 3), true);
          e.shootTimer = Math.max(0.35, 1.2 + Math.random() * 1.2 - wave * 0.03);
        }
      }

      // Enemy-player collision
      if (invincibleTimer <= 0 &&
          e.x < player.x + player.w && e.x + e.w > player.x &&
          e.y < player.y + player.h && e.y + e.h > player.y) {
        E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, e.color, 15, { lifeMax: 0.4 });
        if (e.isBoss) {
          e.hp = Math.max(0, e.hp - 3);
          if (e.hp <= 0) { enemies.splice(i, 1); enemiesKilledThisWave++; spawnCoinDrop(e.x + e.w/2, e.y + e.h/2, e.coins); }
        } else {
          enemies.splice(i, 1);
          if (e.onDeath) { e.onDeath(e); } // still trigger death effect
        }
        if (player.shield > 0) { player.shield--; invincibleTimer = 0.5; E.playHit(); }
        else { invincibleTimer = INVINCIBLE_DURATION; if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; } E.shake(5, 0.25); E.playExplode(); }
      }
    }

    // Spawn enemies
    if (enemiesSpawnedThisWave < waveSpawnCount) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        if (hasBossThisWave && !bossSpawned) { spawnBoss(); enemySpawnTimer = 2.5; }
        else if (enemies.length < MAX_ENEMIES) { spawnEnemy(); enemySpawnTimer = Math.max(0.15, 0.9 - wave * 0.025); }
        else enemySpawnTimer = 0.3;
      }
    }

    // Remove off-screen enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].x < -120) enemies.splice(i, 1);
    }

    // Wave transition
    if (enemiesSpawnedThisWave >= waveSpawnCount && enemies.length === 0 && enemiesKilledThisWave > 0) {
      wave++;
      enemiesSpawnedThisWave = 0;
      enemiesKilledThisWave = 0;
      waveSpawnCount = Math.min(6 + wave * 2, 50);
      hasBossThisWave = (wave % 5 === 0);
      bossSpawned = false;
      enemySpawnTimer = 0.5;
      E.playLevelUp();
      E.addScore(wave * 50);

      // Show in-run shop every 3 waves (skip if boss wave just happened)
      if (wave % 3 === 0 && !hasBossThisWave) {
        openInRunShop();
        if (inRunShopActive) { state = 'shop'; return; }
      }
    }

    E.updateParticles(particles, dt);
  }

  // ── Boss movement ──
  function bossMovement(e, dt) {
    e.attackTimer += dt;
    var speed = e.speed;
    if (e.x > E.W * 0.6) { e.x -= speed * dt; return; }

    // Phase based on HP
    var hpPct = e.hp / e.maxHp;
    e.phase = hpPct < 0.33 ? 2 : (hpPct < 0.66 ? 1 : 0);
    e.phaseTimer += dt;

    switch (e.phase) {
      case 0: // Normal: sine sweep
        e.sinePhase += dt * 1.8;
        e.y += Math.sin(e.sinePhase) * 50 * dt;
        e.x -= speed * 0.3 * dt;
        break;
      case 1: // Angry: track player
        var ty = player.y + player.h/2 - e.h/2;
        e.y += (ty - e.y) * 1.5 * dt;
        e.x -= speed * 0.4 * dt;
        break;
      case 2: // Desperate: erratic + faster
        e.y += Math.sin(e.attackTimer * 3) * 80 * dt;
        e.x -= speed * 0.5 * dt;
        break;
    }
    e.y = Math.max(15, Math.min(E.H - e.h - 15, e.y));
  }

  // ── Boss shooting ──
  function bossShoot(e) {
    var hpPct = e.hp / e.maxHp;
    var bossWave = Math.floor(wave / 5);
    var bulletCount = Math.min(3 + bossWave, 10);
    var r = Math.random();

    // More aggressive at low HP
    var aggro = hpPct < 0.33 ? 0.5 : (hpPct < 0.66 ? 0.4 : 0.3);
    e.shootTimer = Math.max(0.2, 0.5 - aggro * 0.3 + Math.random() * 0.3);

    if (r < aggro) {
      // Aimed burst (more at low HP)
      var burstCount = hpPct < 0.33 ? 4 : (hpPct < 0.66 ? 3 : 2);
      for (var k = 0; k < burstCount; k++) {
        var dx = (player.x + player.w/2) - (e.x + e.w/2) + (Math.random() - 0.5) * 20;
        var dy = (player.y + player.h/2) - (e.y + e.h/2) + (Math.random() - 0.5) * 20;
        var dist = Math.sqrt(dx*dx + dy*dy) || 1;
        (function(tdx, tdy) {
          setTimeout(function() {
            spawnBullet(e.x, e.y + e.h/2 - 3,
              tdx/Math.sqrt(tdx*tdx+tdy*tdy) * (200 + bossWave*20),
              tdy/Math.sqrt(tdx*tdx+tdy*tdy) * (200 + bossWave*20), true, '#ff6666');
          }, k * 100);
        })(dx, dy);
      }
    } else if (r < 0.7) {
      // Spread fan
      var step = 180 / (bulletCount + 2);
      for (var a = -90 + step; a < 90; a += step) {
        var rad = a * Math.PI / 180;
        spawnBullet(e.x, e.y + e.h/2, Math.cos(rad) * 200 - 100, Math.sin(rad) * 200, true, '#ff8888');
      }
    } else {
      // Circle burst
      var count = bulletCount * 2 + (hpPct < 0.33 ? 4 : 0);
      for (var a = 0; a < 360; a += 360/count) {
        var rad = a * Math.PI / 180;
        spawnBullet(e.x + e.w/2, e.y + e.h/2, Math.cos(rad) * 150, Math.sin(rad) * 150, true, '#ff4444');
      }
    }
    E.playBeep(200, 0.06, 'square', 0.05);
  }

  // ── Render ──
  function render(ctx) {
    // Stars with twinkle
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var alpha = Math.max(0.1, s.bright * 0.8);
      ctx.globalAlpha = alpha;
      E.circle(s.x, s.y, s.size, 'rgba(200,200,255,0.6)');
    }
    ctx.globalAlpha = 1;

    if (state === 'ready') { renderReady(ctx); return; }
    if (state === 'gameover') { renderGameOver(ctx); return; }
    if (state === 'shop') { renderShop(ctx); renderWorld(ctx); return; }
    renderWorld(ctx);
  }

  function renderReady(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, E.W, E.H);

    // Boss preview for boss waves
    if (hasBossThisWave) {
      var bossNum = Math.floor(wave / 5);
      var colors = ['#ff2222', '#cc44ff', '#ffdd00'];
      var names = ['FURY', 'VOID', 'TITAN'];
      E.textCenter('⚠ BOSS WAVE: ' + names[bossNum % 3] + ' ⚠', E.W/2, 80, 9,
        colors[bossNum % 3]);
    }

    E.textCenterShadow('SPACE BLASTER', E.W/2, 50, 20, '#ff4444', '#000');
    E.textCenterShadow('WAVE ' + wave, E.W/2, 90, 14, '#ffaa00', '#000');
    E.textCenter('Essence: collect colored orbs for buffs!', E.W/2, 125, 7, '#88ccff');
    E.textCenter('UPGRADES:', E.W/2, 155, 8, '#888');
    var upStr = '❤x' + player.maxShield + '  DMG+' + upgradeLevels.damage + '  SPD+' + upgradeLevels.speed;
    E.textCenter(upStr, E.W/2, 170, 7, '#aaa');
    E.textCenter('Coins: ' + (window.FreeArcadeSave ? window.FreeArcadeSave.getCoins() : 0), E.W/2, 192, 8, '#ffdd00');
    E.textCenter('← → ↑ ↓  SPACE shoot  P pause', E.W/2, 225, 7, '#666');
    E.textCenter('PRESS ENTER TO START', E.W/2, 265, 10, '#00ff88');

    // Legend
    E.textCenter('★ Red=ATK  Blue=SPD  Green=❤  Gold=x2', E.W/2, 295, 6, '#666');
  }

  function renderGameOver(ctx) {
    renderWorld(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, E.W, E.H);
    E.textCenterShadow('GAME OVER', E.W/2, E.H/2 - 60, 22, '#ff2222', '#000');
    E.textCenterShadow('WAVE ' + wave, E.W/2, E.H/2 - 25, 10, '#ff8800', '#000');
    E.textCenterShadow('SCORE: ' + E.getScore(), E.W/2, E.H/2, 12, '#ffaa00', '#000');
    var hs = window.FreeArcadeSave ? window.FreeArcadeSave.getHighScore('SpaceBlaster') : 0;
    if (E.getScore() >= hs) E.textCenter('★ NEW HIGH SCORE ★', E.W/2, E.H/2 + 22, 9, '#ffdd00');
    E.textCenter('COINS: ' + coinsThisRun, E.W/2, E.H/2 + 42, 8, '#ffdd00');
    // Stats
    E.textCenter('Enemies killed: ' + totalEnemiesKilledThisRun, E.W/2, E.H/2 + 60, 7, '#88aacc');
    E.textCenter('PRESS ENTER TO RETRY', E.W/2, E.H/2 + 82, 8, '#aaa');
  }

  function renderShop(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, E.W, E.H);

    E.textCenterShadow('⟡ IN-RUN SHOP ⟡', E.W/2, 60, 14, '#ffdd00', '#000');
    E.textCenter('✦' + coinsThisRun, E.W/2, 90, 10, '#ffdd00');

    for (var i = 0; i < inRunShopItems.length; i++) {
      var item = inRunShopItems[i];
      var y = 130 + i * 35;
      var prefix = (i === inRunShopSelection) ? '▸ ' : '  ';
      var affordable = item.cost <= coinsThisRun;
      E.text(prefix + item.label + '  ✦' + item.cost,
        E.W/2 - 100, y, 8,
        i === inRunShopSelection ? (affordable ? '#ffdd00' : '#ff4444') : (affordable ? '#aaffaa' : '#666'),
        'center');
    }

    E.textCenter('↑↓ select  ENTER buy  ESC skip', E.W/2, E.H - 40, 7, '#888');
  }

  function renderWorld(ctx) {
    // Engine trail
    for (var i = 0; i < engineTrail.length; i++) {
      var tr = engineTrail[i];
      ctx.globalAlpha = tr.life * 0.4;
      ctx.fillStyle = '#ff6600';
      var ts = 2 + tr.life * 4;
      E.circle(tr.x, tr.y, ts, '#ff6600');
    }
    ctx.globalAlpha = 1;

    // Player
    if (!(invincibleTimer > 0 && Math.floor(invincibleTimer * 10) % 2 === 0)) {
      // Ship body (triangle)
      ctx.fillStyle = '#00ddff';
      ctx.beginPath();
      ctx.moveTo(player.x + player.w, player.y + player.h/2);
      ctx.lineTo(player.x, player.y);
      ctx.lineTo(player.x, player.y + player.h);
      ctx.closePath();
      ctx.fill();

      // Cockpit glow
      ctx.fillStyle = '#aaffff';
      ctx.beginPath();
      ctx.moveTo(player.x + player.w * 0.7, player.y + player.h/2);
      ctx.lineTo(player.x + player.w * 0.2, player.y + player.h * 0.3);
      ctx.lineTo(player.x + player.w * 0.2, player.y + player.h * 0.7);
      ctx.closePath();
      ctx.fill();

      // Thruster flame (animated)
      var flameLen = 4 + Math.sin(player.thrusterPhase) * 3;
      var grad = ctx.createRadialGradient(player.x, player.y + player.h/2, 0, player.x, player.y + player.h/2, flameLen + 6);
      grad.addColorStop(0, '#ffcc00');
      grad.addColorStop(0.5, '#ff6600');
      grad.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(player.x, player.y + player.h/2, flameLen + 6, 0, Math.PI * 2);
      ctx.fill();

      // Shield effect
      if (player.shield > 0) {
        ctx.strokeStyle = 'rgba(0,221,255,' + (0.3 + Math.sin(playTime * 3) * 0.15) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,221,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var isFlashing = e.flashTimer > 0;
      ctx.fillStyle = isFlashing ? '#ffffff' : e.color;

      if (e.isBoss) {
        // Boss body with detail
        ctx.fillRect(e.x, e.y, e.w, e.h);
        // Boss inner detail
        ctx.fillStyle = isFlashing ? '#ffffff' : 'rgba(0,0,0,0.2)';
        ctx.fillRect(e.x + 10, e.y + 8, e.w - 20, e.h - 16);
        // Core
        var coreX = e.x + e.w/2, coreY = e.y + e.h/2;
        ctx.fillStyle = isFlashing ? '#ffffff' : e.color;
        ctx.beginPath();
        ctx.arc(coreX, coreY, Math.min(e.w, e.h) * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Weak point
        if (e.weakPoint && e.weakPoint.active) {
          var pulse = 0.5 + Math.sin(playTime * 5) * 0.5;
          ctx.fillStyle = 'rgba(255,255,0,' + (0.3 + pulse * 0.3) + ')';
          ctx.fillRect(e.x + e.w * 0.5 - 8, e.y + e.h * 0.3 - 8, 16, 16);
          ctx.strokeStyle = 'rgba(255,255,0,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(e.x + e.w * 0.5 - 8, e.y + e.h * 0.3 - 8, 16, 16);
          E.textCenter('!', e.x + e.w/2, e.y + e.h * 0.3 - 6, 7, '#ffff00');
        }

        // Boss name
        E.textCenter('<' + e.bossName + '>', e.x + e.w/2, e.y - 16, 6, e.color);

        // Boss HP bar
        E.rect(e.x, e.y - 10, e.w, 5, '#333');
        var hpR = e.hp / e.maxHp;
        E.rect(e.x, e.y - 10, e.w * hpR, 5, hpR > 0.5 ? '#00ff88' : (hpR > 0.25 ? '#ffaa00' : '#ff4444'));
        // Phase indicator
        var phaseDots = '';
        for (var pd = 0; pd < 3; pd++) phaseDots += (pd === e.phase) ? '●' : '○';
        E.textCenter(phaseDots, e.x + e.w/2, e.y + e.h + 2, 5, '#888');

      } else if (e.isMini) {
        // Mini enemies (from splitter)
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        E.circle(e.x + e.w/2, e.y + e.h/2, 3, 'rgba(255,255,255,0.3)');
      } else {
        // Normal enemy
        ctx.fillRect(e.x, e.y, e.w, e.h);
        // Eyes
        ctx.fillStyle = isFlashing ? '#000' : 'rgba(0,0,0,0.3)';
        ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
        ctx.fillRect(e.x + e.w - 8, e.y + 4, 4, 4);
        // HP bar for multi-HP enemies
        if (e.maxHp > 1) {
          E.rect(e.x, e.y - 5, e.w, 3, 'rgba(0,0,0,0.4)');
          E.rect(e.x, e.y - 5, e.w * (e.hp/e.maxHp), 3, '#44ff44');
        }
      }
    }

    // Bullets with trails
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];

      // Player bullet trail
      if (!b.isEnemy && b.trail) {
        for (var t = 0; t < b.trail.length; t++) {
          ctx.globalAlpha = 0.2 - t * 0.03;
          E.circle(b.trail[t].x, b.trail[t].y, 2, '#88ffff');
        }
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = b.color || (b.isEnemy ? '#ff4444' : '#ffff44');
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Glow
      ctx.globalAlpha = 0.3;
      E.circle(b.x + b.w/2, b.y + b.h/2, b.w + 2, b.color || '#ffff44');
      ctx.globalAlpha = 1;
    }

    // Essence drops
    for (var i = 0; i < essenceDrops.length; i++) {
      var ed = essenceDrops[i];
      var pulse = 0.6 + Math.sin(ed.pulse) * 0.4;
      ctx.globalAlpha = Math.min(1, ed.life) * pulse;
      var col = ESSENCE_COLORS[ed.type] || '#fff';
      E.circle(ed.x, ed.y, ed.size + 1, col);
      ctx.globalAlpha = 1;
      E.circle(ed.x, ed.y, ed.size * 0.5, '#fff');
    }

    // Coin drops
    for (var i = 0; i < coinDrops.length; i++) {
      var c = coinDrops[i];
      ctx.globalAlpha = Math.min(1, c.life);
      var glow = Math.sin(c.pulse) * 0.3 + 0.7;
      E.circle(c.x, c.y, c.size * glow, '#ffdd00');
      E.circle(c.x, c.y, c.size * 0.5, '#ffffff');
      ctx.globalAlpha = 1;
    }

    // Particles
    E.drawParticles(ctx, particles);

    // ── Essence buff indicators (top) ──
    var buffY = 44;
    for (var k in essenceBuffs) {
      if (essenceTimers[k] > 0) {
        var col = ESSENCE_COLORS[k] || '#888';
        var label = k === 'scoreMult' ? 'x' + essenceBuffs[k] : (essenceBuffs[k] > 0 ? '+' + essenceBuffs[k] : '');
        if (label) {
          ctx.globalAlpha = 0.3 + Math.sin(playTime * 4) * 0.2;
          E.text(label + ' ' + Math.ceil(essenceTimers[k]) + 's', E.W/2, buffY, 6, col, 'center');
          ctx.globalAlpha = 1;
          buffY += 12;
        }
      }
    }

    // HUD
    E.text('SCORE: ' + E.getScore(), 8, 8, 8, '#ffaa00');
    E.text('WAVE: ' + wave, 8, 20, 8, '#00ff88');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, 8, 32, 8, '#ff6666');
    E.text('✦' + coinsThisRun, E.W - 8, 8, 8, '#ffdd00', 'right');

    if (comboCount >= 3) {
      E.text('COMBO x' + (1 + Math.floor(comboCount/5)*0.5).toFixed(1),
        E.W - 8, 20, 7, '#ffdd00', 'right');
    }

    // Essence legend (bottom)
    E.text('♡DMG ♢SPD ♥SHD ★SCR', E.W/2, E.H - 8, 5, 'rgba(255,255,255,0.2)', 'center');

    // Boss border
    if (state === 'playing' && hasBossThisWave) {
      var found = false;
      for (var i = 0; i < enemies.length; i++) { if (enemies[i].isBoss) found = true; }
      if (found) {
        ctx.fillStyle = 'rgba(255,0,0,' + (0.2 + Math.sin(Date.now()/200)*0.12) + ')';
        ctx.fillRect(0, 0, E.W, 3);
        ctx.fillRect(0, E.H - 3, E.W, 3);
      }
    }
  }

  function destroy() {}

  window.SpaceBlaster = {
    init: init, update: update, render: render, destroy: destroy
  };
})();
