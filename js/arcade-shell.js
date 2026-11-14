/*
 * arcade-shell.js — the shared "cabinet shell" for the alikonainofficial arcade games.
 *
 * Drop this file into each game repo as js/arcade-shell.js and load it with a plain
 * <script src="js/arcade-shell.js"></script> BEFORE the game's own scripts. No build step.
 * It exposes ONE global, window.Arcade, with these parts:
 *
 *   Arcade.init(opts)      wraps the canvas in a scaled, themed stage; adds HUD, overlay, back link
 *   Arcade.loop(update, draw)  requestAnimationFrame loop with delta time, pause and hit-stop
 *   Arcade.input           keyboard (by e.code) + pointer, in canvas logical coordinates
 *   Arcade.store           localStorage, namespaced per game, with best-score helper
 *   Arcade.sfx             synthesized Web Audio sound effects (no audio files needed)
 *   Arcade.fx              screen shake, flash, hit-stop, particles
 *   Arcade.ui              HUD strip, overlay (results / pause / start), toast
 *   Arcade.share           copy-to-clipboard with toast
 *   Arcade.rng             seeded PRNG (mulberry32), daily seed, day number
 *   Arcade.touch           on-screen d-pad / buttons, shown only on coarse pointers
 *   Arcade.theme           the portfolio's colours
 *   Arcade.fmt             small formatters (time, score)
 *
 * Everything is optional: a game can use only loop + store, or everything.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- theme
  var theme = {
    bg: '#0a1c1f', bgDeep: '#061315', surface: '#163a42', surface2: '#1e4852', line: '#2a5a63',
    text: '#eef3ec', muted: '#b3c8c0', brass: '#e2bb6e', brassHi: '#efd096', coral: '#ff7a59',
    rose: '#e7a196', cyan: '#5fe0d4', magenta: '#f08cc8', green: '#7ed9a0', red: '#e0564b',
    blue: '#5b8def', yellow: '#f2d16b', white: '#ffffff', black: '#04090a',
    fontHud: '"Pixelify Sans", "Silkscreen", "Courier New", monospace',
    fontBody: 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif'
  };

  // ---------------------------------------------------------------- state
  var S = {
    game: 'game', canvas: null, ctx: null, width: 800, height: 600,
    stage: null, hudEl: null, overlayEl: null, toastEl: null,
    running: false, paused: false, rafId: 0, lastT: 0, hitstopUntil: 0,
    update: null, draw: null, onRestart: null, onPauseChange: null,
    captured: {}, overlayAction: null
  };

  // ---------------------------------------------------------------- helpers
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }

  // ---------------------------------------------------------------- init
  function init(opts) {
    opts = opts || {};
    S.game = opts.game || 'game';
    S.canvas = opts.canvas || document.getElementById('gameCanvas');
    if (!S.canvas) throw new Error('Arcade.init: canvas not found');
    S.width = opts.width || S.canvas.width;
    S.height = opts.height || S.canvas.height;
    S.canvas.width = S.width; S.canvas.height = S.height;
    S.ctx = S.canvas.getContext('2d');
    S.onRestart = opts.onRestart || null;
    S.onPauseChange = opts.onPauseChange || null;

    document.documentElement.classList.add('arcade-html');
    document.body.classList.add('arcade-body');

    // Stage: [back link] [hud] [canvas] [touch] — the canvas is CSS-scaled, logical size stays.
    var stage = el('div', 'arcade-stage');
    var top = el('div', 'arcade-top');
    if (opts.back !== false) {
      var back = el('a', 'arcade-back', '&larr; Back to the club');
      back.href = opts.backHref || 'https://alikonainofficial.github.io/#arcade';
      top.appendChild(back);
    }
    var title = el('div', 'arcade-title', opts.title || document.title || '');
    top.appendChild(title);
    var mute = el('button', 'arcade-mute', '');
    mute.type = 'button';
    mute.title = 'Sound on/off';
    mute.addEventListener('click', function () { sfx.toggleMute(); syncMute(); });
    top.appendChild(mute);
    stage.appendChild(top);

    S.hudEl = el('div', 'arcade-hud');
    stage.appendChild(S.hudEl);

    var frame = el('div', 'arcade-frame');
    frame.style.aspectRatio = S.width + ' / ' + S.height;
    S.canvas.parentNode.insertBefore(stage, S.canvas);
    frame.appendChild(S.canvas);
    S.overlayEl = el('div', 'arcade-overlay arcade-hidden');
    frame.appendChild(S.overlayEl);
    stage.appendChild(frame);

    S.touchEl = el('div', 'arcade-touch');
    stage.appendChild(S.touchEl);

    S.toastEl = el('div', 'arcade-toast arcade-hidden');
    stage.appendChild(S.toastEl);

    S.stage = stage;
    S.canvas.style.touchAction = 'none';
    S.canvas.tabIndex = 0;

    input._attach();
    function syncMute() { mute.textContent = sfx.isMuted() ? 'Sound: off' : 'Sound: on'; }
    syncMute();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S.running && !S.paused) setPaused(true, true);
    });
    return S.ctx;
  }

  // ---------------------------------------------------------------- loop
  function loop(update, draw) {
    S.update = update; S.draw = draw;
    S.running = true; S.lastT = now();
    cancelAnimationFrame(S.rafId);
    S.rafId = requestAnimationFrame(frame);
  }
  function frame(t) {
    S.rafId = requestAnimationFrame(frame);
    var dt = (t - S.lastT) / 1000; S.lastT = t;
    dt = clamp(dt, 0, 0.05); // never let a tab switch produce a giant step
    var inHitstop = now() < S.hitstopUntil;
    if (!S.paused && !inHitstop && S.update) S.update(dt);
    fx._update(dt);
    if (S.draw) {
      var c = S.ctx; c.save();
      fx._begin(c);
      S.draw(c, dt);
      fx._particles(c);
      c.restore();
      fx._flash(c);
    }
    input._endFrame();
  }
  function setPaused(p, auto) {
    if (S.paused === p) return;
    S.paused = p;
    if (p) ui.overlay({ title: 'Paused', lines: auto ? ['Tab lost focus'] : [], hint: 'Space or P to continue', action: function () { setPaused(false); } });
    else ui.hideOverlay();
    if (S.onPauseChange) S.onPauseChange(p);
  }
  function togglePause() { setPaused(!S.paused); }
  function restart() {
    S.hitstopUntil = 0; fx.clear(); ui.hideOverlay(); S.paused = false;
    if (S.onRestart) S.onRestart();
  }

  // ---------------------------------------------------------------- input
  var input = {
    down: {}, pressed: {}, released: {},
    pointer: { x: 0, y: 0, down: false, justDown: false, justUp: false, id: null },
    pointers: {}, // id -> {x,y}
    _pointerDownCbs: [], _pointerUpCbs: [], _pointerMoveCbs: [],
    capture: function (codes) { codes.forEach(function (c) { S.captured[c] = true; }); },
    isDown: function (code) { return !!input.down[code]; },
    wasPressed: function (code) { return !!input.pressed[code]; },
    wasReleased: function (code) { return !!input.released[code]; },
    onPointerDown: function (cb) { input._pointerDownCbs.push(cb); },
    onPointerUp: function (cb) { input._pointerUpCbs.push(cb); },
    onPointerMove: function (cb) { input._pointerMoveCbs.push(cb); },
    // Fake a key from touch controls so games only ever read key codes.
    press: function (code) { if (!input.down[code]) { input.down[code] = true; input.pressed[code] = true; } },
    release: function (code) { if (input.down[code]) { input.down[code] = false; input.released[code] = true; } },
    _endFrame: function () {
      input.pressed = {}; input.released = {};
      input.pointer.justDown = false; input.pointer.justUp = false;
    },
    _toCanvas: function (e) {
      var r = S.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (S.width / r.width), y: (e.clientY - r.top) * (S.height / r.height) };
    },
    _attach: function () {
      document.addEventListener('keydown', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        sfx._unlock();
        if (e.repeat) { if (S.captured[e.code]) e.preventDefault(); return; }
        // Global shell keys
        if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) { restart(); e.preventDefault(); return; }
        if (e.code === 'KeyP' || e.code === 'Escape') { if (!S.overlayAction || S.paused) { togglePause(); e.preventDefault(); return; } }
        if (!S.overlayEl.classList.contains('arcade-hidden') && S.overlayAction && (e.code === 'Space' || e.code === 'Enter')) {
          var a = S.overlayAction; ui.hideOverlay(); a(); e.preventDefault(); return;
        }
        input.press(e.code);
        if (S.captured[e.code]) e.preventDefault();
      });
      document.addEventListener('keyup', function (e) { input.release(e.code); });
      window.addEventListener('blur', function () { input.down = {}; });

      var cv = S.canvas;
      cv.addEventListener('pointerdown', function (e) {
        sfx._unlock(); cv.setPointerCapture(e.pointerId);
        var p = input._toCanvas(e);
        input.pointers[e.pointerId] = p;
        if (input.pointer.id === null) { input.pointer.id = e.pointerId; input.pointer.x = p.x; input.pointer.y = p.y; input.pointer.down = true; input.pointer.justDown = true; }
        if (!S.overlayEl.classList.contains('arcade-hidden') && S.overlayAction) { var a = S.overlayAction; ui.hideOverlay(); a(); return; }
        input._pointerDownCbs.forEach(function (cb) { cb(p, e.pointerId); });
        e.preventDefault();
      });
      cv.addEventListener('pointermove', function (e) {
        var p = input._toCanvas(e);
        if (input.pointers[e.pointerId]) input.pointers[e.pointerId] = p;
        if (e.pointerId === input.pointer.id || input.pointer.id === null) { input.pointer.x = p.x; input.pointer.y = p.y; }
        input._pointerMoveCbs.forEach(function (cb) { cb(p, e.pointerId); });
      });
      function up(e) {
        var p = input._toCanvas(e);
        delete input.pointers[e.pointerId];
        if (e.pointerId === input.pointer.id) { input.pointer.id = null; input.pointer.down = false; input.pointer.justUp = true; }
        input._pointerUpCbs.forEach(function (cb) { cb(p, e.pointerId); });
      }
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
  };

  // ---------------------------------------------------------------- store
  var store = {
    key: function (k) { return 'arcade.' + S.game + '.' + k; },
    get: function (k, dflt) {
      try { var v = localStorage.getItem(store.key(k)); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; }
    },
    set: function (k, v) { try { localStorage.setItem(store.key(k), JSON.stringify(v)); } catch (e) { /* private mode */ } },
    remove: function (k) { try { localStorage.removeItem(store.key(k)); } catch (e) {} },
    // best(k, value) keeps the max; best(k, value, {lower:true}) keeps the min (times).
    // Returns {best, isNew}. Also bumps arcade.<game>.plays.
    best: function (k, value, o) {
      o = o || {};
      var prev = store.get(k, null), isNew = false;
      if (prev == null || (o.lower ? value < prev : value > prev)) { store.set(k, value); isNew = true; prev = value; }
      return { best: prev, isNew: isNew };
    },
    bumpPlays: function () { var n = (store.get('plays', 0) | 0) + 1; store.set('plays', n); return n; }
  };

  // ---------------------------------------------------------------- sfx (Web Audio, synthesized)
  var sfx = (function () {
    var ctx = null, master = null, muted = false;
    try { muted = localStorage.getItem('arcade.muted') === '1'; } catch (e) {}
    function ensure() {
      if (ctx) return ctx;
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
      return ctx;
    }
    function unlock() { var c = ensure(); if (c && c.state === 'suspended') c.resume(); }
    // tone({freq, dur, type, vol, slide, delay})  slide = end frequency for a pitch sweep
    function tone(o) {
      var c = ensure(); if (!c) return;
      o = o || {};
      var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.08;
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.freq || 440, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    function noise(o) {
      var c = ensure(); if (!c) return;
      o = o || {};
      var dur = o.dur || 0.1, t0 = c.currentTime + (o.delay || 0);
      var buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.cutoff || 1200;
      var g = c.createGain(); g.gain.setValueAtTime(o.vol || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t0);
    }
    // Decode a sample file once for games that keep real samples (the drum kit).
    var cache = {};
    function sample(url) {
      var c = ensure(); if (!c) return Promise.resolve(null);
      if (cache[url]) return cache[url];
      cache[url] = fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return c.decodeAudioData(b); });
      return cache[url];
    }
    function playSample(buffer, o) {
      var c = ensure(); if (!c || !buffer) return;
      o = o || {};
      var src = c.createBufferSource(); src.buffer = buffer; src.playbackRate.value = o.rate || 1;
      var g = c.createGain(); g.gain.value = o.vol == null ? 1 : o.vol;
      src.connect(g); g.connect(master); src.start(c.currentTime + (o.delay || 0));
    }
    var SEMI = Math.pow(2, 1 / 12);
    var presets = {
      // hit(n): pitch rises with n (combo index), resets when the game resets n
      hit: function (n) { tone({ freq: 440 * Math.pow(SEMI, (n || 0) % 24), dur: 0.06, type: 'square', vol: 0.25 }); },
      bounce: function () { tone({ freq: 220, slide: 180, dur: 0.05, type: 'triangle', vol: 0.3 }); },
      score: function () { tone({ freq: 660, dur: 0.07 }); tone({ freq: 880, dur: 0.1, delay: 0.07 }); },
      pickup: function () { tone({ freq: 523, dur: 0.05, type: 'triangle' }); tone({ freq: 784, dur: 0.08, delay: 0.05, type: 'triangle' }); },
      unlock: function () { tone({ freq: 330, dur: 0.06 }); tone({ freq: 440, dur: 0.06, delay: 0.06 }); tone({ freq: 660, dur: 0.12, delay: 0.12 }); },
      lose: function () { tone({ freq: 220, slide: 80, dur: 0.35, type: 'sawtooth', vol: 0.25 }); },
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, dur: 0.12, delay: i * 0.1, type: 'square', vol: 0.25 }); }); },
      tick: function () { tone({ freq: 880, dur: 0.03, type: 'square', vol: 0.15 }); },
      countdown: function (last) { tone({ freq: last ? 880 : 440, dur: last ? 0.4 : 0.12, type: 'square', vol: 0.3 }); },
      thud: function () { noise({ dur: 0.12, cutoff: 300, vol: 0.5 }); tone({ freq: 90, slide: 40, dur: 0.12, type: 'sine', vol: 0.5 }); },
      rattle: function () { for (var i = 0; i < 6; i++) noise({ dur: 0.03, cutoff: 3000, filter: 'highpass', vol: 0.15, delay: i * 0.09 }); },
      whoosh: function () { noise({ dur: 0.25, cutoff: 900, vol: 0.2 }); },
      buzz: function () { tone({ freq: 110, dur: 0.3, type: 'sawtooth', vol: 0.3 }); }
    };
    return {
      play: function (name, arg) { if (presets[name]) presets[name](arg); },
      tone: tone, noise: noise, sample: sample, playSample: playSample,
      isMuted: function () { return muted; },
      toggleMute: function () { muted = !muted; try { localStorage.setItem('arcade.muted', muted ? '1' : '0'); } catch (e) {} if (master) master.gain.value = muted ? 0 : 0.5; },
      context: function () { return ensure(); },
      _unlock: unlock
    };
  })();

  // ---------------------------------------------------------------- fx
  var fx = (function () {
    var shake = { amp: 0, until: 0, dur: 1 }, flash = { color: null, until: 0, dur: 1 }, parts = [];
    return {
      shake: function (amp, ms) { var u = now() + (ms || 120); if (amp >= shake.amp || now() > shake.until) { shake.amp = Math.min(amp, 12); shake.until = u; shake.dur = ms || 120; } },
      flash: function (color, ms) { flash.color = color || 'rgba(255,255,255,0.5)'; flash.until = now() + (ms || 60); flash.dur = ms || 60; },
      hitstop: function (ms) { S.hitstopUntil = Math.max(S.hitstopUntil, now() + Math.min(ms || 40, 120)); },
      // burst(x, y, {color, count, speed, life, size, gravity})
      burst: function (x, y, o) {
        o = o || {};
        var n = o.count || 8;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, sp = (o.speed || 180) * (0.4 + Math.random() * 0.8);
          parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: (o.life || 0.4) * (0.6 + Math.random() * 0.6), age: 0, size: o.size || 3, color: o.color || theme.brass, g: o.gravity == null ? 300 : o.gravity });
        }
        if (parts.length > 600) parts.splice(0, parts.length - 600);
      },
      clear: function () { parts = []; shake.until = 0; flash.until = 0; },
      _update: function (dt) {
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i]; p.age += dt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      },
      _begin: function (c) {
        if (now() < shake.until) {
          var k = (shake.until - now()) / shake.dur; // decays to 0
          c.translate((Math.random() * 2 - 1) * shake.amp * k, (Math.random() * 2 - 1) * shake.amp * k);
        }
      },
      _particles: function (c) {
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i]; c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.color;
          c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        c.globalAlpha = 1;
      },
      _flash: function (c) {
        if (now() < flash.until) { c.save(); c.globalAlpha = (flash.until - now()) / flash.dur; c.fillStyle = flash.color; c.fillRect(0, 0, S.width, S.height); c.restore(); }
      }
    };
  })();

  // ---------------------------------------------------------------- ui
  var ui = {
    // hud({Score: 120, Best: 300, Lives: '♥♥♥'}) — order preserved, re-rendered each call (cheap)
    hud: function (items) {
      var html = '';
      Object.keys(items).forEach(function (k) { html += '<span class="arcade-hud-item"><span class="arcade-hud-k">' + k + '</span><span class="arcade-hud-v">' + items[k] + '</span></span>'; });
      if (S.hudEl.innerHTML !== html) S.hudEl.innerHTML = html;
    },
    // overlay({title, lines:[...], hint, action, buttons:[{label, onClick}]}) — Space/Enter/tap runs action
    overlay: function (o) {
      o = o || {};
      var html = '<div class="arcade-overlay-box">';
      if (o.kicker) html += '<div class="arcade-kicker">' + o.kicker + '</div>';
      html += '<div class="arcade-overlay-title">' + (o.title || '') + '</div>';
      (o.lines || []).forEach(function (l) { html += '<div class="arcade-overlay-line">' + l + '</div>'; });
      if (o.buttons && o.buttons.length) {
        html += '<div class="arcade-overlay-buttons">';
        o.buttons.forEach(function (b, i) { html += '<button type="button" class="arcade-btn" data-i="' + i + '">' + b.label + '</button>'; });
        html += '</div>';
      }
      if (o.hint) html += '<div class="arcade-overlay-hint">' + o.hint + '</div>';
      html += '</div>';
      S.overlayEl.innerHTML = html;
      S.overlayEl.classList.remove('arcade-hidden');
      S.overlayAction = o.action || null;
      if (o.buttons) {
        Array.prototype.forEach.call(S.overlayEl.querySelectorAll('.arcade-btn'), function (btn) {
          btn.addEventListener('click', function (e) { e.stopPropagation(); var b = o.buttons[+btn.dataset.i]; if (b.keepOpen !== true) ui.hideOverlay(); b.onClick(); });
        });
      }
      S.overlayEl.onclick = function (e) { if (e.target === S.overlayEl && S.overlayAction) { var a = S.overlayAction; ui.hideOverlay(); a(); } };
    },
    hideOverlay: function () { S.overlayEl.classList.add('arcade-hidden'); S.overlayAction = null; },
    overlayVisible: function () { return !S.overlayEl.classList.contains('arcade-hidden'); },
    toast: function (text, ms) {
      S.toastEl.textContent = text; S.toastEl.classList.remove('arcade-hidden');
      clearTimeout(ui._t); ui._t = setTimeout(function () { S.toastEl.classList.add('arcade-hidden'); }, ms || 1600);
    },
    // Draw a banner on the canvas for the current frame (call from draw())
    banner: function (c, text, o) {
      o = o || {};
      c.save(); c.font = (o.size || 48) + 'px ' + theme.fontHud; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,0,0.55)'; var w = c.measureText(text).width + 40;
      c.fillRect(S.width / 2 - w / 2, (o.y || S.height / 2) - (o.size || 48) * 0.8, w, (o.size || 48) * 1.6);
      c.fillStyle = o.color || theme.coral; c.fillText(text, S.width / 2, o.y || S.height / 2); c.restore();
    },
    text: function (c, text, x, y, o) {
      o = o || {};
      c.save(); c.font = (o.size || 18) + 'px ' + theme.fontHud; c.textAlign = o.align || 'left'; c.textBaseline = o.baseline || 'top';
      c.fillStyle = o.color || theme.text; c.fillText(text, x, y); c.restore();
    }
  };

  // ---------------------------------------------------------------- share
  var share = {
    copy: function (text, toastText) {
      function done() { ui.toast(toastText || 'Copied to clipboard'); }
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { share._fallback(text); done(); }); }
      else { share._fallback(text); done(); }
    },
    _fallback: function (text) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
    }
  };

  // ---------------------------------------------------------------- rng
  var rng = {
    mulberry32: function (seed) {
      var a = seed >>> 0;
      return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    },
    // Local calendar day as YYYYMMDD and as a day number since 2026-01-01 (for "Simon #312")
    todayKey: function () { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); },
    dayNumber: function () { var d = new Date(); var e = new Date(2026, 0, 1); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())) / 86400000) + 1; },
    daily: function (salt) { return rng.mulberry32(rng.todayKey() * 31 + (salt || 0)); },
    secureInt: function (n) { // 0..n-1 using crypto when available
      if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
      return Math.floor(Math.random() * n);
    }
  };

  // ---------------------------------------------------------------- touch
  var touch = {
    isCoarse: function () { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; },
    // dpad({up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight'}, side) → fakes key codes
    dpad: function (map, side) {
      if (!touch.isCoarse()) return null;
      var pad = el('div', 'arcade-dpad arcade-dpad-' + (side || 'left'));
      [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']].forEach(function (d) {
        var b = el('button', 'arcade-dpad-btn arcade-dpad-' + d[0], d[1]); b.type = 'button';
        var code = map[d[0]]; if (!code) { b.style.visibility = 'hidden'; }
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); sfx._unlock(); b.setPointerCapture(e.pointerId); input.press(code); });
        function up(e) { input.release(code); }
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        pad.appendChild(b);
      });
      S.touchEl.appendChild(pad); return pad;
    },
    // buttons([{label:'A', code:'Space'}], side)
    buttons: function (list, side) {
      if (!touch.isCoarse()) return null;
      var box = el('div', 'arcade-tbtns arcade-tbtns-' + (side || 'right'));
      list.forEach(function (it) {
        var b = el('button', 'arcade-tbtn', it.label); b.type = 'button';
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); sfx._unlock(); b.setPointerCapture(e.pointerId); input.press(it.code); if (it.onDown) it.onDown(); });
        function up() { input.release(it.code); if (it.onUp) it.onUp(); }
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        box.appendChild(b);
      });
      S.touchEl.appendChild(box); return box;
    }
  };

  // ---------------------------------------------------------------- fmt
  var fmt = {
    time: function (ms, digits) { return (ms / 1000).toFixed(digits == null ? 2 : digits) + ' s'; },
    delta: function (ms) { return (ms >= 0 ? '+' : '−') + (Math.abs(ms) / 1000).toFixed(2) + ' s'; },
    pad: function (n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  };

  window.Arcade = {
    theme: theme, init: init, loop: loop, restart: restart, pause: setPaused, togglePause: togglePause,
    isPaused: function () { return S.paused; }, size: function () { return { w: S.width, h: S.height }; },
    input: input, store: store, sfx: sfx, fx: fx, ui: ui, share: share, rng: rng, touch: touch, fmt: fmt
  };
})();
