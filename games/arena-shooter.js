/**
 * Arena Shooter — 360° top-down wave survival with turret & core system
 *
 * Creative twist: enemies drop colored cores that power temporary buffs or
 * deploy turrets between waves. 6 weapon types cycle as you level up.
 * Boss every 5 waves with unique attack patterns.
 *
 * WASD move, arrow keys / mouse aim, SPACE shoot.
 */
(function () {
  'use strict';

  var E;
  var player, player2, bullets, enemies, particles, cores, turrets;
  var state, wave, waveSpawnCount, enemiesSpawned, enemiesKilled;
  var fireCooldown, enemySpawnTimer;
  var invincibleTimer = 0;
  var playTime = 0;
  var scoreMultiplier = 1;
  var weaponLevel = 0;
  var weaponTimer = 0;
  var turretCores = 0;
  var inShopActive = false;
  var shopSelection = 0;
  var totalKills = 0;
  var mp, isMultiplayer, isHost, mpFrameCount;

  var WEAPONS = [
    { name: 'Pistol',    spread: 0,    count: 1,  cooldown: 0.25, dmg: 1,  speed: 400, color: '#ffff44' },
    { name: 'Shotgun',   spread: 0.2,  count: 4,  cooldown: 0.45, dmg: 1,  speed: 350, color: '#ff8844' },
    { name: 'Machine',   spread: 0.05, count: 1,  cooldown: 0.10, dmg: 1,  speed: 450, color: '#44ff44' },
    { name: 'Laser',     spread: 0,    count: 1,  cooldown: 0.40, dmg: 3,  speed: 600, color: '#ff4444' },
    { name: 'Arc',       spread: 0.3,  count: 6,  cooldown: 0.50, dmg: 1,  speed: 300, color: '#cc44ff' },
    { name: 'Burst',     spread: 0.02, count: 3,  cooldown: 0.35, dmg: 2,  speed: 500, color: '#44ffff' },
  ];

  var ENEMY_TYPES = [
    { id: 'rusher',   hp: 1, speed: 100, score: 50,  color: '#ff4444', size: 14, pattern: 'rush',     cores: 1 },
    { id: 'sniper',   hp: 2, speed: 40,  score: 100, color: '#ff8800', size: 16, pattern: 'snipe',    cores: 2 },
    { id: 'swarm',    hp: 1, speed: 140, score: 30,  color: '#ff44ff', size: 10, pattern: 'rush',     cores: 1 },
    { id: 'tank',     hp: 5, speed: 30,  score: 200, color: '#44ff88', size: 22, pattern: 'rush',     cores: 3 },
    { id: 'spawner',  hp: 3, speed: 35,  score: 150, color: '#ffaa44', size: 20, pattern: 'spawn',    cores: 3 },
    { id: 'orbiter',  hp: 2, speed: 60,  score: 120, color: '#4488ff', size: 14, pattern: 'orbit',    cores: 2 },
  ];

  var CORE_TYPES = [
    { id: 'red',    color: '#ff3333', label: '♥ ATK', effect: 'attack' },
    { id: 'blue',   color: '#3388ff', label: '♢ SPD', effect: 'speed' },
    { id: 'green',  color: '#33ff66', label: '♡ LIFE',effect: 'heal' },
    { id: 'yellow', color: '#ffdd00', label: '★ CORE',effect: 'turret' },
  ];

  var _lastInput = { keys: {} };

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = { x: E.W/3, y: E.H/2, r: 10, speed: 180, maxHp: 5, hp: 5, invincible: 0 };
    player2 = { x: 2*E.W/3, y: E.H/2, r: 10, speed: 180, maxHp: 5, hp: 5, invincible: 0 };
    bullets = [];
    enemies = [];
    particles = [];
    cores = [];
    turrets = [];

    state = 'ready';
    waveSpawnCount = Math.min(5 + wave * 2, 40);
    enemiesSpawned = 0;
    enemiesKilled = 0;
    fireCooldown = 0;
    enemySpawnTimer = 0;
    invincibleTimer = 0;
    playTime = 0;
    scoreMultiplier = 1 + Math.floor(wave / 10) * 0.5;
    weaponLevel = Math.min(wave, WEAPONS.length - 1);
    weaponTimer = 0;
    turretCores = 0;
    inShopActive = false;
    totalKills = 0;

    // Multiplayer setup
    mp = (typeof window !== 'undefined' && window.MultiplayerClientInstance) ? window.MultiplayerClientInstance() : null;
    isMultiplayer = (typeof window !== 'undefined' && window.MultiplayerActive) ? window.MultiplayerActive() : false;
    isHost = mp ? mp.isHost : true;
    mpFrameCount = 0;

    if (isMultiplayer) {
      waveSpawnCount = Math.min(8 + wave * 3, 55); // More enemies for co-op
    }

    E.setScore(0);
    E.setLives(3);
  }

  function spawnEnemy() {
    var maxTypes = Math.min(ENEMY_TYPES.length, 2 + Math.floor(wave / 2));
    var idx = Math.floor(Math.random() * maxTypes);
    var t = ENEMY_TYPES[idx];

    var hpBonus = Math.floor(wave / 6);
    // Spawn from edge
    var side = Math.floor(Math.random() * 4);
    var x, y;
    switch (side) {
      case 0: x = -20; y = Math.random() * E.H; break; // left
      case 1: x = E.W + 20; y = Math.random() * E.H; break; // right
      case 2: x = Math.random() * E.W; y = -20; break; // top
      case 3: x = Math.random() * E.W; y = E.H + 20; break; // bottom
    }

    var e = {
      x: x, y: y, r: t.size, hp: t.hp + hpBonus, maxHp: t.hp + hpBonus,
      speed: t.speed + Math.random() * 10 + wave * 1.5,
      score: t.score + Math.floor(wave / 3) * 20,
      color: t.color, pattern: t.pattern, cores: t.cores + Math.floor(wave / 5),
      flashTimer: 0, shootTimer: 1 + Math.random() * 2,
      angle: Math.atan2(E.H/2 - y, E.W/2 - x),
      orbitAngle: Math.random() * Math.PI * 2,
      orbitDist: 60 + Math.random() * 40,
      spawnTimer: 0,
    };
    enemies.push(e);
    enemiesSpawned++;
  }

  function spawnBoss() {
    var bossNum = Math.floor(wave / 5);
    var r = 28 + bossNum * 3;
    var x = E.W/2, y = -40;
    var hp = 15 + bossNum * 12;

    var boss = {
      x: x, y: y, r: r, hp: hp, maxHp: hp,
      speed: 25 + bossNum * 2,
      score: 1000 + bossNum * 800,
      color: '#ff2222', pattern: 'boss',
      cores: 10 + bossNum * 5,
      flashTimer: 0, shootTimer: 0.3,
      angle: 0, orbitAngle: 0,
      isBoss: true, bossPhase: 0, bossTimer: 0,
    };
    enemies.push(boss);
    enemiesSpawned++;
  }

  function spawnBullet(x, y, angle, speed, isEnemy, color) {
    bullets.push({
      x: x, y: y, r: isEnemy ? 4 : 3,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      isEnemy: isEnemy, life: 3 + (isEnemy ? 2 : 0),
      color: color || (isEnemy ? '#ff6666' : '#ffff44'),
      trail: [],
    });
  }

  function spawnCore(x, y, type) {
    if (!type) {
      // Random weighted by wave
      var r = Math.random();
      if (r < 0.35) type = 'red';
      else if (r < 0.6) type = 'blue';
      else if (r < 0.8) type = 'green';
      else type = 'yellow';
    }
    cores.push({
      x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
      vy: -30 - Math.random() * 20, vx: (Math.random() - 0.5) * 30,
      life: 4, type: type, size: 4,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function deployTurret(x, y) {
    turrets.push({
      x: x, y: y, r: 8, angle: 0, cooldown: 0,
      range: 150, color: '#44ddff',
    });
  }

  function openShop() {
    inShopActive = true;
    shopSelection = 0;
  }

  // ── Update ──
  function update(dt, input) {
    playTime += dt;

    // Weapon cycling
    weaponTimer += dt;
    if (weaponTimer > 15 + wave * 2) {
      weaponLevel = (weaponLevel + 1) % WEAPONS.length;
      weaponTimer = 0;
      E.textCenter('⟳ ' + WEAPONS[weaponLevel].name, E.W/2, E.H/2 - 30, 9, WEAPONS[weaponLevel].color);
      E.playPowerup();
    }

    if (invincibleTimer > 0) invincibleTimer -= dt;

    // Cores
    for (var i = cores.length - 1; i >= 0; i--) {
      var c = cores[i];
      c.y += c.vy * dt; c.x += (c.vx || 0) * dt;
      c.vy += 50 * dt; c.life -= dt;
      c.pulse += dt * 3;
      if (c.life <= 0) { cores.splice(i, 1); continue; }
      var dx = player.x - c.x, dy = player.y - c.y;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 50) { c.x += dx/dist * 150 * dt; c.y += dy/dist * 150 * dt; }
      if (dist < 14) {
        applyCore(c.type);
        for (var p = 0; p < 6; p++) {
          var ang = Math.random() * Math.PI * 2;
          particles.push({ x: c.x, y: c.y, vx: Math.cos(ang)*40, vy: Math.sin(ang)*40, life: 0.3, maxLife: 0.3, size: 3, color: c.color });
        }
        cores.splice(i, 1);
        E.playPowerup();
      }
    }

    // Turrets
    for (var i = turrets.length - 1; i >= 0; i--) {
      var t = turrets[i];
      t.cooldown -= dt;
      // Find closest enemy
      var closest = null, cDist = t.range;
      for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j];
        var d = Math.abs(e.x - t.x) + Math.abs(e.y - t.y);
        if (d < cDist) { cDist = d; closest = e; }
      }
      if (closest && t.cooldown <= 0) {
        t.angle = Math.atan2(closest.y - t.y, closest.x - t.x);
        spawnBullet(t.x, t.y, t.angle, 300, false, '#44ddff');
        t.cooldown = 0.3;
        E.playShoot();
      }
    }

    // State machines
    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'gameover') {
      try {
        window.FreeArcadeSave.setHighScore('ArenaShooter', E.getScore());
        window.FreeArcadeSave.addCoins(Math.floor(totalKills / 3));
      } catch(e) {}
      if (input.action) { E.setLevel(1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'levelComplete') {
      try { window.FreeArcadeSave.setHighScore('ArenaShooter', E.getScore()); } catch(e) {}
      if (input.action) { E.setLevel(wave+1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'shop') {
      if (input.up) shopSelection = Math.max(0, shopSelection - 1);
      if (input.down) shopSelection = Math.min(2, shopSelection + 1);
      if (input.action) {
        if (shopSelection === 0 && turretCores >= 2) { turretCores -= 2; deployTurret(player.x - 15, player.y); E.playPowerup(); }
        if (shopSelection === 1 && turretCores >= 1) { turretCores -= 1; player.hp = Math.min(player.maxHp, player.hp + 2); E.playPowerup(); }
        if (shopSelection === 2) { inShopActive = false; state = 'playing'; }
      }
      if (input.escape) { inShopActive = false; state = 'playing'; }
      return;
    }

    // ── PLAYING ──
    // Store input for render function
    _lastInput = input;

    // Player movement (WASD / arrows)
    var spd = player.speed;
    var mx = 0, my = 0;
    if (input.left)  mx -= 1;
    if (input.right) mx += 1;
    if (input.up)    my -= 1;
    if (input.down)  my += 1;
    if (mx !== 0 || my !== 0) {
      var len = Math.sqrt(mx*mx + my*my);
      mx /= len; my /= len;
    }
    player.x += mx * spd * dt;
    player.y += my * spd * dt;
    player.x = Math.max(player.r, Math.min(E.W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(E.H - player.r, player.y));

    // Shooting (8-dir with arrow keys + space)
    var aimX = 0, aimY = 0;
    if (input.keys['ArrowUp'] || input.keys['KeyW']) aimY = -1;
    if (input.keys['ArrowDown'] || input.keys['KeyS']) aimY = 1;
    if (input.keys['ArrowLeft'] || input.keys['KeyA']) aimX = -1;
    if (input.keys['ArrowRight'] || input.keys['KeyD']) aimX = 1;

    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'])) {
      if (aimX === 0 && aimY === 0) aimX = 1; // default right
      var angle = Math.atan2(aimY, aimX);
      var wpn = WEAPONS[weaponLevel];
      for (var b = 0; b < wpn.count; b++) {
        var aOff = (b - (wpn.count-1)/2) * wpn.spread;
        spawnBullet(player.x, player.y, angle + aOff, wpn.speed + wave * 5, false, wpn.color);
      }
      fireCooldown = Math.max(0.06, wpn.cooldown - wave * 0.003);
      E.playShoot();
    }

    // ── Player 2 (Local co-op or remote) ──
    var p2Input = null;
    if (isMultiplayer && mp) {
      // Receive remote input from other player
      var remoteInputs = mp.remoteInputs;
      for (var pid in remoteInputs) {
        if (remoteInputs.hasOwnProperty(pid) && parseInt(pid) !== mp.playerId) {
          p2Input = remoteInputs[pid];
          break;
        }
      }
    }

    // If remote input available, use it; otherwise use local P2 keys
    if (p2Input) {
      // Remote player — apply their input locally
      var p2spd = player2.speed;
      var p2mx = 0, p2my = 0;
      if (p2Input.left)  p2mx -= 1;
      if (p2Input.right) p2mx += 1;
      if (p2Input.up)    p2my -= 1;
      if (p2Input.down)  p2my += 1;
      if (p2mx !== 0 || p2my !== 0) { var l = Math.sqrt(p2mx*p2mx + p2my*p2my); p2mx /= l; p2my /= l; }
      player2.x += p2mx * p2spd * dt;
      player2.y += p2my * p2spd * dt;
      player2.x = Math.max(player2.r, Math.min(E.W - player2.r, player2.x));
      player2.y = Math.max(player2.r, Math.min(E.H - player2.r, player2.y));

      // Remote player shooting
      if (p2Input.shoot && p2Input.fireTimer) {
        var p2angle = Math.atan2(p2Input.aimY, p2Input.aimX);
        var wpn = WEAPONS[weaponLevel];
        for (var b = 0; b < wpn.count; b++) {
          var aOff = (b - (wpn.count-1)/2) * wpn.spread;
          spawnBullet(player2.x, player2.y, p2angle + aOff, wpn.speed + wave * 5, false, wpn.color);
        }
      }
    } else if (isMultiplayer || true) {
      // Local P2 controls (IJKL move, U/H aim, G shoot) — always available even in local mode
      var p2mx = 0, p2my = 0;
      if (input.keys['KeyI']) p2my -= 1; // Up
      if (input.keys['KeyK']) p2my += 1; // Down
      if (input.keys['KeyJ']) p2mx -= 1; // Left
      if (input.keys['KeyL']) p2mx += 1; // Right
      if (p2mx !== 0 || p2my !== 0) { var l = Math.sqrt(p2mx*p2mx + p2my*p2my); p2mx /= l; p2my /= l; }
      player2.x += p2mx * player2.speed * dt;
      player2.y += p2my * player2.speed * dt;
      player2.x = Math.max(player2.r, Math.min(E.W - player2.r, player2.x));
      player2.y = Math.max(player2.r, Math.min(E.H - player2.r, player2.y));

      // P2 shoot (G key)
      var p2aimX = 0, p2aimY = 0;
      if (input.keys['KeyU']) p2aimY = -1;
      if (input.keys['KeyH']) p2aimY = 1;
      if (p2aimX === 0 && p2aimY === 0) p2aimX = 1; // default right
      if (input.keys['KeyG']) {
        var p2angle = Math.atan2(p2aimY, p2aimX);
        var wpn = WEAPONS[weaponLevel];
        for (var b = 0; b < wpn.count; b++) {
          var aOff = (b - (wpn.count-1)/2) * wpn.spread;
          spawnBullet(player2.x, player2.y, p2angle + aOff, wpn.speed + wave * 5, false, wpn.color);
        }
        input.keys['KeyG'] = false;
      }
    }

    // ── Send own input to remote opponents ──
    if (isMultiplayer && mp) {
      mp.sendInput({
        left: input.left || input.keys['KeyJ'] || false,
        right: input.right || input.keys['KeyL'] || false,
        up: input.up || input.keys['KeyI'] || false,
        down: input.down || input.keys['KeyK'] || false,
        shoot: input.keys['Space'] || input.keys['KeyZ'] || false,
        aimX: aimX,
        aimY: aimY,
        fireTimer: fireCooldown,
      });

      // Host sends authoritative game state every 3 frames
      mpFrameCount++;
      if (isHost && mpFrameCount % 3 === 0) {
        mp.sendGameState({
          enemies: enemies.map(function(e) {
            return { x: e.x, y: e.y, hp: e.hp, r: e.r, color: e.color, isBoss: !!e.isBoss };
          }),
          cores: cores.map(function(c) {
            return { x: c.x, y: c.y, type: c.type, life: c.life };
          }),
          player2: { x: player2.x, y: player2.y },
          wave: wave,
          score: E.getScore(),
        });
      }

      // Apply remote game state (for non-host: receive host's authoritative state)
      if (!isHost) {
        var remoteStates = mp.remoteStates;
        for (var pid in remoteStates) {
          if (remoteStates.hasOwnProperty(pid) && parseInt(pid) === mp.hostId) {
            var st = remoteStates[pid];
            if (st && st.enemies) {
              // Sync enemies from host
              for (var ei = 0; ei < st.enemies.length; ei++) {
                var se = st.enemies[ei];
                if (ei < enemies.length) {
                  enemies[ei].x = se.x;
                  enemies[ei].y = se.y;
                  enemies[ei].hp = se.hp;
                }
              }
              // Sync P2 position if it's us
              if (st.player2) {
                player2.x = st.player2.x;
                player2.y = st.player2.y;
              }
            }
          }
        }
      }
    }

    // Bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.x > E.W+20 || b.y < -20 || b.y > E.H+20) { bullets.splice(i, 1); continue; }

      if (!b.isEnemy) {
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (Math.abs(b.x - e.x) < e.r + b.r && Math.abs(b.y - e.y) < e.r + b.r) {
            bullets.splice(i, 1);
            e.hp -= (WEAPONS[weaponLevel] ? WEAPONS[weaponLevel].dmg : 1);
            e.flashTimer = 0.08;
            if (e.hp <= 0) {
              E.emitParticles(particles, e.x, e.y, e.color, 12, { speedMax: 80, lifeMax: 0.4 });
              E.addScore(Math.floor(e.score * scoreMultiplier));
              totalKills++;
              enemiesKilled++;

              // Drop cores
              if (e.isBoss) {
                for (var k = 0; k < e.cores; k++) spawnCore(e.x, e.y, 'yellow');
                E.shake(8, 0.4);
              } else {
                for (var k = 0; k < e.cores; k++) spawnCore(e.x, e.y);
              }

              enemies.splice(j, 1);
              E.playExplode();
            } else E.playHit();
            break;
          }
        }
      } else {
        if (invincibleTimer <= 0 && Math.abs(b.x - player.x) < player.r + b.r && Math.abs(b.y - player.y) < player.r + b.r) {
          bullets.splice(i, 1);
          takeDamage();
        }
      }
    }

    // Enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.flashTimer = Math.max(0, e.flashTimer - dt);
      e.shootTimer -= dt;

      switch (e.pattern) {
        case 'rush':
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          e.x += dx/dist * e.speed * dt;
          e.y += dy/dist * e.speed * dt;
          break;
        case 'snipe':
          // Move sideways, keep distance
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          if (dist > 200) { e.x += dx/dist * e.speed * dt; e.y += dy/dist * e.speed * dt; }
          else if (dist < 100) { e.x -= dx/dist * e.speed * dt; e.y -= dy/dist * e.speed * dt; }
          else { e.x += Math.cos(e.orbitAngle) * e.speed * dt; e.orbitAngle += dt * 2; }
          // Shoot at player
          if (e.shootTimer <= 0) {
            var ang = Math.atan2(dy, dx);
            spawnBullet(e.x, e.y, ang, 200 + wave * 5, true, '#ff8800');
            e.shootTimer = 0.8 + Math.random() * 1.2;
          }
          break;
        case 'orbit':
          e.orbitAngle += dt * 1.5;
          e.x = E.W/2 + Math.cos(e.orbitAngle) * e.orbitDist;
          e.y = E.H/2 + Math.sin(e.orbitAngle) * e.orbitDist;
          // Shoot radially
          if (e.shootTimer <= 0) {
            var ang = Math.atan2(player.y - e.y, player.x - e.x);
            spawnBullet(e.x, e.y, ang, 150 + wave * 3, true, '#4488ff');
            e.shootTimer = 1.0 + Math.random() * 1.5;
          }
          break;
        case 'spawn':
          e.spawnTimer -= dt;
          if (e.spawnTimer <= 0) {
            // Spawn mini rushers
            for (var s = 0; s < 3; s++) {
              enemies.push({
                x: e.x + (Math.random()-0.5)*20, y: e.y + (Math.random()-0.5)*20,
                r: 8, hp: 1, maxHp: 1, speed: 130, score: 20, color: '#ffaa44', pattern: 'rush',
                cores: 0, flashTimer: 0, shootTimer: 999, angle: 0, orbitAngle: 0,
                isMini: true, spawnTimer: 0,
              });
            }
            e.spawnTimer = 3 + Math.random() * 2;
            E.playBeep(300, 0.1, 'square', 0.05);
          }
          // Move slowly
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          e.x += dx/dist * e.speed * 0.5 * dt;
          e.y += dy/dist * e.speed * 0.5 * dt;
          break;
        case 'boss':
          bossUpdate(e, dt);
          break;
      }

      // Enemy-player collision
      if (invincibleTimer <= 0 && Math.abs(e.x - player.x) < player.r + e.r && Math.abs(e.y - player.y) < player.r + e.r) {
        if (e.isBoss) {
          e.hp -= 2;
          if (e.hp <= 0) { enemies.splice(i, 1); enemiesKilled++; }
        }
        takeDamage();
      }
    }

    // Spawn enemies
    if (enemiesSpawned < waveSpawnCount) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        if (wave % 5 === 0 && !enemies.some(function(e) { return e.isBoss; })) {
          spawnBoss();
          enemySpawnTimer = 3;
        } else {
          spawnEnemy();
          enemySpawnTimer = Math.max(0.15, 0.6 - wave * 0.015);
        }
      }
    }

    // Remove off-screen enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.x < -100 || e.x > E.W + 100 || e.y < -100 || e.y > E.H + 100) {
        if (!e.isBoss) enemies.splice(i, 1);
      }
    }

    // Wave transition
    if (enemiesSpawned >= waveSpawnCount && enemies.length === 0 && enemiesKilled > 0) {
      wave++;
      enemiesSpawned = 0;
      enemiesKilled = 0;
      waveSpawnCount = Math.min(5 + wave * 2, 45);
      enemySpawnTimer = 1;
      weaponLevel = Math.min(wave, WEAPONS.length - 1);
      E.playLevelUp();
      E.addScore(wave * 50);
      // Shop every 3 waves
      if (wave % 3 === 0) { openShop(); state = 'shop'; }
    }

    E.updateParticles(particles, dt);
  }

  function bossUpdate(e, dt) {
    e.bossTimer += dt;
    e.shootTimer -= dt;

    // Move in sweeping patterns
    e.x += Math.cos(e.bossTimer * 0.5) * 60 * dt;
    e.y += Math.sin(e.bossTimer * 0.7) * 40 * dt;
    e.x = Math.max(e.r, Math.min(E.W - e.r, e.x));
    e.y = Math.max(e.r, Math.min(E.H - e.r, e.y));

    if (e.shootTimer <= 0) {
      var r = Math.random();
      if (r < 0.4) {
        // Aimed burst
        for (var k = 0; k < 3; k++) {
          var ang = Math.atan2(player.y - e.y, player.x - e.x) + (Math.random() - 0.5) * 0.2;
          (function(a) { setTimeout(function() { spawnBullet(e.x, e.y, a, 220, true, '#ff4444'); }, k * 100); })(ang);
        }
      } else if (r < 0.7) {
        // Radial burst
        for (var a = 0; a < 360; a += 45) {
          var rad = a * Math.PI / 180;
          spawnBullet(e.x, e.y, rad, 150, true, '#ff8888');
        }
      } else {
        // Aimed fast shot
        var ang = Math.atan2(player.y - e.y, player.x - e.x);
        spawnBullet(e.x, e.y, ang, 350, true, '#ff2222');
      }
      e.shootTimer = 0.3 + Math.random() * 0.4;
    }
  }

  function takeDamage() {
    if (invincibleTimer > 0) return;
    player.hp--;
    invincibleTimer = 1.0;
    E.emitParticles(particles, player.x, player.y, '#ff4444', 8, { lifeMax: 0.3 });
    if (player.hp <= 0) {
      if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
      player.hp = player.maxHp;
    }
    E.shake(4, 0.2);
    E.playHit();
  }

  function applyCore(type) {
    switch (type) {
      case 'red':
        // Temporary damage boost
        scoreMultiplier = Math.min(3, scoreMultiplier + 0.2);
        E.textCenter('♥ ATK UP', player.x, player.y - 20, 8, '#ff3333');
        break;
      case 'blue':
        player.speed = Math.min(300, player.speed + 15);
        E.textCenter('♢ SPD UP', player.x, player.y - 20, 8, '#3388ff');
        break;
      case 'green':
        player.hp = Math.min(player.maxHp, player.hp + 1);
        E.textCenter('♡ +1 HP', player.x, player.y - 20, 8, '#33ff66');
        break;
      case 'yellow':
        turretCores++;
        E.textCenter('★ TURRET CORE', player.x, player.y - 20, 7, '#ffdd00');
        break;
    }
  }

  // ── Render ──
  function render(ctx) {
    // Background
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, E.W, E.H);

    // Grid
    ctx.strokeStyle = 'rgba(40,40,80,0.15)';
    ctx.lineWidth = 1;
    for (var x = 0; x < E.W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, E.H); ctx.stroke(); }
    for (var y = 0; y < E.H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(E.W, y); ctx.stroke(); }

    // Turrets
    for (var i = 0; i < turrets.length; i++) {
      var t = turrets[i];
      ctx.fillStyle = '#1a3355';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      // Barrel
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(t.angle) * 15, t.y + Math.sin(t.angle) * 15);
      ctx.stroke();
      // Range circle
      ctx.strokeStyle = 'rgba(68,221,255,0.08)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cores
    for (var i = 0; i < cores.length; i++) {
      var c = cores[i];
      var alpha = Math.min(1, c.life);
      var glow = 0.5 + Math.sin(c.pulse) * 0.3;
      ctx.globalAlpha = alpha * glow;
      var col = CORE_TYPES.find(function(t) { return t.id === c.type; });
      E.circle(c.x, c.y, c.size + 1, col ? col.color : '#fff');
      ctx.globalAlpha = 1;
      E.circle(c.x, c.y, c.size * 0.5, '#fff');
    }

    // Bullets
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      if (b.trail) {
        for (var t = 0; t < b.trail.length; t++) {
          ctx.globalAlpha = 0.15 - t * 0.02;
          E.circle(b.trail[t].x, b.trail[t].y, b.r * 0.5, b.color || '#fff');
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = b.color || (b.isEnemy ? '#ff4444' : '#ffff44');
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ctx.fillStyle = e.flashTimer > 0 ? '#fff' : e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      if (!e.isBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(e.x - 4, e.y - 4, 3, 3);
        ctx.fillRect(e.x + 2, e.y - 4, 3, 3);
      }
      // HP bar
      if (e.maxHp > 1) {
        var bw = e.r * 2;
        E.rect(e.x - bw/2, e.y - e.r - 5, bw, 3, 'rgba(0,0,0,0.4)');
        E.rect(e.x - bw/2, e.y - e.r - 5, bw * (e.hp/e.maxHp), 3, '#44ff44');
      }
    }

    // Player
    if (invincibleTimer <= 0 || Math.floor(invincibleTimer * 10) % 2 === 0) {
      ctx.fillStyle = '#44ddff';
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      // Inner circle
      ctx.fillStyle = '#88eeff';
      ctx.beginPath();
      ctx.arc(player.x - 2, player.y - 2, player.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // HP bar above
      var bw2 = player.r * 2.5;
      E.rect(player.x - bw2/2, player.y - player.r - 8, bw2, 4, 'rgba(0,0,0,0.5)');
      E.rect(player.x - bw2/2, player.y - player.r - 8, bw2 * (player.hp/player.maxHp), 4,
        player.hp > 2 ? '#44ff88' : (player.hp > 1 ? '#ffaa00' : '#ff4444'));

      // Aim direction indicator
      if (_lastInput && _lastInput.keys && (_lastInput.keys['ArrowUp'] || _lastInput.keys['ArrowDown'] || _lastInput.keys['ArrowLeft'] || _lastInput.keys['ArrowRight'])) {
        ctx.strokeStyle = 'rgba(68,221,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        var ax = 0, ay = 0;
        if (_lastInput.keys['ArrowUp'] || _lastInput.keys['KeyW']) ay = -1;
        if (_lastInput.keys['ArrowDown'] || _lastInput.keys['KeyS']) ay = 1;
        if (_lastInput.keys['ArrowLeft'] || _lastInput.keys['KeyA']) ax = -1;
        if (_lastInput.keys['ArrowRight'] || _lastInput.keys['KeyD']) ax = 1;
        if (ax === 0 && ay === 0) ax = 1;
        ctx.lineTo(player.x + ax * 30, player.y + ay * 30);
        ctx.stroke();
      }
    }

    // Player 2 (co-op)
    if (player2.x > 0 && player2.y > 0) {
      ctx.fillStyle = '#ff8844';
      ctx.beginPath();
      ctx.arc(player2.x, player2.y, player2.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc88';
      ctx.beginPath();
      ctx.arc(player2.x - 2, player2.y - 2, player2.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // HP bar
      E.rect(player2.x - player2.r, player2.y - player2.r - 8, player2.r * 2, 3, 'rgba(0,0,0,0.5)');
      E.rect(player2.x - player2.r, player2.y - player2.r - 8, player2.r * 2 * (player2.hp/player2.maxHp), 3, '#ff8844');
    }

    E.drawParticles(ctx, particles);

    // HUD
    E.text('WAVE ' + wave + '  SCORE: ' + E.getScore(), 8, 8, 8, '#ffaa00');
    E.text('P1 HP: ' + player.hp + '/' + player.maxHp, 8, 20, 7, '#44ff88');
    if (isMultiplayer || player2.x > 0) {
      E.text('P2 HP: ' + player2.hp + '/' + player2.maxHp, 8, 30, 7, '#ff8844');
    }
    E.text(WEAPONS[weaponLevel].name, E.W - 8, 8, 7, WEAPONS[weaponLevel].color, 'right');
    E.text('⟡' + turretCores, E.W - 8, 20, 7, '#ffdd00', 'right');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, E.W/2, 8, 8, '#ff6666', 'center');
    E.text('ENEMIES: ' + (waveSpawnCount - enemiesKilled), 8, 42, 7, '#88aacc');
    if (scoreMultiplier > 1) E.text('x' + scoreMultiplier.toFixed(1), E.W - 8, 32, 7, '#ff4444', 'right');
    if (isMultiplayer) {
      E.text(isHost ? '👑 HOST' : '📡 JOINER', E.W/2, 20, 7, '#ffdd00', 'center');
      if (mp) E.text('ROOM: ' + (mp.roomCode || '--'), E.W/2, 30, 6, '#888', 'center');
    }

    var cx = E.W/2, cy = E.H/2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('ARENA SHOOTER', cx, 60, 18, '#ff6644', '#000');
      E.textCenterShadow('WAVE ' + wave, cx, 95, 12, '#ffaa00', '#000');
      E.textCenter('WASD move · Arrows aim · SPACE shoot', cx, 150, 8, '#aaa');
      E.textCenter('Colored cores give temporary buffs!', cx, 175, 7, '#888');
      E.textCenter('Weapon cycles every few waves', cx, 195, 7, '#888');
      if (isMultiplayer) {
        E.textCenter('P1: WASD + Arrows + SPACE  |  P2: IJKL + U/H + G', cx, 220, 7, '#aaa');
        E.textCenter('PLAYERS: ' + (mp ? mp.players.length : 2) + '  MODE: ' + (isHost ? 'HOST' : 'JOINER'), cx, 235, 7, '#ffdd00');
      }
      E.textCenter('PRESS ENTER TO START', cx, isMultiplayer ? 260 : 250, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 55, 18, '#ff4444', '#000');
      E.textCenterShadow('WAVE ' + wave + '  SCORE: ' + E.getScore(), cx, cy - 10, 10, '#ffaa00', '#000');
      E.textCenter('KILLS: ' + totalKills, cx, cy + 15, 8, '#88aacc');
      var best = window.FreeArcadeSave ? window.FreeArcadeSave.getHighScore('ArenaShooter') : 0;
      if (E.getScore() >= best) E.textCenter('★ NEW BEST ★', cx, cy + 32, 8, '#ffdd00');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 60, 8, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('WAVE ' + wave + ' CLEAR!', cx, cy - 30, 14, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy + 10, 10, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR WAVE ' + (wave + 1), cx, cy + 45, 8, '#aaa');
    }

    if (state === 'shop') {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('⟡ SHOP ⟡', cx, 50, 14, '#ffdd00', '#000');
      E.textCenter('⟡ CORES: ' + turretCores, cx, 85, 9, '#ffdd00');

      var shopItems = [
        { label: 'DEPLOY TURRET   ⟡2', desc: 'Auto-targets enemies' },
        { label: 'HEAL +2 HP      ⟡1', desc: 'Restore health' },
        { label: 'CONTINUE',            desc: 'Back to battle' },
      ];
      for (var i = 0; i < shopItems.length; i++) {
        var y = 130 + i * 40;
        var aff = (i === 0 && turretCores >= 2) || (i === 1 && turretCores >= 1) || i === 2;
        E.text((i === shopSelection ? '▸ ' : '  ') + shopItems[i].label,
          cx - 100, y, 8, i === shopSelection ? (aff ? '#ffdd00' : '#ff4444') : (aff ? '#aaa' : '#666'), 'center');
        E.text(shopItems[i].desc, cx, y + 16, 6, '#555', 'center');
      }
      E.textCenter('↑↓ select  ENTER buy  ESC skip', cx, E.H - 30, 7, '#666');
    }
  }

  function destroy() {}

  window.ArenaShooter = { init: init, update: update, render: render, destroy: destroy };
})();
