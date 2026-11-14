# Simon — implementation plan

Repo: `alikonainofficial/simon_game` · Live: `https://alikonainofficial.github.io/simon_game/` · Game id for storage: `simon`

## 0. What the repo is today

`index.html` (four coloured `div.btn` pads in two rows, jQuery 3.5.1 from a CDN, a Google Font), `game.js` (~80 lines of jQuery), `styles.css`, and five MP3s in `sounds/` (`red`, `green`, `blue`, `yellow`, `wrong`). Press any key to start; each round pushes one random colour and **flashes only that new colour** (not the whole sequence); the user clicks pads; a wrong pad plays `wrong.mp3`, flashes the body red for 200 ms, sets the title to "Game Over, Press Any Key to Restart" and resets `level` to 0.

Known defects:

- The sequence is never replayed in full, so a single missed blink is an unavoidable loss.
- No input lock during playback; clicks during the flash count as answers.
- Starts on `keypress` only: no way to start on a phone.
- `new Audio()` per press (latency); `<div lass="row">` typo; CDN jQuery and Google Font break the site's "no third-party requests" rule.
- No high score, no speed-up, the reached level disappears on death.

This game is DOM-based, not canvas. It stays DOM-based; the shell is used for store, sfx, share, rng, ui.toast and the stage chrome, but the pads remain HTML elements.

## 1. Target

Standard Simon (full replay, speeds up), with a death screen that shows level and best, two modes — **Daily** (same sequence for everyone that day, with a day streak and a shareable result line) and **Endless** — plus a **Practice** toggle. Keyboard (1–4, arrows), mouse, touch. Zero-latency synthesized tones. No jQuery, no CDN.

## 2. File layout after

```
index.html
css/arcade-shell.css   (copied, unmodified)
css/game.css           pads, board, mode bar
js/arcade-shell.js     (copied, unmodified)
js/game.js             all game code (vanilla)
```
Delete `sounds/` once synthesized tones are in. Delete `styles.css`.

## 3. Steps

