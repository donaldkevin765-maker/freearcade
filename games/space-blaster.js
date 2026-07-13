/**
 * Space Blaster — side-scrolling shooter with levels
 * Uses FreeArcadeEngine via `game.engine` object
 */
(function () {
  'use strict';

  var E; // engine reference, set in init()

  // Game state
  var player, bullets, enemies, particles, stars;
  var state = 'ready';    // ready | playing | gameover | levelComplete
  var waveSize = 4;
  var enemiesSpawned = 0;
  var enemiesKilled = 0;
  var fireCooldown = 0;
  var enemySpawnTimer = 0;
  var waveCount = 1;

  function init() {
    E = this.engine;
    player = { x: 60, y: E.H / 2, w: 24, h: 18, speed: 220 };
    bullets = [];
    enemies = [];
    particles = [];
    stars = [];
    state = 'ready';
    waveSize = 4;
    enemiesSpawned = 0;
    enemiesKilled = 0;
    fireCooldown = 0;
    enemySpawnTimer = 0;
    waveCount = E.getLevel();

    // Create starfield
    for (var i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * E.W,
        y: Math.random() * E.H,
        speed: 40 + Math.random() * 80,
        size: 1 + Math.random() * 2
      });
    }

    E.setScore(0);
    E.setLives(3);
  }

  function spawnEnemy() {
    var types = [
      { w: 20, h: 16, hp: 1, speed: 90, score: 100, color: '#ff4444' },
      { w: 26, h: 22, hp: 2, speed: 60, score: 200, color: '#ff8800' },
      { w: 32, h: 24, hp: 3, speed: 45, score: 350, color: '#cc44ff' },
    ];
    // Later waves get tougher enemies
    var maxType = Math.min(waveCount - 1, types.length - 1);
    var idx = Math.floor(Math.random() * (maxType + 1));
    if (waveCount <= 1) idx = 0;
    var t = types[idx];

    var enemy = {
      x: E.W + 10,
      y: 30 + Math.random() * (E.H - 80),
      w: t.w, h: t.h,
      hp: t.hp,
      speed: t.speed + Math.random() * 30,
      score: t.score,
      color: t.color,
      shootTimer: 1 + Math.random() * 2,
      dir: Math.random() > 0.5 ? 1 : -1,
    };
    enemies.push(enemy);
    enemiesSpawned++;
  }

  function spawnBullet(x, y, vx, vy, isEnemy) {
    bullets.push({
      x: x, y: y, w: 6, h: 6,
      vx: vx, vy: vy,
      isEnemy: isEnemy,
      life: 2
    });
  }

  function addParticles(x, y, color, count) {
    for (var i = 0; i < (count || 12); i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 40 + Math.random() * 120;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.4,
        size: 2 + Math.random() * 3,
        color: color || '#ff6600'
      });
    }
  }

  function update(dt, input) {
    // Update stars
    for (var i = 0; i < stars.length; i++) {
      stars[i].x -= stars[i].speed * dt;
      if (stars[i].x < -5) {
        stars[i].x = E.W + 5;
        stars[i].y = Math.random() * E.H;
      }
    }

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
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    if (state === 'levelComplete') {
      if (input.action) {
        E.setLevel(waveCount + 1);
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── Playing state ──

    // Player movement
    if (input.left)  player.x -= player.speed * dt;
    if (input.right) player.x += player.speed * dt;
    if (input.up)    player.y -= player.speed * dt;
    if (input.down)  player.y += player.speed * dt;

    // Clamp
    player.x = Math.max(10, Math.min(E.W - player.w - 10, player.x));
    player.y = Math.max(10, Math.min(E.H - player.h - 10, player.y));

    // Shooting
    fireCooldown -= dt;
    if (fireCooldown <= 0 && (input.keys['Space'] || input.keys['KeyZ'] || input.touchTapped)) {
      spawnBullet(player.x + player.w, player.y + player.h / 2 - 3, 400, 0, false);
      // Second bullet (dual shot at higher levels)
      if (waveCount >= 3) {
        spawnBullet(player.x + player.w, player.y + 3, 400, -50, false);
        spawnBullet(player.x + player.w, player.y + player.h - 3, 400, 50, false);
      }
      fireCooldown = waveCount >= 5 ? 0.15 : 0.25;
      E.playShoot();
    }

    // Update bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.x > E.W + 20 || b.y < -20 || b.y > E.H + 20 || b.life <= 0) {
        bullets.splice(i, 1);
        continue;
      }

      if (!b.isEnemy) {
        // Hit enemies
        for (var j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
            bullets.splice(i, 1);
            e.hp--;
            if (e.hp <= 0) {
              addParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 15);
              enemies.splice(j, 1);
              E.addScore(e.score);
              enemiesKilled++;
              E.playExplode();
            } else {
              E.playHit();
            }
            break;
          }
        }
      } else {
        // Hit player
        if (b.x < player.x + player.w && b.x + b.w > player.x && b.y < player.y + player.h && b.y + b.h > player.y) {
          bullets.splice(i, 1);
          addParticles(player.x + player.w / 2, player.y + player.h / 2, '#00ffff', 20);
          if (!E.loseLife()) {
            state = 'gameover';
            E.playGameOver();
          } else {
            E.playExplode();
          }
        }
      }
    }

    // Enemy shooting
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      e.shootTimer -= dt;
      e.x -= e.speed * dt;
      e.y += Math.sin(Date.now() / 500 + i) * 40 * dt;
      e.y = Math.max(20, Math.min(E.H - e.h - 20, e.y));

      if (e.shootTimer <= 0) {
        var dx = player.x - e.x;
        var dy = player.y - e.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        spawnBullet(e.x, e.y + e.h / 2 - 3, dx / dist * 200, dy / dist * 200, true);
        e.shootTimer = 1.5 + Math.random() * 2;
      }

      // Enemy hits player
      if (e.x < player.x + player.w && e.x + e.w > player.x && e.y < player.y + player.h && e.y + e.h > player.y) {
        addParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 20);
        addParticles(player.x + player.w / 2, player.y + player.h / 2, '#00ffff', 20);
        enemies.splice(i, 1);
        if (!E.loseLife()) {
          state = 'gameover';
          E.playGameOver();
        } else {
          E.playExplode();
        }
        i--;
      }
    }

    // Spawn enemies in waves
    if (enemiesSpawned < waveSize + waveCount * 2) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(0.3, 1.2 - waveCount * 0.08);
      }
    }

    // Remove off-screen enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].x < -60) {
        enemies.splice(i, 1);
      }
    }

    // Update particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size *= 0.98;
      if (p.life <= 0 || p.size < 0.5) particles.splice(i, 1);
    }

    // Check win condition
    if (enemiesKilled >= waveSize + waveCount * 2 && enemies.length === 0) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function render(ctx) {
    // Starfield
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      E.circle(s.x, s.y, s.size, 'rgba(200,200,255,0.5)');
    }

    if (state === 'ready') {
      // Title screen
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);

      E.textShadow('SPACE BLASTER', E.W / 2, 80, 20, '#ff4444', '#000');
      E.textShadow('WAVE ' + waveCount, E.W / 2, 120, 14, '#ffaa00', '#000');
      E.text('← → ↑ ↓ to move', E.W / 2, 180, 10, '#aaa');
      E.text('SPACE / Z to shoot', E.W / 2, 205, 10, '#aaa');
      E.text('PRESS ENTER TO START', E.W / 2, 260, 12, '#00ff88');
      return;
    }

    if (state === 'gameover') {
      // Render game behind
      renderGame(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('GAME OVER', E.W / 2, E.H / 2 - 40, 22, '#ff2222', '#000');
      E.textShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 10, 12, '#ffaa00', '#000');
      E.text('PRESS ENTER TO RETRY', E.W / 2, E.H / 2 + 50, 9, '#aaa');
      return;
    }

    if (state === 'levelComplete') {
      renderGame(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('WAVE ' + waveCount + ' CLEAR!', E.W / 2, E.H / 2 - 40, 16, '#00ff88', '#000');
      E.textShadow('SCORE: ' + E.getScore(), E.W / 2, E.H / 2 + 10, 12, '#ffaa00', '#000');
      E.text('PRESS ENTER FOR WAVE ' + (waveCount + 1), E.W / 2, E.H / 2 + 50, 9, '#aaa');
      return;
    }

    renderGame(ctx);
  }

  function renderGame(ctx) {
    // Player ship
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

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      // Details
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
      ctx.fillRect(e.x + e.w - 8, e.y + 4, 4, 4);
      if (e.hp > 1) {
        E.rect(e.x, e.y - 6, e.w, 4, '#333');
        E.rect(e.x, e.y - 6, e.w * (e.hp / 3), 4, '#0f0');
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
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = p.life / 0.8;
      ctx.globalAlpha = Math.max(0, a);
      E.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;

    // HUD
    E.text('SCORE: ' + E.getScore(), 10, 10, 9, '#ffaa00');
    E.text('WAVE: ' + waveCount, 10, 26, 9, '#00ff88');
    var livesStr = '';
    for (var i = 0; i < E.getLives(); i++) livesStr += '♥ ';
    E.text('LIVES: ' + livesStr, 10, 42, 9, '#ff6666');
  }

  function destroy() {}

  window.SpaceBlaster = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
