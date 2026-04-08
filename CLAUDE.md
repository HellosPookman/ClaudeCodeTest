# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of browser games — single self-contained HTML files with inline CSS and vanilla JavaScript. No build tools, no dependencies, no bundler. Each game opens directly in a browser.

## Running Games

Open any `.html` file directly in a browser:
```bash
start shooter.html      # Windows
open shooter.html       # macOS
```

## Code Architecture

### Conventions (apply to all games)

- **Single file:** All HTML, CSS, and JS live in one `.html` file per game.
- **Canvas rendering:** Games use the `<canvas>` API with a fixed logical resolution (e.g. 640×480) scaled via CSS to fit the viewport.
- **Game loop:** `requestAnimationFrame` with delta-time (`dt = Math.min((ts - lastT) / 1000, 0.05)`). The dt cap prevents spiral-of-death on tab blur.
- **State machine:** A `gs` string variable (`'MENU'`, `'PLAYING'`, `'LVLCLEAR'`, `'GAMEOVER'`, `'WIN'`) drives both `update(dt)` and `render()` dispatchers.
- **Input:** `keydown/keyup` tracked in a `keys` object; `kjp` (keys-just-pressed) tracks single-frame presses and is cleared at the end of each `update()`.
- **Collision:** Circle-circle (`dx²+dy² < (r1+r2)²`) — no spatial hashing needed at these entity counts.
- **Sprites:** Pixel-art drawn entirely with `ctx.fillRect` via a `spr(grid, scale, ox, oy)` helper. Sprite grids are 2D arrays of hex color strings or `null` (transparent). Sprites are rotated with `ctx.save/translate/rotate/restore`.

### shooter.html — systems at a glance

| System | Key variables |
|---|---|
| Enemy types | `grunt`, `fast`, `tank`, `zigzag` — defined in `SCORE_FOR`, `COLOR_FOR`, and per-type config inside `spawnEnemy()` |
| Wave definitions | `LEVELS[]` array; beyond `LEVELS.length`, counts scale by `1 + 0.25 * bonus` |
| Wave clear | `waveSpawned > 0 && enemies.length === 0 && waveQueues.every(q => q.remaining <= 0)` |
| Player blink | `invT > 0 && Math.floor(invT * 10) % 2 === 0` |
| Enemy AI | `grunt/tank`: straight chase; `fast`: sinusoidal weave; `zigzag`: perpendicular sine offset |

## Git Workflow

Repository: https://github.com/HellosPookman/ClaudeCodeTest

After making changes, commit per game/feature and push:
```bash
git add <file>
git commit -m "descriptive message"
git push
```
