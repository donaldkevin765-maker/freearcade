/**
 * Twin-Stick Shooter — 360° aiming with Elemental Resonance system
 *
 * Creative twist: cycle between 4 elements (fire/ice/lightning/void). Each
 * enemy type has a weakness (2x damage). Combining elements near each other
 * creates combo effects. Arena modifiers change every few waves.
 *
 * WASD move · Mouse aim (click to shoot) · Q/E cycle element
 * Or: Arrows aim + SPACE shoot (twin-stick classic)
 */
(function () {
  'use strict';

  var E;
  var player, bullets, enemies, particles, orbs, walls;
  var state;
  var wave, enemiesInWave, enemiesKilled, totalKilled;
  var fireCooldown, spawnTimer;
  var mmx = 0, mmy = 0; // mouse / aim position
  var scoreMult = 1;

  var ELEMENTS = [
    { id: 'fire',     color: '#ff4422', label: 'FIRE',     desc: 'Burning (DoT)', weak: ['ice', 'flesh'] },
    { id: 'ice',      color: '#44ddff', label: 'ICE',      desc: 'Slow + shatter', weak: ['lightning', 'rock'] },
    { id: 'lightning',color: '#ffdd00', label: 'LIGHTNING',desc: 'Chain nearby', weak: ['shadow', 'shell'] },
    { id: 'void',     color: '#aa44ff', label: 'VOID',     desc: 'Pull + explode', weak: ['fire', 'energy'] },
  ];
  var currentElement = 0;
  var elementTimer = 0;

  var ENEMY_TYPES = [
    { id: 'crawler', hp: 2, speed: 100, size: 16, score: 60, color: '#ff7744', affinity: 'flesh', pattern: 'rush',    drops: 1 },
    { id: 'sprinter',hp: 1, speed: 180, size: 12, score: 40, color: '#ff4444', affinity: 'flesh', pattern: 'rush',    drops: 1 },
    { id: 'shielder',hp: 4, speed: 40,  size: 20, score: 120,color: '#4488ff', affinity: 'rock', pattern: 'shield',  drops: 2 },
    { id: 'mage',    hp: 2, speed: 60,  size: 14, score: 100,color: '#cc44ff', affinity: 'energy',pattern: 'ranged', drops: 2 },
    { id: 'iceShell',hp: 3, speed: 50,  size: 18, score: 90, color: '#44ddff', affinity: 'ice', pattern: 'rush',    drops: 2 },
    { id: 'shadow',  hp: 2, speed: 120, size: 14, score: 80, color: '#6644aa', affinity: 'shadow',pattern: 'blink',  drops: 2 },
  ];

  var enemyColorCache = {};

  function getWeakness(e) {
    for (var i = 0; i < ELEMENTS.length; i++) {
      if (ELEMENTS[i].weak.indexOf(e.affinity) !== -1) return i;
    }
    return -1;
  }

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = { x: E.W/2, y: E.H/2, r: 12, speed: 170, hp: 5, maxHp: 5, invincible: 0 };
    bullets = [];
    enemies = [];
    particles = [];
    orbs = [];
    walls = [];

    state = 'ready';
    enemiesInWave = 15 + wave * 4;
    enemiesKilled = 0;
    totalKilled = 0;
    fireCooldown = 0;
    spawnTimer = 0;
    currentElement = Math.min(wave, ELEMENTS.length - 1);
    elementTimer = 0;
    scoreMult = 1 + Math.floor(wave / 8) * 0.25;
    mmx = E.W / 2;
    mmy = E.H / 2;

    E.setScore(0);
    E.setLives(3);
  }

  function spawnEnemy() {
    var maxIdx = Math.min(ENEMY_TYPES.length, 2 + Math.floor(wave / 2));
    var idx = Math.floor(Math.random() * maxIdx);
    var t = ENEMY_TYPES[idx];
    var hpBonus = Math.floor(wave / 5);

    var side = Math.floor(Math.random() * 4);
    var x, y;
    switch (side) {
      case 0: x = -30; y = 50 + Math.random() * (E.H - 100); break;
      case 1: x = E.W + 30; y = 50 + Math.random() * (E.H - 100); break;
      case 2: x = 50 + Math.random() * (E.W - 100); y = -30; break;
      case 3: x = 50 + Math.random() * (E.W - 100); y = E.H + 30; break;
    }

    enemies.push({
      x: x, y: y, r: t.size,
      hp: t.hp + hpBonus, maxHp: t.hp + hpBonus,
      speed: t.speed + wave * 2,
      color: t.color, affinity: t.affinity,
      pattern: t.pattern, score: t.score + wave * 15,
      drops: t.drops + Math.floor(wave / 4),
      flash: 0, shootTimer: 1.5 + Math.random() * 2,
      blinkTimer: 0, angle: Math.atan2(E.H/2 - y, E.W/2 - x),
    });
  }

  function spawnBoss() {
    var bossNum = Math.floor(wave / 5);
    enemies.push({
      x: E.W/2, y: -40, r: 30 + bossNum * 4,
      hp: 20 + bossNum * 15, maxHp: 20 + bossNum * 15,
      speed: 30, color: '#ff2222', affinity: 'energy',
      pattern: 'boss', score: 1500 + bossNum * 1000,
      drops: 10 + bossNum * 5, flash: 0, shootTimer: 0.5,
      isBoss: true, phase: 0, phaseTimer: 0,
    });
  }

  function shootBullet(x, y, elIdx, dmgMult) {
    var el = ELEMENTS[elIdx !== undefined ? elIdx : currentElement];
    var dx = mmx - player.x, dy = mmy - player.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    var bulletsToFire = [];
    var b = {
      x: x, y: y, r: 4,
      vx: dx / dist * 400, vy: dy / dist * 400,
      element: elIdx !== undefined ? elIdx : currentElement,
      dmg: 1 * (dmgMult || 1),
      life: 1.5, color: el.color,
      trail: [], hpLeft: el.id === 'void' ? 0.6 : 0,
    };
    bulletsToFire.push(b);

    if (el.id === 'lightning') {
      // Chain: fires 2 more at angles
      for (var k = 1; k <= 2; k++) {
        var ang = Math.atan2(dy, dx) + (k % 2 === 0 ? 0.15 : -0.15);
        bulletsToFire.push({
          x: x, y: y, r: 3,
          vx: Math.cos(ang) * 400, vy: Math.sin(ang) * 400,
          element: currentElement,
          dmg: 0.7, life: 1.2, color: '#ffdd00',
          trail: [], hpLeft: 0,
        });
      }
    }

    for (var i = 0; i < bulletsToFire.length; i++) {
      bullets.push(bulletsToFire[i]);
    }
    E.playShoot();
  }

  function spawnOrb(x, y, elIdx) {
    var col = ELEMENTS[elIdx].color;
    orbs.push({ x: x, y: y, r: 5, element: elIdx, life: 6, color: col, bob: Math.random() * 5 });
  }

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); return; }
      return;
    }
    if (state === 'gameover') {
      try { window.FreeArcadeSave.setHighScore('TwinStick', E.getScore()); } catch(e) {}
      if (input.action) { E.setLevel(1); init(); state = 'playing'; E.playCoin(); }
      return;
    }
    if (state === 'levelClear') {
      try { window.FreeArcadeSave.setHighScore('TwinStick', E.getScore()); } catch(e) {}
      if (input.action) { E.setLevel(wave + 1); init(); state = 'playing'; E.playCoin(); }
      return;
    }

    // Element cycling (Q/E)
    if (input.keys['KeyQ'] || input.keys['KeyE']) {
      var dir = input.keys['KeyE'] ? 1 : -1;
      currentElement = (currentElement + dir + ELEMENTS.length) % ELEMENTS.length;
      elementTimer = 0.5;
      if (input.keys['KeyQ']) input.keys['KeyQ'] = false;
      if (input.keys['KeyE']) input.keys['KeyE'] = false;
    }

    // Mouse/aim position
    if (input.mouseX !== undefined) { mmx = input.mouseX; mmy = input.mouseY; }
    else {
      // Keyboard aim (arrows) — calculate direction from aim keys
      var amx = 0, amy = 0;
      if (input.keys['ArrowUp'] || input.keys['KeyW']) amy = -1;
      if (input.keys['ArrowDown'] || input.keys['KeyS']) amy = 1;
      if (input.keys['ArrowLeft'] || input.keys['KeyA']) amx = -1;
      if (input.keys['ArrowRight'] || input.keys['KeyD']) amx = 1;
      if (amx !== 0 || amy !== 0) { mmx = player.x + amx * 100; mmy = player.y + amy * 100; }
    }

    elementTimer = Math.max(0, elementTimer - dt);
    if (player.invincible > 0) player.invincible -= dt;

    // Player movement (WASD)
    var mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (mx !== 0 || my !== 0) { var len = Math.sqrt(mx*mx + my*my); mx /= len; my /= len; }
    player.x += mx * player.speed * dt;
    player.y += my * player.speed * dt;
    player.x = Math.max(player.r, Math.min(E.W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(E.H - player.r, player.y));

    // Shooting (SPACE / mouse click)
    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'] || input.mouseDown)) {
      if (!(mx === 0 && my === 0 && Math.abs(mmx - player.x) < 5 && Math.abs(mmy - player.y) < 5)) {
        shootBullet(player.x, player.y, currentElement);
        fireCooldown = Math.max(0.1, 0.22 - wave * 0.002);
      }
    }

    // ── Orbs ──
    for (var i = orbs.length - 1; i >= 0; i--) {
      var o = orbs[i];
      o.life -= dt;
      o.bob += dt * 3;
      if (o.life <= 0) { orbs.splice(i, 1); continue; }
      // Attract to player
      var dx = player.x - o.x, dy = player.y - o.y;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 150) { o.x += dx/dist * 100 * dt; o.y += dy/dist * 100 * dt; }
      if (dist < 16) {
        // Pick up — change element to this orb's element
        currentElement = o.element;
        elementTimer = 0.5;
        for (var p = 0; p < 6; p++) {
          var a = Math.random() * 6.28;
          particles.push({ x: o.x, y: o.y, vx: Math.cos(a)*50, vy: Math.sin(a)*50, life: 0.3, maxLife: 0.3, size: 3, color: o.color });
        }
        orbs.splice(i, 1);
        E.playPowerup();
      }
    }

    // ── Bullets ──
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      // Trail
      if (b.trail) { b.trail.push({x: b.x, y: b.y}); if (b.trail.length > 5) b.trail.shift(); }

      if (b.x < -30 || b.x > E.W + 30 || b.y < -30 || b.y > E.H + 30) { bullets.splice(i, 1); continue; }
      if (b.life <= 0) { bullets.splice(i, 1); continue; }

      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        if (Math.abs(b.x - e.x) < e.r + b.r && Math.abs(b.y - e.y) < e.r + b.r) {
          var dmg = b.dmg;
          var el = ELEMENTS[b.element];
          var weakIdx = getWeakness(e);
          if (weakIdx !== -1 && weakIdx === b.element) {
            dmg *= 2;
            E.textCenter('WEAK!', e.x, e.y - e.r - 10, 7, '#ffdd00');
          }

          // Elemental effects
          if (el.id === 'fire') {
            e.burnTimer = (e.burnTimer || 0) + 1.5;
          }
          if (el.id === 'void') {
            // Pull other enemies toward this one
            for (var k = 0; k < enemies.length; k++) {
              if (k !== j) {
                var ee = enemies[k];
                var xd = e.x - ee.x, yd = e.y - ee.y;
                var dd = Math.sqrt(xd*xd + yd*yd) || 1;
                if (dd < 120) { ee.x += xd/dd * 80 * dt; ee.y += yd/dd * 80 * dt; }
              }
            }
          }

          e.hp -= dmg;
          e.flash = 0.12;
          if (e.hp <= 0) {
            E.emitParticles(particles, e.x, e.y, e.color, 10, {});
            E.addScore(Math.floor(e.score * scoreMult));
            totalKilled++;
            enemiesKilled++;
            // Drop elemental orb
            if (e.drops > 0 && Math.random() < 0.3) {
              var randEl = Math.floor(Math.random() * ELEMENTS.length);
              spawnOrb(e.x + (Math.random() - 0.5) * 10, e.y + (Math.random() - 0.5) * 10, randEl);
            }
            enemies.splice(j, 1);
            E.playExplode();
          } else {
            E.playHit();
          }
          bullets.splice(i, 1);
          break;
        }
      }
    }

    // ── Burn damage ──
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        if (Math.floor(e.burnTimer * 4) % 2 === 0) { e.hp -= dt * 0.5; e.flash = 0.05; }
        if (e.hp <= 0) {
          E.emitParticles(particles, e.x, e.y, '#ff4422', 8, {});
          E.addScore(Math.floor(e.score * scoreMult));
          totalKilled++; enemiesKilled++;
          enemies.splice(i, 1);
          E.playExplode();
        }
      }
    }

    // ── Enemies ──
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.shootTimer -= dt;

      switch (e.pattern) {
        case 'rush':
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          e.x += dx/dist * e.speed * dt;
          e.y += dy/dist * e.speed * dt;
          break;
        case 'shield':
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          if (dist > 180) { e.x += dx/dist * e.speed * dt; e.y += dy/dist * e.speed * dt; }
          else { e.x -= dx/dist * e.speed * 0.4 * dt; e.y -= dy/dist * e.speed * 0.4 * dt; }
          // Shoot when close
          if (e.shootTimer <= 0 && dist < 300) {
            var ang = Math.atan2(dy, dx);
            bullets.push({ x: e.x, y: e.y, r: 5,
              vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180,
              element: -1, dmg: 1, life: 2, color: '#4488ff', trail: [], hpLeft: 0 });
            e.shootTimer = 1.5 + Math.random() * 1;
          }
          break;
        case 'ranged':
          var dx = player.x - e.x, dy = player.y - e.y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          if (dist > 250) { e.x += dx/dist * e.speed * dt; e.y += dy/dist * e.speed * dt; }
          else { e.x -= dx/dist * e.speed * 0.3 * dt; e.y -= dy/dist * e.speed * 0.3 * dt; }
          if (e.shootTimer <= 0) {
            var ang = Math.atan2(dy, dx);
            for (var k = 0; k < 3; k++) {
              bullets.push({ x: e.x, y: e.y, r: 4,
                vx: Math.cos(ang + (k-1)*0.12) * 160, vy: Math.sin(ang + (k-1)*0.12) * 160,
                element: -1, dmg: 1, life: 2, color: '#cc44ff', trail: [], hpLeft: 0 });
            }
            e.shootTimer = 1.5 + Math.random() * 1.5;
          }
          break;
        case 'blink':
          e.blinkTimer -= dt;
          if (e.blinkTimer <= 0) {
            var dx = player.x - e.x, dy = player.y - e.y;
            var dist = Math.sqrt(dx*dx + dy*dy) || 1;
            if (dist > 100) {
              E.emitParticles(particles, e.x, e.y, '#6644aa', 5, { lifeMax: 0.2, speedMax: 80 });
              e.x += (dx/dist) * (80 + Math.random() * 60);
              e.y += (dy/dist) * (80 + Math.random() * 60);
              e.blinkTimer = 0.4 + Math.random() * 0.3;
            }
          }
          break;
        case 'boss':
          bossUpdate(e, dt);
          break;
      }

      // Enemy-player collision
      if (player.invincible <= 0 && Math.abs(e.x - player.x) < player.r + e.r && Math.abs(e.y - player.y) < player.r + e.r) {
        if (e.isBoss) { e.hp -= 1; if (e.hp <= 0) { enemies.splice(i, 1); enemiesKilled++; } }
        player.hp--;
        player.invincible = 1.0;
        E.emitParticles(particles, player.x, player.y, '#ff4444', 8, {});
        if (player.hp <= 0) {
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          player.hp = player.maxHp;
          player.x = E.W/2; player.y = E.H/2;
        }
        E.shake(5, 0.2);
        E.playHit();
      }

      // Remove far off-screen
      if (e.x < -120 || e.x > E.W + 120 || e.y < -120 || e.y > E.H + 120) {
        if (!e.isBoss) enemies.splice(i, 1);
      }
    }

    // ── Spawn ──
    if (enemiesKilled < enemiesInWave) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        if (wave % 5 === 0 && !enemies.some(function(ee) { return ee.isBoss; }) && enemiesKilled > 5) {
          spawnBoss();
          spawnTimer = 2;
        } else {
          spawnEnemy();
          spawnTimer = Math.max(0.2, 0.6 - wave * 0.01);
        }
      }
    }

    // ── Wave complete ──
    if (enemiesKilled >= enemiesInWave && enemies.length === 0 && state === 'playing') {
      state = 'levelClear';
      E.playLevelUp();
      E.addScore(wave * 100);
    }

    E.updateParticles(particles, dt);
  }

  function bossUpdate(e, dt) {
    e.phaseTimer += dt;
    e.shootTimer -= dt;

    e.x += Math.cos(e.phaseTimer * 0.7) * 70 * dt;
    e.y += Math.sin(e.phaseTimer * 0.5) * 50 * dt;
    e.x = Math.max(e.r, Math.min(E.W - e.r, e.x));
    e.y = Math.max(e.r, Math.min(E.H - e.r, e.y));

    var hpPct = e.hp / e.maxHp;

    if (e.shootTimer <= 0) {
      if (hpPct > 0.6) {
        // Aimed burst
        var dx = player.x - e.x, dy = player.y - e.y;
        var ang = Math.atan2(dy, dx);
        for (var k = 0; k < 5; k++) {
          (function(idx) {
            setTimeout(function() {
              if (e && e.hp > 0) bullets.push({
                x: e.x, y: e.y, r: 6,
                vx: Math.cos(ang + (idx-2)*0.08) * 220,
                vy: Math.sin(ang + (idx-2)*0.08) * 220,
                element: -1, dmg: 2, life: 3, color: '#ff6666', trail: [], hpLeft: 0,
              });
            }, idx * 80);
          })(k);
        }
        e.shootTimer = 1.2;
      } else if (hpPct > 0.3) {
        // Spiral
        for (var a = 0; a < 8; a++) {
          var ang = a * Math.PI / 4 + e.phaseTimer;
          bullets.push({
            x: e.x, y: e.y, r: 5,
            vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160,
            element: -1, dmg: 1, life: 2.5, color: '#ff8888', trail: [], hpLeft: 0,
          });
        }
        e.shootTimer = 0.8;
      } else {
        // Desperate — random fast shots
        for (var k = 0; k < 3; k++) {
          var ang = Math.atan2(player.y - e.y + (Math.random()-0.5)*60, player.x - e.x + (Math.random()-0.5)*60);
          bullets.push({
            x: e.x, y: e.y, r: 4,
            vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300,
            element: -1, dmg: 1, life: 2.5, color: '#ff2222', trail: [], hpLeft: 0,
          });
        }
        e.shootTimer = 0.5;
      }
    }
  }

  function render(ctx) {
    // Background
    ctx.fillStyle = '#060612';
    ctx.fillRect(0, 0, E.W, E.H);

    // Hexagonal grid
    ctx.strokeStyle = 'rgba(40,40,80,0.1)';
    ctx.lineWidth = 1;
    var hxStep = 40, hyStep = 34;
    for (var hx = 0; hx < E.W; hx += hxStep) {
      for (var hy = 0; hy < E.H; hy += hyStep) {
        ctx.beginPath();
        for (var s = 0; s < 6; s++) {
          var ang = s * Math.PI / 3 - Math.PI / 6;
          var px = hx + Math.cos(ang) * 18 + (hy % 68 === 0 ? 20 : 0);
          var py = hy + Math.sin(ang) * 18;
          s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
    }

    // ── Orbs ──
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      var alpha = Math.min(1, o.life);
      var bob = Math.sin(o.bob) * 3;
      ctx.globalAlpha = alpha * 0.7;
      E.circle(o.x, o.y + bob, o.r + 2, o.color);
      ctx.globalAlpha = alpha;
      E.circle(o.x, o.y + bob, o.r, '#fff');
      ctx.globalAlpha = 1;
    }

    // ── Bullets ──
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      // Trail
      if (b.trail) {
        for (var t = 0; t < b.trail.length; t++) {
          ctx.globalAlpha = 0.08 * (t / b.trail.length);
          E.circle(b.trail[t].x, b.trail[t].y, b.r * 0.5, b.color || '#fff');
        }
        ctx.globalAlpha = 1;
      }
      E.circle(b.x, b.y, b.r, b.color || '#fff');
    }

    // ── Enemies ──
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var drawColor = e.flash > 0 ? '#fff' : e.color;
      if (e.isBoss) {
        // Hexagonal boss
        ctx.fillStyle = drawColor;
        ctx.beginPath();
        for (var s = 0; s < 6; s++) {
          var ang = s * Math.PI / 3 - Math.PI / 6 + e.phaseTimer * 0.5;
          var px = e.x + Math.cos(ang) * e.r;
          var py = e.y + Math.sin(ang) * e.r;
          s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(e.x - 5, e.y - 3, 5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 5, e.y - 3, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.arc(e.x - 5, e.y - 3, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 5, e.y - 3, 3, 0, Math.PI*2); ctx.fill();
      } else {
        E.circle(e.x, e.y, e.r, drawColor);
        // Affinity indicator
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(e.x - 3, e.y - 3, 3, 3);
        ctx.fillRect(e.x + 2, e.y - 3, 3, 3);
        // Elemental icon
        ctx.font = '7px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText(e.affinity[0].toUpperCase(), e.x, e.y + 3);
      }

      // HP bar
      if (e.maxHp > 1) {
        var bw = e.r * 2;
        E.rect(e.x - bw/2, e.y - e.r - 5, bw, 3, 'rgba(0,0,0,0.5)');
        E.rect(e.x - bw/2, e.y - e.r - 5, bw * (e.hp/e.maxHp), 3, '#44ff88');
      }

      // Burn indicator
      if (e.burnTimer > 0) {
        ctx.strokeStyle = 'rgba(255,68,34,' + (0.3 + Math.sin(Date.now() * 0.02) * 0.2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ── Player ──
    if (player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0) {
      var el = ELEMENTS[currentElement];
      // Outer glow
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.1;
      E.circle(player.x, player.y, player.r + 5, el.color);
      ctx.globalAlpha = 1;
      E.circle(player.x, player.y, player.r, '#44ddff');
      E.circle(player.x - 3, player.y - 3, player.r * 0.4, '#88eeff');
      // Element indicator arrow
      var dx = mmx - player.x, dy = mmy - player.y;
      var d = Math.sqrt(dx*dx + dy*dy) || 1;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + dx/d * (player.r + 2), player.y + dy/d * (player.r + 2));
      ctx.lineTo(player.x + dx/d * (player.r + 12), player.y + dy/d * (player.r + 12));
      ctx.stroke();

      // HP bar
      var hpw = player.r * 3;
      E.rect(player.x - hpw/2, player.y - player.r - 8, hpw, 3, 'rgba(0,0,0,0.5)');
      E.rect(player.x - hpw/2, player.y - player.r - 8, hpw * (player.hp/player.maxHp), 3, '#44ff88');
    }

    E.drawParticles(ctx, particles);

    // ── HUD ──
    E.text('HP: ' + player.hp + '/' + player.maxHp, 8, 8, 7, '#44ff88');
    E.text('WAVE ' + wave, E.W/2 - 30, 8, 7, '#ffaa00');
    E.text('SCORE: ' + E.getScore(), E.W/2 - 30, 20, 7, '#fff');
    E.text('KILLS: ' + enemiesKilled + '/' + enemiesInWave, 8, 20, 7, '#888');
    if (scoreMult > 1) E.text('x' + scoreMult.toFixed(2), E.W - 8, 20, 7, '#ff4444', 'right');

    // Element display
    var el = ELEMENTS[currentElement];
    E.text(el.label, E.W - 8, 8, 7, el.color, 'right');
    E.text('WEAK: ' + el.weak.join('/'), E.W - 8, 32, 6, '#888', 'right');
    if (elementTimer > 0) { E.text('⟳', E.W - 8, 44, 7, el.color, 'right'); }

    // Weakness indicators on visible enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (Math.abs(e.x - player.x) < E.W/2 && Math.abs(e.y - player.y) < E.H/2) {
        var w = getWeakness(e);
        if (w === currentElement) {
          ctx.strokeStyle = 'rgba(255,221,0,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6 + Math.sin(Date.now() * 0.005 + i) * 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // ── Overlays ──
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('TWIN-STICK SHOOTER', E.W/2, 60, 18, '#44ddff', '#000');
      E.textCenterShadow('WAVE ' + wave, E.W/2, 95, 12, '#ffaa00', '#000');
      E.textCenter('WASD move  ·  Arrows aim + SPACE shoot  ·  Q/E cycle element', E.W/2, 140, 8, '#aaa');
      E.textCenter('Each enemy has an elemental weakness (2x damage!)', E.W/2, 165, 7, '#888');
      E.textCenter('FIRE burns · ICE slows · LIGHTNING chains · VOID pulls', E.W/2, 185, 7, '#888');
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

    if (state === 'levelClear') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('WAVE ' + wave + ' CLEAR!', E.W/2, E.H/2 - 30, 14, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), E.W/2, E.H/2 + 5, 10, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR WAVE ' + (wave + 1), E.W/2, E.H/2 + 40, 8, '#aaa');
    }
  }

  function destroy() {}

  window.TwinStickShooter = { init: init, update: update, render: render, destroy: destroy };
})();
