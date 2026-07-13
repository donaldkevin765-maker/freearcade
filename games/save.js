/**
 * FreeArcade Save System — persistent progress via localStorage
 *
 * Tracks high scores, total coins, stats per game, and run-based upgrades.
 * All data survives page reloads and browser restarts.
 */
window.FreeArcadeSave = (function () {
  'use strict';

  var STORAGE_KEY = 'freearcade_data';

  // ── Default structure ──
  function getDefaults() {
    return {
      coins: 0,
      totalPlayTime: 0,
      totalGamesPlayed: 0,
      highScores: {
        spaceBlaster: 0,
        blockBreaker: 0,
        mazeRunner: 0,
        snakeEvolved: 0
      },
      bestWaves: 0,
      bestLevels: 0,
      bestMazeTime: 999999,
      bestSnakeScore: 0,
      upgrades: {
        spaceBlaster: {
          fireRate: 0,   // 0-5
          shield: 0,     // 0-3
          damage: 0,     // 0-5
          speed: 0,      // 0-3
        }
      },
      stats: {
        totalEnemiesKilled: 0,
        totalBricksBroken: 0,
        totalMazesCompleted: 0,
        totalFruitsEaten: 0,
      }
    };
  }

  var data = null;

  function load() {
    if (data) return data;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = JSON.parse(raw);
        // Merge with defaults in case new fields were added
        var defaults = getDefaults();
        for (var key in defaults) {
          if (!(key in data)) data[key] = defaults[key];
          else if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
            for (var sub in defaults[key]) {
              if (!(sub in data[key])) data[key][sub] = defaults[key][sub];
            }
          }
        }
      } else {
        data = getDefaults();
      }
    } catch (e) {
      data = getDefaults();
    }
    return data;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  // ── Coins ──
  function addCoins(amount) {
    load().coins += amount;
    persist();
  }

  function getCoins() {
    return load().coins;
  }

  function spendCoins(amount) {
    if (load().coins < amount) return false;
    data.coins -= amount;
    persist();
    return true;
  }

  // ── High Scores ──
  function getHighScore(game) {
    var key = scoreKey(game);
    return load().highScores[key] || 0;
  }

  function setHighScore(game, score) {
    var key = scoreKey(game);
    if (score > (load().highScores[key] || 0)) {
      data.highScores[key] = score;
      persist();
      return true; // new record
    }
    return false;
  }

  function scoreKey(game) {
    var map = {
      'SpaceBlaster': 'spaceBlaster',
      'BlockBreaker': 'blockBreaker',
      'MazeRunner': 'mazeRunner',
      'SnakeEvolved': 'snakeEvolved'
    };
    return map[game] || game;
  }

  // ── Best times/waves ──
  function setBestWaves(w) {
    if (w > load().bestWaves) { data.bestWaves = w; persist(); }
  }
  function getBestWaves() { return load().bestWaves; }

  function setBestLevels(l) {
    if (l > load().bestLevels) { data.bestLevels = l; persist(); }
  }
  function getBestLevels() { return load().bestLevels; }

  function setBestMazeTime(t) {
    if (t < load().bestMazeTime) { data.bestMazeTime = t; persist(); }
  }
  function getBestMazeTime() { return load().bestMazeTime; }

  // ── Upgrades (Space Blaster) ──
  function getUpgradeLevel(game, upgrade) {
    load();
    if (data.upgrades[game] && data.upgrades[game][upgrade] !== undefined) {
      return data.upgrades[game][upgrade];
    }
    return 0;
  }

  function setUpgradeLevel(game, upgrade, level) {
    load();
    if (data.upgrades[game]) {
      data.upgrades[game][upgrade] = level;
      persist();
    }
  }

  // ── Stats ──
  function incrementStat(stat, amount) {
    load();
    if (data.stats[stat] !== undefined) {
      data.stats[stat] += (amount || 1);
      persist();
    }
  }

  function getStats() {
    return load().stats;
  }

  // ── Play time ──
  function addPlayTime(seconds) {
    load().totalPlayTime += seconds;
    persist();
  }

  function getTotalPlayTime() {
    return load().totalPlayTime;
  }

  function incrementGamesPlayed() {
    load().totalGamesPlayed++;
    persist();
  }

  // ── Reset ──
  function resetAll() {
    data = getDefaults();
    persist();
  }

  return {
    // Coins
    addCoins: addCoins,
    getCoins: getCoins,
    spendCoins: spendCoins,
    // High scores
    getHighScore: getHighScore,
    setHighScore: setHighScore,
    // Best waves/levels/times
    setBestWaves: setBestWaves,
    getBestWaves: getBestWaves,
    setBestLevels: setBestLevels,
    getBestLevels: getBestLevels,
    setBestMazeTime: setBestMazeTime,
    getBestMazeTime: getBestMazeTime,
    // Upgrades
    getUpgradeLevel: getUpgradeLevel,
    setUpgradeLevel: setUpgradeLevel,
    // Stats
    incrementStat: incrementStat,
    getStats: getStats,
    // Play time
    addPlayTime: addPlayTime,
    getTotalPlayTime: getTotalPlayTime,
    incrementGamesPlayed: incrementGamesPlayed,
    // Reset
    resetAll: resetAll,
    load: load,
  };
})();
