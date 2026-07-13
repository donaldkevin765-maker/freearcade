/**
 * Snake Evolved — snake with prism fruits, obstacles & power system
 *
 * Creative twists:
 *  - Colored fruits grant temporary powers: blue (speed), purple (phase), gold (score), green (shrink)
 *  - "Prism" combo: eat 3 same-colored fruits in a row for bonus
 *  - Moving obstacles at higher levels
 *  - Animated wave background
 *  - Golden fruit that appears briefly for huge points
 *
 * Infinite levels with scaling difficulty. Best score saved to localStorage.
 */
(function () {
  'use strict';

  var E;
  var snake, food, obstacles;
  var gridSize, cols, rows;
  var dir, nextDir;
  var state, level;
  var moveTimer, moveDelay, baseDelay;
  var ateCount, targetFood;
  var offsetX, offsetY;
  var scorePopups = [];
  var respawning = false;
  var playTime = 0;

  // Power system
  var speedBoostTimer = 0;
  var phaseTimer = 0;
  var prismCombo = []; // last 3 fruit colors eaten
  var lastColor = '';
  var comboCount = 0;

  // Golden fruit
  var goldenFruit = null;
  var goldenFruitTimer = 0;

  // Moving obstacles
  var movingObs = [];

  // Background wave
  var wavePhase = 0;

  function init() {
    E = this.engine;
    level = E.getLevel();

    gridSize = 20;
    var areaW = Math.min(E.W - 40, 480);
    var areaH = Math.min(E.H - 60, 480);
    cols = Math.floor(areaW / gridSize);
    rows = Math.floor(areaH / gridSize);
    cols = Math.max(10, Math.min(cols, 24));
    rows = Math.max(10, Math.min(rows, 20));

    var totalW = cols * gridSize;
    var totalH = rows * gridSize;
    offsetX = Math.floor((E.W - totalW) / 2);
    offsetY = Math.floor((E.H - 60 - totalH) / 2) + 30;

    var startCol = Math.floor(cols / 2);
    var startRow = Math.floor(rows / 2);
    snake = [
      { col: startCol, row: startRow },
      { col: startCol - 1, row: startRow },
      { col: startCol - 2, row: startRow }
    ];

    dir = { col: 1, row: 0 };
    nextDir = { col: 1, row: 0 };

    ateCount = 0;
    targetFood = 5 + level * 2;
    baseDelay = Math.max(0.06, 0.18 - level * 0.008);
    moveDelay = baseDelay;

    // Static obstacles
    obstacles = [];
    var numObs = Math.min(level * 2 + 2, 28);
    for (var i = 0; i < numObs; i++) {
      var o;
      var attempts = 0;
      do {
        o = { col: 1 + Math.floor(Math.random() * (cols - 2)), row: 1 + Math.floor(Math.random() * (rows - 2)) };
        attempts++;
      } while ((isNearStart(o, startCol, startRow, 4) || isOccupied(o)) && attempts < 60);
      obstacles.push(o);
    }

    // Moving obstacles (at higher levels)
    movingObs = [];
    if (level > 3) {
      var numMoving = Math.min(Math.floor(level / 3), 4);
      for (var i = 0; i < numMoving; i++) {
        var mo;
        var attempts = 0;
        do {
          mo = {
            col: 2 + Math.floor(Math.random() * (cols - 4)),
            row: 2 + Math.floor(Math.random() * (rows - 4)),
            dir: Math.random() > 0.5 ? 'h' : 'v',
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 0.5,
          };
          attempts++;
        } while ((isNearStart(mo, startCol, startRow, 5) || isOccupied(mo)) && attempts < 40);
        movingObs.push(mo);
      }
    }

    scorePopups = [];
    respawning = false;
    speedBoostTimer = 0;
    phaseTimer = 0;
    prismCombo = [];
    lastColor = '';
    comboCount = 0;
    goldenFruit = null;
    goldenFruitTimer = 0;
    wavePhase = 0;
    playTime = 0;

    createFood();
    state = 'ready';
    moveTimer = 0;
    E.setScore(0);
    E.setLives(3);
  }

  // ── Fruit types with powers ──
  var FRUIT_TYPES = [
    { id: 'red',    color: '#ff4444', label: 'R', points: 50, effect: null },
    { id: 'blue',   color: '#4488ff', label: 'B', points: 60, effect: 'speed' },
    { id: 'purple', color: '#cc44ff', label: 'P', points: 70, effect: 'phase' },
    { id: 'green',  color: '#44ff66', label: 'G', points: 80, effect: 'shrink' },
  ];

  function isNearStart(pos, sc, sr, dist) {
    return Math.abs(pos.col - sc) < dist && Math.abs(pos.row - sr) < dist;
  }

  function isOccupied(pos) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].col === pos.col && snake[i].row === pos.row) return true;
    }
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].col === pos.col && obstacles[i].row === pos.row) return true;
    }
    for (var i = 0; i < movingObs.length; i++) {
      if (movingObs[i].col === pos.col && movingObs[i].row === pos.row) return true;
    }
    return false;
  }

  function createFood() {
    var bestPos = null;
    var bestScore = -1;
    for (var attempt = 0; attempt < 30; attempt++) {
      var pos = { col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * rows) };
      if (isOccupied(pos)) continue;
      var minDist = Infinity;
      for (var i = 0; i < obstacles.length; i++) {
        var d = Math.abs(pos.col - obstacles[i].col) + Math.abs(pos.row - obstacles[i].row);
        if (d < minDist) minDist = d;
      }
      for (var i = 0; i < snake.length; i++) {
        var d = Math.abs(pos.col - snake[i].col) + Math.abs(pos.row - snake[i].row);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) { bestScore = minDist; bestPos = pos; }
    }
    if (bestPos) {
      // Pick fruit type (weighted, more special at higher levels)
      var r = Math.random();
      var idx = 0;
      if (level > 3 && r < 0.25) idx = 1; // blue
      else if (level > 5 && r < 0.45) idx = 2; // purple
      else if (level > 2 && r < 0.55) idx = 3; // green
      var ft = FRUIT_TYPES[idx];
      food = { col: bestPos.col, row: bestPos.row, type: ft.id, color: ft.color, label: ft.label, points: ft.points, effect: ft.effect };
    } else {
      var attempts2 = 0;
      do {
        food = { col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * rows) };
        attempts2++;
      } while (isOccupied(food) && attempts2 < 200);
      food.type = 'red'; food.color = '#ff4444'; food.label = 'R'; food.points = 50; food.effect = null;
    }

    // Golden fruit chance
    if (level > 2 && Math.random() < 0.12 && !goldenFruit) {
      goldenFruit = { col: 0, row: 0, timer: 5 };
      var gAttempts = 0;
      do {
        goldenFruit.col = Math.floor(Math.random() * cols);
        goldenFruit.row = Math.floor(Math.random() * rows);
        gAttempts++;
      } while (isOccupied(goldenFruit) && gAttempts < 40);
      goldenFruitTimer = 5;
    }
  }

  function addScorePopup(x, y, text, color) {
    scorePopups.push({ text: text, x: x, y: y, vy: -30, life: 0.8, color: color || '#ffdd00' });
  }

  function resetSnake() {
    var sc = Math.floor(cols / 2);
    var sr = Math.floor(rows / 2);
    snake = [
      { col: sc, row: sr },
      { col: sc - 1, row: sr },
      { col: sc - 2, row: sr }
    ];
    dir = { col: 1, row: 0 };
    nextDir = { col: 1, row: 0 };
    moveDelay = baseDelay;
    respawning = true;
    speedBoostTimer = 0;
    phaseTimer = 0;
  }

  // ── Update ──
  function update(dt, input) {
    playTime += dt;
    wavePhase += dt * 2;

    // Score popups
    for (var i = scorePopups.length - 1; i >= 0; i--) {
      var p = scorePopups[i];
      p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) scorePopups.splice(i, 1);
    }

    // Power timers
    if (speedBoostTimer > 0) speedBoostTimer -= dt;
    if (phaseTimer > 0) phaseTimer -= dt;

    // Golden fruit timer
    if (goldenFruit) {
      goldenFruitTimer -= dt;
      if (goldenFruitTimer <= 0) goldenFruit = null;
    }

    // Move obstacles
    for (var i = 0; i < movingObs.length; i++) {
      var mo = movingObs[i];
      mo.phase += dt * mo.speed;
      if (mo.dir === 'h') {
        mo.col = mo.originalCol || (function(){ mo.originalCol = mo.col; return mo.col; })() + Math.sin(mo.phase) * 1.5;
      } else {
        mo.row = mo.originalRow || (function(){ mo.originalRow = mo.row; return mo.row; })() + Math.sin(mo.phase) * 1.5;
      }
      // Round to nearest cell for collision
      mo._col = Math.round(mo.col);
      mo._row = Math.round(mo.row);
    }

    if (state === 'ready') {
      if (input.left || input.right || input.up || input.down) { state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'gameover') {
      try { window.FreeArcadeSave.setHighScore('SnakeEvolved', E.getScore()); } catch(e) {}
      if (input.action) { E.setLevel(1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    if (state === 'levelComplete') {
      try {
        window.FreeArcadeSave.setHighScore('SnakeEvolved', E.getScore());
        window.FreeArcadeSave.incrementStat('totalFruitsEaten', ateCount);
      } catch(e) {}
      if (input.action) { E.setLevel(level+1); init.call({engine: E}); state = 'playing'; E.playCoin(); }
      return;
    }

    // ── PLAYING ──

    // Direction input with reversal prevention
    if (input.left)  { if (dir.col !== 1)  nextDir = { col: -1, row: 0 }; }
    if (input.right) { if (dir.col !== -1) nextDir = { col: 1,  row: 0 }; }
    if (input.up)    { if (dir.row !== 1)  nextDir = { col: 0,  row: -1 }; }
    if (input.down)  { if (dir.row !== -1) nextDir = { col: 0,  row: 1 }; }

    // Speed boost from blue fruit
    var currentDelay = speedBoostTimer > 0 ? baseDelay * 0.5 : moveDelay;

    moveTimer -= dt;
    if (moveTimer > 0) return;
    moveTimer = currentDelay;

    dir = nextDir;

    var newHead = {
      col: snake[0].col + dir.col,
      row: snake[0].row + dir.row
    };

    // Phase through walls
    if (phaseTimer > 0) {
      if (newHead.col < 0) newHead.col = cols - 1;
      if (newHead.col >= cols) newHead.col = 0;
      if (newHead.row < 0) newHead.row = rows - 1;
      if (newHead.row >= rows) newHead.row = 0;
    }

    // Wall collision
    if (newHead.col < 0 || newHead.col >= cols || newHead.row < 0 || newHead.row >= rows) {
      if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
      resetSnake(); createFood(); E.playExplode(); return;
    }

    // Self collision
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].col === newHead.col && snake[i].row === newHead.row) {
        if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
        resetSnake(); createFood(); E.playExplode(); return;
      }
    }

    // Obstacle collision
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].col === newHead.col && obstacles[i].row === newHead.row) {
        if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
        resetSnake(); createFood(); E.playExplode(); return;
      }
    }

    // Moving obstacle collision
    for (var i = 0; i < movingObs.length; i++) {
      var mo = movingObs[i];
      if ((mo._col === undefined || mo._col === newHead.col) && (mo._row === undefined || mo._row === newHead.row)) {
        if (Math.round(mo.col) === newHead.col && Math.round(mo.row) === newHead.row) {
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          resetSnake(); createFood(); E.playExplode(); return;
        }
      }
    }

    // Move: add new head
    snake.unshift(newHead);

    // Golden fruit check
    var ateGolden = false;
    if (goldenFruit && newHead.col === goldenFruit.col && newHead.row === goldenFruit.row) {
      ateGolden = true;
      var bonus = 500 * level;
      E.addScore(bonus);
      addScorePopup(offsetX + goldenFruit.col * gridSize + gridSize/2, offsetY + goldenFruit.row * gridSize, '+' + bonus + ' ★', '#ffdd00');
      E.playLevelUp();
      goldenFruit = null;
    }

    // Food check
    if (newHead.col === food.col && newHead.row === food.row) {
      ateCount++;
      var points = food.points * level + ateCount * 10;
      if (ateGolden) points += 500 * level;
      E.addScore(points);

      var fx = offsetX + food.col * gridSize + gridSize/2;
      var fy = offsetY + food.row * gridSize;
      addScorePopup(fx, fy, '+' + points, food.color);

      // Apply fruit power
      applyFruitPower(food);

      // Prism combo tracking
      if (food.type === lastColor && lastColor !== '') {
        prismCombo.push(food.type);
        if (prismCombo.length >= 3) {
          // PRISM BONUS!
          var prismBonus = 1000 * level;
          E.addScore(prismBonus);
          addScorePopup(E.W/2, E.H/2 - 20, '✦ PRISM x3 +' + prismBonus, '#ffdd00');
          E.playLevelUp();
          E.shake(3, 0.15);
          prismCombo = [];
          // Clear all obstacles in a 2-cell radius around head
          for (var i = obstacles.length - 1; i >= 0; i--) {
            if (Math.abs(obstacles[i].col - snake[0].col) <= 2 && Math.abs(obstacles[i].row - snake[0].row) <= 2) {
              obstacles.splice(i, 1);
            }
          }
        }
      } else {
        prismCombo = [food.type];
      }
      lastColor = food.type;

      E.playCoin();
      moveDelay = Math.max(0.04, moveDelay - 0.003);
      createFood();
    } else {
      snake.pop();
    }

    respawning = false;

    if (ateCount >= targetFood) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function applyFruitPower(fruit) {
    switch (fruit.effect) {
      case 'speed':
        speedBoostTimer = 5;
        addScorePopup(E.W/2, E.H/2 - 10, '⚡ SPEED 5s', '#4488ff');
        break;
      case 'phase':
        phaseTimer = 4;
        addScorePopup(E.W/2, E.H/2 - 10, '⟐ PHASE 4s', '#cc44ff');
        break;
      case 'shrink':
        if (snake.length > 3) {
          snake.splice(snake.length - 2, 2);
          addScorePopup(E.W/2, E.H/2 - 10, '▼ SHRINK', '#44ff66');
        }
        break;
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    if (!snake || snake.length === 0) return;

    // Background wave grid
    ctx.fillStyle = '#0d0d2a';
    ctx.fillRect(offsetX, offsetY, cols * gridSize, rows * gridSize);

    // Wave grid lines
    for (var c = 1; c < cols; c++) {
      var xOff = Math.sin(wavePhase + c * 0.3) * 2;
      ctx.strokeStyle = 'rgba(68, 136, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(offsetX + c * gridSize + xOff, offsetY);
      ctx.lineTo(offsetX + c * gridSize + xOff, offsetY + rows * gridSize);
      ctx.stroke();
    }
    for (var r = 1; r < rows; r++) {
      var yOff = Math.sin(wavePhase * 0.7 + r * 0.3) * 2;
      ctx.strokeStyle = 'rgba(68, 136, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + r * gridSize + yOff);
      ctx.lineTo(offsetX + cols * gridSize, offsetY + r * gridSize + yOff);
      ctx.stroke();
    }

    // Static obstacles
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var ox = offsetX + o.col * gridSize;
      var oy = offsetY + o.row * gridSize;
      var pulse = 0.6 + Math.sin(playTime * 2 + i) * 0.3;
      ctx.fillStyle = 'rgba(58, 34, 68, ' + (0.5 + pulse * 0.3) + ')';
      ctx.fillRect(ox + 1, oy + 1, gridSize - 2, gridSize - 2);
      ctx.fillStyle = 'rgba(85, 51, 85, ' + (0.5 + pulse * 0.2) + ')';
      ctx.fillRect(ox + 3, oy + 3, gridSize - 6, gridSize - 6);
      ctx.fillStyle = 'rgba(119, 68, 119, ' + (0.4 + pulse * 0.2) + ')';
      ctx.fillRect(ox + 5, oy + 5, gridSize - 10, gridSize - 10);
    }

    // Moving obstacles
    for (var i = 0; i < movingObs.length; i++) {
      var mo = movingObs[i];
      var mox = offsetX + Math.round(mo.col) * gridSize;
      var moy = offsetY + Math.round(mo.row) * gridSize;
      ctx.fillStyle = '#664488';
      ctx.fillRect(mox + 1, moy + 1, gridSize - 2, gridSize - 2);
      ctx.fillStyle = '#8866aa';
      ctx.fillRect(mox + 3, moy + 3, gridSize - 6, gridSize - 6);
      ctx.fillStyle = '#aa88cc';
      ctx.fillRect(mox + 5, moy + 5, gridSize - 10, gridSize - 10);
    }

    // Food with glow pulse and type color
    var fx = offsetX + food.col * gridSize;
    var fy = offsetY + food.row * gridSize;
    var pulse = 0.6 + Math.sin(playTime * 4) * 0.4;
    ctx.globalAlpha = pulse;
    E.circle(fx + gridSize/2, fy + gridSize/2, gridSize * 0.38, food.color);
    ctx.globalAlpha = 1;
    E.circle(fx + gridSize/2, fy + gridSize/2, gridSize * 0.18, '#fff');
    // Food type label
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(food.label, fx + gridSize/2, fy + gridSize/2);

    // Golden fruit
    if (goldenFruit) {
      var gfx = offsetX + goldenFruit.col * gridSize;
      var gfy = offsetY + goldenFruit.row * gridSize;
      var gp = 0.4 + Math.sin(playTime * 6) * 0.4 + (goldenFruitTimer < 2 ? Math.sin(playTime * 10) * 0.2 : 0);
      ctx.globalAlpha = gp;
      ctx.fillStyle = '#ffdd00';
      ctx.beginPath();
      ctx.arc(gfx + gridSize/2, gfy + gridSize/2, gridSize * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      E.textCenter('★', gfx + gridSize/2, gfy + gridSize/2 - 2, 9, '#ffdd00');
    }

    // Snake body
    for (var i = snake.length - 1; i >= 0; i--) {
      var seg = snake[i];
      var sx = offsetX + seg.col * gridSize;
      var sy = offsetY + seg.row * gridSize;

      // Color gradient + phase effect
      var ratio = i / Math.max(snake.length - 1, 1);
      var r = Math.floor(30 + (1 - ratio) * 100);
      var g = Math.floor(160 + (1 - ratio) * 95);
      var b = Math.floor(30 + (1 - ratio) * 100);
      if (phaseTimer > 0) {
        // Phase glow
        ctx.fillStyle = 'rgba(204,68,255,' + (0.3 + Math.sin(playTime * 5) * 0.2) + ')';
        ctx.fillRect(sx - 1, sy - 1, gridSize + 2, gridSize + 2);
      }

      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      var pad = i === 0 ? 1 : 2;
      ctx.fillRect(sx + pad, sy + pad, gridSize - pad*2, gridSize - pad*2);

      // Eyes on head
      if (i === 0) {
        ctx.fillStyle = '#fff';
        var es = 4;
        if (dir.col === 1) {
          ctx.fillRect(sx + gridSize - es - 2, sy + 3, es, es);
          ctx.fillRect(sx + gridSize - es - 2, sy + gridSize - es - 3, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + gridSize - es - 1, sy + 4, 2, 2);
          ctx.fillRect(sx + gridSize - es - 1, sy + gridSize - es - 2, 2, 2);
        } else if (dir.col === -1) {
          ctx.fillRect(sx + 2, sy + 3, es, es);
          ctx.fillRect(sx + 2, sy + gridSize - es - 3, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 3, sy + 4, 2, 2);
          ctx.fillRect(sx + 3, sy + gridSize - es - 2, 2, 2);
        } else if (dir.row === -1) {
          ctx.fillRect(sx + 3, sy + 2, es, es);
          ctx.fillRect(sx + gridSize - es - 3, sy + 2, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 4, sy + 3, 2, 2);
          ctx.fillRect(sx + gridSize - es - 2, sy + 3, 2, 2);
        } else {
          ctx.fillRect(sx + 3, sy + gridSize - es - 2, es, es);
          ctx.fillRect(sx + gridSize - es - 3, sy + gridSize - es - 2, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 4, sy + gridSize - es - 1, 2, 2);
          ctx.fillRect(sx + gridSize - es - 2, sy + gridSize - es - 1, 2, 2);
        }

        // Speed indicator
        if (speedBoostTimer > 0) {
          ctx.strokeStyle = 'rgba(68,136,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx + gridSize/2, sy + gridSize/2, gridSize * 0.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Prism combo indicator
    if (prismCombo.length > 0) {
      var comboStr = '';
      for (var pi = 0; pi < prismCombo.length; pi++) {
        var ft = FRUIT_TYPES.find(function(t) { return t.id === prismCombo[pi]; });
        comboStr += (ft ? ft.label : '?') + ' ';
      }
      E.text('PRISM: ' + comboStr, E.W/2, E.H - 8, 6, '#ffdd00', 'center');
    }

    // Score popups
    for (var i = 0; i < scorePopups.length; i++) {
      var p = scorePopups[i];
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      E.textCenter('+' + p.text.replace('+', ''), p.x, p.y, 8, p.color);
    }
    ctx.globalAlpha = 1;

    // HUD
    E.text('LEVEL ' + level + '  SCORE: ' + E.getScore(), 8, 8, 8, '#ffaa00');
    E.text('EAT: ' + ateCount + '/' + targetFood, E.W - 8, 8, 8, '#00ff88', 'right');
    var ls = '';
    for (var i = 0; i < E.getLives(); i++) ls += '♥ ';
    E.text(ls, E.W/2, 8, 8, '#ff6666', 'center');
    E.text('SIZE: ' + snake.length, 8, 20, 7, '#6688aa');

    if (speedBoostTimer > 0) E.text('⚡ ' + Math.ceil(speedBoostTimer), 8, 32, 6, '#4488ff');
    if (phaseTimer > 0) E.text('⟐ ' + Math.ceil(phaseTimer), 8, 40, 6, '#cc44ff');
    if (goldenFruit) E.text('★ ' + Math.ceil(goldenFruitTimer), E.W - 8, 20, 7, '#ffdd00', 'right');

    var cx = E.W/2, cy = E.H/2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('SNAKE EVOLVED', cx, 50, 16, '#44ff88', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 85, 10, '#ffaa00', '#000');
      E.textCenter('← → ↑ ↓ to move', cx, 135, 8, '#aaa');
      E.textCenter('Colored fruits = powers: ⚡SPD ⟐PHASE ▼SHRINK', cx, 160, 6, '#888');
      E.textCenter('Prism combo: 3 same in a row = bonus!', cx, 175, 6, '#ffdd00');
      E.textCenter('Eat ' + targetFood + ' fruits to clear!', cx, 195, 7, '#ff8844');
      E.textCenter('PRESS ENTER TO START', cx, 250, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 55, 16, '#ff4444', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy - 15, 10, '#ffaa00', '#000');
      E.textCenterShadow('SIZE: ' + snake.length, cx, cy + 5, 8, '#88aacc', '#000');
      try {
        var best = window.FreeArcadeSave.getHighScore('SnakeEvolved');
        if (E.getScore() >= best && best > 0) E.textCenter('★ NEW BEST ★', cx, cy + 20, 8, '#ffdd00');
        else E.textCenter('BEST: ' + best, cx, cy + 20, 7, '#ffdd00');
      } catch (e) {}
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 55, 8, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('LEVEL ' + level + ' CLEAR!', cx, cy - 40, 14, '#00ff88', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy, 10, '#ffaa00', '#000');
      E.textCenterShadow('SIZE: ' + snake.length, cx, cy + 18, 8, '#88aacc', '#000');
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 55, 8, '#aaa');
    }
  }

  function destroy() {}

  window.SnakeEvolved = { init: init, update: update, render: render, destroy: destroy };
})();
