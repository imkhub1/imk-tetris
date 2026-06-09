# 🎮 Tetris

Classic **Tetris** implementation in vanilla JavaScript, using HTML5 Canvas and CSS. No external dependencies, no frameworks, no build step: just open and play.

<div align="center">

[![▶ PLAY NOW](https://img.shields.io/badge/▶%20%20PLAY%20NOW-7eff6e?style=for-the-badge&labelColor=0d1117&color=7eff6e&logoColor=7eff6e)](https://imkhub1.github.io/imk-tetris/)

</div>
![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-orange)
![CSS3](https://img.shields.io/badge/CSS3-blueviolet)
![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## 📸 Preview

> 💡 **No install needed** → click the green badge above to play in the browser.

| Start screen | Gameplay | Game Over |
|---|---|---|
| ![Start screen](assets/start-screen.jpg) | ![Gameplay](assets/gameplay.gif) | ![Game Over](assets/game-over.jpg) |

---

## What's included?

- **10 × 20** cell board.
- All **7 standard pieces** (I, O, T, S, Z, J, L) with distinct colors.
- **Rotation** with *wall kicks* (±1, ±2 columns to rotate near walls).
- **Soft drop** (accelerated fall) and **Hard drop** (instant drop, also with mouse click).
- **Ghost piece**: shows where the piece will land.
- **Next piece preview**.
- **Block skin selector** (**Pastel**, **Arcade**, and **Glass**).
- Classic **scoring system** (100 / 300 / 500 / 800 × level).
- **Levels** that increase every 10 lines and speed up the fall.
- **3-2-1 countdown** before each game starts.
- **Pause** and **Game Over** with restart option.
- **High scores table** with name entry, persisted in `localStorage`.
- **Audio**: sound effects and synthesized background music (menu and gameplay).
- **Volume control** and **mute** in the pause menu.
- **Light / dark mode** (toggle, persisted in `localStorage`).
- **Freeze mode**: freezes the game without showing the pause menu.

---

## How to run

Nothing to install. Two options:

### Option 1: open directly

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Option 2: local server (recommended)

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in the browser.

---

## Controls

| Key               | Action                             |
| ----------------- | ---------------------------------- |
| `←` / `→`        | Move horizontally                  |
| `↑`               | Rotate clockwise                   |
| `↓`               | Soft drop (fall faster)            |
| `Space`           | Hard drop (instant drop)           |
| Click on board    | Hard drop (instant drop)           |
| `P` / `Escape`    | Pause / resume                     |
| `Enter`           | Restart (on Game Over)             |

---

## Project structure

```
tetris/
├── assets/          # Screenshots and GIFs for README
├── index.html       # DOM structure and canvas
├── style.css        # Styles (dark retro arcade theme)
├── theme-init.js    # Applies saved theme before first render (prevents flash)
├── audio.js         # Audio engine: SFX and synthesized music (Web Audio API)
├── game.js          # Full game logic
└── README.md
```

---

## How it works

### `index.html`
Defines the visual structure:
- A `<canvas id="board">` of **300 × 600** px (main board).
- A `<canvas id="next">` of **120 × 120** px (preview).
- Side panels with score/lines/level and next piece preview.
- Overlay for pause and game over.

### `style.css`
*Dark retro arcade* aesthetic:
- CSS variables for colors and neon effects.
- `Press Start 2P` typography (pixel art).
- Glow effects with `text-shadow` and `box-shadow`.
- Subtle background grid.

### `game.js`
Contains all logic (~1,400 lines):

| Function        | Responsibility                                      |
|-----------------|-----------------------------------------------------|
| `init()`        | Resets the full game state                          |
| `createBoard()` | Creates the ROWS × COLS matrix filled with zeros    |
| `spawn()`       | Places the next piece as active                     |
| `collide()`     | Detects collisions with walls and locked blocks     |
| `rotateCW()`    | Rotates a matrix 90° clockwise                      |
| `tryRotate()`   | Attempts rotation with wall kicks                   |
| `lockPiece()`   | Locks the piece onto the board                      |
| `clearLines()`  | Clears complete lines and updates score             |
| `getGhostY()`   | Calculates the final Y position of the ghost piece  |
| `draw()`        | Renders everything: grid, board, ghost, active piece|
| `loop()`        | Game loop with `requestAnimationFrame`              |

### Game flow

```
init()
  ├── createBoard()
  ├── next = randomPiece()
  ├── spawn() → moves next to current, generates new next
  └── requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├── accumulates dt
     ├── if dt ≥ dropInterval → drop or lock piece
     ├── draw()
     └── requestAnimationFrame(loop)

   keydown → move / rotate / soft-drop / hard-drop / pause
```

---

## Customization

Easy-to-adjust parameters in `game.js`:

| Constant       | Meaning                                    | Default               |
|----------------|--------------------------------------------|-----------------------|
| `COLS`         | Board columns                              | `10`                  |
| `ROWS`         | Board rows                                 | `20`                  |
| `BLOCK`        | Cell size in px                            | `30`                  |
| `COLORS`       | Color palette per piece type               | 7 neon colors         |
| `LINE_SCORES`  | Points for 1-4 lines cleared               | `[0,100,300,500,800]` |

> If you change `COLS`, `ROWS` or `BLOCK`, also update `width`/`height` on `<canvas id="board">` in `index.html`.

---

## Ideas for improvement

- [ ] Touch support (swipe) for mobile
- [ ] Flash animation when clearing lines
- [ ] Counter-clockwise rotation (`Z`)
- [ ] Hold piece
- [ ] Multiplayer mode

---

## Technologies

- **HTML5** – Canvas 2D API
- **CSS3** – Flexbox, CSS variables, animations
- **JavaScript ES6+** – No external dependencies

---

## License

Free to use for educational and practice purposes.
