/**
 * Maze Runner — Navigate procedurally generated mazes with a chase enemy
 *
 * Uses FreeArcadeEngine via `this.engine` in init()
 *
 * Features:
 *  - Recursive backtracker maze generation (always solvable)
 *  - Ghost enemy chases player after a brief delay — creates urgency
 *  - Fog of war: only visited cells visible on minimap
 *  - Direction indicator on player
 *  - Step counter and time tracker in HUD
 *  - Exit indicator arrow when near
 *  - Visited cell trail with gradient
 *  - Progressive difficulty: bigger mazes, faster ghost
 */
(function () {
  'use strict';

  var E;
  var maze, player, goal, ghost;
  var cellSize, cols, rows;
  var offsetX, offsetY;
  var state; // 'ready' | 'playing' | 'gameover' | 'levelComplete'
  var level;
  var moveTimer, moveDelay;
  var timeElapsed, steps;
  var ghostActive, ghostReleaseTime;

  // Fog: track which cells the player has visited
  var visited;

  function init() {
    E = this.engine;
    level = E.getLevel();

    // Maze size scales with level, but slower than before
    cols = 8 + level * 1;
    rows = 6 + level * 1;
    cols = Math.min(cols, 28);
    rows = Math.min(rows, 22);
    cols = Math.max(cols, 8);
    rows = Math.max(rows, 6);

    cellSize = Math.min(Math.floor((E.W - 20) / cols), Math.floor((E.H - 60) / rows));
    cellSize = Math.max(cellSize, 14);

    var mazeW = cols * cellSize;
    var mazeH = rows * cellSize;
    offsetX = Math.floor((E.W - mazeW) / 2);
    offsetY = Math.floor((E.H - 60 - mazeH) / 2) + 30;

    maze = generateMaze(cols, rows);

    // Pixel coordinates for cells
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        maze[r][c].px = offsetX + c * cellSize;
        maze[r][c].py = offsetY + r * cellSize;
      }
    }

    // Player start
    player = { col: 0, row: 0 };
    // Goal
    goal = { col: cols - 1, row: rows - 1 };

    // Visited cells (fog of war)
    visited = [];
    for (var r = 0; r < rows; r++) {
      visited[r] = [];
      for (var c = 0; c < cols; c++) visited[r][c] = false;
    }
    visited[0][0] = true;

    // Ghost starts at player position but doesn't move initially
    ghost = { col: 0, row: 0, active: false, delay: Math.max(5, 12 - level) };

    state = 'ready';
    moveTimer = 0;
    moveDelay = 0.12;
    timeElapsed = 0;
    steps = 0;
    ghostActive = false;
    ghostReleaseTime = 0;

    E.setScore(0);
    E.setLives(3);
  }

  // ── Maze Generation (Recursive Backtracker) ──
  function generateMaze(c, r) {
    var grid = [];
    for (var row = 0; row < r; row++) {
      grid[row] = [];
      for (var col = 0; col < c; col++) {
        grid[row][col] = {
          col: col, row: row,
          top: true, right: true, bottom: true, left: true,
          visited: false, px: 0, py: 0
        };
      }
    }

    var stack = [];
    var current = grid[0][0];
    current.visited = true;

    var dirs = [
      { dr: -1, dc: 0, wall: 'top', opp: 'bottom' },
      { dr: 1,  dc: 0, wall: 'bottom', opp: 'top' },
      { dr: 0,  dc: -1, wall: 'left', opp: 'right' },
      { dr: 0,  dc: 1, wall: 'right', opp: 'left' }
    ];

    do {
      var neighbors = [];
      for (var d = 0; d < dirs.length; d++) {
        var nr = current.row + dirs[d].dr;
        var nc = current.col + dirs[d].dc;
        if (nr >= 0 && nr < r && nc >= 0 && nc < c && !grid[nr][nc].visited) {
          neighbors.push({ cell: grid[nr][nc], wall: dirs[d].wall, opp: dirs[d].opp });
        }
      }

      if (neighbors.length > 0) {
        var idx = Math.floor(Math.random() * neighbors.length);
        var next = neighbors[idx];
        current[next.wall] = false;
        next.cell[next.opp] = false;
        next.cell.visited = true;
        stack.push(current);
        current = next.cell;
      } else {
        current = stack.pop();
      }
    } while (current);

    return grid;
  }

  // ── Ghost pathfinding (greedy BFS toward player) ──
  function moveGhost() {
    if (!ghost.active) return;

    // Simple greedy: move toward player along accessible paths
    var g = maze[ghost.row][ghost.col];
    var bestDir = null;
    var bestDist = Infinity;

    var candidates = [
      { dr: -1, dc: 0, wall: 'top' },
      { dr: 1,  dc: 0, wall: 'bottom' },
      { dr: 0,  dc: -1, wall: 'left' },
      { dr: 0,  dc: 1, wall: 'right' }
    ];

    for (var d = 0; d < candidates.length; d++) {
      var dir = candidates[d];
      if (g[dir.wall]) continue; // wall blocks ghost too
      var nr = ghost.row + dir.dr;
      var nc = ghost.col + dir.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      var dist = Math.abs(nr - player.row) + Math.abs(nc - player.col);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }

    if (bestDir) {
      ghost.row += bestDir.dr;
      ghost.col += bestDir.dc;
    }
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) <= 1;
  }

  // ── Update ──
  function update(dt, input) {
    timeElapsed += dt;

    // State screens
    if (state === 'ready') {
      if (input.action) {
        state = 'playing';
        ghostReleaseTime = timeElapsed + ghost.delay;
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      if (input.action) {
        E.setLevel(1);
        init.call({ engine: E });
        state = 'playing';
        ghostReleaseTime = timeElapsed + ghost.delay;
        E.playCoin();
      }
      return;
    }

    if (state === 'levelComplete') {
      if (input.action) {
        E.setLevel(level + 1);
        init.call({ engine: E });
        state = 'playing';
        ghostReleaseTime = timeElapsed + ghost.delay;
        E.playCoin();
      }
      return;
    }

    // ── PLAYING ──

    // Ghost activation
    if (!ghostActive && timeElapsed >= ghostReleaseTime) {
      ghostActive = true;
      ghost.active = true;
      E.playBeep(300, 0.15, 'sawtooth', 0.1);
      E.playBeep(200, 0.2, 'sawtooth', 0.12);
    }

    // Move ghost (every N seconds, speed scales with level)
    if (ghostActive) {
      var ghostInterval = Math.max(0.15, 0.5 - level * 0.025);
      ghostReleaseTime -= dt;
      if (ghostReleaseTime <= 0) {
        moveGhost();
        ghostReleaseTime = ghostInterval;

        // Check ghost catch
        if (isAdjacent(ghost, player)) {
          if (!E.loseLife()) {
            state = 'gameover';
            E.playGameOver();
            return;
          }
          // Ghost reset
          ghost.col = 0;
          ghost.row = 0;
          ghostReleaseTime = ghost.delay * 0.5;
          ghostActive = false;
          E.playExplode();
          E.shake(5, 0.3);
        }
      }
    }

    // Player movement on timer
    moveTimer -= dt;
    if (moveTimer > 0) return;

    var moved = false;

    if (input.left && !maze[player.row][player.col].left) {
      player.col--; moved = true;
    } else if (input.right && !maze[player.row][player.col].right) {
      player.col++; moved = true;
    } else if (input.up && !maze[player.row][player.col].top) {
      player.row--; moved = true;
    } else if (input.down && !maze[player.row][player.col].bottom) {
      player.row++; moved = true;
    }

    if (moved) {
      steps++;
      visited[player.row][player.col] = true;
      moveTimer = moveDelay;
      E.playBeep(500 + player.col * 10, 0.03, 'square', 0.03);

      // Win check
      if (player.col === goal.col && player.row === goal.row) {
        state = 'levelComplete';
        E.playLevelUp();
        var timeBonus = Math.max(0, 300 - Math.floor(timeElapsed) * 3);
        E.addScore(200 + timeBonus);
      }
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    if (!maze || maze.length === 0) return;

    // Draw maze
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = maze[r][c];
        var x = cell.px;
        var y = cell.py;

        // Cell background — visited or not
        if (visited[r][c]) {
          // Gradient: recently visited = brighter
          var dist = Math.abs(r - player.row) + Math.abs(c - player.col);
          var brightness = Math.max(0.1, 1 - dist * 0.04);
          ctx.fillStyle = 'rgba(0,60,120,' + brightness * 0.3 + ')';
        } else {
          ctx.fillStyle = 'rgba(10,10,25,0.6)';
        }
        ctx.fillRect(x, y, cellSize, cellSize);

        // Walls
        ctx.strokeStyle = visited[r][c] ? '#4488ff' : '#224466';
        ctx.lineWidth = 2;
        if (cell.top)    drawLine(x, y, x + cellSize, y);
        if (cell.bottom) drawLine(x, y + cellSize, x + cellSize, y + cellSize);
        if (cell.left)   drawLine(x, y, x, y + cellSize);
        if (cell.right)  drawLine(x + cellSize, y, x + cellSize, y + cellSize);
      }
    }

    // Trail (visited cells that aren't current)
    ctx.fillStyle = 'rgba(0,100,200,0.08)';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (visited[r][c] && !(r === player.row && c === player.col)) {
          ctx.fillRect(maze[r][c].px + 2, maze[r][c].py + 2, cellSize - 4, cellSize - 4);
        }
      }
    }

    // Ghost
    if (ghost.active) {
      var gx = maze[ghost.row][ghost.col].px;
      var gy = maze[ghost.row][ghost.col].py;
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
      ctx.fillStyle = '#ff2244';
      ctx.beginPath();
      ctx.arc(gx + cellSize / 2, gy + cellSize / 2, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Ghost eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(gx + cellSize * 0.25, gy + cellSize * 0.25, cellSize * 0.15, cellSize * 0.15);
      ctx.fillRect(gx + cellSize * 0.6, gy + cellSize * 0.25, cellSize * 0.15, cellSize * 0.15);
      ctx.fillStyle = '#000';
      ctx.fillRect(gx + cellSize * 0.3, gy + cellSize * 0.3, cellSize * 0.08, cellSize * 0.1);
      ctx.fillRect(gx + cellSize * 0.65, gy + cellSize * 0.3, cellSize * 0.08, cellSize * 0.1);
      ctx.globalAlpha = 1;
    }

    // Goal
    var gx = goal.col, gy = goal.row;
    var gpx = maze[gy][gx].px;
    var gpy = maze[gy][gx].py;
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 300) * 0.3;
    ctx.fillRect(gpx + 3, gpy + 3, cellSize - 6, cellSize - 6);
    ctx.globalAlpha = 1;
    // Goal indicator
    E.textCenter('★', gpx + cellSize / 2, gpy + cellSize / 2 - 5, 12, '#00ff88');

    // Player
    var ppx = maze[player.row][player.col].px;
    var ppy = maze[player.row][player.col].py;
    ctx.fillStyle = '#ffdd00';
    var pad = cellSize * 0.15;
    ctx.fillRect(ppx + pad, ppy + pad, cellSize - pad * 2, cellSize - pad * 2);
    // Direction indicator (triangle in the direction the player last moved)
    ctx.fillStyle = '#ff8800';

    // Distance to goal hint
    var distToGoal = Math.abs(player.col - goal.col) + Math.abs(player.row - goal.row);
    if (distToGoal <= 5) {
      // Arrow pointing to goal
      var dx = goal.col - player.col;
      var dy = goal.row - player.row;
      var angle = Math.atan2(dy, dx);
      var ax = ppx + cellSize / 2 + Math.cos(angle) * cellSize * 0.5;
      var ay = ppy + cellSize / 2 + Math.sin(angle) * cellSize * 0.5;
      ctx.fillStyle = 'rgba(0,255,136,' + (0.3 + Math.sin(Date.now() / 200) * 0.2) + ')';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶', ax, ay);
    }

    // Minimap (top-right corner)
    var mapScale = 3;
    var mapW = cols * mapScale;
    var mapH = rows * mapScale;
    var mapX = E.W - mapW - 8;
    var mapY = 8;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mapX - 2, mapY - 2, mapW + 4, mapH + 4);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var mx = mapX + c * mapScale;
        var my = mapY + r * mapScale;
        if (visited[r][c]) {
          ctx.fillStyle = 'rgba(0,100,200,0.3)';
          ctx.fillRect(mx, my, mapScale, mapScale);
        }
        // Walls
        var cell = maze[r][c];
        ctx.strokeStyle = 'rgba(68,136,255,0.3)';
        ctx.lineWidth = 0.5;
        if (cell.top)    { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + mapScale, my); ctx.stroke(); }
        if (cell.bottom) { ctx.beginPath(); ctx.moveTo(mx, my + mapScale); ctx.lineTo(mx + mapScale, my + mapScale); ctx.stroke(); }
        if (cell.left)   { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my + mapScale); ctx.stroke(); }
        if (cell.right)  { ctx.beginPath(); ctx.moveTo(mx + mapScale, my); ctx.lineTo(mx + mapScale, my + mapScale); ctx.stroke(); }
      }
    }

    // Minimap player (blinking)
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(mapX + player.col * mapScale, mapY + player.row * mapScale, mapScale, mapScale);

    // Minimap goal
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(mapX + goal.col * mapScale, mapY + goal.row * mapScale, mapScale, mapScale);

    // Minimap ghost
    if (ghost.active) {
      ctx.fillStyle = '#ff2244';
      ctx.fillRect(mapX + ghost.col * mapScale, mapY + ghost.row * mapScale, mapScale, mapScale);
    }

    // HUD
    E.text('LABYRINTH LV ' + level, 8, 8, 8, '#00ff88');
    E.text('STEPS: ' + steps, 8, 22, 7, '#88aacc');
    E.text('TIME: ' + Math.floor(timeElapsed) + 's', 8, 34, 7, '#88aacc');

    // Ghost warning
    if (ghostActive) {
      var ghostDist = Math.abs(player.col - ghost.col) + Math.abs(player.row - ghost.row);
      if (ghostDist <= 3) {
        var pulse = 0.5 + Math.sin(Date.now() / 150) * 0.4;
        E.textCenter('⚠ GHOST NEARBY', E.W / 2, E.H - 16, 7,
          'rgba(255,50,50,' + pulse + ')');
      }
    } else if (state === 'playing') {
      var timeLeft = Math.max(0, Math.ceil(ghostReleaseTime - timeElapsed));
      if (timeLeft <= 3) {
        E.textCenter('⚠ ' + timeLeft, E.W / 2, E.H - 16, 10, '#ff4444');
      }
    }

    // Overlays
    var cx = E.W / 2, cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('MAZE RUNNER', cx, 70, 18, '#44aaff', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 105, 12, '#ffaa00', '#000');
      E.textCenter('← → ↑ ↓ to move', cx, 160, 9, '#aaa');
      E.textCenter('Find the exit ★', cx, 185, 9, '#00ff88');
      E.textCenter('A ghost will chase you!', cx, 210, 8, '#ff4444');
      E.textCenter('P to pause', cx, 230, 7, '#666');
      E.textCenter('PRESS ENTER TO START', cx, 270, 10, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('CAUGHT!', cx, cy - 45, 20, '#ff4444', '#000');
      E.textCenterShadow('STEPS: ' + steps, cx, cy - 5, 10, '#ffaa00', '#000');
      E.textCenterShadow('TIME: ' + Math.floor(timeElapsed) + 's', cx, cy + 15, 9, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 55, 9, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('MAZE CLEAR!', cx, cy - 45, 16, '#00ff88', '#000');
      E.textCenterShadow('STEPS: ' + steps, cx, cy - 5, 10, '#ffaa00', '#000');
      E.textCenterShadow('TIME: ' + Math.floor(timeElapsed) + 's', cx, cy + 15, 9, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 55, 9, '#aaa');
    }
  }

  function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function destroy() {}

  window.MazeRunner = {
    init: init,
    update: update,
    render: render,
    destroy: destroy
  };
})();
