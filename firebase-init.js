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
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      _db = firebase.database();
      _auth = firebase.auth();

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
    if (!_db || !_uid) { console.log('Firebase not ready'); return; }
    _db.ref('admins/' + _uid).set(true).then(function() {
      _isAdmin = true;
      console.log('[SkyDrop] You are now admin! UID:', _uid);
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
    factoryReset: factoryReset
  };
})();

FB.init();
