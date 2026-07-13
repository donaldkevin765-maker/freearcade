/**
 * Run 'n' Gun — side-scrolling platform shooter with Style Chain system
 *
 * Creative twist: chaining different actions (jump-shot, slide, melee, grenade,
 * wall-jump) builds a style multiplier. At max style (x10), use FINISHER for
 * screen clear. Random terrain generation with platforms, pits, enemies.
 *
 * WASD move · SPACE shoot · F melee · G grenade · SHIFT slide · E interact
 * Jump on enemies to stun them!
 */
(function () {
  'use strict';

  var E;
  var player, bullets, enemies, platforms, particles, items;
  var camera;
  var levelWidth = 3000;
  var state;
  var wave, enemiesInWave, enemiesKilled;
  var gravity = 800, scrollSpeed = 120;
  var styleMeter, styleMultiplier, styleDecay;
  var lastAction = '', actionCombo = [];
  var maxComboShown = '';
  var finisherReady = false;
  var score = 0;
  var playerLives = 3;
  var bossWave = 5;

  var WEAPONS = [
    { name: 'Blaster',   spread: 0,    count: 1,  cooldown: 0.20, dmg: 1, speed: 500, color: '#44ffaa' },
    { name: 'Spread',    spread: 0.15, count: 3,  cooldown: 0.35, dmg: 1, speed: 400, color: '#ffaa44' },
    { name: 'Sniper',    spread: 0,    count: 1,  cooldown: 0.50, dmg: 3, speed: 800, color: '#ff4488' },
    { name: 'Rocket',    spread: 0,    count: 1,  cooldown: 0.70, dmg: 5, speed: 250, color: '#ff4444' },
    { name: 'Rapid',     spread: 0.08, count: 1,  cooldown: 0.08, dmg: 1, speed: 450, color: '#44ddff' },
  ];
  var currentWeapon = 0;
  var fireCooldown = 0;
  var slideTimer = 0;
  var grenadeCooldown = 0;
  var finisherTimer = 0;

  function init() {
    E = this.engine;
    wave = E.getLevel();

    player = {
      x: 150, y: 300, w: 20, h: 32,
      vx: 0, vy: 0, onGround: false, onWall: false,
      facing: 1, hp: 5, maxHp: 5,
      invincible: 0,
      jumpCount: 0, maxJumps: 2,
    };

    bullets = [];
    enemies = [];
    platforms = [];
    particles = [];
    items = [];

    camera = { x: 0, y: 0 };
    levelWidth = 3000 + wave * 200;

    state = 'ready';
    enemiesInWave = 20 + wave * 5;
    enemiesKilled = 0;
    currentWeapon = Math.min(wave, WEAPONS.length - 1);
    styleMeter = 0;
    styleMultiplier = 1;
    styleDecay = 0;
    lastAction = '';
    actionCombo = [];
    maxComboShown = '';
    finisherReady = false;
    score = 0;
    playerLives = 3;
    fireCooldown = 0;
    slideTimer = 0;
    grenadeCooldown = 0;
    finisherTimer = 0;

    E.setScore(0);
    E.setLives(3);
    generateTerrain();
  }

  function generateTerrain() {
    platforms = [];
    // Ground segments with gaps
    var x = 0;
    while (x < levelWidth) {
      var segW = 120 + Math.random() * 250;
      var gap = 0;
      if (x > 400 && Math.random() < 0.2) gap = 50 + Math.random() * 80;
      if (x + segW + gap < levelWidth) {
        var groundY = 400 + Math.random() * 30 - 15;
        platforms.push({ x: x, y: groundY, w: segW, h: 20, type: 'ground' });
        x += segW + gap;
      } else {
        platforms.push({ x: x, y: 410, w: levelWidth - x, h: 20, type: 'ground' });
        break;
      }
    }

    // Floating platforms
    for (var i = 0; i < 8 + wave * 3; i++) {
      var px = 200 + Math.random() * (levelWidth - 300);
      var py = 200 + Math.random() * 150;
      var pw = 60 + Math.random() * 100;
      // Don't place on existing platforms
      var ok = true;
      for (var j = 0; j < platforms.length; j++) {
        if (Math.abs(px - platforms[j].x) < pw + platforms[j].w &&
            Math.abs(py - platforms[j].y) < 50) { ok = false; break; }
      }
      if (ok) platforms.push({ x: px, y: py, w: pw, h: 14, type: 'float' });
    }

    // Item pickups on platforms
    for (var i = 0; i < 5 + wave * 2; i++) {
      var pi = Math.floor(Math.random() * platforms.length);
      var p = platforms[pi];
      if (p.type === 'float' && Math.random() < 0.5) continue;
      var type = Math.random() < 0.6 ? 'weapon' : (Math.random() < 0.5 ? 'health' : 'grenade');
      if (type === 'weapon') {
        var wpn = Math.floor(Math.random() * WEAPONS.length);
        items.push({ x: p.x + Math.random() * p.w, y: p.y - 20, type: 'weapon', wpn: wpn, life: 15 });
      } else if (type === 'health') {
        items.push({ x: p.x + Math.random() * p.w, y: p.y - 20, type: 'health', life: 15 });
      } else {
        items.push({ x: p.x + Math.random() * p.w, y: p.y - 20, type: 'grenade', life: 15 });
      }
    }
  }

  // ── Physics ──
  function isOnPlatform(px, py, pw, ph) {
    var pLeft = px, pRight = px + pw;
    var pTop = py, pBottom = py + ph;
    var playerBottom = player.y + player.h;
    var playerCenterX = player.x + player.w/2;

    if (playerBottom > pTop - 5 && playerBottom < pTop + 15 &&
        playerCenterX > pLeft - player.w/2 && playerCenterX < pRight + player.w/2 &&
        player.vy >= 0) {
      return pTop;
    }
    return null;
  }

  function physics(dt) {
    var p = player;

    // Horizontal movement
    var moveX = 0;
    if (inputState.left) moveX -= 1;
    if (inputState.right) moveX += 1;

    if (slideTimer > 0) {
      p.vx = p.facing * 250;
      p.h = 18; // slide height
      slideTimer -= dt;
    } else {
      p.h = 32;
      p.vx = moveX * (inputState.run ? 220 : 160);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += gravity * dt;

    // Jump
    if (inputState.jump && p.jumpCount < p.maxJumps) {
      p.vy = -350;
      p.jumpCount++;
      inputState.jump = false; // consume
      E.playBeep(400 + p.jumpCount * 100, 0.08, 'square', 0.03);
    }

    // Wall jump (simplified — bounce off edges of ground platforms)
    p.onWall = false;
    for (var i = 0; i < platforms.length; i++) {
      var pl = platforms[i];
      var px = pl.x, py = pl.y;
      var playerBoxRight = p.x + p.w, playerBoxLeft = p.x;
      var playerBoxBottom = p.y + p.h, playerBoxTop = p.y;

      // Horizontal collision (walls)
      if (playerBoxBottom > py && playerBoxTop < py + pl.h) {
        if (playerBoxRight > px && playerBoxRight < px + 10 && p.vx > 0) { p.x = px - p.w; p.vx = 0; p.onWall = true; }
        if (playerBoxLeft < px + pl.w && playerBoxLeft > px + pl.w - 10 && p.vx < 0) { p.x = px + pl.w; p.vx = 0; p.onWall = true; }
      }
    }

    // Ground collision
    p.onGround = false;
    for (var i = 0; i < platforms.length; i++) {
      var pl = platforms[i];
      var groundY = isOnPlatform(pl.x, pl.y, pl.w, pl.h);
      if (groundY !== null) {
        p.y = groundY - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpCount = 0;
      }
    }

    // Clamp to level
    p.x = Math.max(10, Math.min(levelWidth - p.w - 10, p.x));
    if (p.y > 600) { // fell off
      takeDamage(2);
      p.y = 300;
      p.vy = -200;
    }

    // Camera follows player
    camera.x = p.x - 200;
    camera.x = Math.max(0, Math.min(levelWidth - E.W, camera.x));
    camera.y = 0;
  }

  // ── Style System ──
  function addStyle(action, amount) {
    if (action === lastAction) amount *= 0.5;
    lastAction = action;
    styleMeter += amount;
    styleDecay = 2; // seconds before decay starts

    // Track combo variety
    if (actionCombo.indexOf(action) === -1) actionCombo.push(action);
    if (actionCombo.length >= 4) finisherReady = true;

    styleMultiplier = Math.min(10, 1 + Math.floor(styleMeter / 50));
    if (styleMultiplier >= 3 && actionCombo.length >= 3) {
      maxComboShown = 'STYLE x' + styleMultiplier + '!';
    }
  }

  // ── Spawn ──
  function spawnEnemy(x, y, type) {
    var e = {
      x: x, y: y, w: 24, h: 28,
      vx: -40 - Math.random() * 30, vy: 0,
      hp: 1 + Math.floor(wave / 3),
      maxHp: 1 + Math.floor(wave / 3),
      type: type || 'walker',
      onGround: false,
      score: 50 + wave * 10,
      color: '#ff6644',
      direction: -1,
      shootTimer: 2 + Math.random() * 2,
      flash: 0,
    };
    if (type === 'flyer') { e.color = '#ff44aa'; e.vx = 0; e.hp = 1; }
    if (type === 'heavy') { e.color = '#aa44ff'; e.w = 30; e.h = 34; e.hp = 3 + Math.floor(wave/2); e.score = 100 + wave * 15; }
    if (type === 'turret') { e.color = '#ff8844'; e.vx = 0; e.hp = 2; }
    enemies.push(e);
  }

  function spawnBoss() {
    var bossX = levelWidth - 200;
    var boss = {
      x: bossX, y: 350, w: 40, h: 50,
      vx: 0, vy: 0,
      hp: 20 + wave * 5, maxHp: 20 + wave * 5,
      type: 'boss',
      onGround: false,
      score: 2000,
      color: '#ff2222',
      direction: -1,
      shootTimer: 1.5, flash: 0,
      phase: 0, phaseTimer: 0,
    };
    enemies.push(boss);
  }

  // ── Combat ──
  function shootBullet(x, y, dir, isEnemy, dmg, color, speed) {
    bullets.push({
      x: x, y: y, r: isEnemy ? 5 : 3,
      vx: dir * (speed || (isEnemy ? 200 : 500)),
      vy: (isEnemy ? (Math.random() - 0.5) * 30 : 0),
      isEnemy: isEnemy, dmg: dmg || 1,
      life: 2 + (isEnemy ? 1 : 0),
      color: color || (isEnemy ? '#ff6666' : '#44ffaa'),
    });
  }

  function meleeAttack() {
    var range = 35;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (Math.abs(e.x - (player.x + player.w/2)) < range &&
          Math.abs(e.y - (player.y + player.h/2)) < range + 20) {
        e.hp -= 2;
        e.flash = 0.15;
        if (e.hp <= 0) { killEnemy(i); }
        else { E.playHit(); }
      }
    }
    for (var i = 0; i < 8; i++) {
      var ang = player.facing > 0 ? (-0.5 + Math.random() * 0.5) : (Math.PI - 0.5 + Math.random());
      particles.push({ x: player.x + player.w/2 + player.facing * 25, y: player.y + player.h/2,
        vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80, life: 0.3, maxLife: 0.3, size: 3, color: '#ffaa44' });
    }
    addStyle('melee', 25);
    E.playBeep(300, 0.06, 'square', 0.04);
  }

  function throwGrenade() {
    var bx = player.x + player.facing * 25;
    var by = player.y + 10;
    bullets.push({
      x: bx, y: by, r: 6,
      vx: player.facing * 180, vy: -100,
      isEnemy: false, dmg: 3,
      life: 1.5, color: '#ff8800',
      isGrenade: true, grenadeTimer: 0.6,
    });
    grenadeCooldown = 2;
    addStyle('grenade', 40);
    E.playBeep(200, 0.08, 'square', 0.06);
  }

  function doFinisher() {
    if (!finisherReady) return;
    finisherReady = false;
    styleMeter = 0;
    styleMultiplier = 1;
    actionCombo = [];
    finisherTimer = 0.5;

    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      E.addScore(e.score * 2);
      score += e.score * 2;
      E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, '#ffdd00', 15, {});
      enemies.splice(i, 1);
      enemiesKilled++;
    }

    E.shake(10, 0.4);
    E.playExplode();
    E.textCenterShadow('★ FINISHER ★', E.W/2, E.H/2, 16, '#ffdd00', '#000');
  }

  function killEnemy(i, drop) {
    var e = enemies[i];
    E.addScore(e.score * styleMultiplier);
    score += e.score * styleMultiplier;
    E.emitParticles(particles, e.x + e.w/2, e.y + e.h/2, e.color, 10, {});
    enemiesKilled++;
    if (drop !== false && Math.random() < 0.15) {
      var ix = e.x + e.w/2, iy = e.y;
      if (Math.random() < 0.5) items.push({ x: ix, y: iy, type: 'health', life: 10 });
      else items.push({ x: ix, y: iy, type: 'weapon', wpn: Math.floor(Math.random() * WEAPONS.length), life: 10 });
    }
    enemies.splice(i, 1);
    E.playExplode();
  }

  function takeDamage(amount) {
    if (player.invincible > 0) return;
    player.hp -= amount || 1;
    player.invincible = 1.0;
    E.emitParticles(particles, player.x + player.w/2, player.y + player.h/2, '#ff4444', 6, {});
    if (player.hp <= 0) {
      playerLives--;
      E.setLives(playerLives);
      if (playerLives <= 0) {
        state = 'gameover';
        try { window.FreeArcadeSave.setHighScore('RunGun', score); window.FreeArcadeSave.addCoins(Math.floor(score/100)); } catch(e) {}
        E.playGameOver();
        return;
      }
      player.hp = player.maxHp;
      player.x = Math.max(50, player.x - 100);
      player.vy = -200;
    }
    E.shake(5, 0.2);
    E.playHit();
  }

  // ── Update ──
  var inputState = { left: false, right: false, jump: false, shoot: false, run: false };

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing'; E.playCoin(); }
      return;
    }
    if (state === 'gameover') {
      if (input.action) { E.setLevel(1); init(); state = 'playing'; E.playCoin(); }
      return;
    }
    if (state === 'win') {
      if (input.action) { E.setLevel(wave + 1); init(); state = 'playing'; E.playCoin(); }
      return;
    }

    // Input mapping
    inputState.left = input.left;
    inputState.right = input.right;
    inputState.jump = input.action || input.keys['Space'] || false;
    inputState.shoot = input.keys['KeyZ'] || input.keys['KeyX'] || false;
    inputState.run = input.keys['ShiftLeft'] || input.keys['ShiftRight'] || false;

    if (player.invincible > 0) player.invincible -= dt;

    // Style decay
    if (styleDecay > 0) styleDecay -= dt;
    else if (styleMeter > 0) {
      styleMeter -= dt * 15;
      if (styleMeter < 0) { styleMeter = 0; styleMultiplier = 1; actionCombo = []; finisherReady = false; }
    }

    if (finisherTimer > 0) finisherTimer -= dt;

    fireCooldown -= dt;
    if (slideTimer > 0) slideTimer -= dt;
    grenadeCooldown -= dt;

    // Physics
    physics(dt);

    var p = player;
    var centerX = p.x + p.w/2;
    var centerY = p.y + p.h/2;

    // Slide (double-tap shift / press shift while moving)
    if (inputState.run && p.onGround && Math.abs(p.vx) > 50 && slideTimer <= 0) {
      slideTimer = 0.3;
      addStyle('slide', 20);
    }

    // Shoot
    if (inputState.shoot && fireCooldown <= 0) {
      var wpn = WEAPONS[currentWeapon];
      var dir = p.facing;
      for (var b = 0; b < wpn.count; b++) {
        var aOff = (b - (wpn.count - 1) / 2) * wpn.spread;
        shootBullet(centerX + dir * 15, centerY - 4, dir, false, wpn.dmg, wpn.color, wpn.speed);
      }
      fireCooldown = wpn.cooldown;
      if (!p.onGround) addStyle('airShot', 15);
      E.playShoot();
    }

    // Melee (F key)
    if (input.keys['KeyF']) {
      meleeAttack();
      input.keys['KeyF'] = false;
    }

    // Grenade (G key)
    if (input.keys['KeyG'] && grenadeCooldown <= 0) {
      throwGrenade();
      input.keys['KeyG'] = false;
    }

    // Finisher (Q key)
    if (input.keys['KeyQ'] && finisherReady) {
      doFinisher();
      input.keys['KeyQ'] = false;
    }

    // Face direction
    if (Math.abs(p.vx) > 10) p.facing = p.vx > 0 ? 1 : -1;

    // ── Bullets ──
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vy += (b.isGrenade ? 0 : gravity * 0.3) * dt;
      b.life -= dt;

      if (b.isGrenade) {
        b.grenadeTimer -= dt;
        if (b.grenadeTimer <= 0) {
          // Explode
          for (var j = enemies.length - 1; j >= 0; j--) {
            var e = enemies[j];
            if (Math.abs(e.x - b.x) < 60 && Math.abs(e.y - b.y) < 60) {
              e.hp -= b.dmg;
              e.flash = 0.2;
              if (e.hp <= 0) killEnemy(j);
            }
          }
          E.emitParticles(particles, b.x, b.y, '#ff8800', 20, { speedMax: 100, lifeMax: 0.4 });
          E.shake(6, 0.25);
          E.playExplode();
          for (var j = 0; j < enemies.length; j++) enemies[j].flash = 0.15;
          bullets.splice(i, 1);
          continue;
        }
      }

      if (b.x < camera.x - 20 || b.x > camera.x + E.W + 20) { bullets.splice(i, 1); continue; }

      if (!b.isEnemy) {
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (Math.abs(b.x - (e.x + e.w/2)) < e.w/2 + b.r &&
              Math.abs(b.y - (e.y + e.h/2)) < e.h/2 + b.r) {
            e.hp -= b.dmg;
            e.flash = 0.1;
            if (e.hp <= 0) killEnemy(j);
            else E.playHit();
            bullets.splice(i, 1);
            break;
          }
        }
      } else {
        if (player.invincible <= 0 &&
            Math.abs(b.x - centerX) < player.w/2 + b.r &&
            Math.abs(b.y - centerY) < player.h/2 + b.r) {
          takeDamage(b.dmg || 1);
          bullets.splice(i, 1);
        }
      }
    }

    // ── Enemies ──
    var scrollMargin = 300;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      e.shootTimer -= dt;
      e.vy += gravity * 0.6 * dt;

      switch (e.type) {
        case 'walker':
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          // Reverse at edges
          var onPlat = false;
          for (var pi = 0; pi < platforms.length; pi++) {
            var p = platforms[pi];
            if (e.x + e.w > p.x && e.x < p.x + p.w && e.y + e.h >= p.y && e.y + e.h <= p.y + 20) {
              e.y = p.y - e.h; e.vy = 0; onPlat = true;
            }
          }
          if (!onPlat && e.y > 550) e.vy = -250;
          // Shoot at player
          if (e.shootTimer <= 0) {
            shootBullet(e.x + e.w/2, e.y + 5, -1, true, 1, '#ff6644', 180);
            e.shootTimer = 2 + Math.random() * 2;
          }
          break;
        case 'flyer':
          // Hover above player at fixed height
          var targetY = 150 + Math.sin(Date.now() * 0.002 + e.x) * 40;
          e.y += (targetY - e.y) * 2 * dt;
          e.x += Math.sin(Date.now() * 0.003 + e.x * 0.01) * 60 * dt;
          if (e.shootTimer <= 0) {
            var ang = Math.atan2(player.y - e.y, player.x - e.x);
            bullets.push({
              x: e.x + e.w/2, y: e.y + e.h/2, r: 4,
              vx: Math.cos(ang) * 150, vy: Math.sin(ang) * 150,
              isEnemy: true, dmg: 1, life: 2, color: '#ff44aa',
            });
            e.shootTimer = 2 + Math.random();
          }
          break;
        case 'heavy':
          e.x += e.vx * 0.8 * dt;
          e.y += e.vy * dt;
          for (var pi = 0; pi < platforms.length; pi++) {
            var p = platforms[pi];
            if (e.x + e.w > p.x && e.x < p.x + p.w && e.y + e.h >= p.y && e.y + e.h <= p.y + 20) {
              e.y = p.y - e.h; e.vy = 0;
            }
          }
          if (e.shootTimer <= 0) {
            shootBullet(e.x + e.w/2, e.y + 10, -1, true, 2, '#aa44ff', 140);
            e.shootTimer = 1.5 + Math.random() * 1.5;
          }
          break;
        case 'turret':
          // Fixed position, shoots at player
          e.y += e.vy * dt;
          for (var pi = 0; pi < platforms.length; pi++) {
            var p = platforms[pi];
            if (e.x + e.w > p.x && e.x < p.x + p.w && e.y + e.h >= p.y && e.y + e.h <= p.y + 20) {
              e.y = p.y - e.h; e.vy = 0;
            }
          }
          if (e.shootTimer <= 0) {
            var ang = Math.atan2(player.y - e.y, player.x - e.x);
            bullets.push({
              x: e.x + e.w/2, y: e.y + 5, r: 5,
              vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200,
              isEnemy: true, dmg: 1, life: 2.5, color: '#ff8844',
            });
            e.shootTimer = 0.8 + Math.random() * 0.5;
          }
          break;
        case 'boss':
          bossUpdate(e, dt, centerX, centerY);
          break;
      }

      // Remove off-screen behind player
      if (e.x + e.w < camera.x - 200) { enemies.splice(i, 1); continue; }

      // Enemy-player collision
      if (player.invincible <= 0 &&
          Math.abs((e.x + e.w/2) - centerX) < e.w/2 + player.w/2 - 5 &&
          Math.abs((e.y + e.h/2) - centerY) < e.h/2 + player.h/2 - 5) {
        // Jump on top?
        if (player.vy > 0 && centerY < e.y) {
          e.hp -= 2;
          e.flash = 0.2;
          player.vy = -250;
          addStyle('bounce', 30);
          if (e.hp <= 0) killEnemy(i);
          else E.playHit();
        } else {
          takeDamage(e.type === 'heavy' ? 2 : 1);
          if (e.type !== 'boss') { e.x += e.vx > 0 ? 50 : -50; }
        }
      }
    }

    // ── Items ──
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.life -= dt;
      if (it.life <= 0 || it.x < camera.x - 50) { items.splice(i, 1); continue; }
      if (Math.abs(it.x - centerX) < 20 && Math.abs(it.y - centerY) < 25) {
        if (it.type === 'health') {
          player.hp = Math.min(player.maxHp, player.hp + 2);
          E.textCenter('+2 HP', player.x, player.y - 20, 8, '#44ff88');
        } else if (it.type === 'weapon') {
          currentWeapon = it.wpn;
          E.textCenter(WEAPONS[currentWeapon].name + '!', player.x, player.y - 20, 8, WEAPONS[currentWeapon].color);
        } else if (it.type === 'grenade') {
          grenadeCooldown = 0;
          throwGrenade();
        }
        items.splice(i, 1);
        E.playPowerup();
      }
    }

    // ── Wave spawning ──
    if (enemies.length + enemiesKilled < enemiesInWave && state === 'playing') {
      var spawnChance = dt * (2 + wave * 0.3);
      if (Math.random() < spawnChance && enemies.length < 15) {
        var spawnX = camera.x + E.W + 30;
        var spawnY = 350 + Math.random() * 50;
        var typeRoll = Math.random();
        if (typeRoll < 0.4) spawnEnemy(spawnX, spawnY, 'walker');
        else if (typeRoll < 0.6) spawnEnemy(spawnX, spawnY, 'flyer');
        else if (typeRoll < 0.75 && wave > 2) spawnEnemy(spawnX, spawnY, 'heavy');
        else if (typeRoll < 0.9) spawnEnemy(spawnX, spawnY, 'turret');
        else spawnEnemy(spawnX, spawnY, 'walker');
        // Also from above
        if (Math.random() < 0.3) {
          spawnEnemy(spawnX - 100, 50, 'flyer');
        }
      }
    }

    // ── Boss wave ──
    if (wave % bossWave === 0 && enemies.length === 0 && enemiesKilled < enemiesInWave) {
      var hasBoss = false;
      for (var i = 0; i < enemies.length; i++) if (enemies[i].type === 'boss') hasBoss = true;
      if (!hasBoss && enemiesKilled > 5) spawnBoss();
    }

    // ── Wave complete ──
    if (enemiesKilled >= enemiesInWave && enemies.length === 0) {
      if (state === 'playing') {
        state = 'win';
        E.playLevelUp();
        try { window.FreeArcadeSave.setHighScore('RunGun', score); window.FreeArcadeSave.addCoins(Math.floor(score/200)); } catch(e) {}
      }
    }

    E.updateParticles(particles, dt);
  }

  function bossUpdate(e, dt, px, py) {
    e.phaseTimer += dt;
    e.shootTimer -= dt;

    // Bounce up and down
    e.y += Math.sin(e.phaseTimer * 2) * 60 * dt;
    // Move toward/away
    var dx = e.x - px;
    if (Math.abs(dx) > 300) e.x += (dx > 0 ? -1 : 1) * 80 * dt;
    else e.x += Math.sin(e.phaseTimer * 1.5) * 40 * dt;

    // Phase-based attack patterns
    var hpPct = e.hp / e.maxHp;
    if (hpPct < 0.3) e.phase = 2;
    else if (hpPct < 0.6) e.phase = 1;

    if (e.shootTimer <= 0) {
      if (e.phase === 0) {
        // Single aimed shot
        var ang = Math.atan2(py - e.y, px - e.x);
        bullets.push({ x: e.x + e.w/2, y: e.y + e.h/2, r: 6,
          vx: Math.cos(ang) * 220, vy: Math.sin(ang) * 220, isEnemy: true, dmg: 2, life: 3, color: '#ff4444' });
        e.shootTimer = 1.0;
      } else if (e.phase === 1) {
        // Burst + charge
        for (var k = 0; k < 3; k++) {
          (function(idx) {
            setTimeout(function() {
              var ang = Math.atan2(py - e.y, px - e.x) + (Math.random() - 0.5) * 0.3;
              if (e && e.hp > 0) bullets.push({ x: e.x + e.w/2, y: e.y + e.h/2, r: 5,
                vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250, isEnemy: true, dmg: 1, life: 3, color: '#ff8888' });
            }, idx * 120);
          })(k);
        }
        e.shootTimer = 1.2;
      } else {
        // Desperate — spread
        for (var a = 0; a < 8; a++) {
          var ang = a * Math.PI / 4 + Math.sin(e.phaseTimer) * 0.3;
          bullets.push({ x: e.x + e.w/2, y: e.y + e.h/2, r: 4,
            vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180, isEnemy: true, dmg: 1, life: 3, color: '#ff2222' });
        }
        e.shootTimer = 0.8;
      }
      E.playBeep(200, 0.05, 'square', 0.08);
    }
  }

  // ── Render ──
  function render(ctx) {
    var cx = camera.x, cy = camera.y;

    // Background
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, E.W, E.H);

    // Parallax mountains
    for (var m = 0; m < 5; m++) {
      var mx = m * 200 - (cx * 0.1) % 200;
      var mh = 100 + Math.sin(m * 1.7) * 40;
      ctx.fillStyle = 'rgba(30,30,60,0.3)';
      ctx.beginPath();
      ctx.moveTo(mx - 150, E.H);
      ctx.lineTo(mx, E.H - mh);
      ctx.lineTo(mx + 150, E.H);
      ctx.fill();
    }

    // Grid (moving)
    ctx.strokeStyle = 'rgba(40,60,80,0.08)';
    ctx.lineWidth = 1;
    for (var x = -((cx * 0.5) % 40); x < E.W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, E.H); ctx.stroke();
    }

    // ── Platforms ──
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var sx = p.x - cx, sy = p.y;
      if (sx + p.w < -50 || sx > E.W + 50) continue;
      var grad = ctx.createLinearGradient(sx, sy, sx, sy + p.h);
      if (p.type === 'ground') {
        grad.addColorStop(0, '#2a3a4a');
        grad.addColorStop(1, '#1a2a3a');
      } else {
        grad.addColorStop(0, '#3a4a6a');
        grad.addColorStop(1, '#2a3a5a');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, p.w, p.h);
      ctx.strokeStyle = 'rgba(100,150,200,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, p.w, p.h);
    }

    // ── Items ──
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var sx = it.x - cx, sy = it.y;
      if (sx < -20 || sx > E.W + 20) continue;
      var bob = Math.sin(Date.now() * 0.004 + i) * 3;
      if (it.type === 'health') {
        E.circle(sx, sy + bob, 8, '#44ff88');
        E.text('+', sx, sy + bob - 3, 8, '#fff', 'center');
      } else if (it.type === 'weapon') {
        E.circle(sx, sy + bob, 8, WEAPONS[it.wpn].color);
        E.text('W', sx, sy + bob - 3, 8, '#fff', 'center');
      } else {
        E.circle(sx, sy + bob, 8, '#ff8800');
        E.text('G', sx, sy + bob - 3, 8, '#fff', 'center');
      }
    }

    // ── Bullets ──
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      var sx = b.x - cx, sy = b.y;
      if (sx < -20 || sx > E.W + 20) continue;
      if (b.isGrenade) {
        E.circle(sx, sy, b.r + 1, '#ff8800');
        E.circle(sx, sy, b.r, '#ffaa00');
        E.circle(sx, sy, b.r * 0.5, '#fff');
      } else {
        E.circle(sx, sy, b.r, b.color);
      }
    }

    // ── Enemies ──
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var sx = e.x - cx, sy = e.y;
      if (sx + e.w < -30 || sx > E.W + 30) continue;

      if (e.flash > 0) {
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = e.color;
      }
      ctx.fillRect(sx, sy, e.w, e.h);

      // Eyes
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      if (e.type === 'boss') {
        ctx.fillRect(sx + 8, sy + 10, 6, 6);
        ctx.fillRect(sx + e.w - 14, sy + 10, 6, 6);
        // Crown
        ctx.fillStyle = '#ffdd00';
        ctx.fillRect(sx + 5, sy - 5, 30, 5);
      } else {
        ctx.fillRect(sx + 4, sy + 6, 5, 4);
        ctx.fillRect(sx + e.w - 9, sy + 6, 5, 4);
      }

      // HP bar
      if (e.maxHp > 1) {
        var bw = e.w;
        E.rect(sx, sy - 5, bw, 3, 'rgba(0,0,0,0.4)');
        E.rect(sx, sy - 5, bw * (e.hp / e.maxHp), 3,
          e.hp > e.maxHp * 0.3 ? '#44ff88' : '#ff4444');
      }
    }

    // ── Player ──
    var psx = player.x - cx, psy = player.y;
    if (player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0) {
      ctx.fillStyle = finisherReady ? '#ffdd00' : '#44ddff';
      ctx.fillRect(psx, psy, player.w, player.h);
      // Inner detail
      ctx.fillStyle = finisherReady ? '#ffee88' : '#88eeff';
      ctx.fillRect(psx + 4, psy + 4, player.w - 8, 6);
      // Eyes
      ctx.fillStyle = '#222';
      var ex = psx + (player.facing > 0 ? 12 : 4);
      ctx.fillRect(ex, psy + 8, 4, 4);
      // Boots
      ctx.fillStyle = '#335';
      ctx.fillRect(psx + 2, psy + player.h - 6, 6, 6);
      ctx.fillRect(psx + player.w - 8, psy + player.h - 6, 6, 6);

      // HP bar
      var hpw = player.w + 10;
      E.rect(psx - 5, psy - 8, hpw, 3, 'rgba(0,0,0,0.5)');
      E.rect(psx - 5, psy - 8, hpw * (player.hp / player.maxHp), 3, '#44ff88');
    }

    // ── Particles ──
    for (var i = 0; i < particles.length; i++) {
      var pt = particles[i];
      var sx = pt.x - cx, sy = pt.y;
      if (sx < -20 || sx > E.W + 20) continue;
      var alpha = pt.life / pt.maxLife;
      ctx.globalAlpha = alpha;
      E.circle(sx, sy, pt.size, pt.color);
    }
    ctx.globalAlpha = 1;

    // ── HUD ──
    E.text('HP: ' + player.hp + '/' + player.maxHp, 8, 8, 7, '#44ff88');
    E.text('WAVE ' + wave, E.W/2 - 20, 8, 7, '#ffaa00');
    E.text('SCORE: ' + score, E.W/2 - 20, 20, 7, '#fff');
    E.text(WEAPONS[currentWeapon].name, E.W - 8, 8, 7, WEAPONS[currentWeapon].color, 'right');
    E.text('❤' + playerLives, E.W - 8, 20, 7, '#ff6666', 'right');
    E.text('KILLS: ' + enemiesKilled + '/' + enemiesInWave, 8, 20, 7, '#888');

    // Style meter
    E.rect(8, 35, 100, 6, 'rgba(0,0,0,0.4)');
    E.rect(8, 35, Math.min(100, styleMeter), 6, styleMultiplier >= 5 ? '#ffdd00' : '#ff8844');
    var styleText = finisherReady ? '★ x' + styleMultiplier + ' [Q]' : 'x' + styleMultiplier;
    E.text(styleText, 110, 38, 8, styleMultiplier >= 5 ? '#ffdd00' : '#ffaa00');

    // Combo display
    if (actionCombo.length > 1) {
      E.text('COMBO: ' + actionCombo.join('-'), E.W - 8, 32, 6, '#aaa', 'right');
    }

    // Finisher flash
    if (finisherReady && Math.floor(Date.now() * 0.01) % 2 === 0) {
      E.textCenter('★ FINISHER READY [Q] ★', E.W - 100, E.H - 30, 7, '#ffdd00');
    }

    // ── Overlays ──
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('RUN N\' GUN', E.W/2, 60, 18, '#ff8844', '#000');
      E.textCenterShadow('WAVE ' + wave, E.W/2, 95, 12, '#ffaa00', '#000');
      E.textCenter('← → MOVE  SPACE SHOOT  F MELEE  G GRENADE  Q FINISHER', E.W/2, 150, 8, '#aaa');
      E.textCenter('SHIFT SLIDE  JUMP ON ENEMIES  STYLE CHAIN → HIGH SCORE', E.W/2, 170, 7, '#888');
      E.textCenter('PRESS ENTER TO START', E.W/2, 220, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', E.W/2, E.H/2 - 50, 18, '#ff4444', '#000');
      E.textCenterShadow('SCORE: ' + score, E.W/2, E.H/2 - 5, 10, '#ffaa00', '#000');
      E.textCenter('WAVE ' + wave, E.W/2, E.H/2 + 18, 8, '#fff');
      E.textCenter('PRESS ENTER TO RETRY', E.W/2, E.H/2 + 50, 8, '#aaa');
    }

    if (state === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('WAVE ' + wave + ' CLEAR!', E.W/2, E.H/2 - 30, 14, '#44ff88', '#000');
      E.textCenterShadow('SCORE: ' + score, E.W/2, E.H/2 + 5, 10, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR WAVE ' + (wave + 1), E.W/2, E.H/2 + 40, 8, '#aaa');
    }
  }

  function destroy() {}

  window.RunGun = { init: init, update: update, render: render, destroy: destroy };
})();
