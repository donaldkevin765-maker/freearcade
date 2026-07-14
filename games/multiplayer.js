/**
 * FreeArcade Multiplayer — Supabase Realtime
 *
 * Players connect via Supabase Realtime channels (WebSocket).
 * No server to deploy, no tunnel, no PC to keep on.
 * Works 24/7 on the free Supabase plan.
 *
 * Channel:  room:{CODE}
 * Protocol:
 *   Host subscribes → tracks presence {playerId, name, isHost}
 *   Joiner subscribes → broadcast join_request
 *   Host receives → broadcast join_assigned {playerId, name}
 *   Joiner receives → tracks presence with assigned ID
 *   Broadcast for game data relay (remote_input, game_state, game_started)
 *
 * API (same interface as previous — drop-in replacement):
 *   createRoom(), joinRoom(), startGame(), sendInput(), sendGameState()
 *   leaveRoom(), disconnect(), on(), off()
 *   .players, .isHost, .hostId, .playerId, .roomCode
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://glxrlfzttixpgkchlmed.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseHJsZnp0dGl4cGdrY2hsbWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTA3ODcsImV4cCI6MjA5OTU2Njc4N30.h4EbcTVAlsy5XRsJYjIOnqtyKuHzDB7fMDlk6h8qs0o';

  function MultiplayerClient() {
    this._supabase = null;
    this._channel = null;
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.isHost = false;
    this.players = [];
    this.playerName = 'Player';
    this.remoteInputs = {};
    this.remoteStates = {};
    this._callbacks = {};
    this._connected = false;
    this._intentionalClose = false;
  }

  // ── Helpers ──

  function genCode() {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ', r = '';
    for (var i = 0; i < 4; i++) r += c[Math.random() * c.length | 0];
    return r;
  }

  // ── Client methods ──

  MultiplayerClient.prototype._init = function () {
    if (this._supabase) return;
    if (typeof supabase === 'undefined') {
      this._fire('error', { message: 'Supabase library not loaded' });
      return false;
    }
    this._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  };

  MultiplayerClient.prototype._setupChannel = function (code, isHost) {
    var self = this;
    if (self._channel) self._supabase.removeChannel(self._channel);

    self._channel = self._supabase.channel('room:' + code, {
      config: { broadcast: { self: false } },
    });

    // Broadcast handler
    self._channel.on('broadcast', { event: 'data' }, function (payload) {
      self._onData(payload);
    });

    // Presence: sync (full state refresh)
    self._channel.on('presence', { event: 'sync' }, function () {
      var state = self._channel.presenceState();
      var list = [];
      for (var k in state) {
        if (state.hasOwnProperty(k)) {
          var p = state[k][0];
          list.push({ id: p.playerId, name: p.name, isHost: p.isHost, ready: false });
        }
      }
      list.sort(function (a, b) { return a.id - b.id; });
      self.players = list;

      // Fire room_joined if we received our first presence sync as joiner
      if (!isHost && self.playerId !== null && list.length >= 1) {
        self._fire('room_joined', {
          code: code, playerId: self.playerId, hostId: self.hostId, players: list,
        });
      }
    });

    // Presence: join
    self._channel.on('presence', { event: 'join' }, function (payload) {
      var p = payload.newPresences[0];
      if (!p || p.playerId === self.playerId) return;
      var exists = self.players.some(function (x) { return x.id === p.playerId; });
      if (!exists) {
        self.players.push({ id: p.playerId, name: p.name, isHost: p.isHost, ready: false });
        self._fire('player_joined', { player: { id: p.playerId, name: p.name } });
      }
    });

    // Presence: leave
    self._channel.on('presence', { event: 'leave' }, function (payload) {
      var p = payload.leftPresences[0];
      if (!p) return;
      self.players = self.players.filter(function (x) { return x.id !== p.playerId; });
      delete self.remoteInputs[p.playerId];
      delete self.remoteStates[p.playerId];
      self._fire('player_left', { playerId: p.playerId });
    });

    return self._channel;
  };

  MultiplayerClient.prototype._onData = function (data) {
    var self = this;

    switch (data.type) {

      case 'join_request':
        // Only host handles this
        if (!self.isHost) return;
        var pid = self.players.length;
        var pName = data.name || 'Joiner ' + pid;

        self._channel.send({
          type: 'broadcast',
          event: 'data',
          payload: { type: 'join_assigned', playerId: pid, hostId: 0, name: pName },
        });

        self.players.push({ id: pid, name: pName, isHost: false, ready: false });
        self._fire('player_joined', { player: { id: pid, name: pName } });
        break;

      case 'join_assigned':
        // Joiner receives assigned ID
        if (self.isHost || self.playerId !== null) return;
        self.playerId = data.playerId;
        self.hostId = data.hostId;

        // Track presence with assigned ID
        self._channel.track({ playerId: data.playerId, name: data.name || self.playerName, isHost: false });
        break;

      case 'game_started':
        // Start the game
        self._fire('game_started', { timestamp: data.timestamp || Date.now() });
        break;

      case 'remote_input':
        self.remoteInputs[data.playerId] = data.gameData;
        break;

      case 'game_state':
        self.remoteStates[data.playerId] = data.gameData;
        break;
    }
  };

  MultiplayerClient.prototype.connect = function () {
    if (this._init()) {
      this._connected = true;
      this._fire('connected', {});
    }
  };

  MultiplayerClient.prototype.createRoom = function (game, name) {
    if (!this._init()) return;

    this.isHost = true;
    this.playerId = 0;
    this.hostId = 0;
    this.playerName = name || 'Host';
    this.roomCode = genCode();

    this._setupChannel(this.roomCode, true);

    this._channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        // Track host presence
        this._channel.track({ playerId: 0, name: this.playerName, isHost: true });

        this._fire('room_created', {
          code: this.roomCode, playerId: 0, hostId: 0,
          players: [{ id: 0, name: this.playerName, isHost: true, ready: false }],
        });
      }
    }.bind(this));
  };

  MultiplayerClient.prototype.joinRoom = function (code, name) {
    if (!this._init()) return;

    this.isHost = false;
    this.playerName = name || 'Player';
    this.roomCode = code.toUpperCase();
    this.playerId = null;
    this.hostId = 0;
    this.players = [{ id: 0, name: 'Host', isHost: true, ready: false }];

    this._setupChannel(this.roomCode, false);

    this._channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        // Don't track yet — wait for host to assign our ID
        this._channel.send({
          type: 'broadcast',
          event: 'data',
          payload: { type: 'join_request', name: this.playerName },
        });
      }
    }.bind(this));
  };

  // ── Data relay ──

  MultiplayerClient.prototype.startGame = function () {
    if (!this.isHost || !this._channel) return;
    this._channel.send({
      type: 'broadcast', event: 'data',
      payload: { type: 'game_started', timestamp: Date.now() },
    });
    this._fire('game_started', { timestamp: Date.now() });
  };

  MultiplayerClient.prototype.sendInput = function (data) {
    if (!this._channel) return;
    this._channel.send({
      type: 'broadcast', event: 'data',
      payload: { type: 'remote_input', playerId: this.playerId, gameData: data },
    });
  };

  MultiplayerClient.prototype.sendGameState = function (data) {
    if (!this._channel || !this.isHost) return;
    this._channel.send({
      type: 'broadcast', event: 'data',
      payload: { type: 'game_state', playerId: this.playerId, gameData: data },
    });
  };

  // ── Lifecycle ──

  MultiplayerClient.prototype.leaveRoom = function () {
    if (this._channel) {
      this._channel.untrack();
      if (this._supabase) this._supabase.removeChannel(this._channel);
      this._channel = null;
    }
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.isHost = false;
    this.players = [];
  };

  MultiplayerClient.prototype.disconnect = function () {
    this._intentionalClose = true;
    this.leaveRoom();
    this._supabase = null;
    this._connected = false;
    this.remoteInputs = {};
    this.remoteStates = {};
  };

  // ── Event system ──

  MultiplayerClient.prototype.on = function (type, cb) {
    if (!this._callbacks[type]) this._callbacks[type] = [];
    this._callbacks[type].push(cb);
  };

  MultiplayerClient.prototype.off = function (type, cb) {
    if (!this._callbacks[type]) return;
    this._callbacks[type] = this._callbacks[type].filter(function (f) { return f !== cb; });
  };

  MultiplayerClient.prototype._fire = function (type, data) {
    var cbs = this._callbacks[type];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data); } catch (e) { console.error('MP callback:', e); }
    }
  };

  window.MultiplayerClient = MultiplayerClient;
})();
