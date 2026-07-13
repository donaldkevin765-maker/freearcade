/**
 * Snake Evolved — classic snake with obstacles, speed boost, and levels
 * Uses FreeArcadeEngine via `game.engine` object
 */
(function () {
  'use strict';

  var E; // engine reference

  var snake, food, obstacles;
  var gridSize = 20;
  var cols, rows;
  var dir, nextDir;
  var state = 'ready';  // ready | playing | gameover | levelComplete
  var level = 1;
  var moveTimer = 0;
  var moveDelay = 0.18;
  var ateCount = 0;
  var targetFood = 5;
  var offsetX, offsetY;

  function init() {
    E = this.engine;
    level = E.getLevel();

    // Grid gets bigger with levels, game area smaller
    var areaW = Math.min(E.W - 40, 480);
    var areaH = Math.min(E.H - 60, 480);
    gridSize = 20;
    cols = Math.floor(areaW / gridSize);
    rows = Math.floor(areaH / gridSize);
    cols = Math.max(cols, 10);
    rows = Math.max(rows, 10);
    cols = Math.min(cols, 24);
    rows = Math.min(rows, 20);

    var totalW = cols * gridSize;
    var totalH = rows * gridSize;
    offsetX = Math.floor((E.W - totalW) / 2);
    offsetY = Math.floor((E.H - 60 - totalH) / 2) + 30;

    // Snake starts in center
    var startCol = Math.floor(cols / 2);
    var startRow = Math.floor(rows / 2);
    snake = [
      { col: startCol, row: startRow }
    ];

    dir = { col: 1, row: 0 };
    nextDir = { col: 1, row: 0 };
    ateCount = 0;
    targetFood = 5 + level * 2;
    moveDelay = Math.max(0.08, 0.18 - level * 0.008);

    // Generate obstacles based on level
    obstacles = [];
    var numObstacles = Math.min(level * 2 + 3, 30);
    for (var i = 0; i < numObstacles; i++) {
      var o;
      var attempts = 0;
      do {
        o = {
          col: 1 + Math.floor(Math.random() * (cols - 2)),
          row: 1 + Math.floor(Math.random() * (rows - 2))
        };
        attempts++;
      } while ((Math.abs(o.col - startCol) < 3 && Math.abs(o.row - startRow) < 3 || isOccupied(o)) && attempts < 50);
      obstacles.push(o);
    }

    createFood();

    state = 'ready';
    moveTimer = 0;
    E.setScore(0);
    E.setLives(3);
  }

  function isOccupied(pos) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].col === pos.col && snake[i].row === pos.row) return true;
    }
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].col === pos.col && obstacles[i].row === pos.row) return true;
    }
    return false;
  }

  function createFood() {
    var attempts = 0;
    do {
      food = {
        col: Math.floor(Math.random() * cols),
        row: Math.floor(Math.random() * rows)
      };
      attempts++;
    } while (isOccupied(food) && attempts < 200);
  }

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) {
        state = 'playing';
        E.playCoin();
      }
      // Allow direction change before starting
      if (input.left)  { nextDir = { col: -1, row: 0 }; }
      if (input.right) { nextDir = { col: 1, row: 0 }; }
      if (input.up)    { nextDir = { col: 0, row: -1 }; }
      if (input.down)  { nextDir = { col: 0, row: 1 }; }
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
        E.setLevel(level + 1);
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── Playing ──

    // Direction input
    if (input.left)  { if (dir.col !== 1) nextDir = { col: -1, row: 0 }; }
    if (input.right) { if (dir.col !== -1) nextDir = { col: 1, row: 0 }; }
    if (input.up)    { if (dir.row !== 1) nextDir = { col: 0, row: -1 }; }
    if (input.down)  { if (dir.row !== -1) nextDir = { col: 0, row: 1 }; }

    moveTimer -= dt;
    if (moveTimer > 0) return;
    moveTimer = moveDelay;

    dir = nextDir;

    var newHead = {
      col: snake[0].col + dir.col,
      row: snake[0].row + dir.row
    };

    // Wall collision → lose life
    if (newHead.col < 0 || newHead.col >= cols || newHead.row < 0 || newHead.row >= rows) {
      if (!E.loseLife()) {
        state = 'gameover';
        E.playGameOver();
        return;
      }
      // Respawn in center
      snake = [{ col: Math.floor(cols / 2), row: Math.floor(rows / 2) }];
      dir = { col: 1, row: 0 };
      nextDir = { col: 1, row: 0 };
      E.playExplode();
      return;
    }

    // Self collision
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].col === newHead.col && snake[i].row === newHead.row) {
        if (!E.loseLife()) {
          state = 'gameover';
          E.playGameOver();
          return;
        }
        snake = [{ col: Math.floor(cols / 2), row: Math.floor(rows / 2) }];
        dir = { col: 1, row: 0 };
        nextDir = { col: 1, row: 0 };
        E.playExplode();
        return;
      }
    }

    // Obstacle collision
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].col === newHead.col && obstacles[i].row === newHead.row) {
        if (!E.loseLife()) {
          state = 'gameover';
          E.playGameOver();
          return;
        }
        snake = [{ col: Math.floor(cols / 2), row: Math.floor(rows / 2) }];
        dir = { col: 1, row: 0 };
        nextDir = { col: 1, row: 0 };
        E.playExplode();
        return;
      }
    }

    // Move snake
    snake.unshift(newHead);

    // Check food
    if (newHead.col === food.col && newHead.row === food.row) {
      ateCount++;
      E.addScore(level * 50);
      E.playCoin();
      createFood();
      // Speed up slightly
      moveDelay = Math.max(0.05, moveDelay - 0.003);
    } else {
      snake.pop(); // Remove tail if no food eaten
    }

    // Win check
    if (ateCount >= targetFood) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  function render(ctx) {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    if (!snake || snake.length === 0) return;

    // Grid background
    ctx.fillStyle = '#0d0d2a';
    ctx.fillRect(offsetX, offsetY, cols * gridSize, rows * gridSize);

    // Grid lines
    ctx.strokeStyle = 'rgba(68, 136, 255, 0.06)';
    ctx.lineWidth = 1;
    for (var c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + c * gridSize, offsetY);
      ctx.lineTo(offsetX + c * gridSize, offsetY + rows * gridSize);
      ctx.stroke();
    }
    for (var r = 1; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + r * gridSize);
      ctx.lineTo(offsetX + cols * gridSize, offsetY + r * gridSize);
      ctx.stroke();
    }

    // Obstacles
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var ox = offsetX + o.col * gridSize;
      var oy = offsetY + o.row * gridSize;
      ctx.fillStyle = '#553355';
      ctx.fillRect(ox + 1, oy + 1, gridSize - 2, gridSize - 2);
      ctx.fillStyle = '#774477';
      ctx.fillRect(ox + 3, oy + 3, gridSize - 6, gridSize - 6);
    }

    // Food (with pulse)
    var fx = offsetX + food.col * gridSize;
    var fy = offsetY + food.row * gridSize;
    var pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
    ctx.globalAlpha = pulse;
    E.circle(fx + gridSize / 2, fy + gridSize / 2, gridSize * 0.35, '#ff4444');
    E.circle(fx + gridSize / 2, fy + gridSize / 2, gridSize * 0.18, '#ff8888');
    ctx.globalAlpha = 1;

    // Snake body
    for (var i = snake.length - 1; i >= 0; i--) {
      var seg = snake[i];
      var sx = offsetX + seg.col * gridSize;
      var sy = offsetY + seg.row * gridSize;
      var ratio = i / snake.length;
      var r2 = Math.floor(50 + (1 - ratio) * 80);
      var g2 = Math.floor(180 + (1 - ratio) * 75);
      var b2 = Math.floor(50 + (1 - ratio) * 80);
      ctx.fillStyle = 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
      var pad = i === 0 ? 1 : 2;
      ctx.fillRect(sx + pad, sy + pad, gridSize - pad * 2, gridSize - pad * 2);

      // Eyes on head
      if (i === 0) {
        ctx.fillStyle = '#000';
        var eyeOff = 4;
        if (dir.col === 1) {
          ctx.fillRect(sx + gridSize - 5, sy + 4, 3, 3);
          ctx.fillRect(sx + gridSize - 5, sy + gridSize - 7, 3, 3);
        } else if (dir.col === -1) {
          ctx.fillRect(sx + 2, sy + 4, 3, 3);
          ctx.fillRect(sx + 2, sy + gridSize - 7, 3, 3);
        } else if (dir.row === -1) {
          ctx.fillRect(sx + 4, sy + 2, 3, 3);
          ctx.fillRect(sx + gridSize - 7, sy + 2, 3, 3);
        } else {
          ctx.fillRect(sx + 4, sy + gridSize - 5, 3, 3);
          ctx.fillRect(sx + gridSize - 7, sy + gridSize - 5, 3, 3);
        }
      }
    }

    // HUD
    E.text('LEVEL ' + level + ' | SCORE: ' + E.getScore(), 10, 8, 8, '#ffaa00');
    E.text('EAT: ' + ateCount + '/' + targetFood, E.W - 10, 8, 8, '#00ff88', 'right');
    var livesStr = '';
    for (var i = 0; i < E.getLives(); i++) livesStr += '♥ ';
    E.text(livesStr, E.W / 2, 8, 8, '#ff6666', 'center');

    // Overlays
    var cx = E.W / 2;
    var cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('SNAKE EVOLVED', cx, 60, 16, '#44ff88', '#000');
      E.textShadow('LEVEL ' + level, cx, 100, 10, '#ffaa00', '#000');
      E.text('← → ↑ ↓ to move', cx, 160, 8, '#aaa', 'center');
      E.text('Eat ' + targetFood + ' fruits to clear!', cx, 185, 8, '#ff8844', 'center');
      E.text('Avoid walls, self, and obstacles', cx, 210, 7, '#aaa', 'center');
      E.text('PRESS ENTER TO START', cx, 260, 9, '#00ff88', 'center');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('GAME OVER', cx, cy - 40, 16, '#ff4444', '#000');
      E.textShadow('SCORE: ' + E.getScore(), cx, cy + 5, 10, '#ffaa00', '#000');
      E.text('PRESS ENTER TO RETRY', cx, cy + 50, 8, '#aaa', 'center');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('LEVEL ' + level + ' CLEAR!', cx, cy - 40, 14, '#00ff88', '#000');
      E.textShadow('SCORE: ' + E.getScore(), cx, cy + 5, 10, '#ffaa00', '#000');
      E.text('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 50, 8, '#aaa', 'center');
    }
  }

  function destroy() {}

  window.SnakeEvolved = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
