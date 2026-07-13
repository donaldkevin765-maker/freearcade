/**
 * Snake Evolved — classic snake with obstacles, speed, levels, and score popups
 *
 * Uses FreeArcadeEngine via `this.engine` in init()
 *
 * Features:
 *  - Starts with 3 segments for proper snake feel
 *  - Speed resets on respawn (fair difficulty)
 *  - Food spawns in open areas away from obstacles
 *  - Floating score popups (+50, +100, etc.)
 *  - Obstacles avoid blocking paths
 *  - Eyes on head show current direction
 *  - Progressive difficulty: more obstacles, faster speed, more food needed
 *  - Wall collision = life loss + respawn (with speed reset)
 */
(function () {
  'use strict';

  var E;
  var snake, food, obstacles;
  var gridSize, cols, rows;
  var dir, nextDir;
  var state; // 'ready' | 'playing' | 'gameover' | 'levelComplete'
  var level;
  var moveTimer, moveDelay, baseDelay;
  var ateCount, targetFood;
  var offsetX, offsetY;
  var scorePopups = [];
  var respawning = false;

  function init() {
    E = this.engine;
    level = E.getLevel();

    // Consistent grid size
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

    // Snake starts in center with 3 segments
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
    baseDelay = Math.max(0.08, 0.18 - level * 0.008);
    moveDelay = baseDelay;

    // Generate obstacles
    obstacles = [];
    var numObstacles = Math.min(level * 2 + 2, 28);
    for (var i = 0; i < numObstacles; i++) {
      var o;
      var attempts = 0;
      do {
        o = {
          col: 1 + Math.floor(Math.random() * (cols - 2)),
          row: 1 + Math.floor(Math.random() * (rows - 2))
        };
        attempts++;
      } while ((isNearStart(o, startCol, startRow, 4) || isOccupied(o)) && attempts < 60);
      obstacles.push(o);
    }

    scorePopups = [];
    respawning = false;

    // Ensure food doesn't overlap
    createFood();

    state = 'ready';
    moveTimer = 0;
    E.setScore(0);
    E.setLives(3);
  }

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
    return false;
  }

  function createFood() {
    // Try to place food in open area (away from snake head and obstacles)
    var bestPos = null;
    var bestScore = -1;

    for (var attempt = 0; attempt < 30; attempt++) {
      var pos = {
        col: Math.floor(Math.random() * cols),
        row: Math.floor(Math.random() * rows)
      };
      if (isOccupied(pos)) continue;

      // Score by minimum distance to any obstacle/snake
      var minDist = Infinity;
      for (var i = 0; i < obstacles.length; i++) {
        var d = Math.abs(pos.col - obstacles[i].col) + Math.abs(pos.row - obstacles[i].row);
        if (d < minDist) minDist = d;
      }
      for (var i = 0; i < snake.length; i++) {
        var d = Math.abs(pos.col - snake[i].col) + Math.abs(pos.row - snake[i].row);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        bestPos = pos;
      }
    }

    if (bestPos) {
      food = bestPos;
    } else {
      // Fallback: any free cell
      var attempts2 = 0;
      do {
        food = { col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * rows) };
        attempts2++;
      } while (isOccupied(food) && attempts2 < 200);
    }
  }

  function addScorePopup(x, y, text, color) {
    scorePopups.push({
      text: text,
      x: x,
      y: y,
      vy: -30,
      life: 0.8,
      color: color || '#ffdd00'
    });
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
    moveDelay = baseDelay; // reset speed
    respawning = true;
  }

  // ── Update ──
  function update(dt, input) {
    // Update score popups
    for (var i = scorePopups.length - 1; i >= 0; i--) {
      var p = scorePopups[i];
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) scorePopups.splice(i, 1);
    }

    if (state === 'ready') {
      if (input.left || input.right || input.up || input.down) {
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
        E.setLevel(level + 1);
        init.call({ engine: E });
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── PLAYING ──

    // Direction input (with 180° reversal prevention)
    // Allow direction changes during the moveTimer delay for responsive controls
    if (input.left)  { if (dir.col !== 1)  nextDir = { col: -1, row: 0 }; }
    if (input.right) { if (dir.col !== -1) nextDir = { col: 1,  row: 0 }; }
    if (input.up)    { if (dir.row !== 1)  nextDir = { col: 0,  row: -1 }; }
    if (input.down)  { if (dir.row !== -1) nextDir = { col: 0,  row: 1 }; }

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
      resetSnake();
      createFood();
      E.playExplode();
      return;
    }

    // Self collision (check against body, excluding tail which will move)
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].col === newHead.col && snake[i].row === newHead.row) {
        if (!E.loseLife()) {
          state = 'gameover';
          E.playGameOver();
          return;
        }
        resetSnake();
        createFood();
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
        resetSnake();
        createFood();
        E.playExplode();
        return;
      }
    }

    // Move: add new head
    snake.unshift(newHead);

    // Check food
    if (newHead.col === food.col && newHead.row === food.row) {
      ateCount++;
      var points = level * 50 + ateCount * 10;
      E.addScore(points);

      var fx = offsetX + food.col * gridSize + gridSize / 2;
      var fy = offsetY + food.row * gridSize;
      addScorePopup(fx, fy, '+' + points, '#ffdd00');

      E.playCoin();

      // Speed up slightly (capped)
      moveDelay = Math.max(0.05, moveDelay - 0.003);

      createFood();
    } else {
      // Remove tail (no food eaten)
      snake.pop();
    }

    respawning = false;

    // Win check
    if (ateCount >= targetFood) {
      state = 'levelComplete';
      E.playLevelUp();
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    if (!snake || snake.length === 0) return;

    // Grid background
    ctx.fillStyle = '#0d0d2a';
    ctx.fillRect(offsetX, offsetY, cols * gridSize, rows * gridSize);

    // Grid lines
    ctx.strokeStyle = 'rgba(68, 136, 255, 0.05)';
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
      ctx.fillStyle = '#3a2244';
      ctx.fillRect(ox + 1, oy + 1, gridSize - 2, gridSize - 2);
      ctx.fillStyle = '#553355';
      ctx.fillRect(ox + 3, oy + 3, gridSize - 6, gridSize - 6);
      ctx.fillStyle = '#774477';
      ctx.fillRect(ox + 5, oy + 5, gridSize - 10, gridSize - 10);
    }

    // Food with glow pulse
    var fx = offsetX + food.col * gridSize;
    var fy = offsetY + food.row * gridSize;
    var pulse = 0.6 + Math.sin(Date.now() / 180) * 0.4;
    ctx.globalAlpha = pulse;
    E.circle(fx + gridSize / 2, fy + gridSize / 2, gridSize * 0.38, '#ff4444');
    ctx.globalAlpha = 1;
    E.circle(fx + gridSize / 2, fy + gridSize / 2, gridSize * 0.18, '#ff8888');

    // Snake body (drawn tail-to-head so head is on top)
    for (var i = snake.length - 1; i >= 0; i--) {
      var seg = snake[i];
      var sx = offsetX + seg.col * gridSize;
      var sy = offsetY + seg.row * gridSize;

      // Color gradient: head brighter, tail darker
      var ratio = i / Math.max(snake.length - 1, 1);
      var r = Math.floor(30 + (1 - ratio) * 100);
      var g = Math.floor(160 + (1 - ratio) * 95);
      var b = Math.floor(30 + (1 - ratio) * 100);

      // Rounding effect on body
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      var pad = i === 0 ? 1 : 2;
      ctx.fillRect(sx + pad, sy + pad, gridSize - pad * 2, gridSize - pad * 2);

      // Inter-segment gap fill
      if (i > 0) {
        var prev = snake[i - 1];
        // Draw connecting segment to prevent visual gaps on fast turns
        ctx.fillStyle = 'rgb(' + Math.floor((r + 30) / 2) + ',' + Math.floor((g + 160) / 2) + ',' + Math.floor((b + 30) / 2) + ')';
        if (seg.col !== prev.col || seg.row !== prev.row) {
          // just ensure they connect - the grid-based approach handles this visually
        }
      }

      // Eyes on head
      if (i === 0) {
        ctx.fillStyle = '#fff';
        var es = 4; // eye size
        if (dir.col === 1) { // right
          ctx.fillRect(sx + gridSize - es - 2, sy + 3, es, es);
          ctx.fillRect(sx + gridSize - es - 2, sy + gridSize - es - 3, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + gridSize - es - 1, sy + 4, 2, 2);
          ctx.fillRect(sx + gridSize - es - 1, sy + gridSize - es - 2, 2, 2);
        } else if (dir.col === -1) { // left
          ctx.fillRect(sx + 2, sy + 3, es, es);
          ctx.fillRect(sx + 2, sy + gridSize - es - 3, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 3, sy + 4, 2, 2);
          ctx.fillRect(sx + 3, sy + gridSize - es - 2, 2, 2);
        } else if (dir.row === -1) { // up
          ctx.fillRect(sx + 3, sy + 2, es, es);
          ctx.fillRect(sx + gridSize - es - 3, sy + 2, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 4, sy + 3, 2, 2);
          ctx.fillRect(sx + gridSize - es - 2, sy + 3, 2, 2);
        } else { // down
          ctx.fillRect(sx + 3, sy + gridSize - es - 2, es, es);
          ctx.fillRect(sx + gridSize - es - 3, sy + gridSize - es - 2, es, es);
          ctx.fillStyle = '#000';
          ctx.fillRect(sx + 4, sy + gridSize - es - 1, 2, 2);
          ctx.fillRect(sx + gridSize - es - 2, sy + gridSize - es - 1, 2, 2);
        }
      }
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
    E.text(ls, E.W / 2, 8, 8, '#ff6666', 'center');

    // Size indicator
    E.text('SIZE: ' + snake.length, 8, 20, 7, '#6688aa');

    // Overlays
    var cx = E.W / 2, cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('SNAKE EVOLVED', cx, 50, 16, '#44ff88', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 85, 10, '#ffaa00', '#000');
      E.textCenter('← → ↑ ↓ to move', cx, 135, 8, '#aaa');
      E.textCenter('Eat ' + targetFood + ' fruits to clear!', cx, 160, 8, '#ff8844');
      E.textCenter('Avoid walls, self, and obstacles', cx, 185, 7, '#aaa');
      E.textCenter('P to pause', cx, 205, 7, '#666');
      E.textCenter('PRESS ENTER TO START', cx, 250, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('GAME OVER', cx, cy - 45, 16, '#ff4444', '#000');
      E.textCenterShadow('SCORE: ' + E.getScore(), cx, cy - 5, 10, '#ffaa00', '#000');
      E.textCenterShadow('SIZE: ' + snake.length, cx, cy + 15, 8, '#88aacc', '#000');
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

  window.SnakeEvolved = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
