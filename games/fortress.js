/**
 * Fortress Survival — top-down resource gathering, building, and wave survival
 *
 * Creative twist: gather resources (wood/stone/metal), build walls, ramps, and
 * traps to defend against waves. Craft weapons at workbenches. Storm circle
 * shrinks, forcing close-quarters combat. Boss every 5 waves.
 *
 * WASD move · SPACE attack · 1-4 build mode · E collect · MOUSE aim
 */
(function () {
  'use strict';

  var E;
  var player, resources, enemies, bullets, particles, structures, stations;
  var camera;
  var mapW = 1600, mapH = 1600;
  var state;
  var wave, enemiesInWave, enemiesKilled, totalKilled;
  var inventory, selectedSlot;
  var buildMode = false;
  var fireCooldown = 0;
  var spawnTimer = 0;
  var stormRadius, stormX, stormY;
  var stormActive = false;
  var stormTimer = 0;
  var craftTimer = 0;
  var builderPlacing = false;
  var placeX = 0, placeY = 0;

  var STRUCTURES = [
    { id: 'wall',  hp: 100, cost: { wood: 3, stone: 1 }, color: '#886644', label: 'WALL',   size: 24 },
    { id: 'ramp',  hp: 60,  cost: { wood: 2 },           color: '#aa8844', label: 'RAMP',   size: 24 },
    { id: 'spike', hp: 30,  cost: { wood: 1, metal: 1 }, color: '#cc4444', label: 'SPIKE',  size: 20 },
    { id: 'wall2', hp: 200, cost: { wood: 5, stone: 3 }, color: '#666688', label: 'STONE',  size: 24 },
  ];

  var WEAPONS = [
    { name: 'Pickaxe',  dmg: 2,  cooldown: 0.35, range: 30, color: '#88aa88', cost: null },
    { name: 'Sword',    dmg: 3,  cooldown: 0.20, range: 28, color: '#88aaff', cost: { wood: 3, stone: 2 } },
    { name: 'Bow',      dmg: 2,  cooldown: 0.40, range: 200,color: '#88dd88', cost: { wood: 5 } },
    { name: 'Hammer',   dmg: 5,  cooldown: 0.60, range: 32, color: '#aaaaff', cost: { wood: 5, stone: 5, metal: 2 } },
  ];
  var currentWeapon = 0;

  var RES_TYPES = [
    { id: 'tree',  color: '#33aa44', hp: 20, gives: { wood: 3 }, label: '🌲' },
    { id: 'rock',  color: '#888888', hp: 25, gives: { stone: 2 }, label: '🪨' },
    { id: 'metal', color: '#aabbcc', hp: 30, gives: { metal: 2 }, label: '⛏️' },
  ];

  function doCost(cost) {
    if (!cost) return true;
    for (var k in cost) if ((inventory[k] || 0) < cost[k]) return false;
    return true;
  }

  function spendCost(cost) {
    if (!cost) return;
    for (var k in cost) inventory[k] -= cost[k];
  }

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = {
      x: mapW/2, y: mapH/2, r: 12,
      hp: 8, maxHp: 8,
      speed: 150, invincible: 0,
      facing: 1,
    };

    resources = [];
    enemies = [];
    bullets = [];
    particles = [];
    structures = [];
    stations = [];

    camera = { x: 0, y: 0 };
    state = 'ready';
    wave = E.getLevel();
    enemiesInWave = 10 + wave * 4;
    enemiesKilled = 0;
    totalKilled = 0;
    fireCooldown = 0;
    spawnTimer = 0;
    selectedSlot = 0;
    buildMode = false;
    stormActive = false;
    stormRadius = 600;
    stormX = mapW/2;
    stormY = mapH/2;
    stormTimer = 0;
    craftTimer = 0;
    builderPlacing = false;

    inventory = { wood: 10, stone: 5, metal: 2 };
    currentWeapon = 0;

    E.setScore(0);
    E.setLives(3);
    spawnResources();
  }

  function spawnResources() {
    for (var i = 0; i < 30 + wave * 5; i++) {
      var rx = 100 + Math.random() * (mapW - 200);
      var ry = 100 + Math.random() * (mapH - 200);
      var type = Math.random();
      if (type < 0.5) resources.push({ x: rx, y: ry, type: 'tree', hp: 20, maxHp: 20, alive: true, bob: Math.random() * 5 });
      else if (type < 0.8) resources.push({ x: rx, y: ry, type: 'rock', hp: 25, maxHp: 25, alive: true, bob: Math.random() * 5 });
      else resources.push({ x: rx, y: ry, type: 'metal', hp: 30, maxHp: 30, alive: true, bob: Math.random() * 5 });
    }
    // Workbench
    stations.push({ x: mapW/2, y: mapH/2, type: 'workbench', color: '#ffaa44', label: '⚒' });
  }

  function spawnEnemy() {
    var side = Math.floor(Math.random() * 4);
    var x, y;
    switch (side) {
      case 0: x = player.x + (Math.random() - 0.5) * 400 - 500; y = player.y + (Math.random() - 0.5) * 400; break;
      case 1: x = player.x + (Math.random() - 0.5) * 400 + 500; y = player.y + (Math.random() - 0.5) * 400; break;
      case 2: x = player.x + (Math.random() - 0.5) * 400; y = player.y + (Math.random() - 0.5) * 400 - 500; break;
      case 3: x = player.x + (Math.random() - 0.5) * 400; y = player.y + (Math.random() - 0.5) * 400 + 500; break;
    }
    x = Math.max(30, Math.min(mapW - 30, x));
    y = Math.max(30, Math.min(mapH - 30, y));

    var typeRoll = Math.random();
    var hp = 1 + Math.floor(wave / 4);
    var speed = 60 + wave * 3;
    var e;
    if (typeRoll < 0.5) {
      e = { x: x, y: y, r: 14, hp: hp, maxHp: hp, speed: speed, score: 40 + wave * 10, color: '#ff6644', type: 'walker', attackDmg: 1, attackTimer: 0 };
    } else if (typeRoll < 0.75) {
      e = { x: x, y: y, r: 10, hp: Math.max(1, hp - 1), maxHp: Math.max(1, hp - 1), speed: speed * 1.5, score: 30 + wave * 8, color: '#ff8844', type: 'fast', attackDmg: 1, attackTimer: 0 };
    } else if (typeRoll < 0.9) {
      e = { x: x, y: y, r: 20, hp: hp + 2, maxHp: hp + 2, speed: speed * 0.6, score: 80 + wave * 15, color: '#8844ff', type: 'tank', attackDmg: 2, attackTimer: 0 };
    } else {
      e = { x: x, y: y, r: 12, hp: hp, maxHp: hp, speed: speed * 0.8, score: 60 + wave * 12, color: '#ff44aa', type: 'ranged', attackDmg: 1, attackTimer: 0 };
    }
    enemies.push(e);
  }

  function spawnBoss() {
    var bossNum = Math.floor(wave / 5);
    var dx = 400 + Math.random() * 200;
    var dy = 400 + Math.random() * 200;
    enemies.push({
      x: player.x + (Math.random() < 0.5 ? -dx : dx),
      y: player.y + (Math.random() < 0.5 ? -dy : dy),
      r: 32 + bossNum * 4,
      hp: 30 + bossNum * 20, maxHp: 30 + bossNum * 20,
      speed: 25 + bossNum * 2,
      score: 2000 + bossNum * 1500,
      color: '#ff2222', type: 'boss',
      attackDmg: 3, attackTimer: 0,
      isBoss: true, phase: 0, phaseTimer: 0,
    });
  }

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); return; }
      return;
    }
    if (state === 'gameover') {
      try { window.FreeArcadeSave.setHighScore('Fortress', E.getScore()); window.FreeArcadeSave.addCoins(Math.floor(totalKilled/2)); } catch(e) {}
      if (input.action) { E.setLevel(1); init(); state = 'playing'; E.playCoin(); }
      return;
    }
    if (state === 'win') {
      try { window.FreeArcadeSave.setHighScore('Fortress', E.getScore()); window.FreeArcadeSave.addCoins(Math.floor(totalKilled/2)); } catch(e) {}
      if (input.action) { E.setLevel(wave + 1); init(); state = 'playing'; E.playCoin(); }
      return;
    }

    // Pause for building mode
    if (buildMode) {
      buildUpdate(dt, input);
      return;
    }

    if (player.invincible > 0) player.invincible -= dt;

    // Player movement
    var mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (mx !== 0 || my !== 0) { var len = Math.sqrt(mx*mx + my*my); mx /= len; my /= len; player.facing = mx !== 0 ? mx : player.facing; }
    player.x += mx * player.speed * dt;
    player.y += my * player.speed * dt;
    player.x = Math.max(player.r, Math.min(mapW - player.r, player.x));
    player.y = Math.max(player.r, Math.min(mapH - player.r, player.y));

    // Mouse aim
    var aimX = input.mouseX !== undefined ? input.mouseX + camera.x : player.x + player.facing * 50;
    var aimY = input.mouseY !== undefined ? input.mouseY + camera.y : player.y;
    var aimDx = aimX - player.x, aimDy = aimY - player.y;
    var aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
    player.facing = aimDx > 0 ? 1 : -1;

    // Build mode toggle (B)
    if (input.keys['KeyB']) { buildMode = true; builderPlacing = false; selectedSlot = 0; input.keys['KeyB'] = false; return; }

    // Weapon hotkeys
    for (var k = 0; k < WEAPONS.length; k++) {
      if (input.keys['Digit' + (k + 1)] || input.keys['Numpad' + (k + 1)]) {
        currentWeapon = k;
        input.keys['Digit' + (k + 1)] = false;
        input.keys['Numpad' + (k + 1)] = false;
      }
    }

    // Collect resources (E)
    if (input.keys['KeyE']) {
      for (var i = resources.length - 1; i >= 0; i--) {
        var r = resources[i];
        if (!r.alive) continue;
        if (Math.abs(r.x - player.x) < 30 && Math.abs(r.y - player.y) < 30) {
          var resType = RES_TYPES.find(function(rt) { return rt.id === r.type; });
          if (resType) {
            for (var k in resType.gives) {
              inventory[k] = (inventory[k] || 0) + resType.gives[k];
            }
            E.textCenter('+' + Object.keys(resType.gives).map(function(k) { return resType.gives[k] + ' ' + k; }).join(' '),
              player.x, player.y - 20, 7, '#ffdd00');
            E.playCoin();
            // Respawn resource after delay
            var respawnType = r.type;
            setTimeout(function() {
              var spawned = false;
              for (var si = 0; si < resources.length; si++) {
                if (!resources[si].alive && resources[si].type === respawnType) {
                  resources[si].alive = true;
                  resources[si].hp = resources[si].maxHp;
                  resources[si].x = 100 + Math.random() * (mapW - 200);
                  resources[si].y = 100 + Math.random() * (mapH - 200);
                  spawned = true;
                  break;
                }
              }
            }, 5000);
            resources[i].alive = false;
          }
        }
      }
      input.keys['KeyE'] = false;
    }

    // Attack (SPACE / mouse click)
    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'] || input.mouseDown)) {
      var wpn = WEAPONS[currentWeapon];
      if (wpn.range > 40) {
        // Ranged
        shootBullet(player.x, player.y, aimDx/aimDist, aimDy/aimDist, wpn.dmg);
        E.playShoot();
      } else {
        // Melee
        for (var i = enemies.length - 1; i >= 0; i--) {
          var e = enemies[i];
          if (Math.abs(e.x - player.x) < wpn.range && Math.abs(e.y - player.y) < wpn.range) {
            e.hp -= wpn.dmg;
            e.attackTimer = 0.15;
            E.emitParticles(particles, e.x, e.y, '#ffaa44', 4, {});
            if (e.hp <= 0) { killEnemy(i); }
          }
        }
        // Swing particles
        for (var p = 0; p < 4; p++) {
          var a = Math.atan2(aimDy, aimDx) + (Math.random() - 0.5) * 0.5;
          particles.push({ x: player.x + aimDx/aimDist * 20, y: player.y + aimDy/aimDist * 20,
            vx: Math.cos(a)*40, vy: Math.sin(a)*40, life: 0.2, maxLife: 0.2, size: 3, color: wpn.color });
        }
        E.playHit();
      }
      fireCooldown = wpn.cooldown;
      // Also hit resources
      for (var i = resources.length - 1; i >= 0; i--) {
        var r = resources[i];
        if (!r.alive) continue;
        if (Math.abs(r.x - player.x) < 30 && Math.abs(r.y - player.y) < 30) {
          r.hp -= wpn.dmg;
          if (r.hp <= 0) {
            var resType = RES_TYPES.find(function(rt) { return rt.id === r.type; });
            if (resType) {
              for (var k in resType.gives) { inventory[k] = (inventory[k] || 0) + resType.gives[k]; }
              E.textCenter('+' + Object.keys(resType.gives).map(function(k) { return resType.gives[k] + ' ' + k; }).join(' '), player.x, player.y - 20, 7, '#ffdd00');
            }
            r.alive = false;
            setTimeout(function(rr) {
              if (rr) { rr.alive = true; rr.hp = rr.maxHp; rr.x = 100 + Math.random() * (mapW - 200); rr.y = 100 + Math.random() * (mapH - 200); }
            }.bind(null, r), 8000);
            E.playExplode();
          }
        }
      }
    }

    // ── Craft at workbench ──
    var nearBench = false;
    for (var i = 0; i < stations.length; i++) {
      if (Math.abs(stations[i].x - player.x) < 30 && Math.abs(stations[i].y - player.y) < 30) {
        nearBench = true;
        if (input.keys['KeyF']) {
          // Craft weapons
          for (var w = 1; w < WEAPONS.length; w++) {
            if (doCost(WEAPONS[w].cost) && WEAPONS[w].name !== WEAPONS[currentWeapon].name) {
              spendCost(WEAPONS[w].cost);
              currentWeapon = w;
              E.textCenter('CRAFTED: ' + WEAPONS[w].name, player.x, player.y - 20, 8, WEAPONS[w].color);
              E.playPowerup();
              break;
            }
          }
          input.keys['KeyF'] = false;
        }
        if (input.keys['KeyR']) {
          // Repair nearest structure
          for (var si = 0; si < structures.length; si++) {
            var st = structures[si];
            if (Math.abs(st.x - player.x) < 80 && Math.abs(st.y - player.y) < 80 && st.hp < st.maxHp && doCost({ wood: 1, stone: 1 })) {
              st.hp = Math.min(st.maxHp, st.hp + 20);
              spendCost({ wood: 1, stone: 1 });
              E.textCenter('REPAIR', player.x, player.y - 20, 7, '#44ff88');
              break;
            }
          }
          input.keys['KeyR'] = false;
        }
      }
    }
    craftTimer = nearBench ? Math.min(1, craftTimer + dt) : Math.max(0, craftTimer - dt);

    // ── Resources ──
    for (var i = resources.length - 1; i >= 0; i--) {
      var r = resources[i];
      if (!r.alive) continue;
      // Remove if far from player (cleanup)
      if (Math.abs(r.x - player.x) > 2000 || Math.abs(r.y - player.y) > 2000) {
        if (Math.random() < 0.01) { r.alive = false; }
      }
    }

    // ── Bullets ──
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -50 || b.x > mapW + 50 || b.y < -50 || b.y > mapH + 50 || b.life <= 0) { bullets.splice(i, 1); continue; }
      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        if (Math.abs(b.x - e.x) < e.r + 5 && Math.abs(b.y - e.y) < e.r + 5) {
          e.hp -= b.dmg;
          e.attackTimer = 0.1;
          if (e.hp <= 0) killEnemy(j);
          else E.playHit();
          bullets.splice(i, 1);
          break;
        }
      }
    }

    // ── Enemies ──
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.attackTimer = Math.max(0, e.attackTimer - dt);

      // Find nearest target (player or structures)
      var dx = player.x - e.x, dy = player.y - e.y;
      var dist = Math.sqrt(dx*dx + dy*dy);

      // Check structures first
      var targetStruct = null;
      var structDist = Infinity;
      for (var si = 0; si < structures.length; si++) {
        var st = structures[si];
        if (st.type === 'spike' || st.type === 'wall2' || st.type === 'wall') {
          var sd = Math.sqrt((st.x - e.x)*(st.x - e.x) + (st.y - e.y)*(st.y - e.y));
          if (sd < structDist) { structDist = sd; targetStruct = st; }
        }
      }

      var targetX = player.x, targetY = player.y;
      var attackRange = e.r + 20;

      if (targetStruct && structDist < 300) {
        targetX = targetStruct.x;
        targetY = targetStruct.y;
        attackRange = e.r + targetStruct.size/2 + 5;
      }

      dx = targetX - e.x;
      dy = targetY - e.y;
      var d = Math.sqrt(dx*dx + dy*dy) || 1;

      if (e.type === 'boss') {
        e.phaseTimer += dt;
        e.x += Math.cos(e.phaseTimer * 0.5) * 100 * dt;
        e.y += Math.sin(e.phaseTimer * 0.7) * 80 * dt;
        // Charge at player occasionally
        if (Math.sin(e.phaseTimer * 0.4) > 0.8) {
          e.x += dx/d * 200 * dt;
          e.y += dy/d * 200 * dt;
        }
      } else {
        e.x += dx/d * e.speed * dt;
        e.y += dy/d * e.speed * dt;
        // Ranged enemies hang back
        if (e.type === 'ranged' && d < 150) {
          e.x -= dx/d * e.speed * 0.5 * dt;
          e.y -= dy/d * e.speed * 0.5 * dt;
        }
      }

      // Attack
      if (d < attackRange) {
        if (e.type === 'ranged') {
          if (e.attackTimer <= 0) {
            shootBullet(e.x, e.y, dx/d, dy/d, e.attackDmg || 1, true);
            e.attackTimer = 1.5;
          }
        } else {
          if (e.attackTimer <= 0) {
            if (targetStruct) {
              targetStruct.hp -= (e.attackDmg || 1);
              if (targetStruct.hp <= 0) {
                E.emitParticles(particles, targetStruct.x, targetStruct.y, '#886644', 8, {});
                structures.splice(structures.indexOf(targetStruct), 1);
              }
            } else {
              player.hp -= (e.attackDmg || 1);
              player.invincible = 0.4;
              E.emitParticles(particles, player.x, player.y, '#ff4444', 4, {});
              if (player.hp <= 0) {
                if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
                player.hp = player.maxHp;
                player.x = mapW/2;
                player.y = mapH/2;
              }
              E.shake(4, 0.15);
              E.playHit();
            }
            e.attackTimer = 1.0;
          }
        }
      }

      // Storm damage
      if (stormActive) {
        var sd = Math.sqrt((e.x - stormX)*(e.x - stormX) + (e.y - stormY)*(e.y - stormY));
        if (sd > stormRadius) { e.hp -= dt * 2; if (e.hp <= 0) killEnemy(i); }
      }

      // Remove far-off enemies
      if (e.x < -200 || e.x > mapW + 200 || e.y < -200 || e.y > mapH + 200) {
        if (!e.isBoss) enemies.splice(i, 1);
      }
    }

    // ── Storm ──
    stormTimer += dt;
    if (wave > 2 && stormTimer > 5) {
      stormRadius = Math.max(120, stormRadius - dt * 3);
      stormActive = true;
    }
    // Storm damage to player
    if (stormActive) {
      var pd = Math.sqrt((player.x - stormX)*(player.x - stormX) + (player.y - stormY)*(player.y - stormY));
      if (pd > stormRadius) {
        player.hp -= dt * 0.5;
        if (player.hp <= 0) {
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          player.hp = player.maxHp;
        }
      }
    }

    // ── Spawn ──
    if (enemiesKilled < enemiesInWave) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        if (wave % 5 === 0 && enemies.length < 3 && enemiesKilled > 5 && !enemies.some(function(ee) { return ee.isBoss; })) {
          spawnBoss();
          spawnTimer = 3;
        } else {
          spawnEnemy();
          spawnTimer = Math.max(0.3, 0.8 - wave * 0.01);
        }
      }
    }

    // ── Wave complete ──
    if (enemiesKilled >= enemiesInWave && enemies.length === 0 && state === 'playing') {
      state = 'win';
      wave++;
      enemiesInWave = 10 + wave * 4;
      enemiesKilled = 0;
      spawnTimer = 3;
      stormRadius = 500;
      stormTimer = 0;
      // Bonus resources
      inventory.wood += 5 + wave;
      inventory.stone += 3 + Math.floor(wave/2);
      inventory.metal += 1 + Math.floor(wave/3);
      E.textCenterShadow('BONUS RESOURCES!', player.x - camera.x, player.y - camera.y - 40, 10, '#ffdd00', '#000');
      E.playLevelUp();
      E.addScore(wave * 50);
      try { window.FreeArcadeSave.setHighScore('Fortress', E.getScore()); } catch(e) {}
    }

    E.updateParticles(particles, dt);
  }

  function buildUpdate(dt, input) {
    // 1-4 select structure, ENTER to place, B/ESC to exit
    if (input.keys['Escape'] || input.keys['KeyB']) { buildMode = false; input.keys['Escape'] = false; input.keys['KeyB'] = false; return; }

    var sel = selectedSlot;
    if (input.keys['Digit1']) { sel = 0; input.keys['Digit1'] = false; }
    if (input.keys['Digit2']) { sel = 1; input.keys['Digit2'] = false; }
    if (input.keys['Digit3']) { sel = 2; input.keys['Digit3'] = false; }
    if (input.keys['Digit4']) { sel = 3; input.keys['Digit4'] = false; }
    selectedSlot = sel;

    // Placement preview
    var wp = STRUCTURES[selectedSlot];
    placeX = player.x + input.aimX * 60;
    placeY = player.y + input.aimY * 60;
    // If mouse available
    if (input.mouseX !== undefined) {
      placeX = input.mouseX + camera.x;
      placeY = input.mouseY + camera.y;
    }
    // Snap to grid
    placeX = Math.round(placeX / 24) * 24;
    placeY = Math.round(placeY / 24) * 24;
    placeX = Math.max(12, Math.min(mapW - 12, placeX));
    placeY = Math.max(12, Math.min(mapH - 12, placeY));

    // Check if occupied
    var blocked = false;
    for (var i = 0; i < structures.length; i++) {
      var st = structures[i];
      if (Math.abs(st.x - placeX) < 20 && Math.abs(st.y - placeY) < 20) { blocked = true; break; }
    }

    if (input.action && !blocked && doCost(wp.cost)) {
      spendCost(wp.cost);
      var s = {
        x: placeX, y: placeY,
        type: wp.id,
        size: wp.size,
        hp: wp.hp, maxHp: wp.hp,
        color: wp.color,
        label: wp.label,
      };
      structures.push(s);
      E.playCoin();
      builderPlacing = true;
    }
  }

  function shootBullet(x, y, nx, ny, dmg, isEnemy) {
    bullets.push({
      x: x, y: y, r: 4,
      vx: nx * (isEnemy ? 150 : 300),
      vy: ny * (isEnemy ? 150 : 300),
      dmg: dmg || 1, isEnemy: isEnemy || false,
      life: 1.5, color: isEnemy ? '#ff8888' : '#88dd88',
    });
  }

  function killEnemy(i) {
    var e = enemies[i];
    E.addScore(e.score);
    E.emitParticles(particles, e.x, e.y, e.color, 8, {});
    totalKilled++;
    enemiesKilled++;
    enemies.splice(i, 1);
    E.playExplode();
  }

  function render(ctx) {
    var cx = player.x - E.W/2;
    var cy = player.y - E.H/2;
    cx = Math.max(0, Math.min(mapW - E.W, cx));
    cy = Math.max(0, Math.min(mapH - E.H, cy));
    camera.x = cx; camera.y = cy;

    ctx.save();
    ctx.translate(-cx, -cy);

    // Ground
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, mapW, mapH);

    // Grass texture
    ctx.strokeStyle = 'rgba(40,60,40,0.15)';
    for (var gx = 0; gx < mapW; gx += 60) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, mapH); ctx.stroke();
    }
    for (var gy = 0; gy < mapH; gy += 60) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(mapW, gy); ctx.stroke();
    }

    // Storm circle
    if (stormActive) {
      ctx.strokeStyle = 'rgba(200,0,255,0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.arc(stormX, stormY, stormRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Storm outside
      ctx.fillStyle = 'rgba(200,0,255,0.04)';
      ctx.beginPath();
      ctx.rect(-1000, -1000, mapW + 2000, mapH + 2000);
      ctx.arc(stormX, stormY, stormRadius, 0, Math.PI * 2, true);
      ctx.fill();
    }

    // Resources
    for (var i = 0; i < resources.length; i++) {
      var r = resources[i];
      if (!r.alive) continue;
      if (r.x < cx - 50 || r.x > cx + E.W + 50 || r.y < cy - 50 || r.y > cy + E.H + 50) continue;
      var bob = Math.sin(Date.now() * 0.003 + r.bob) * 2;
      var resType = RES_TYPES.find(function(rt) { return rt.id === r.type; });
      if (r.type === 'tree') {
        ctx.fillStyle = '#33aa44';
        ctx.beginPath();
        ctx.moveTo(r.x, r.y + bob - 12);
        ctx.lineTo(r.x - 12, r.y + bob + 4);
        ctx.lineTo(r.x + 12, r.y + bob + 4);
        ctx.fill();
        ctx.fillStyle = '#886644';
        ctx.fillRect(r.x - 2, r.y + bob + 2, 4, 8);
      } else if (r.type === 'rock') {
        ctx.fillStyle = '#999999';
        ctx.beginPath(); ctx.arc(r.x, r.y + bob, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#777777';
        ctx.beginPath(); ctx.arc(r.x - 2, r.y + bob - 2, 6, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#778899';
        ctx.fillRect(r.x - 8, r.y + bob - 8, 16, 16);
        ctx.fillStyle = '#99aabb';
        ctx.fillRect(r.x - 5, r.y + bob - 5, 10, 10);
      }
      // HP bar
      if (r.hp < r.maxHp) {
        E.rect(r.x - 8, r.y + bob - 16, 16, 2, 'rgba(0,0,0,0.4)');
        E.rect(r.x - 8, r.y + bob - 16, 16 * (r.hp/r.maxHp), 2, '#ffaa44');
      }
    }

    // Stations
    for (var i = 0; i < stations.length; i++) {
      var st = stations[i];
      if (st.x < cx - 40 || st.x > cx + E.W + 40 || st.y < cy - 40 || st.y > cy + E.H + 40) continue;
      var bob = Math.sin(Date.now() * 0.003) * 2;
      // Anvil shape
      ctx.fillStyle = st.color;
      ctx.fillRect(st.x - 12, st.y + bob - 6, 24, 12);
      ctx.fillRect(st.x - 6, st.y + bob - 12, 12, 8);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚒', st.x, st.y + bob + 5);
    }

    // Structures
    for (var i = 0; i < structures.length; i++) {
      var st = structures[i];
      if (st.x < cx - st.size || st.x > cx + E.W + st.size || st.y < cy - st.size || st.y > cy + E.H + st.size) continue;
      if (st.type === 'wall' || st.type === 'wall2') {
        ctx.fillStyle = st.color;
        ctx.fillRect(st.x - st.size/2, st.y - st.size/2, st.size, st.size);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(st.x - st.size/2, st.y - st.size/2, st.size, st.size);
        // Pattern
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(st.x - 4, st.y - 8, 8, 16);
      } else if (st.type === 'ramp') {
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.moveTo(st.x - st.size/2, st.y + st.size/2);
        ctx.lineTo(st.x, st.y - st.size/2);
        ctx.lineTo(st.x + st.size/2, st.y + st.size/2);
        ctx.fill();
      } else if (st.type === 'spike') {
        ctx.fillStyle = st.color;
        for (var s = -1; s <= 1; s++) {
          ctx.beginPath();
          ctx.moveTo(st.x + s * 6 - 4, st.y + 8);
          ctx.lineTo(st.x + s * 6, st.y - 8);
          ctx.lineTo(st.x + s * 6 + 4, st.y + 8);
          ctx.fill();
        }
        // Damage nearby enemies
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (Math.abs(e.x - st.x) < 24 && Math.abs(e.y - st.y) < 24) {
            e.hp -= dt * 1.5;
            if (e.hp <= 0) killEnemy(j);
          }
        }
      }
      // HP bar
      if (st.hp < st.maxHp) {
        E.rect(st.x - st.size/2, st.y - st.size/2 - 5, st.size, 3, 'rgba(0,0,0,0.4)');
        E.rect(st.x - st.size/2, st.y - st.size/2 - 5, st.size * (st.hp/st.maxHp), 3,
          st.hp > st.maxHp * 0.3 ? '#44ff88' : '#ff4444');
      }
    }

    // Bullets
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      if (b.x < cx - 10 || b.x > cx + E.W + 10 || b.y < cy - 10 || b.y > cy + E.H + 10) continue;
      E.circle(b.x, b.y, b.r, b.color);
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.x < cx - 50 || e.x > cx + E.W + 50 || e.y < cy - 50 || e.y > cy + E.H + 50) continue;
      ctx.fillStyle = e.attackTimer > 0 ? '#fff' : e.color;
      if (e.isBoss) {
        // Boss: pentagon
        ctx.beginPath();
        for (var s = 0; s < 5; s++) {
          var a = s * 1.2566 + e.phaseTimer;
          var px = e.x + Math.cos(a) * e.r;
          var py = e.y + Math.sin(a) * e.r;
          s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff8888';
        ctx.beginPath(); ctx.arc(e.x - 6, e.y - 4, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 6, e.y - 4, 4, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
        // Eyes
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(e.x - 5, e.y - 4, 4, 4);
        ctx.fillRect(e.x + 2, e.y - 4, 4, 4);
      }
      // HP bar
      if (e.maxHp > 1) {
        var bw = e.r * 2;
        E.rect(e.x - bw/2, e.y - e.r - 5, bw, 3, 'rgba(0,0,0,0.4)');
        E.rect(e.x - bw/2, e.y - e.r - 5, bw * (e.hp/e.maxHp), 3, '#44ff88');
      }
    }

    // Player
    var psx = player.x, psy = player.y;
    if (player.invincible <= 0 || Math.floor(player.invincible * 8) % 2 === 0) {
      ctx.fillStyle = '#44ddff';
      ctx.beginPath(); ctx.arc(psx, psy, player.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#88eeff';
      ctx.beginPath(); ctx.arc(psx - 3, psy - 3, player.r * 0.5, 0, Math.PI * 2); ctx.fill();
      // Facing indicator
      ctx.strokeStyle = 'rgba(68,221,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(psx, psy);
      ctx.lineTo(psx + player.facing * 25, psy);
      ctx.stroke();
    }

    E.drawParticles(ctx, particles);

    ctx.restore();

    // ── HUD (screen space) ──
    E.text('HP: ' + player.hp + '/' + player.maxHp, 8, 8, 7, '#44ff88');
    E.text('WAVE ' + wave, E.W/2 - 30, 8, 7, '#ffaa00');
    E.text('SCORE: ' + E.getScore(), E.W/2 - 30, 20, 7, '#fff');

    // Inventory
    var invX = E.W - 140, invY = 8;
    E.text('WD ' + inventory.wood + '  ST ' + inventory.stone + '  MT ' + inventory.metal,
      invX, invY, 7, '#ffdd00', 'left');

    // Weapon
    var wpn = WEAPONS[currentWeapon];
    E.text(wpn.name + (wpn.range > 40 ? ' →' : '⚔'), invX, invY + 14, 7, wpn.color, 'left');

    // Enemies remaining
    var remaining = enemiesInWave - enemiesKilled;
    E.text('ENEMIES: ' + remaining, 8, 20, 7, '#888');
    E.text('BUILDINGS: ' + structures.length, 8, 32, 7, '#886644');

    // Build hint
    if (!buildMode) {
      E.text('[B] BUILD  [1-4] WEAPON  [E] COLLECT', E.W/2 - 80, E.H - 24, 6, '#666', 'left');
      if (craftTimer > 0.5) {
        E.text('[F] CRAFT SWORD/BOW/HAMMER  [R] REPAIR', E.W/2 - 80, E.H - 12, 6, '#ffaa44', 'left');
      }
      // Storm warning
      if (stormActive) {
        var pd = Math.sqrt((player.x - stormX)*(player.x - stormX) + (player.y - stormY)*(player.y - stormY));
        if (pd > stormRadius * 0.8) {
          E.textCenter('⚠ STORM ZONE ⚠', E.W/2, E.H/2 - 30, 9, '#ff4444');
        }
      }
    }

    // Build mode GUI
    if (buildMode) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('BUILD MODE', E.W/2, 40, 14, '#ffaa44', '#000');

      for (var i = 0; i < STRUCTURES.length; i++) {
        var st = STRUCTURES[i];
        var y = 80 + i * 45;
        var canAfford = doCost(st.cost);
        var sel = (i === selectedSlot) ? ' ▸ ' : '   ';
        var costStr = Object.keys(st.cost).map(function(k) { return st.cost[k] + ' ' + k; }).join(' ');
        E.text(sel + st.label + ' (' + costStr + ')', E.W/2 - 120, y, 8,
          canAfford ? (i === selectedSlot ? '#ffdd00' : '#aaa') : '#666', 'left');
        E.text('HP: ' + st.hp, E.W/2 - 120, y + 14, 6, canAfford ? '#888' : '#555', 'left');
      }

      // Preview
      var psx2 = placeX - camera.x;
      var psy2 = placeY - camera.y;
      if (psx2 > 0 && psx2 < E.W && psy2 > 0 && psy2 < E.H) {
        ctx.fillStyle = 'rgba(255,170,68,0.3)';
        ctx.strokeStyle = 'rgba(255,170,68,0.6)';
        ctx.lineWidth = 1;
        var wp = STRUCTURES[selectedSlot];
        ctx.fillRect(psx2 - wp.size/2, psy2 - wp.size/2, wp.size, wp.size);
        ctx.strokeRect(psx2 - wp.size/2, psy2 - wp.size/2, wp.size, wp.size);
      }

      E.textCenter('[1-4] SELECT  [ENTER] PLACE  [B/ESC] EXIT', E.W/2, E.H - 20, 7, '#666');
    }

    // Overlays
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('FORTRESS SURVIVAL', E.W/2, 50, 18, '#44dd88', '#000');
      E.textCenterShadow('WAVE ' + wave, E.W/2, 85, 12, '#ffaa00', '#000');
      E.textCenter('WASD MOVE  SPACE ATTACK  E COLLECT  B BUILD', E.W/2, 140, 8, '#aaa');
      E.textCenter('GATHER resources, build walls & traps, survive waves!', E.W/2, 165, 7, '#888');
      E.textCenter('Storm circle closes in — stay inside!', E.W/2, 185, 7, '#888');
      E.textCenter('PRESS ENTER TO START', E.W/2, 240, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', E.W/2, E.H/2 - 50, 18, '#ff4444', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W/2, E.H/2 - 5, 10, '#ffaa00', '#000');
      E.textCenter('WAVE ' + wave + '  KILLS: ' + totalKilled, E.W/2, E.H/2 + 18, 8, '#fff');
      E.textCenter('PRESS ENTER TO RETRY', E.W/2, E.H/2 + 50, 8, '#aaa');
    }

    if (state === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('WAVE ' + (wave - 1) + ' CLEAR!', E.W/2, E.H/2 - 30, 14, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W/2, E.H/2 + 5, 10, '#ffaa00', '#000');
      E.textCenter('PREPARE FOR WAVE ' + wave, E.W/2, E.H/2 + 40, 8, '#aaa');
      E.textCenter('PRESS ENTER TO CONTINUE', E.W/2, E.H/2 + 60, 8, '#aaa');
    }
  }

  function destroy() {}

  window.FortressSurvival = { init: init, update: update, render: render, destroy: destroy };
})();
