/**
 * FreeArcade Multiplayer Client
 *
 * WebSocket-based lobby + relay for co-op / versus games.
 *
 * Usage:
 *   var mp = new MultiplayerClient('wss://my-server.com');
 *   mp.createRoom('ArenaShooter');
 *   mp.on('room_created', function(data) { ... });
 */
(function () {
  'use strict';

  function MultiplayerClient(serverUrl) {
    this.serverUrl = serverUrl || (window.MULTIPLAYER_SERVER || 'ws://localhost:10000');
    this.ws = null;
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};   // playerId → last input data
    this.remoteStates = {};   // playerId → last game state
    this._callbacks = {};
    this._reconnectTimer = null;
    this._pingTimer = null;
  }

  MultiplayerClient.prototype.connect = function () {
    var self = this;

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch (e) {
      this._fire('error', { message: 'Connection failed: ' + e.message });
      return;
    }

    this.ws.onopen = function () {
      self.connected = true;
      self._fire('connected', {});
      // Start ping
      self._pingTimer = setInterval(function () {
        self._send({ type: 'ping' });
      }, 25000);
    };

    this.ws.onclose = function () {
      self.connected = false;
      if (self._pingTimer) clearInterval(self._pingTimer);
      self._fire('disconnected', {});
      // Auto-reconnect if was in a room
      if (self.roomCode) {
        self._reconnectTimer = setTimeout(function () { self.connect(); }, 3000);
      }
    };

    this.ws.onerror = function () {
      self._fire('error', { message: 'WebSocket error' });
    };

    this.ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }

      switch (msg.type) {
        case 'connected':
          break;
        case 'room_created':
          self.roomCode = msg.code;
          self.playerId = msg.playerId;
          self.hostId = msg.hostId;
          self.isHost = true;
          self.players = msg.players || [];
          break;
        case 'room_joined':
          self.roomCode = msg.code;
          self.playerId = msg.playerId;
          self.hostId = msg.hostId;
          self.isHost = (msg.playerId === msg.hostId);
          self.players = msg.players || [];
          break;
        case 'player_joined':
          if (msg.player) self.players.push(msg.player);
          break;
        case 'player_left':
          self.players = self.players.filter(function (p) { return p.id !== msg.playerId; });
          delete self.remoteInputs[msg.playerId];
          delete self.remoteStates[msg.playerId];
          break;
        case 'host_changed':
          self.hostId = msg.hostId;
          self.isHost = (self.playerId === msg.hostId);
          break;
        case 'room_left':
          self.roomCode = null;
          self.playerId = null;
          self.hostId = null;
          self.isHost = false;
          self.players = [];
          self.remoteInputs = {};
          self.remoteStates = {};
          break;
        case 'game_started':
          break;
        case 'remote_input':
          self.remoteInputs[msg.playerId] = msg.data;
          break;
        case 'game_state':
          self.remoteStates[msg.playerId] = msg.data;
          break;
        case 'error':
          break;
      }

      self._fire(msg.type, msg);
    };
  };

  MultiplayerClient.prototype.disconnect = function () {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
  };

  MultiplayerClient.prototype.createRoom = function (game, name) {
    this._send({ type: 'create_room', game: game, name: name || 'Host' });
  };

  MultiplayerClient.prototype.joinRoom = function (code, name) {
    this._send({ type: 'join_room', code: code.toUpperCase(), name: name || 'Player' });
  };

  MultiplayerClient.prototype.leaveRoom = function () {
    this._send({ type: 'leave_room' });
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
  };

  MultiplayerClient.prototype.startGame = function () {
    this._send({ type: 'start_game' });
  };

  MultiplayerClient.prototype.sendInput = function (data) {
    if (!this.roomCode) return;
    this._send({ type: 'input', data: data });
  };

  MultiplayerClient.prototype.sendGameState = function (data) {
    if (!this.roomCode) return;
    this._send({ type: 'game_state', data: data });
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
        this._callbacks[type][i](data);
      }
    }
  };

  MultiplayerClient.prototype._send = function (msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  };

  window.MultiplayerClient = MultiplayerClient;
})();
