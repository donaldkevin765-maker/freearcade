/**
 * Maze Runner — Navigate procedurally generated mazes with increasing difficulty
 * Uses FreeArcadeEngine via `game.engine` object
 */
(function () {
  'use strict';

  var E; // engine reference

  var maze, player, goal, cellSize;
  var cols, rows;
  var state = 'ready';  // ready | playing | gameover | levelComplete
  var level = 1;
  var moveTimer = 0;
  var moveDelay = 0.15;
  var timeElapsed = 0;
  var trail = [];

  function init() {
    E = this.engine;
    level = E.getLevel();
    timeElapsed = 0;
    trail = [];

    // Maze gets bigger and more complex with levels
    cols = 10 + level * 2;
    rows = 8 + level * 2;
    cols = Math.min(cols, 30);
    rows = Math.min(rows, 24);
    cellSize = Math.min(Math.floor(E.W / cols), Math.floor((E.H - 60) / rows));
    cellSize = Math.max(cellSize, 12);

    var mazeW = cols * cellSize;
    var mazeH = rows * cellSize;
    var offsetX = Math.floor((E.W - mazeW) / 2);
    var offsetY = Math.floor((E.H - 60 - mazeH) / 2) + 30;

    maze = generateMaze(cols, rows);

    // Convert to pixel coords
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = maze[r][c];
        cell.x = offsetX + c * cellSize;
        cell.y = offsetY + r * cellSize;
      }
    }

    // Player start (0,0)
    player = {
      col: 0, row: 0,
      x: maze[0][0].x,
      y: maze[0][0].y,
      size: cellSize * 0.6
    };

    // Goal (cols-1, rows-1)
    var goalCell = maze[rows - 1][cols - 1];
    goal = {
      col: cols - 1,
      row: rows - 1,
      x: goalCell.x,
      y: goalCell.y
    };

    // Ensure a solution exists (our generator guarantees it)
    state = 'ready';
    moveTimer = 0;
    E.setScore(0);
    E.setLives(3);
  }

  // ── Maze Generation (Recursive Backtracker) ──
  function generateMaze(c, r) {
    // Initialize grid with all walls
    var grid = [];
    for (var row = 0; row < r; row++) {
      grid[row] = [];
      for (var col = 0; col < c; col++) {
        grid[row][col] = {
          col: col, row: row,
          top: true, right: true, bottom: true, left: true,
          visited: false
        };
      }
    }

    // Recursive backtracker
    var stack = [];
    var current = grid[0][0];
    current.visited = true;

    function getUnvisitedNeighbors(cell) {
      var n = [];
      var dirs = [
        { dr: -1, dc: 0, wall: 'top', opp: 'bottom' },
        { dr: 1, dc: 0, wall: 'bottom', opp: 'top' },
        { dr: 0, dc: -1, wall: 'left', opp: 'right' },
        { dr: 0, dc: 1, wall: 'right', opp: 'left' }
      ];
      for (var d = 0; d < dirs.length; d++) {
        var nr = cell.row + dirs[d].dr;
        var nc = cell.col + dirs[d].dc;
        if (nr >= 0 && nr < r && nc >= 0 && nc < c && !grid[nr][nc].visited) {
          n.push({ cell: grid[nr][nc], wall: dirs[d].wall, opp: dirs[d].opp });
        }
      }
      return n;
    }

    do {
      var neighbors = getUnvisitedNeighbors(current);
      if (neighbors.length > 0) {
        var idx = Math.floor(Math.random() * neighbors.length);
        var next = neighbors[idx];
        // Remove wall
        current[next.wall] = false;
        next.cell[next.opp] = false;
        next.cell.visited = true;
        stack.push(current);
        current = next.cell;
      } else {
        current = stack.pop();
      }
    } while (current);

    // Add extra openings for variety (harder levels = fewer extra openings)
    var extraOpenings = Math.max(0, Math.floor(cols * rows * (0.05 - level * 0.003)));
    for (var e = 0; e < extraOpenings; e++) {
      var rr = Math.floor(Math.random() * r);
      var cc = Math.floor(Math.random() * c);
      var dirs = [
        { dr: -1, dc: 0, wall: 'top' },
        { dr: 1, dc: 0, wall: 'bottom' },
        { dr: 0, dc: -1, wall: 'left' },
        { dr: 0, dc: 1, wall: 'right' }
      ];
      var dir = dirs[Math.floor(Math.random() * 4)];
      var nr = rr + dir.dr;
      var nc = cc + dir.dc;
      if (nr >= 0 && nr < r && nc >= 0 && nc < c) {
        grid[rr][cc][dir.wall] = false;
      }
    }

    return grid;
  }

  function update(dt, input) {
    timeElapsed += dt;

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
        E.setLevel(level + 1);
        init();
        state = 'playing';
        E.playCoin();
      }
      return;
    }

    // ── Playing ──
    moveTimer -= dt;
    if (moveTimer > 0) return;

    var cell = maze[player.row][player.col];
    var moved = false;

    if (input.left && !cell.left) {
      player.col--;
      moved = true;
    } else if (input.right && !cell.right) {
      player.col++;
      moved = true;
    } else if (input.up && !cell.top) {
      player.row--;
      moved = true;
    } else if (input.down && !cell.bottom) {
      player.row++;
      moved = true;
    }

    if (moved) {
      player.x = maze[player.row][player.col].x;
      player.y = maze[player.row][player.col].y;
      trail.push({ x: player.x, y: player.y });
      if (trail.length > 50) trail.shift();
      moveTimer = moveDelay;
      E.playBeep(400 + player.col * 20, 0.04, 'square', 0.04);

      // Check goal
      if (player.col === goal.col && player.row === goal.row) {
        state = 'levelComplete';
        E.playLevelUp();
        E.addScore(Math.max(100, 500 - Math.floor(timeElapsed) * 5));
      }
    }
  }

  function render(ctx) {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, E.W, E.H);

    if (!maze || maze.length === 0) return;

    var cell = maze[0][0];
    var offsetX = cell.x;
    var offsetY = cell.y;

    // Draw maze
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = maze[r][c];
        var x = cell.x;
        var y = cell.y;
        var s = cellSize;

        // Cell background
        var isVisited = (r < player.row || (r === player.row && c < player.col)) ||
                        trail.some(function(t) { return Math.abs(t.x - x) < 2 && Math.abs(t.y - y) < 2; });
        ctx.fillStyle = isVisited ? 'rgba(0,40,80,0.2)' : 'rgba(10,10,30,0.5)';
        ctx.fillRect(x, y, s, s);

        // Walls
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2;
        if (cell.top)    drawWall(x, y, x + s, y);
        if (cell.bottom) drawWall(x, y + s, x + s, y + s);
        if (cell.left)   drawWall(x, y, x, y + s);
        if (cell.right)  drawWall(x + s, y, x + s, y + s);
      }
    }

    // Trail
    for (var i = 0; i < trail.length; i++) {
      var a = i / trail.length * 0.5;
      ctx.globalAlpha = a;
      E.rect(trail[i].x + cellSize * 0.15, trail[i].y + cellSize * 0.15,
             cellSize * 0.7, cellSize * 0.7, '#004488');
    }
    ctx.globalAlpha = 1;

    // Goal
    var gx = goal.x;
    var gy = goal.y;
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 300) * 0.3;
    E.rect(gx + 4, gy + 4, cellSize - 8, cellSize - 8, '#00ff88');
    ctx.globalAlpha = 1;

    // Player
    var px = player.x + (cellSize - player.size) / 2;
    var py = player.y + (cellSize - player.size) / 2;
    E.rect(px, py, player.size, player.size, '#ffdd00');
    // Direction indicator
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(px + 2, py + 2, player.size - 4, 3);

    // HUD
    E.text('LABYRINTH LEVEL ' + level, 10, 8, 8, '#00ff88');
    E.text('TIME: ' + Math.floor(timeElapsed) + 's', E.W - 10, 8, 8, '#ffaa00', 'right');
    E.text('SIZE: ' + cols + 'x' + rows, 10, 22, 7, '#6688aa');

    // Overlays
    var cx = E.W / 2;
    var cy = E.H / 2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('MAZE RUNNER', cx, 80, 18, '#44aaff', '#000');
      E.textShadow('LEVEL ' + level, cx, 120, 12, '#ffaa00', '#000');
      E.text('← → ↑ ↓ to move', cx, 180, 9, '#aaa', 'center');
      E.text('Find the exit ' + ('→'), cx, 210, 9, '#00ff88', 'center');
      E.text('PRESS ENTER TO START', cx, 260, 10, '#00ff88', 'center');
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('GAME OVER', cx, cy - 40, 18, '#ff4444', '#000');
      E.textShadow('TIME: ' + Math.floor(timeElapsed) + 's', cx, cy + 10, 10, '#ffaa00', '#000');
      E.text('PRESS ENTER TO RETRY', cx, cy + 50, 9, '#aaa', 'center');
    }

    if (state === 'levelComplete') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textShadow('MAZE CLEAR!', cx, cy - 40, 16, '#00ff88', '#000');
      E.textShadow('TIME: ' + Math.floor(timeElapsed) + 's', cx, cy, 10, '#ffaa00', '#000');
      E.textShadow('+ SCORE', cx, cy + 20, 10, '#ffaa00', '#000');
      E.text('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 60, 9, '#aaa', 'center');
    }
  }

  function drawWall(x1, y1, x2, y2) {
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
