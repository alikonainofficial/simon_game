# Simon

Watch the pattern, then repeat it. One of the cabinets in the arcade on
[alikonainofficial.github.io](https://alikonainofficial.github.io/#arcade).

**Play:** https://alikonainofficial.github.io/simon_game/

Every round adds one pad and replays the whole sequence, a little faster each
time. Miss a pad and the board shows you the one you should have pressed.

## Modes

- **Daily**: everyone gets the same sequence on the same date (`Daily #N`).
  Your first game of the day is the one that counts; later games still play
  but are practice runs. Play on consecutive days to build a streak, and use
  **Copy result** to share a line such as
  `Simon #318 · Level 14 🟩🟥🟦🟨 · 3-day streak` (the four squares are the
  first four pads of the day).
- **Endless**: a fresh random sequence every game. Copies
  `Simon · Level 14 · best 19`.
- **Practice** (works with either mode): a wrong pad doesn't end the game; the
  sequence replays and you try again. Practice games never save a score.

## Controls

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Green / Red / Yellow / Blue | `1` `2` `3` `4` or `↑` `→` `←` `↓` | tap the pad |
| Start / retry | `Space` or `Enter` | tap any pad, or the result screen |
| Restart | `R` | |
| Pause | `P` or `Esc` | |

## Privacy

The daily sequence is derived from the date on your device; nothing is sent
anywhere. Best scores, the daily result and the streak are kept in your
browser's `localStorage`. The page loads no fonts, libraries or other files
from anywhere else.

## Files

```
index.html
css/game.css          board, pads, mode bar
css/arcade-shell.css  shared arcade shell (identical in every cabinet; don't edit here)
js/game.js            the game
js/arcade-shell.js    shared arcade shell (identical in every cabinet; don't edit here)
```

Plain static site, no build step: open `index.html` or serve the folder.
