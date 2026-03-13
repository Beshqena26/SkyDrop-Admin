// =====================================================================
// SKYDROP II — FIREBASE INTEGRATION (ADMIN PANEL)
// =====================================================================
// This is the admin-only version. It connects to the SAME Firebase
// database as the game, but only exposes config, rounds, and admin
// functions (no game sync, no liveBets, no chat).
//
// IMPORTANT: The FIREBASE_CONFIG below must match the game's config
// exactly — both apps share one Firebase project.
// =====================================================================

// ██ PASTE YOUR FIREBASE CONFIG HERE (same as game) ██
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyAPPjhU1xFqVYVu4nxvTkTKxgCtO9ltN4U",
  authDomain: "skydrop-9b21b.firebaseapp.com",
  databaseURL: "https://skydrop-9b21b-default-rtdb.firebaseio.com",
  projectId: "skydrop-9b21b",
  storageBucket: "skydrop-9b21b.firebasestorage.app",
  messagingSenderId: "665217333875",
  appId: "1:665217333875:web:109afc988eae507f80c806"
};

// =====================================================================
// FIREBASE BRIDGE — Admin Panel Edition
// =====================================================================
var FB = (function() {
  var _db = null;
  var _auth = null;
  var _uid = null;
  var _isAdmin = false;
  var _ready = false;
  var _onReadyCbs = [];

  function _isConfigured() {
    return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
  }

  function init() {
    if (!_isConfigured()) {
      _ready = true;
      _onReadyCbs.forEach(function(cb) { try { cb(false); } catch(e) {} });
      _onReadyCbs = [];
      return;
    }
    try {
      // Use a SEPARATE app name ('admin') so the admin panel's anonymous
      // auth session does NOT overwrite the game's auth in the same browser.
      var _app = null;
      firebase.apps.forEach(function(a) { if (a.name === 'admin') _app = a; });
      if (!_app) _app = firebase.initializeApp(FIREBASE_CONFIG, 'admin');
      _db = _app.database();
      _auth = _app.auth();

      _auth.signInAnonymously().then(function(result) {
        _uid = result.user.uid;
        _trackConnection();

        _db.ref('admins/' + _uid).once('value').then(function(snap) {
          _isAdmin = !!snap.val();
        }).catch(function() {
          _isAdmin = false;
        }).then(function() {
          _ready = true;
          _onReadyCbs.forEach(function(cb) { try { cb(true); } catch(e) {} });
          _onReadyCbs = [];
        });
      }).catch(function() {
        _ready = true;
        _onReadyCbs.forEach(function(cb) { try { cb(false); } catch(e) {} });
        _onReadyCbs = [];
      });
    } catch(e) {
      _ready = true;
      _onReadyCbs.forEach(function(cb) { try { cb(false); } catch(e2) {} });
      _onReadyCbs = [];
    }
  }

  function onReady(cb) {
    if (_ready) { cb(_isConfigured() && !!_db); }
    else { _onReadyCbs.push(cb); }
  }

  var _connected = false;
  function _trackConnection() {
    if (!_db) return;
    _db.ref('.info/connected').on('value', function(snap) {
      _connected = !!snap.val();
    });
  }
  function isOnline() { return !!_db && _connected; }
  function isAdmin() { return _isAdmin; }
  function getUid() { return _uid; }

  // ─── CONFIG ───
  function saveConfig(data) {
    if (!_db) {
      localStorage.setItem('skydrop_admin_config', JSON.stringify(data));
      return Promise.resolve();
    }
    return _db.ref('config').set(data).then(function() {
      localStorage.setItem('skydrop_admin_config', JSON.stringify(data));
    });
  }

  function loadConfig() {
    if (!_db) {
      try {
        var s = localStorage.getItem('skydrop_admin_config');
        return Promise.resolve(s ? JSON.parse(s) : null);
      } catch(e) { return Promise.resolve(null); }
    }
    return _db.ref('config').once('value').then(function(snap) { return snap.val(); });
  }

  // ─── ROUNDS ───
  function loadRounds() {
    if (!_db) {
      try {
        var h = localStorage.getItem('skydrop_history');
        return Promise.resolve(h ? JSON.parse(h) : []);
      } catch(e) { return Promise.resolve([]); }
    }
    return _db.ref('rounds').orderByChild('ts').limitToLast(500).once('value').then(function(snap) {
      var arr = [];
      snap.forEach(function(child) { arr.unshift(child.val()); });
      return arr;
    });
  }

  function onNewRound(cb) {
    if (!_db) return;
    _db.ref('rounds').orderByChild('ts').limitToLast(1).on('child_added', function(snap) {
      var val = snap.val();
      if (val) { try { cb(val); } catch(e) {} }
    });
  }

  // ─── ADMIN ───
  function makeAdmin() {
    if (!_db || !_uid) { return Promise.reject('Firebase not ready'); }
    return _db.ref('admins/' + _uid).set(true).then(function() {
      _isAdmin = true;
    });
  }

  // Get stored admin password hash from Firebase
  function getAdminPassHash() {
    if (!_db) return Promise.resolve(null);
    return _db.ref('adminPassHash').once('value').then(function(snap) { return snap.val(); });
  }

  // Store admin password hash in Firebase
  function setAdminPassHash(hash) {
    if (!_db) return Promise.resolve();
    return _db.ref('adminPassHash').set(hash);
  }

  // Remove this UID from admins (logout)
  function revokeAdmin() {
    if (!_db || !_uid) return Promise.resolve();
    _isAdmin = false;
    return _db.ref('admins/' + _uid).remove();
  }

  // ─── CLEAR ROUNDS BY TIME ───
  // cutoffTs: timestamp — delete rounds with ts <= cutoffTs
  // If cutoffTs is 0, delete ALL rounds
  function clearRoundsByTime(cutoffTs) {
    if (!_db) return Promise.resolve(0);
    if (cutoffTs === 0) {
      return _db.ref('rounds').remove().then(function() { return -1; });
    }
    return _db.ref('rounds').orderByChild('ts').endAt(cutoffTs).once('value').then(function(snap) {
      var count = 0;
      var updates = {};
      snap.forEach(function(child) { updates[child.key] = null; count++; });
      if (count === 0) return 0;
      return _db.ref('rounds').update(updates).then(function() { return count; });
    });
  }

  // ─── FACTORY RESET ───
  function factoryReset() {
    if (!_db) return Promise.resolve();
    return Promise.all([
      _db.ref('config').remove(),
      _db.ref('chat').remove(),
      _db.ref('rounds').remove(),
      _db.ref('liveBets').remove(),
      _db.ref('game').remove()
    ]);
  }

  return {
    init: init,
    onReady: onReady,
    isOnline: isOnline,
    isAdmin: isAdmin,
    getUid: getUid,
    saveConfig: saveConfig,
    loadConfig: loadConfig,
    loadRounds: loadRounds,
    onNewRound: onNewRound,
    makeAdmin: makeAdmin,
    getAdminPassHash: getAdminPassHash,
    setAdminPassHash: setAdminPassHash,
    revokeAdmin: revokeAdmin,
    clearRoundsByTime: clearRoundsByTime,
    factoryReset: factoryReset
  };
})();

FB.init();
