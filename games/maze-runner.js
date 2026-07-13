/**
 * Maze Runner — infinite procedural mazes with items, themed ghosts & secrets
 *
 * Creative twists:
 *  - Items in maze: speed boost, shield (ghost immunity), reveal map, teleport to goal area
 *  - Ghost types cycle: normal → fast → duplicate → invisible at higher levels
 *  - Keys & gates: collect keys to unlock shortcut gates
 *  - Themed color palettes: fire, ice, forest, void, neon
 *  - Secret treasure rooms (dead ends with bonus coins)
 *  - Better ghost AI with A*-like pathfinding
 *
 * Infinite levels, each unique. Best time saved to localStorage.
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
  var items = [];
  var keys = 0;
  var gates = [];
  var treasures = [];
  var theme;
  var hintShown = false;
  var shieldTimer = 0;
  var revealTimer = 0;
  var ghostType = 0; // 0=normal, 1=fast, 2=duplicate, 3=invisible

  // Theme palettes
  var THEMES = [
    { name: 'Neon',  bg: '#0a0a1a', wallUnvisited: '#112244', wallVisited: '#4488ff', path: '#0a1a3a', ghost: '#ff2244', goal: '#00ff88', player: '#ffdd00', acc: '#44aaff', item: '#ffdd00' },
    { name: 'Fire',  bg: '#1a0808', wallUnvisited: '#442211', wallVisited: '#ff6644', path: '#2a1008', ghost: '#ff8800', goal: '#ffdd00', player: '#ffaa44', acc: '#ff4400', item: '#ff6600' },
    { name: 'Ice',   bg: '#0a1a20', wallUnvisited: '#224466', wallVisited: '#88ddff', path: '#0a1828', ghost: '#4488ff', goal: '#66ffcc', player: '#88ffff', acc: '#00ccff', item: '#44ddff' },
    { name: 'Forest',bg: '#0a180a', wallUnvisited: '#224422', wallVisited: '#44ff66', path: '#0a2008', ghost: '#66ff44', goal: '#ffff44', player: '#88ff88', acc: '#44aa00', item: '#88ff00' },
    { name: 'Void',  bg: '#0a0a0a', wallUnvisited: '#222233', wallVisited: '#8866ff', path: '#0a0a18', ghost: '#ff44ff', goal: '#44ffff', player: '#ffffff', acc: '#6644ff', item: '#ff88ff' },
  ];

  function init() {
    E = this.engine;
    level = E.getLevel();

    theme = THEMES[level % THEMES.length];

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
    for (var r = 0; r < rows; r++) { visited[r] = []; for (var c = 0; c < cols; c++) visited[r][c] = false; }
    visited[0][0] = true;

    ghost = { col: 0, row: 0, active: false };
    ghostType = Math.min(3, Math.floor((level - 1) / 4));

    // Place items (powerups)
    items = [];
    var itemTypes = ['speed', 'shield', 'reveal', 'teleport'];
    var numItems = Math.min(2 + Math.floor(level / 3), 6);
    for (var i = 0; i < numItems; i++) {
      var pos = findFreeCell(2, 2);
      if (pos) items.push({ col: pos.col, row: pos.row, type: itemTypes[i % itemTypes.length], collected: false });
    }

    // Place gates & keys
    keys = 0;
    gates = [];
    if (level > 3) {
      // Place gates in middle area
      var midCol = Math.floor(cols / 2);
      var midRow = Math.floor(rows / 2);
      for (var g = 0; g < Math.min(1 + Math.floor(level / 8), 3); g++) {
        var gc = midCol + (g % 2 === 0 ? -2 : 2) * (1 + Math.floor(g/2));
        var gr = midRow + (g % 2 === 0 ? 2 : -2);
        if (gc >= 1 && gc < cols-1 && gr >= 1 && gr < rows-1) {
          gates.push({ col: gc, row: gr, open: false });
        }
      }
      // Place keys (away from start)
      for (var g = 0; g < gates.length; g++) {
        var kPos = findFreeCell(3, 3);
        if (kPos) items.push({ col: kPos.col, row: kPos.row, type: 'key', collected: false, keyId: g });
      }
    }

    // Place treasures (dead-end rooms with coins)
    treasures = [];
    for (var i = 0; i < 3; i++) {
      var tPos = findDeadEnd();
      if (tPos) treasures.push({ col: tPos.col, row: tPos.row, collected: false });
    }

    state = 'ready';
    moveTimer = 0;
    moveDelay = 0.12;
    timeElapsed = 0;
    steps = 0;
    ghostActive = false;
    ghostReleaseTime = 0;
    ghostMoveTimer = 0;
    hintShown = false;
    shieldTimer = 0;
    revealTimer = 0;

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

  function findFreeCell(minDistFromStart, minDistFromGoal) {
    for (var attempt = 0; attempt < 50; attempt++) {
      var c = 1 + Math.floor(Math.random() * (cols - 2));
      var r = 1 + Math.floor(Math.random() * (rows - 2));
      // Check not too close to start or goal
      if (Math.abs(c - 0) + Math.abs(r - 0) < minDistFromStart) continue;
      if (Math.abs(c - goal.col) + Math.abs(r - goal.row) < minDistFromGoal) continue;
      // Check not occupied by item/gate/treasure
      var occupied = false;
      for (var i = 0; i < items.length; i++) { if (items[i].col === c && items[i].row === r && !items[i].collected) occupied = true; }
      for (var i = 0; i < gates.length; i++) { if (gates[i].col === c && gates[i].row === r) occupied = true; }
      for (var i = 0; i < treasures.length; i++) { if (treasures[i].col === c && treasures[i].row === r) occupied = true; }
      if (!occupied) return { col: c, row: r };
    }
    return null;
  }

  function findDeadEnd() {
    for (var attempt = 0; attempt < 40; attempt++) {
      var c = 2 + Math.floor(Math.random() * (cols - 4));
      var r = 2 + Math.floor(Math.random() * (rows - 4));
      // A dead end has 3 walls
      var cell = maze[r][c];
      var wallCount = (cell.top ? 1 : 0) + (cell.bottom ? 1 : 0) + (cell.left ? 1 : 0) + (cell.right ? 1 : 0);
      if (wallCount >= 3) {
        // Check not occupied
        var occupied = false;
        for (var i = 0; i < items.length; i++) { if (items[i].col === c && items[i].row === r) occupied = true; }
        for (var i = 0; i < gates.length; i++) { if (gates[i].col === c && gates[i].row === r) occupied = true; }
        if (!occupied && !(c === goal.col && r === goal.row) && !(c === 0 && r === 0)) return { col: c, row: r };
      }
    }
    return null;
  }

  // ── Ghost AI: A*-like pathfinding ──
  function pathfindGhost() {
    if (!ghost.active || shieldTimer > 0) return;
    var start = { col: ghost.col, row: ghost.row };
    var end = { col: player.col, row: player.row };

    // Simple BFS to player
    var queue = [start];
    var cameFrom = {};
    var visited = {};
    var key = start.col + ',' + start.row;
    visited[key] = true;

    var maxSteps = cols * rows;
    var found = false;

    while (queue.length > 0 && maxSteps-- > 0) {
      var cur = queue.shift();
      if (cur.col === end.col && cur.row === end.row) { found = true; break; }

      var cell = maze[cur.row][cur.col];
      var dirs = [
        { dr: -1, dc: 0, wall: 'top' },
        { dr: 1,  dc: 0, wall: 'bottom' },
        { dr: 0,  dc: -1, wall: 'left' },
        { dr: 0,  dc: 1, wall: 'right' }
      ];
      for (var d = 0; d < dirs.length; d++) {
        if (cell[dirs[d].wall]) continue;
        var nr = cur.row + dirs[d].dr;
        var nc = cur.col + dirs[d].dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        // Check if cell has an open gate
        var blockedByGate = false;
        for (var g = 0; g < gates.length; g++) {
          if (gates[g].col === nc && gates[g].row === nr && !gates[g].open) blockedByGate = true;
        }
        if (blockedByGate) continue;
        var k = nc + ',' + nr;
        if (!visited[k]) {
          visited[k] = true;
          cameFrom[k] = { col: cur.col, row: cur.row };
          queue.push({ col: nc, row: nr });
        }
      }
    }

    // Reconstruct path
    if (found) {
      var path = [];
      var cur = { col: end.col, row: end.row };
      var k = cur.col + ',' + cur.row;
      while (cameFrom[k]) {
        path.push({ col: cur.col, row: cur.row });
        cur = cameFrom[k];
        k = cur.col + ',' + cur.row;
        if (path.length > 100) break;
      }
      path.reverse();
      if (path.length > 0) {
        var next = path[0];
        ghost.col = next.col;
        ghost.row = next.row;
        return;
      }
    }

    // Fallback: greedy
    var gCell = maze[ghost.row][ghost.col];
    var bestDir = null;
    var bestDist = Infinity;
    var dirs = [
      { dr: -1, dc: 0, wall: 'top' },
      { dr: 1,  dc: 0, wall: 'bottom' },
      { dr: 0,  dc: -1, wall: 'left' },
      { dr: 0,  dc: 1, wall: 'right' }
    ];
    for (var d = 0; d < dirs.length; d++) {
      if (gCell[dirs[d].wall]) continue;
      var nr = ghost.row + dirs[d].dr;
      var nc = ghost.col + dirs[d].dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      var dist = Math.abs(nr - player.row) + Math.abs(nc - player.col);
      if (dist < bestDist) { bestDist = dist; bestDir = dirs[d]; }
    }
    if (bestDir) { ghost.col += bestDir.dc; ghost.row += bestDir.dr; }
  }

  // Duplicate ghost management
  var dupeGhost = null;

  // ── Update ──
  function update(dt, input) {
    timeElapsed += dt;
    if (shieldTimer > 0) shieldTimer -= dt;
    if (revealTimer > 0) revealTimer -= dt;

    if (state === 'ready') {
      if (input.action) {
        state = 'playing';
        ghostReleaseTime = Math.max(3, 10 - level);
        E.playCoin();
      }
      return;
    }

    if (state === 'gameover') {
      try { window.FreeArcadeSave.setBestMazeTime(timeElapsed); window.FreeArcadeSave.incrementStat('totalMazesCompleted'); } catch(e) {}
      if (input.action) { E.setLevel(1); init.call({engine: E}); state = 'playing'; ghostReleaseTime = Math.max(3, 10 - level); E.playCoin(); }
      return;
    }

    if (state === 'levelComplete') {
      try { window.FreeArcadeSave.setBestMazeTime(timeElapsed); } catch(e) {}
      if (input.action) { E.setLevel(level+1); init.call({engine: E}); state = 'playing'; ghostReleaseTime = Math.max(3, 10 - level); E.playCoin(); }
      return;
    }

    // ── PLAYING ──

    // Ghost activation
    if (!ghostActive && timeElapsed >= ghostReleaseTime) {
      ghostActive = true;
      ghost.active = true;
      ghost.col = Math.floor(cols/2);
      ghost.row = Math.floor(rows/2);
      ghostMoveTimer = 0;
      var pitch = [300, 400, 500, 200][ghostType] || 300;
      E.playBeep(pitch, 0.15, 'sawtooth', 0.1);
      E.playBeep(pitch * 0.7, 0.2, 'sawtooth', 0.12);

      // Duplicate ghost
      if (ghostType >= 2) {
        dupeGhost = { col: 0, row: 0, active: true, moveTimer: 0 };
      }
    }

    // Ghost movement
    if (ghostActive) {
      var interval = [0.18, 0.12, 0.15, 0.2][ghostType] || 0.18;
      interval = Math.max(0.08, interval - level * 0.005);
      ghostMoveTimer -= dt;
      if (ghostMoveTimer <= 0) {
        pathfindGhost();
        ghostMoveTimer = interval;

        // Ghost type 3 (invisible): only detects when very close
        var detectRange = ghostType === 3 ? 2 : 1;
        if (Math.abs(player.col - ghost.col) + Math.abs(player.row - ghost.row) <= detectRange && shieldTimer <= 0) {
          if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
          ghost.col = Math.floor(cols/2); ghost.row = Math.floor(rows/2);
          ghostActive = false;
          ghostReleaseTime = timeElapsed + Math.max(2, 6 - level);
          E.playExplode();
          E.shake(5, 0.3);
        }
      }

      // Duplicate ghost movement (type 2+)
      if (ghostType >= 2 && dupeGhost && dupeGhost.active) {
        dupeGhost.moveTimer -= dt;
        if (dupeGhost.moveTimer <= 0) {
          // Move toward player but offset
          var dCol = player.col > dupeGhost.col ? 1 : (player.col < dupeGhost.col ? -1 : 0);
          var dRow = player.row > dupeGhost.row ? 1 : (player.row < dupeGhost.row ? -1 : 0);
          // Try horizontal then vertical
          var nc = dupeGhost.col + dCol, nr = dupeGhost.row;
          var cell = maze[nr] ? maze[nr][nc] : null;
          if (cell && !cell.left && !cell.right && nc >= 0 && nc < cols) { dupeGhost.col = nc; }
          else {
            nr = dupeGhost.row + dRow; nc = dupeGhost.col;
            var cell = maze[nr] ? maze[nr][nc] : null;
            if (cell && !cell.top && !cell.bottom && nr >= 0 && nr < rows) { dupeGhost.row = nr; }
          }
          dupeGhost.moveTimer = interval * 1.3;

          if (Math.abs(player.col - dupeGhost.col) + Math.abs(player.row - dupeGhost.row) <= 1 && shieldTimer <= 0) {
            if (!E.loseLife()) { state = 'gameover'; E.playGameOver(); return; }
            dupeGhost.col = Math.floor(cols/2); dupeGhost.row = Math.floor(rows/2);
            E.playExplode();
          }
        }
      }
    }

    // Item collection (walk over items)
    for (var i = items.length - 1; i >= 0; i--) {
      var item = items[i];
      if (item.collected) continue;
      if (player.col === item.col && player.row === item.row) {
        item.collected = true;
        applyItem(item);
      }
    }

    // Treasure collection
    for (var i = treasures.length - 1; i >= 0; i--) {
      var t = treasures[i];
      if (t.collected) continue;
      if (player.col === t.col && player.row === t.row) {
        t.collected = true;
        E.addScore(150);
        try { window.FreeArcadeSave.addCoins(3); } catch(e) {}
        E.playPowerup();
        E.textCenter('✦ TREASURE +150 +3✦', E.W/2, E.H/2 - 10, 8, '#ffdd00');
      }
    }

    moveTimer -= dt;
    if (moveTimer > 0) return;

    var moved = false;
    var cell = maze[player.row][player.col];

    // Check gate blocking
    var atGate = false;
    for (var g = 0; g < gates.length; g++) {
      if (gates[g].col === player.col && gates[g].row === player.row && !gates[g].open) atGate = true;
    }

    if (!atGate) {
      if (input.left && !cell.left) { player.col--; moved = true; }
      else if (input.right && !cell.right) { player.col++; moved = true; }
      else if (input.up && !cell.top) { player.row--; moved = true; }
      else if (input.down && !cell.bottom) { player.row++; moved = true; }
    }

    // Check if player walked into a gate (try to open it)
    for (var g = 0; g < gates.length; g++) {
      if (gates[g].col === player.col && gates[g].row === player.row && !gates[g].open) {
        // Check if player has a key for this gate
        for (var k = 0; k < items.length; k++) {
          if (items[k].type === 'key' && items[k].keyId === g && items[k].collected) {
            gates[g].open = true;
            E.playPowerup();
            E.textCenter('GATE OPENED', E.W/2, E.H/2 - 10, 9, '#44ff88');
            break;
          }
        }
        if (!gates[g].open) {
          // Push player back
          if (input.left) player.col++;
          else if (input.right) player.col--;
          else if (input.up) player.row++;
          else if (input.down) player.row--;
          E.playBeep(200, 0.1, 'square', 0.05);
        }
      }
    }

    if (moved) {
      steps++;
      visited[player.row][player.col] = true;
      moveTimer = moveDelay;
      E.playBeep(500 + player.col * 8, 0.025, 'square', 0.025);
      if (player.col === goal.col && player.row === goal.row) {
        state = 'levelComplete';
        E.playLevelUp();
        var bonus = Math.max(0, 400 - timeElapsed * 2);
        E.addScore(300 + Math.floor(bonus) + keys * 50);
      }
    }
  }

  function applyItem(item) {
    switch (item.type) {
      case 'speed':
        moveDelay = Math.max(0.04, moveDelay - 0.04);
        E.playPowerup();
        E.textCenter('⚡ SPEED BOOST', E.W/2, E.H/2 - 10, 8, '#44ff88');
        break;
      case 'shield':
        shieldTimer = 6;
        E.playPowerup();
        E.textCenter('🛡 GHOST SHIELD 6s', E.W/2, E.H/2 - 10, 8, '#4488ff');
        break;
      case 'reveal':
        revealTimer = 5;
        E.playPowerup();
        E.textCenter('◉ MAP REVEAL 5s', E.W/2, E.H/2 - 10, 8, '#ffdd00');
        break;
      case 'teleport':
        // Teleport toward goal area
        var tc = Math.min(goal.col - 2, player.col + 3);
        var tr = Math.min(goal.row - 2, player.row + 3);
        player.col = Math.max(1, tc);
        player.row = Math.max(1, tr);
        E.playPowerup();
        E.textCenter('⟐ TELEPORT', E.W/2, E.H/2 - 10, 8, '#cc44ff');
        E.shake(4, 0.2);
        break;
      case 'key':
        keys++;
        E.playPowerup();
        E.textCenter('🔑 KEY +1', E.W/2, E.H/2 - 10, 8, '#ffdd00');
        break;
    }
  }

  // ── Render ──
  function render(ctx) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, E.W, E.H);
    if (!maze || maze.length === 0) return;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = maze[r][c];
        var x = cell.px, y = cell.py;
        var isVisitedLocal = visited[r][c] || revealTimer > 0;

        if (isVisitedLocal) {
          var dist = Math.abs(r - player.row) + Math.abs(c - player.col);
          ctx.fillStyle = 'rgba(' + hexToRgb(theme.path) + ',' + Math.max(0.08, 1 - dist * 0.04) * 0.3 + ')';
        } else ctx.fillStyle = 'rgba(10,10,25,0.6)';
        ctx.fillRect(x, y, cellSize, cellSize);

        ctx.strokeStyle = isVisitedLocal ? theme.wallVisited : theme.wallUnvisited;
        ctx.lineWidth = 1.5;
        if (cell.top)    drawLine(x, y, x + cellSize, y);
        if (cell.bottom) drawLine(x, y + cellSize, x + cellSize, y + cellSize);
        if (cell.left)   drawLine(x, y, x, y + cellSize);
        if (cell.right)  drawLine(x + cellSize, y, x + cellSize, y + cellSize);
      }
    }

    // Gates
    for (var g = 0; g < gates.length; g++) {
      var gt = gates[g];
      var gx = maze[gt.row][gt.col].px;
      var gy = maze[gt.row][gt.col].py;
      if (gt.open) {
        ctx.fillStyle = 'rgba(68,255,136,0.15)';
        ctx.fillRect(gx, gy, cellSize, cellSize);
      } else {
        ctx.fillStyle = 'rgba(255,68,68,0.3)';
        ctx.fillRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4);
        // Gate symbol
        ctx.fillStyle = '#ff4444';
        for (var l = 0; l < 3; l++) {
          ctx.fillRect(gx + cellSize * 0.2, gy + l * cellSize * 0.3 + 2, cellSize * 0.6, 2);
        }
      }
    }

    // Items
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.collected) continue;
      var ix = maze[item.row][item.col].px;
      var iy = maze[item.row][item.col].py;
      var pulse = 0.6 + Math.sin(Date.now() / 200 + i) * 0.4;
      ctx.globalAlpha = pulse;
      var icon, col;
      switch (item.type) {
        case 'speed':   icon = '⚡'; col = '#44ff88'; break;
        case 'shield':  icon = '🛡'; col = '#4488ff'; break;
        case 'reveal':  icon = '◉'; col = '#ffdd00'; break;
        case 'teleport':icon = '⟐'; col = '#cc44ff'; break;
        case 'key':     icon = '🔑'; col = '#ffdd00'; break;
      }
      E.textCenter(icon, ix + cellSize/2, iy + cellSize/2 - 4, 8, col);
      ctx.globalAlpha = 1;
    }

    // Treasures
    for (var i = 0; i < treasures.length; i++) {
      var t = treasures[i];
      if (t.collected) continue;
      var tx = maze[t.row][t.col].px;
      var ty = maze[t.row][t.col].py;
      var pulse = 0.5 + Math.sin(Date.now() / 300 + i * 2) * 0.5;
      ctx.fillStyle = 'rgba(255,215,0,' + pulse * 0.2 + ')';
      ctx.fillRect(tx + 2, ty + 2, cellSize - 4, cellSize - 4);
      E.textCenter('✦', tx + cellSize/2, ty + cellSize/2 - 4, 7, '#ffdd00');
    }

    // Ghost(s)
    if (ghost.active && shieldTimer <= 0) {
      renderGhost(ctx, ghost.col, ghost.row, theme.ghost, ghostType === 3);
      if (ghostType >= 2 && dupeGhost && dupeGhost.active) {
        renderGhost(ctx, dupeGhost.col, dupeGhost.row, 'rgba(255,50,200,0.5)', false);
      }
    }

    // Goal
    var gx = maze[goal.row][goal.col].px;
    var gy = maze[goal.row][goal.col].py;
    ctx.fillStyle = theme.goal;
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.25;
    ctx.fillRect(gx + 3, gy + 3, cellSize - 6, cellSize - 6);
    ctx.globalAlpha = 1;
    E.textCenter('★', gx + cellSize/2, gy + cellSize/2 - 5, 11, theme.goal);

    // Player
    var pp = maze[player.row][player.col];
    var pad = cellSize * 0.15;
    ctx.fillStyle = theme.player;
    ctx.fillRect(pp.px + pad, pp.py + pad, cellSize - pad*2, cellSize - pad*2);
    ctx.fillStyle = theme.acc;
    ctx.fillRect(pp.px + pad + 2, pp.py + pad + 2, cellSize - pad*2 - 4, 2);

    // Shield visual
    if (shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(68,136,255,' + (0.3 + Math.sin(Date.now()/150)*0.2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pp.px + cellSize/2, pp.py + cellSize/2, cellSize * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hint arrow near goal
    var dg = Math.abs(player.col - goal.col) + Math.abs(player.row - goal.row);
    if (dg <= 5) {
      var ang = Math.atan2(goal.row - player.row, goal.col - player.col);
      var ax = pp.px + cellSize/2 + Math.cos(ang) * cellSize * 0.45;
      var ay = pp.py + cellSize/2 + Math.sin(ang) * cellSize * 0.45;
      ctx.fillStyle = 'rgba(0,255,136,' + (0.3 + Math.sin(Date.now()/180)*0.2) + ')';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
        var vis = visited[r][c] || revealTimer > 0;
        if (vis) {
          ctx.fillStyle = 'rgba(0,100,200,0.25)';
          ctx.fillRect(mx + c*ms, my + r*ms, ms, ms);
        }
        var mc = maze[r][c];
        ctx.strokeStyle = vis ? 'rgba(68,136,255,0.25)' : 'rgba(68,136,255,0.08)';
        ctx.lineWidth = 0.5;
        if (mc.top)    { ctx.beginPath(); ctx.moveTo(mx + c*ms, my + r*ms); ctx.lineTo(mx + (c+1)*ms, my + r*ms); ctx.stroke(); }
        if (mc.bottom) { ctx.beginPath(); ctx.moveTo(mx + c*ms, my + (r+1)*ms); ctx.lineTo(mx + (c+1)*ms, my + (r+1)*ms); ctx.stroke(); }
        if (mc.left)   { ctx.beginPath(); ctx.moveTo(mx + c*ms, my + r*ms); ctx.lineTo(mx + c*ms, my + (r+1)*ms); ctx.stroke(); }
        if (mc.right)  { ctx.beginPath(); ctx.moveTo(mx + (c+1)*ms, my + r*ms); ctx.lineTo(mx + (c+1)*ms, my + (r+1)*ms); ctx.stroke(); }
      }
    }
    ctx.fillStyle = theme.player;
    ctx.fillRect(mx + player.col*ms, my + player.row*ms, ms, ms);
    ctx.fillStyle = theme.goal;
    ctx.fillRect(mx + goal.col*ms, my + goal.row*ms, ms, ms);
    if (ghost.active) {
      ctx.fillStyle = theme.ghost;
      ctx.fillRect(mx + ghost.col*ms, my + ghost.row*ms, ms, ms);
    }

    // HUD
    E.text('MAZE LV.' + level + ' [' + theme.name + ']', 8, 8, 7, theme.goal);
    E.text('STEPS: ' + steps + '  TIME: ' + Math.floor(timeElapsed) + 's', 8, 20, 6, '#88aacc');
    if (keys > 0) E.text('🔑x' + keys, 8, 32, 6, '#ffdd00');

    if (shieldTimer > 0) E.textCenter('🛡 ' + Math.ceil(shieldTimer) + 's', E.W/2, E.H - 22, 7, '#4488ff');
    if (revealTimer > 0) E.textCenter('◉ ' + Math.ceil(revealTimer) + 's', E.W/2, E.H - 12, 7, '#ffdd00');

    if (ghostActive && shieldTimer <= 0) {
      var gd = Math.abs(player.col - ghost.col) + Math.abs(player.row - ghost.row);
      if (gd <= 3) {
        E.textCenter('⚠ GHOST', E.W/2, E.H - 14, 7,
          'rgba(255,50,50,' + (0.5 + Math.sin(Date.now()/150)*0.4) + ')');
      }
    } else if (state === 'playing') {
      var left = Math.max(0, Math.ceil(ghostReleaseTime - timeElapsed));
      if (left <= 5) E.textCenter('⚠ ' + left, E.W/2, E.H - 14, 9, '#ff4444');
    }

    var cx = E.W/2, cy = E.H/2;

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, E.W, E.H);
      E.textCenterShadow('MAZE RUNNER', cx, 60, 17, theme.acc, '#000');
      E.textCenterShadow('LEVEL ' + level, cx, 95, 11, '#ffaa00', '#000');
      E.textCenter('← → ↑ ↓ move · Find ★ exit', cx, 150, 8, '#aaa');
      var ghostLabels = ['Normal Ghost', 'Fast Ghost', 'Duplicate Ghost', 'Invisible Ghost'];
      E.textCenter('[' + ghostLabels[ghostType] + ']', cx, 170, 7, theme.ghost);
      E.textCenter('Collect items: ⚡🛡◉⟐🔑', cx, 190, 7, '#888');
      E.textCenter('Ghost in ~' + Math.max(3, 10 - level) + 's', cx, 210, 7, '#ff4444');
      E.textCenter('PRESS ENTER TO START', cx, 250, 9, '#00ff88');
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
      try { var bt = window.FreeArcadeSave.getBestMazeTime(); if (timeElapsed <= bt || bt >= 999998) E.textCenter('★ BEST TIME ★', cx, cy + 15, 8, '#ffdd00'); } catch(e) {}
      E.textCenter('PRESS ENTER FOR LEVEL ' + (level + 1), cx, cy + 50, 8, '#aaa');
    }
  }

  function renderGhost(ctx, col, row, color, invisible) {
    var gp = maze[row][col];
    if (!gp) return;
    var alpha = invisible ? 0.2 : (0.6 + Math.sin(Date.now()/180) * 0.3);
    if (invisible) {
      // Only show faint shimmer
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(gp.px + cellSize/2, gp.py + cellSize/2, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(gp.px + cellSize/2, gp.py + cellSize/2, cellSize * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(gp.px + cellSize * 0.22, gp.py + cellSize * 0.22, cellSize * 0.16, cellSize * 0.16);
    ctx.fillRect(gp.px + cellSize * 0.62, gp.py + cellSize * 0.22, cellSize * 0.16, cellSize * 0.16);
    ctx.fillStyle = '#000';
    ctx.fillRect(gp.px + cellSize * 0.27, gp.py + cellSize * 0.27, cellSize * 0.08, cellSize * 0.1);
    ctx.fillRect(gp.px + cellSize * 0.67, gp.py + cellSize * 0.27, cellSize * 0.08, cellSize * 0.1);
    ctx.globalAlpha = 1;
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return r + ',' + g + ',' + b;
  }

  function drawLine(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function destroy() {}

  window.MazeRunner = { init: init, update: update, render: render, destroy: destroy };
})();
