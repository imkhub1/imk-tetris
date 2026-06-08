# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication style

When working in this repository, activate the `caveman` skill at the start of the session (invoke it via the Skill tool before responding to the first request). If the skill is not available in the current environment, continue normally without it.

## Running the game

No build step — open `index.html` directly or serve locally:

```
npx serve .
# then open http://localhost:3000
```

## Architecture

Single-file game logic in `game.js` (~460 lines, vanilla JS + Canvas 2D API). No dependencies, no bundler.

**Key state variables** (all module-level):
- `board` — 2D array `ROWS × COLS` (0 = empty, 1-7 = piece color index)
- `current` — active piece `{ matrix, x, y, colorIdx }`
- `next` — queued piece (same shape)
- `dropInterval` — computed by `calcDropInterval(level)`, drives the game loop

**Core game loop** (`loop` → `requestAnimationFrame`):
1. Accumulates `dt`; when `accumulated >= dropInterval` → auto-drop or `lockPiece()`
2. Calls `draw()` every frame: grid → locked blocks → ghost → active piece

**Piece representation**: each piece is a square matrix of integers matching COLORS index. Rotation is pure matrix math (`rotateCW`), wall kicks try offsets `[0, ±1, ±2]`.

**Canvas layout**:
- `#board` — 300×600 px (10 cols × 20 rows × 30 px/block)
- `#next` — 120×120 px (preview, uses `NEXT_BLOCK = 24` px)

**Scoring**: `LINE_SCORES[cleared] * level`; `+1` per row on soft drop, `+2` per cell on hard drop.

## Audio

Sound is a separate module, `audio.js`, loaded **before** `game.js` in `index.html`. It exposes one global, `Sfx`, and has no dependencies or asset files — every sound is generated on the fly with the Web Audio API (oscillators + filtered noise).

**Gain staging**: `voice → gameplayBus (1.0) / uiBus (0.5) → master → destination`. UI SFX route through `uiBus` so they always sit quieter than gameplay SFX. The persisted master volume and mute live on `master`.

**Browser-safe init**: the `AudioContext` is created lazily and resumed on the first trusted user gesture (`pointerdown`/`keydown`/`touchstart`), so there are no autoplay-policy errors.

**Anti-spam**: per-sound cooldowns (`throttled`) plus a global `MAX_VOICES` cap. Rapid input (move/rotate/soft-drop) cannot pile up.

**Persistence** (localStorage): `imktetris.audio.volume` (0–1) and `imktetris.audio.muted` (`'1'`/`'0'`).

**API**: `Sfx.play(name, arg)`, `Sfx.setVolume(v)`, `Sfx.getVolume()`, `Sfx.toggleMute()`, `Sfx.setMuted(m)`, `Sfx.isMuted()`, `Sfx.unlock()`. Sound names: `move`, `rotate`, `softdrop`, `harddrop`, `lock`, `lineclear(n)`, `levelup`, `pause`, `resume`, `gameover`, `uiclick`.

`game.js` calls `Sfx.play(...)` at the matching game events and wires the `#sound-toggle` (mute) and `#volume-slider` controls in the right panel. Interface buttons get `uiclick` via one delegated listener. To add a new sound, add an entry to the `sounds` map in `audio.js` and call `Sfx.play('name')` at the event site.

## Adjusting constants

If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `width`/`height` attributes on `<canvas id="board">` in `index.html` to match (`COLS * BLOCK` × `ROWS * BLOCK`).
