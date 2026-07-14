/**
 * FreeArcade Multiplayer — WebSocket Client
 *
 * Connects to the multiplayer relay server via Cloudflare Tunnel.
 * The server handles room management and message relay between players.
 *
 * Protocol:
 *   Client → Server: create_room, join_room, leave_room, start_game, input, game_state
 *   Server → Client: connected, room_created, room_joined, player_joined, player_left,
 *                    game_started, remote_input, game_state, error, room_left
 *
 * API (same interface as previous implementations for drop-in compatibility):
 *   new MultiplayerClient()
 *   .createRoom(game, name)
 *   .joinRoom(code, name)
 *   .startGame()
 *   .sendInput(data)
 *   .sendGameState(data)
 *   .leaveRoom()
 *   .disconnect()
 *   .on(type, callback)
 *   .off(type, callback)
 *   .players, .isHost, .hostId, .playerId, .roomCode
 */
(function () {
  'use strict';

  function MultiplayerClient() {
    this.ws = null;
    this.serverUrl = null;
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
    this._callbacks = {};
    this._connected = false;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    this._pendingMessages = [];
  }

  MultiplayerClient.prototype._getServerUrl = function () {
    return window.MULTIPLAYER_SERVER || 'ws://localhost:10000';
  };

  MultiplayerClient.prototype.connect = function () {
    var self = this;
    if (self.ws && (self.ws.readyState === WebSocket.OPEN || self.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    self._intentionalClose = false;
    self.serverUrl = self._getServerUrl();

    try {
      self.ws = new WebSocket(self.serverUrl);
    } catch (e) {
      self._fire('error', { message: 'WebSocket connection failed: ' + e.message });
      return;
    }

    self.ws.onopen = function () {
      self._connected = true;
      self._fire('connected', {});
      // Flush any pending messages
      var pending = self._pendingMessages.slice();
      self._pendingMessages = [];
      for (var i = 0; i < pending.length; i++) {
        self._send(pending[i]);
      }
    };

    self.ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      self._handleMessage(msg);
    };

    self.ws.onclose = function () {
      self._connected = false;
      if (!self._intentionalClose) {
        self._fire('disconnected', {});
        // Attempt reconnection
        self._scheduleReconnect();
      }
    };

    self.ws.onerror = function (err) {
      self._fire('error', { message: 'WebSocket error' });
    };
  };

  MultiplayerClient.prototype._scheduleReconnect = function () {
    var self = this;
    if (self._reconnectTimer) return;
    self._reconnectTimer = setTimeout(function () {
      self._reconnectTimer = null;
      if (!self._connected && !self._intentionalClose) {
        self.connect();
      }
    }, 3000);
  };

  MultiplayerClient.prototype._handleMessage = function (msg) {
    switch (msg.type) {

      case 'room_created':
        this.roomCode = msg.code;
        this.playerId = msg.playerId;
        this.hostId = msg.hostId;
        this.isHost = true;
        this.players = msg.players || [];
        this._fire('room_created', msg);
        break;

      case 'room_joined':
        this.roomCode = msg.code;
        this.playerId = msg.playerId;
        this.hostId = msg.hostId;
        this.isHost = (msg.playerId === msg.hostId);
        this.players = msg.players || [];
        this._fire('room_joined', msg);
        break;

      case 'player_joined':
        if (msg.player) this.players.push(msg.player);
        this._fire('player_joined', { player: msg.player });
        break;

      case 'player_left':
        this.players = this.players.filter(function (p) { return p.id !== msg.playerId; });
        delete this.remoteInputs[msg.playerId];
        delete this.remoteStates[msg.playerId];
        this._fire('player_left', { playerId: msg.playerId });
        break;

      case 'host_changed':
        this.hostId = msg.hostId;
        break;

      case 'game_started':
        this._fire('game_started', { timestamp: msg.timestamp || Date.now() });
        break;

      case 'remote_input':
        this.remoteInputs[msg.playerId] = msg.data;
        break;

      case 'game_state':
        this.remoteStates[msg.playerId] = msg.data;
        break;

      case 'room_left':
        this.roomCode = null;
        this.playerId = null;
        this.hostId = null;
        this.isHost = false;
        this.players = [];
        break;

      case 'error':
        this._fire('error', { message: msg.message || 'Server error' });
        break;

      case 'connected':
        // Already handled in onopen, but server also sends 'connected' message
        break;
    }
  };

  MultiplayerClient.prototype._send = function (data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      // Queue for when connection opens
      this._pendingMessages.push(data);
      // Try connecting if not already
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
      return false;
    }
  };

  MultiplayerClient.prototype.createRoom = function (game, name) {
    this._send({
      type: 'create_room',
      game: game || 'ArenaShooter',
      name: name || 'Host',
    });
  };

  MultiplayerClient.prototype.joinRoom = function (code, name) {
    this._send({
      type: 'join_room',
      code: (code || '').toUpperCase(),
      name: name || 'Player',
    });
  };

  MultiplayerClient.prototype.leaveRoom = function () {
    this._send({ type: 'leave_room' });
  };

  MultiplayerClient.prototype.startGame = function () {
    this._send({ type: 'start_game' });
  };

  MultiplayerClient.prototype.sendInput = function (data) {
    this._send({ type: 'input', data: data });
  };

  MultiplayerClient.prototype.sendGameState = function (data) {
    this._send({ type: 'game_state', data: data });
  };

  MultiplayerClient.prototype.disconnect = function () {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this._connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
    this._pendingMessages = [];
  };

  MultiplayerClient.prototype.on = function (type, callback) {
    if (!this._callbacks[type]) this._callbacks[type] = [];
    this._callbacks[type].push(callback);
  };

  MultiplayerClient.prototype.off = function (type, callback) {
    if (!this._callbacks[type]) return;
    this._callbacks[type] = this._callbacks[type].filter(function (cb) { return cb !== callback; });
  };

  MultiplayerClient.prototype._fire = function (type, data) {
    if (this._callbacks[type]) {
      for (var i = 0; i < this._callbacks[type].length; i++) {
        try { this._callbacks[type][i](data); } catch (e) { console.error('MP callback error:', e); }
      }
    }
  };

  window.MultiplayerClient = MultiplayerClient;
})();
