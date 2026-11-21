/*
 * Simon: watch the pattern, then repeat it.
 * DOM board on top of the shared arcade shell (js/arcade-shell.js). No dependencies.
 *
 * States: idle -> showing -> listening -> between -> showing ... | listening -> dying -> over
 * Input only counts while state === 'listening'.
 */
(function () {
  'use strict';

  // Pad index 0..3 in reading order: green, red, yellow, blue.
  var PADS = [
    { name: 'green', freq: 392 },
    { name: 'red', freq: 330 },
    { name: 'yellow', freq: 262 },
    { name: 'blue', freq: 220 }
  ];
  var KEY_TO_PAD = {
    Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
    Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3,
    ArrowUp: 0, ArrowRight: 1, ArrowLeft: 2, ArrowDown: 3
  };
  var LEAD_IN = 600; // ms before a playback starts

  var board = document.getElementById('board');
  var padEls = Array.prototype.slice.call(board.querySelectorAll('.pad'));
  var hub = document.getElementById('hub');
  var hubMain = document.getElementById('hubMain');
  var hubSub = document.getElementById('hubSub');

  var state = 'idle';
  var seq = [];       // pad indices
  var level = 0;      // rounds completed
  var step = 0;       // position of the next expected input
  var timers = [];
  var litTimer = [0, 0, 0, 0];
  var nextAction = null; // what a 'between' / 'dying' pause resumes into
  var pausedFrom = null;

  // ------------------------------------------------------------ shell
  Arcade.init({ game: 'simon', title: 'Simon', onRestart: startRound, onPauseChange: onPause });
  var frame = document.querySelector('.arcade-frame');
  frame.style.aspectRatio = '';
  frame.insertBefore(board, frame.querySelector('.arcade-overlay'));

  // ------------------------------------------------------------ timing helpers
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timers.indexOf(id); if (k >= 0) timers.splice(k, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function cancelAll() {
    timers.forEach(clearTimeout);
    timers = [];
    nextAction = null;
    padEls.forEach(function (el) { el.classList.remove('lit'); });
  }
  // Enter a short transitional state that runs fn after ms (and resumes into fn after a pause).
  function transition(name, fn, ms) {
    state = name;
    nextAction = fn;
    later(function () { nextAction = null; fn(); }, ms);
  }
  function kick(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    later(function () { el.classList.remove(cls); }, ms);
  }

  function onMs() { return Math.max(250, 600 - level * 25); }

  // ------------------------------------------------------------ sound + light
  function unlockAudio() {
    var c = Arcade.sfx.context();
    if (c && c.state === 'suspended') c.resume();
  }
  function tone(i, ms) {
    Arcade.sfx.tone({ freq: PADS[i].freq, type: 'sine', dur: ms / 1000, vol: 0.35 });
  }
  function light(i, ms) {
    var el = padEls[i];
    clearTimeout(litTimer[i]);
    el.classList.add('lit');
    litTimer[i] = later(function () { el.classList.remove('lit'); }, ms);
  }

  // ------------------------------------------------------------ game flow
  function startRound() {
    cancelAll();
    Arcade.ui.hideOverlay();
    seq = [];
    level = 0;
    step = 0;
    nextRound();
  }

  function nextRound() {
    seq.push(Math.floor(Math.random() * 4));
    playSequence();
  }

  // Replay the whole sequence, then hand over to the player.
  function playSequence() {
    state = 'showing';
    step = 0;
    render();
    var on = onMs(), gap = Math.round(on * 0.4), t = LEAD_IN;
    seq.forEach(function (p) {
      later(function () { light(p, on); tone(p, on); }, t);
      t += on + gap;
    });
    later(function () { state = 'listening'; render(); }, t - gap);
  }

  function press(i) {
    unlockAudio();
    if (state === 'idle') { startRound(); return; }
    if (state !== 'listening') return;

    if (i === seq[step]) {
      var ms = Math.min(300, onMs());
      light(i, ms);
      tone(i, ms);
      step++;
      if (step === seq.length) {
        level++;
        later(function () { Arcade.sfx.play('score'); }, 150);
        transition('between', nextRound, 900);
        render();
      }
      return;
    }
    wrong();
  }

  function wrong() {
    Arcade.sfx.play('buzz');
    kick(board, 'wrong', 300);
    light(seq[step], 600); // show what it should have been
    transition('dying', gameOver, 900);
    render();
  }

  function gameOver() {
    state = 'over';
    render();
    Arcade.ui.overlay({
      kicker: 'Game over',
      title: 'Level ' + level,
      hint: 'Space or tap to retry',
      action: startRound
    });
  }

  // ------------------------------------------------------------ pause
  function onPause(p) {
    if (p) {
      if (['showing', 'listening', 'between', 'dying'].indexOf(state) < 0) return;
      var resume = (state === 'between' || state === 'dying') ? nextAction : playSequence;
      cancelAll();
      pausedFrom = resume;
      state = 'paused';
      render();
    } else if (state === 'paused') {
      var fn = pausedFrom; pausedFrom = null;
      fn();
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !Arcade.isPaused() &&
        ['showing', 'listening', 'between'].indexOf(state) >= 0) Arcade.pause(true, true);
  });

  // ------------------------------------------------------------ render
  function render() {
    Arcade.ui.hud({ Level: level });
    var main = String(level), sub = '';
    switch (state) {
      case 'idle': main = 'Start'; sub = 'tap a pad'; break;
      case 'showing': sub = 'watch'; break;
      case 'listening': sub = 'your turn'; break;
      case 'between': sub = 'nice'; break;
      case 'dying': sub = 'game over'; break;
      case 'over': case 'paused': main = ''; break; // the shell overlay carries the message

    }
    hubMain.textContent = main;
    hubSub.textContent = sub;
    hub.classList.toggle('can-start', state === 'idle');
  }

  // ------------------------------------------------------------ input
  padEls.forEach(function (el, i) {
    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault(); // no focus ring, no emulated mouse events, no text selection
      press(i);
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  hub.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    unlockAudio();
    if (state === 'idle') startRound();
  });

  // Registered after Arcade.init, so the shell's keydown (overlay Space/Enter, R, P/Esc) runs first
  // and marks what it handled with preventDefault.
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

    var pad = KEY_TO_PAD[e.code];
    var isGo = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (isGo && t && t.classList && t.classList.contains('pad')) pad = +t.dataset.pad; // focused pad
    else if (isGo && t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return; // let other buttons work

    if (pad != null) {
      e.preventDefault();
      if (Arcade.ui.overlayVisible()) return;
      press(pad);
    } else if (isGo) {
      e.preventDefault();
      if (state === 'idle' || (state === 'over' && !Arcade.ui.overlayVisible())) startRound();
    }
  });

  render();
})();
