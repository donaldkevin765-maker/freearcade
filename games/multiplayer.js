/**
 * FreeArcade Multiplayer — PeerJS (WebRTC P2P)
 *
 * No server required. Players connect directly via WebRTC.
 * PeerJS free signalling server at 0.peerjs.com handles the handshake.
 *
 * Flow:
 *   Host: createRoom() → generates peerId (room code) → shares with friend
 *   Friend: joinRoom(code) → connects to host's Peer → P2P data channel
 *
 * API compatible with previous MultiplayerClient (drop-in replacement).
 */
(function () {
  'use strict';

  function MultiplayerClient() {
    this.peer = null;
    this.conn = null;         // Active data connection
    this.roomCode = null;
    this.playerId = null;     // 0 = host/creator, 1 = joiner
    this.hostId = 0;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
    this.peerConnections = {}; // peerId → DataConnection
    this._callbacks = {};
    this._connected = false;
    this._reconnectTimer = null;
  }

  MultiplayerClient.prototype.connect = function () {
    // PeerJS handles its own connection, nothing to do here
    this._connected = true;
  };

  MultiplayerClient.prototype.createRoom = function (game, name) {
    var self = this;
    var gameKey = game || 'ArenaShooter';
    this.isHost = true;
    this.playerId = 0;
    this.hostId = 0;

    // Generate room code: 4 uppercase letters
    var code = '';
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (var i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

    this.roomCode = code;
    this.players = [{ id: 0, name: name || 'Host', isHost: true, ready: false }];

    // Create host peer with a fixed prefix + code
    this.peer = new Peer('fa-' + code, {
      debug: 0,
    });

    this.peer.on('open', function (id) {
      self.roomCode = code;
      self._connected = true;
      self._fire('connected', {});

      self._fire('room_created', {
        code: code,
        playerId: 0,
        hostId: 0,
        players: self.players,
      });
    });

    // Handle incoming connections (joiners)
    this.peer.on('connection', function (conn) {
      conn.on('open', function () {
        self.conn = conn;
        var pid = self.players.length;
        self.peerConnections[conn.peer] = conn;

        // Send player info to joiner
        conn.send({ type: 'init', playerId: pid, hostId: 0, players: self.players });

        // Update our player list
        self.players.push({ id: pid, name: 'Joiner ' + pid, isHost: false, ready: false });
        self._fire('player_joined', { player: { id: pid, name: 'Joiner ' + pid } });

        // Listen for data from joiner
        conn.on('data', function (data) {
          self._handlePeerData(data, conn);
        });

        conn.on('close', function () {
          self.players = self.players.filter(function (p) { return p.id !== pid; });
          delete self.peerConnections[conn.peer];
          self._fire('player_left', { playerId: pid });
          if (self.players.length <= 1) {
            self._fire('disconnected', {});
          }
        });
      });
    });

    this.peer.on('error', function (err) {
      self._fire('error', { message: err.message || 'Peer error' });
    });

    this.peer.on('disconnected', function () {
      self._fire('disconnected', {});
    });
  };

  MultiplayerClient.prototype.joinRoom = function (code, name) {
    var self = this;
    this.isHost = false;
    this.playerId = null; // Will be assigned by host
    this.roomCode = code.toUpperCase();
    this.players = [{ id: 0, name: 'Host', isHost: true }];

    // Create our own peer
    this.peer = new Peer(undefined, { // random ID
      debug: 0,
    });

    this.peer.on('open', function (id) {
      self._connected = true;
      self._fire('connected', {});

      // Connect to host
      var conn = self.peer.connect('fa-' + self.roomCode, {
        reliable: true,
      });

      conn.on('open', function () {
        self.conn = conn;
        self.peerConnections[conn.peer] = conn;

        conn.send({ type: 'join_request', name: name || 'Joiner' });
      });

      conn.on('data', function (data) {
        self._handlePeerData(data, conn);
      });

      conn.on('close', function () {
        self._fire('disconnected', {});
      });
    });

    this.peer.on('error', function (err) {
      self._fire('error', { message: err.message || 'Connection failed' });
    });

    this.peer.on('disconnected', function () {
      self._fire('disconnected', {});
    });
  };

  MultiplayerClient.prototype._handlePeerData = function (data, conn) {
    switch (data.type) {
      case 'init':
        // Joiner receives this from host on connection
        this.playerId = data.playerId;
        this.hostId = data.hostId;
        this.players = data.players || [{ id: 0, name: 'Host', isHost: true }];
        this._fire('room_joined', {
          code: this.roomCode,
          playerId: this.playerId,
          hostId: this.hostId,
          players: this.players,
        });
        break;

      case 'player_joined':
        if (data.player) this.players.push(data.player);
        this._fire('player_joined', { player: data.player });
        break;

      case 'player_left':
        this.players = this.players.filter(function (p) { return p.id !== data.playerId; });
        delete this.remoteInputs[data.playerId];
        delete this.remoteStates[data.playerId];
        this._fire('player_left', { playerId: data.playerId });
        break;

      case 'game_started':
        this._fire('game_started', { timestamp: data.timestamp || Date.now() });
        break;

      case 'remote_input':
        this.remoteInputs[data.playerId] = data.data;
        break;

      case 'game_state':
        this.remoteStates[data.playerId] = data.data;
        break;

      case 'join_request':
        // Host receives this — assign playerId and notify
        var pid = this.players.length;
        var pName = data.name || 'Joiner ' + pid;

        // Send init back to joiner
        conn.send({
          type: 'init',
          playerId: pid,
          hostId: 0,
          players: this.players.concat([{ id: pid, name: pName, isHost: false, ready: false }]),
        });

        // Update our player list
        this.players.push({ id: pid, name: pName, isHost: false, ready: false });
        this._fire('player_joined', { player: { id: pid, name: pName } });

        // Broadcast to all other peers
        this._broadcast({ type: 'player_joined', player: { id: pid, name: pName } }, conn.peer);
        break;
    }
  };

  MultiplayerClient.prototype._broadcast = function (msg, excludeId) {
    for (var pid in this.peerConnections) {
      if (pid !== excludeId) {
        try { this.peerConnections[pid].send(msg); } catch (e) {}
      }
    }
  };

  MultiplayerClient.prototype._send = function (msg) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    } else {
      // Fallback: try all peer connections
      for (var pid in this.peerConnections) {
        try { this.peerConnections[pid].send(msg); } catch (e) {}
      }
    }
  };

  MultiplayerClient.prototype.leaveRoom = function () {
    if (this.conn) { try { this.conn.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null;
    this.conn = null;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];
    this.remoteInputs = {};
    this.remoteStates = {};
    this.peerConnections = {};
    this._connected = false;
  };

  MultiplayerClient.prototype.disconnect = function () {
    this.leaveRoom();
  };

  MultiplayerClient.prototype.startGame = function () {
    if (!this.isHost) return;
    this._broadcast({ type: 'game_started', timestamp: Date.now() });
    this._fire('game_started', { timestamp: Date.now() });
  };

  MultiplayerClient.prototype.sendInput = function (data) {
    if (!this.isHost && this.conn) {
      this.conn.send({ type: 'remote_input', playerId: this.playerId, data: data });
    } else if (this.isHost) {
      this._broadcast({ type: 'remote_input', playerId: this.playerId, data: data });
    }
  };

  MultiplayerClient.prototype.sendGameState = function (data) {
    if (this.isHost) {
      this._broadcast({ type: 'game_state', playerId: this.playerId, data: data });
    }
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
