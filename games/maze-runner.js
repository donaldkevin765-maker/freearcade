/**
 * Maze Runner — infinite procedural mazes with ghost chase + best time tracking
 *
 * Features for long sessions:
 *  - Infinite procedural mazes (never repeats)
 *  - Best completion time tracked per-session and per-level
 *  - Ghost chase activates faster at higher levels
 *  - Maze size scales infinitely but stays manageable
 */
(function () {
  'use strict';

  var E;
  var maze, player, goal, ghost;
  var cellSize, cols, rows;
  var offsetX, offsetY;
  var state;
  var level;
  var moveTimer, moveDelay;
  var timeElapsed, steps;
  var ghostActive, ghostReleaseTime, ghostMoveTimer;
  var visited;
  var hintShown = false;

  function init() {
    E = this.engine;
    level = E.getLevel();

    cols = Math.min(8 + level, 30);
    rows = Math.min(6 + level, 24);
    cols = Math.max(cols, 8);
    rows = Math.max(rows, 6);

    cellSize = Math.min(Math.floor((E.W - 20) / cols), Math.floor((E.H - 60) / rows));
    cellSize = Math.max(cellSize, 12);

    var mW = cols * cellSize;
    var mH = rows * cellSize;
    offsetX = Math.floor((E.W - mW) / 2);
    offsetY = Math.floor((E.H - 60 - mH) / 2) + 30;

    maze = generateMaze(cols, rows);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        maze[r][c].px = offsetX + c * cellSize;
        maze[r][c].py = offsetY + r * cellSize;
      }
    }

    player = { col: 0, row: 0 };
    goal = { col: cols - 1, row: rows - 1 };

    visited = [];
    for (var r = 0; r < rows; r++) {
      visited[r] = [];
      for (var c = 0; c < cols; c++) visited[r][c] = false;
    }
    visited[0][0] = true;

    ghost = { col: 0, row: 0, active: false };

    state = 'ready';
    moveTimer = 0;
    moveDelay = 0.12;
    timeElapsed = 0;
    steps = 0;
    ghostActive = false;
    ghostReleaseTime = 0;
    ghostMoveTimer = 0;
    hintShown = false;

    E.setScore(0);
    E.setLives(3);
  }

  function generateMaze(c, r) {
    var grid = [];
    for (var row = 0; row < r; row++) {
      grid[row] = [];
      for (var col = 0; col < c; col++) {
        grid[row][col] = { col: col, row: row, top: true, right: true, bottom: true, left: true, visited: false, px: 0, py: 0 };
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

  function moveGhost() {
    if (!ghost.active) return;
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
      if (g[dir.wall]) continue;
      var nr = ghost.row + dir.dr;
      var nc = ghost.col + dir.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      var dist = Math.abs(nr - player.row) + Math.abs(nc - player.col);
      if (dist < bestDist) { bestDist = dist; bestDir = dir; }
    }
    if (bestDir) { ghost.row += bestDir.dr; ghost.col += bestDir.dc; }
  }

  // ── Update ──
  function update(dt, input) {
    timeElapsed += dt;

    if (state === 'ready') {
      if (input.action) {
        state = 'playing';
        ghostReleaseTime = Math.max(4, 12 - level); // ghost comes faster at higher levels
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      try {
        window.FreeArcadeSave.setBestMazeTime(timeElapsed);
        window.FreeArcadeSave.incrementStat('totalMazesCompleted');
      } catch (e) {}
      if (input.action) {
        E.setLevel(1);
        init.call({ engine: E });
        state = 'playing';
        ghostReleaseTime = Math.max(4, 12 - level);
        E.playCoin();
      }
      return;
    }

    if (state === 'levelComplete') {
      try {
        window.FreeArcadeSave.setBestMazeTime(timeElapsed);
      } catch (e) {}
      if (input.action) {
        E.setLevel(level + 1);
        init.call({ engine: E });
        state = 'playing';
        ghostReleaseTime = Math.max(4, 12 - level);
        E.playCoin();
      }
      return;
    }

    // ── PLAYING ──

    if (!ghostActive && timeElapsed >= ghostReleaseTime) {
      ghostActive = true;
      ghost.active = true;
      ghostMoveTimer = 0;
      E.playBeep(300, 0.15, 'sawtooth', 0.1);
      E.playBeep(200, 0.2, 'sawtooth', 0.12);
    }

    if (ghostActive) {
      var interval = Math.max(0.12, 0.5 - level * 0.02);
      ghostMoveTimer -= dt;
      if (ghostMoveTimer <= 0) {
        moveGhost();
        ghostMoveTimer = interval;
        if (Math.abs(player.col - ghost.col) + Math.abs(player.row - ghost.row) <= 1) {
          if (!E.loseLife()) {
            state = 'gameover';
            E.playGameOver();
            return;
          }
          ghost.col = 0; ghost.row = 0;
          ghostActive = false;
          ghostReleaseTime = timeElapsed + Math.max(3, 8 - level);
          E.playExplode();
          E.shake(5, 0.3);
        }
      }
    }

    moveTimer -= dt;
    if (moveTimer > 0) return;

    var moved = false;
    if (input.left && !maze[player.row][player.col].left) { player.col--; moved = true; }
    else if (input.right && !maze[player.row][player.col].right) { player.col++; moved = true; }
    else if (input.up && !maze[player.row][player.col].top) { player.row--; moved = true; }
    else if (input.down && !maze[player.row][player.col].bottom) { player.row++; moved = true; }

    if (moved) {
      steps++;
      visited[player.row][player.col] = true;
      moveTimer = moveDelay;
      E.playBeep(500 + player.col * 8, 0.025, 'square', 0.025);
      if (player.col === goal.col && player.row === goal.row) {
        state = 'levelComplete';
        E.playLevelUp();
        var bonus = Math.max(0, 300 - timeElapsed * 2);
        E.addScore(200 + Math.floor(bonus));
      }
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);
    if (!maze || maze.length === 0) return;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = maze[r][c];
        var x = cell.px, y = cell.py;
        if (visited[r][c]) {
          var dist = Math.abs(r - player.row) + Math.abs(c - player.col);
          ctx.fillStyle = 'rgba(0,60,120,' + Math.max(0.08, 1 - dist * 0.04) * 0.3 + ')';
        } else ctx.fillStyle = 'rgba(10,10,25,0.6)';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = visited[r][c] ? '#4488ff' : '#112244';
        ctx.lineWidth = 1.5;
        if (cell.top)    drawLine(x, y, x + cellSize, y);
        if (cell.bottom) drawLine(x, y + cellSize, x + cellSize, y + cellSize);
        if (cell.left)   drawLine(x, y, x, y + cellSize);
        if (cell.right)  drawLine(x + cellSize, y, x + cellSize, y + cellSize);
      }
    }

    // Ghost
    if (ghost.active) {
      var gp = maze[ghost.row][ghost.col];
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 180) * 0.3;
      ctx.fillStyle = '#ff2244';
      ctx.beginPath();
      ctx.arc(gp.px + cellSize / 2, gp.py + cellSize / 2, cellSize * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(gp.px + cellSize * 0.22, gp.py + cellSize * 0.22, cellSize * 0.16, cellSize * 0.16);
      ctx.fillRect(gp.px + cellSize * 0.62, gp.py + cellSize * 0.22, cellSize * 0.16, cellSize * 0.16);
      ctx.fillStyle = '#000';
      ctx.fillRect(gp.px + cellSize * 0.27, gp.py + cellSize * 0.27, cellSize * 0.08, cellSize * 0.1);
      ctx.fillRect(gp.px + cellSize * 0.67, gp.py + cellSize * 0.27, cellSize * 0.08, cellSize * 0.1);
      ctx.globalAlpha = 1;
    }

    // Goal
    var gx = maze[goal.row][goal.col].px;
    var gy = maze[goal.row][goal.col].py;
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.25;
    ctx.fillRect(gx + 3, gy + 3, cellSize - 6, cellSize - 6);
    ctx.globalAlpha = 1;
    E.textCenter('★', gx + cellSize / 2, gy + cellSize / 2 - 5, 11, '#00ff88');

    // Player
    var pp = maze[player.row][player.col];
    var pad = cellSize * 0.15;
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(pp.px + pad, pp.py + pad, cellSize - pad * 2, cellSize - pad * 2);
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(pp.px + pad + 2, pp.py + pad + 2, cellSize - pad * 2 - 4, 2);

    // Hint arrow near goal
    var dg = Math.abs(player.col - goal.col) + Math.abs(player.row - goal.row);
    if (dg <= 4) {
      var ang = Math.atan2(goal.row - player.row, goal.col - player.col);
      var ax = pp.px + cellSize / 2 + Math.cos(ang) * cellSize * 0.45;
      var ay = pp.py + cellSize / 2 + Math.sin(ang) * cellSize * 0.45;
      ctx.fillStyle = 'rgba(0,255,136,' + (0.3 + Math.sin(Date.now() / 180) * 0.2) + ')';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶', ax, ay);
    }

    // Minimap
    var ms = 3;
    var mw = cols * ms, mh = rows * ms;
    var mx = E.W - mw - 8, my = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (visited[r][c]) {
          ctx.fillStyle = 'rgba(0,100,200,0.25)';
          ctx.fillRect(mx + c * ms, my + r * ms, ms, ms);
        }
        var mc = maze[r][c];
        ctx.strokeStyle = 'rgba(68,136,255,0.25)';
        ctx.lineWidth = 0.5;
        if (mc.top)    { ctx.beginPath(); ctx.moveTo(mx + c * ms, my + r * ms); ctx.lineTo(mx + (c + 1) * ms, my + r * ms); ctx.stroke(); }
        if (mc.bottom) { ctx.beginPath(); ctx.moveTo(mx + c * ms, my + (r + 1) * ms); ctx.lineTo(mx + (c + 1) * ms, my + (r + 1) * ms); ctx.stroke(); }
        if (mc.left)   { ctx.beginPath(); ctx.moveTo(mx + c * ms, my + r * ms); ctx.lineTo(mx + c * ms, my + (r + 1) * ms); ctx.stroke(); }
        if (mc.right)  { ctx.beginPath(); ctx.moveTo(mx + (c + 1) * ms, my + r * ms); ctx.lineTo(mx + (c + 1) * ms, my + (r + 1) * ms); ctx.stroke(); }
      }
    }
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(mx + player.col * ms, my + player.row * ms, ms, ms);
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(mx + goal.col * ms, my + goal.row * ms, ms, ms);
    if (ghost.active) {
      ctx.fillStyle = '#ff2244';
      ctx.fillRect(mx + ghost.col * ms, my + ghost.row * ms, ms, ms);
    }

    // HUD
    E.text('MAZE LV.' + level + '  ' + cols + 'x' + rows, 8, 8, 7, '#00ff88');
    E.text('STEPS: ' + steps + '  TIME: ' + Math.floor(timeElapsed) + 's', 8, 20, 6, '#88aacc');

    if (ghostActive) {
      var gd = Math.abs(player.col - ghost.col) + Math.abs(player.row - ghost.row);
      if (gd <= 3) {
        E.textCenter('⚠ GHOST', E.W / 2, E.H - 14, 7,
          'rgba(255,50,50,' + (0.5 + Math.sin(Date.now() / 150) * 0.4) + ')');
      }
    } else if (state === 'playing') {
      var left = Math.max(0, Math.ceil(ghostReleaseTime - timeElapsed));
      if (left <= 3) E.textCenter('⚠ ' + left, E.W / 2, E.H - 14, 9, '#ff4444');
    }

    var cx = E.W / 2, cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('MAZE RUNNER', cx, 60, 17, '#44aaff', '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 95, 11, '#ffaa00', '#000');
      E.textCenter('← → ↑ ↓ move · Find ★ exit', cx, 150, 8, '#aaa');
      E.textCenter('Ghost chases after ~' + Math.max(4, 12 - level) + 's', cx, 170, 7, '#ff4444');
      E.textCenter('PRESS ENTER TO START', cx, 230, 9, '#00ff88');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('CAUGHT!', cx, cy - 45, 18, '#ff4444', '#000');
      E.textCenterShadow('STEPS: ' + steps + '  TIME: ' + Math.floor(timeElapsed) + 's', cx, cy - 5, 8, '#ffaa00', '#000');
      E.textCenter('PRESS ENTER TO RETRY', cx, cy + 45, 8, '#aaa');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('MAZE CLEAR!', cx, cy - 45, 14, '#00ff88', '#000');
      E.textCenterShadow('TIME: ' + Math.floor(timeElapsed) + 's  STEPS: ' + steps, cx, cy - 5, 7, '#ffaa00', '#000');
      try {
        var bt = window.FreeArcadeSave.getBestMazeTime();
        if (timeElapsed <= bt || bt >= 999998) E.textCenter('★ BEST TIME ★', cx, cy + 15, 8, '#ffdd00');
      } catch(e) {}
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 50, 8, '#aaa');
    }
  }

  function drawLine(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function destroy() {}

  window.MazeRunner = {
    init: init, update: update, render: render, destroy: destroy
  };
})();
