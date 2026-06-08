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

**Gain staging**: `voice → gameplayBus (1.0) / uiBus (0.5) → master → destination`, plus an `ambientBus (0.34) → master` for background ambience. UI SFX route through `uiBus` so they always sit quieter than gameplay SFX. The persisted master volume and mute live on `master`, so they also govern the ambience.

**Browser-safe init**: the `AudioContext` is created lazily and resumed on the first trusted user gesture (`pointerdown`/`keydown`/`touchstart`), so there are no autoplay-policy errors. `play()` also defers a voice via `ctx.resume().then(...)` when the context isn't running yet, so the first gesture's sound isn't dropped.

**Anti-spam**: per-sound cooldowns (`throttled`) plus a global `MAX_VOICES` cap. Rapid input (move/rotate/soft-drop) cannot pile up. The ambience uses dedicated long-lived nodes that are **not** voice-counted.

**Ambience**: `startAmbient()` builds a slow detuned drone (oscillators + a 0.05 Hz lowpass-filter LFO) routed through `ambientBus → master`; `stopAmbient()` fades it out and tears the nodes down. `game.js` starts it when a game begins and on resume, and stops it on pause, game over, and return-to-start.

**Persistence** (localStorage): `imktetris.audio.volume` (0–1) and `imktetris.audio.muted` (`'1'`/`'0'`).

**API**: `Sfx.play(name, arg)`, `Sfx.setVolume(v)`, `Sfx.getVolume()`, `Sfx.toggleMute()`, `Sfx.setMuted(m)`, `Sfx.isMuted()`, `Sfx.unlock()`, `Sfx.startAmbient()`, `Sfx.stopAmbient()`, `Sfx.isAmbientOn()`. Sound names: `move`, `rotate`, `softdrop`, `harddrop`, `lock`, `lineclear(n)`, `levelup`, `pause`, `resume`, `gameover`, `uiclick`, `gamestart`, `countbeep(go)`.

`game.js` calls `Sfx.play(...)` at the matching game events and wires the `#sound-toggle` / `#start-sound-toggle` (mute, kept in sync) and the `#volume-slider` (now inside the pause menu). The light/dark, sound, and freeze toggles sit in a vertical `.board-toggles` column in the right panel, below the skin selector. Interface buttons get `uiclick` via one delegated listener. To add a new sound, add an entry to the `sounds` map in `audio.js` and call `Sfx.play('name')` at the event site.

**Pre-game countdown**: `init()` sets `counting = true` and shows `#countdown`; the game loop renders a 3→2→1 overlay (CSS `countdown-pop` animation, `countbeep` per number) and blocks gravity/input until it finishes, then resets `accumulated` so gravity starts fresh.

## Adjusting constants

If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `width`/`height` attributes on `<canvas id="board">` in `index.html` to match (`COLS * BLOCK` × `ROWS * BLOCK`).