### Step 1 — Vanilla rewrite on the shell, same rules
1. Remove jQuery and the Google Font. Markup: `<div class="simon-board"><button class="pad pad-green" data-pad="0">…` ×4 (green, red, yellow, blue in reading order, so pad index 0–3). Put a `<canvas id="gameCanvas" width="800" height="600" style="display:none">` in the page so `Arcade.init` has something to wrap (the inline style beats the shell's `.arcade-frame canvas { display:block }`) — then move the board into `.arcade-frame` right after init (`const frame = document.querySelector('.arcade-frame'); frame.style.aspectRatio = ''; frame.appendChild(board)`) and leave the canvas hidden. Overlays, HUD, toast, mute and the back link then work unchanged. (Alternative: skip `Arcade.init` and only use `Arcade.store/sfx/share/rng/ui.toast`; if you do that, build the top bar, HUD and overlay in `game.js` with the shell CSS classes. Either is fine; the first keeps overlays for free.)
2. `Arcade.init({ game: 'simon', title: 'Simon', onRestart: startRound })`.
3. Game state machine: `idle → showing → listening → (level up) → showing … | → over`. Input is ignored unless `state === 'listening'`.
4. Replay the **whole** sequence each round. Timing per level: `on = max(250, 600 − level·25)` ms lit, gap `= on·0.4`. Light a pad by adding `.lit` (box-shadow bloom + brighter colour), remove after `on`.
5. Tones with `Arcade.sfx.tone`: green 392 Hz, red 330 Hz, yellow 262 Hz, blue 220 Hz (`type: 'sine'`, `dur: on/1000`, `vol: 0.35`). Wrong: `Arcade.sfx.play('buzz')`. Level up: `Arcade.sfx.play('score')`.
6. Input: pad `pointerdown` (not click, so touch is instant), keys `Digit1..4`, `Numpad1..4`, arrows (Up=green, Right=red, Down=blue, Left=yellow — document it in the HUD hint). Start/restart on any pad tap, Space, or Enter.
7. On a wrong pad: `.wrong` class on the board (shake 300 ms), the **correct** pad lights for 600 ms, `state = 'over'`, then the results overlay (Step 2).

Acceptance: classic Simon, full replay, speeds up, no double inputs, works on a phone.

### Step 2 — Score, best, results overlay
1. `level` = rounds completed. HUD: `Arcade.ui.hud({ Level, Best, Mode })`.
2. On game over: `const { best, isNew } = Arcade.store.best(mode === 'daily' ? 'dailyBest.' + todayKey : 'best', level)`; always also update `arcade.simon.best` (overall) so the portfolio card has one number. Overlay: kicker "Game over", title `Level {level}`, lines: `Best {best}` or `New best!`, buttons "Play again", "Copy result"; hint "Space or tap to retry".
3. `Arcade.store.bumpPlays()`.

### Step 3 — Daily mode, streak, share
1. Mode bar above the board: two toggle buttons **Daily** / **Endless** and a **Practice** checkbox. Persist the choice in `arcade.simon.mode`.
2. **Daily sequence:** `const rand = Arcade.rng.daily(7)`; generate the sequence lazily but deterministically: `seq[i] = Math.floor(rand() * 4)` drawn in order. Everyone gets the same `seq` on the same local date. Show `Daily #N` using `Arcade.rng.dayNumber()`.
3. One scored attempt per day in Daily: store `arcade.simon.daily` = `{ day: todayKey, level, attempts }`. Further attempts that day still play but the overlay says "Today's score stays at {level}; practice run". (Keep it soft: no lockout.)
4. **Streak:** `arcade.simon.streak` = `{ count, lastDay }`. On the first Daily attempt of the day: if `lastDay` was yesterday → `count++`, else if not today → `count = 1`. Show "🔥 3-day streak" in the HUD. No messaging about losing a streak.
5. **Share string** (Daily): `Simon #318 · Level 14 🟩🟥🟦🟨 · 3-day streak` where the four squares are the **first four pads of today's sequence** in emoji (🟩🟥🟨🟦 by colour) — a spoiler-light signature of the day. Endless: `Simon · Level 14 · best 19`. `Arcade.share.copy(text)`.
6. Endless uses `Math.random` and never affects the daily record.

### Step 4 — Practice toggle and feel
1. Practice on: a wrong pad does not end the game; the board shakes, the correct pad lights, then the whole sequence replays and the player tries again. Practice runs are never saved as bests (HUD shows "Practice").
2. Pad press: scale 0.96 for 80 ms, bloom; level-up: the board pulses once (scale 1.03) with `Arcade.sfx.play('score')`; new best: `Arcade.fx` is canvas-only, so do a CSS confetti-free gold flash on the board (`.board-flash` 300 ms).
3. Reduced motion: no shake/pulse, keep the lit states.

### Step 5 — Polish and ship
- `index.html` has a one-line hint under the board: "Watch, then repeat. Keys 1–4 or arrows."
- README: modes, controls, "daily sequence is derived from the date on your device; nothing is sent anywhere".
- Remove `sounds/`, `styles.css`, jQuery.

## 4. Data formats

- `arcade.simon.best` → number (highest level, any mode except practice)
- `arcade.simon.daily` → `{ day: 20261114, level: 14, attempts: 2 }`
- `arcade.simon.streak` → `{ count: 3, lastDay: 20261114 }`
- `arcade.simon.mode` → `'daily' | 'endless'`
- `arcade.simon.plays` → number
- Share (daily): `Simon #{dayNumber} · Level {level} {4 emoji} · {n}-day streak` (omit the streak part when count < 2)
- Share (endless): `Simon · Level {level} · best {best}`

## 5. Test checklist

- [ ] No network requests except the page's own files
- [ ] Full sequence replays each round; speed increases; input ignored during playback
- [ ] Tap, 1–4, arrows all work; start from a phone with no keyboard
- [ ] Two devices on the same date get the same Daily sequence (verify by logging the first 10 pads)
- [ ] Streak increments once per day, not per attempt
- [ ] Practice never writes a best
- [ ] Death shows level + best; `New best!` only when it is; Space retries instantly
- [ ] Copy produces the exact string with the right emoji
