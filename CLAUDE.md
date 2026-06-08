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

## Adjusting constants

If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `width`/`height` attributes on `<canvas id="board">` in `index.html` to match (`COLS * BLOCK` × `ROWS * BLOCK`).
