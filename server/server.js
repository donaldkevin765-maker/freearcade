/**
 * FreeArcade Multiplayer Server
 * WebSocket relay server for room-based multiplayer games.
 *
 * Protocol:
 *   Client → Server: { type, game?, code?, name?, data? }
 *   Server → Client: { type, ... }
 *
 * Deploy: Render, Railway, or Fly.io
 *   Render: set start command to `node server.js`, expose port 10000
 */
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;

// ── Room Manager ──
const rooms = new Map();

function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
}

function createRoom(game) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    game,
    players: new Map(),
    hostId: null,
    state: 'lobby', // lobby | playing | ended
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code);
}

function joinRoom(code, ws, name) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game already started' };
  if (room.players.size >= 4) return { error: 'Room full (max 4)' };

  const playerId = room.players.size;
  const player = { id: playerId, name: name || 'Player ' + (playerId + 1), ws, ready: false };
  room.players.set(playerId, player);

  if (room.hostId === null) room.hostId = playerId;

  // Notify others
  broadcast(room, { type: 'player_joined', player: { id: playerId, name: player.name } }, playerId);

  return { success: true, playerId, hostId: room.hostId, players: getPlayerList(room) };
}

function getPlayerList(room) {
  const list = [];
  room.players.forEach((p, id) => {
    list.push({ id, name: p.name, isHost: id === room.hostId, ready: p.ready });
  });
  return list;
}

function removePlayer(room, playerId) {
  if (!room) return;
  room.players.delete(playerId);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  // Reassign host if needed
  if (room.hostId === playerId) {
    const next = room.players.keys().next().value;
    room.hostId = next;
    broadcast(room, { type: 'host_changed', hostId: next });
  }

  broadcast(room, { type: 'player_left', playerId });
}

function broadcast(room, message, excludeId) {
  const msg = JSON.stringify(message);
  room.players.forEach((p, id) => {
    if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  });
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ── Cleanup stale rooms ──
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (now - room.createdAt > 3600000 && room.players.size === 0) {
      rooms.delete(code);
    }
    // Check for stale connections
    room.players.forEach((p, id) => {
      if (p.ws.readyState === WebSocket.CLOSED || p.ws.readyState === WebSocket.CLOSING) {
        removePlayer(room, id);
      }
    });
  });
}, 30000);

// ── HTTP server (for health checks / info) ──
const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      players: Array.from(rooms.values()).reduce((a, r) => a + r.players.size, 0),
    }));
    return;
  }
  if (req.url === '/rooms') {
    const list = [];
    rooms.forEach((r, code) => {
      list.push({ code, game: r.game, players: r.players.size, state: r.state });
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(list));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── WebSocket server ──
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentPlayerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'create_room': {
        if (currentRoom) {
          sendTo(ws, { type: 'error', message: 'Already in a room' });
          return;
        }
        const room = createRoom(msg.game || 'ArenaShooter');
        const result = joinRoom(room.code, ws, msg.name || 'Host');
        if (result.error) {
          rooms.delete(room.code);
          sendTo(ws, { type: 'error', message: result.error });
          return;
        }
        currentRoom = room;
        currentPlayerId = result.playerId;
        sendTo(ws, {
          type: 'room_created',
          code: room.code,
          playerId: result.playerId,
          hostId: result.hostId,
          players: result.players,
        });
        break;
      }

      case 'join_room': {
        if (currentRoom) {
          sendTo(ws, { type: 'error', message: 'Already in a room. Leave first.' });
          return;
        }
        const result = joinRoom(msg.code, ws, msg.name);
        if (result.error) {
          sendTo(ws, { type: 'error', message: result.error });
          return;
        }
        currentRoom = getRoom(msg.code);
        currentPlayerId = result.playerId;
        sendTo(ws, {
          type: 'room_joined',
          code: msg.code,
          playerId: result.playerId,
          hostId: result.hostId,
          players: result.players,
        });
        break;
      }

      case 'leave_room': {
        if (currentRoom) {
          removePlayer(currentRoom, currentPlayerId);
          currentRoom = null;
          currentPlayerId = null;
          sendTo(ws, { type: 'room_left' });
        }
        break;
      }

      case 'start_game': {
        if (!currentRoom || currentPlayerId !== currentRoom.hostId) {
          sendTo(ws, { type: 'error', message: 'Only host can start' });
          return;
        }
        currentRoom.state = 'playing';
        broadcast(currentRoom, { type: 'game_started', timestamp: Date.now() });
        break;
      }

      case 'input': {
        // Relay player input to all other players in the room
        if (currentRoom && msg.data) {
          broadcast(currentRoom, {
            type: 'remote_input',
            playerId: currentPlayerId,
            data: msg.data,
          }, currentPlayerId);
        }
        break;
      }

      case 'game_state': {
        // Relay authoritative game state from host to others
        if (currentRoom && msg.data) {
          broadcast(currentRoom, {
            type: 'game_state',
            playerId: currentPlayerId,
            data: msg.data,
          }, currentPlayerId);
        }
        break;
      }

      case 'pong':
        break;

      default:
        sendTo(ws, { type: 'error', message: 'Unknown message type: ' + msg.type });
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      removePlayer(currentRoom, currentPlayerId);
    }
  });

  ws.on('error', () => {
    if (currentRoom) {
      removePlayer(currentRoom, currentPlayerId);
    }
  });

  // Send initial connection success
  sendTo(ws, { type: 'connected' });
});

httpServer.listen(PORT, () => {
  console.log(`FreeArcade Multiplayer Server running on port ${PORT}`);
});
