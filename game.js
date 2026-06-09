/* ============================================================
   TETRIS – game.js
   Complete game logic. Vanilla JS + Canvas 2D API.
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────
const COLS         = 10;
const ROWS         = 20;
const BLOCK        = 30;
const NEXT_BLOCK   = 24;
const HS_KEY       = 'imktetris.highscores';
const MAX_HS       = 5;
const HS_NAME_MAX_LEN = 10;
const HS_NAME_FALLBACK = 'AAA';

// Neighbor bitmask for skins that merge adjacent cells (top/right/bottom/left)
const NB_TOP = 1, NB_RIGHT = 2, NB_BOTTOM = 4, NB_LEFT = 8;

// Animation durations (ms). All motion is skipped under prefers-reduced-motion.
const CLEAR_DURATION = 340; // line-clear flash + collapse
const SPAWN_DURATION = 140; // active-piece pop-in
const SHAKE_DURATION = 220; // hard-drop impact shake
const TRAIL_DURATION = 240; // hard-drop motion streak + afterimages
const COUNTDOWN_MS   = 3000; // pre-game 3-2-1 countdown (gravity blocked)

// ── Brick rendering helpers ───────────────────────────────────
/** Lighten (amt>0, toward white) or darken (amt<0, toward black) a #rrggbb color. */
function shade(hex, amt) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  if (amt >= 0) {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  } else {
    const k = 1 + amt; r *= k; g *= k; b *= k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** #rrggbb → rgba() string with the given alpha. */
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Path a rect with per-corner radii {tl,tr,br,bl}. */
function roundRectPath(ctx, x, y, w, h, radii) {
  const { tl, tr, br, bl } = radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Corner radius is full only when both touching edges are open (no neighbor). */
function cornerRadii(neighbors, radius) {
  const open = side => (neighbors & side) === 0;
  const t = open(NB_TOP), r = open(NB_RIGHT), b = open(NB_BOTTOM), l = open(NB_LEFT);
  return {
    tl: t && l ? radius : 0,
    tr: t && r ? radius : 0,
    br: b && r ? radius : 0,
    bl: b && l ? radius : 0,
  };
}

/** Draw bevel highlight/shadow only on outer edges (open sides) so cells merge. */
function bevelEdges(ctx, x, y, w, h, neighbors, hi, lo, thick) {
  if ((neighbors & NB_TOP) === 0) { ctx.fillStyle = hi; ctx.fillRect(x, y, w, thick); }
  if ((neighbors & NB_LEFT) === 0) { ctx.fillStyle = hi; ctx.fillRect(x, y, thick, h); }
  if ((neighbors & NB_BOTTOM) === 0) { ctx.fillStyle = lo; ctx.fillRect(x, y + h - thick, w, thick); }
  if ((neighbors & NB_RIGHT) === 0) { ctx.fillStyle = lo; ctx.fillRect(x + w - thick, y, thick, h); }
}

// ── Skins ─────────────────────────────────────────────────────
const SKINS = {
  pastel: {
    palette: [
      null,
      '#7dd9e8', // I – cyan/teal (elevated brightness)
      '#f3d97d', // O – yellow (refined, less saturated)
      '#c9a8e0', // T – purple (softened)
      '#85d99f', // S – green (lifted)
      '#f09bb5', // Z – pink (muted)
      '#748ae8', // J – royal blue (desaturated edge)
      '#f0ab6f', // L – orange (warmed)
    ],
    drawBlockFn(ctx, col, row, color, size, neighbors = 0) {
      const x = col * size;
      const y = row * size;
      const rx = x + 1, ry = y + 1, w = size - 2, h = size - 2;
      const radius = Math.max(2, size * 0.18);
      const radii = cornerRadii(neighbors, radius);

      // Soft vertical gradient body — gentle, low-contrast pastel depth.
      const grad = ctx.createLinearGradient(0, ry, 0, ry + h);
      grad.addColorStop(0, shade(color, boardIsLight ? 0.18 : 0.12));
      grad.addColorStop(0.5, color);
      grad.addColorStop(1, shade(color, boardIsLight ? -0.10 : -0.16));
      roundRectPath(ctx, rx, ry, w, h, radii);
      ctx.fillStyle = grad;
      ctx.fill();

      // Clip to the rounded body so bevels never spill onto neighbors.
      ctx.save();
      roundRectPath(ctx, rx, ry, w, h, radii);
      ctx.clip();
      const hi = boardIsLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.38)';
      const lo = boardIsLight ? 'rgba(60,50,80,0.16)' : 'rgba(0,0,0,0.26)';
      bevelEdges(ctx, rx, ry, w, h, neighbors, hi, lo, 1.5);
      ctx.restore();

      // Crisp 1px contour for definition.
      roundRectPath(ctx, rx + 0.5, ry + 0.5, w - 1, h - 1, radii);
      ctx.strokeStyle = boardIsLight ? 'rgba(40,30,60,0.18)' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
  },
  arcade: {
    palette: [
      null,
      '#2ddeff', // I – cyan (refined)
      '#ffd650', // O – yellow (balanced)
      '#b968ff', // T – purple (softened)
      '#45e060', // S – green (elevated)
      '#ff6b95', // Z – pink (harmonic)
      '#5f7eff', // J – blue (adjusted)
      '#ff9d4d', // L – orange (warmed)
    ],
    drawBlockFn(ctx, col, row, color, size, neighbors = 0) {
      const x = col * size;
      const y = row * size;
      const rx = x + 1, ry = y + 1, w = size - 2, h = size - 2;
      const bw = Math.max(2, size * 0.13); // bevel thickness

      // Solid base.
      ctx.fillStyle = color;
      ctx.fillRect(rx, ry, w, h);

      // Glossy vertical sheen across the face.
      const gloss = ctx.createLinearGradient(0, ry, 0, ry + h);
      gloss.addColorStop(0, boardIsLight ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.30)');
      gloss.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      gloss.addColorStop(0.55, 'rgba(0,0,0,0.04)');
      gloss.addColorStop(1, boardIsLight ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.30)');
      ctx.fillStyle = gloss;
      ctx.fillRect(rx, ry, w, h);

      // Chunky arcade bevel — bright top/left, dark bottom/right, only on open edges.
      bevelEdges(ctx, rx, ry, w, h, neighbors,
        shade(color, 0.55), shade(color, -0.42), bw);

      // Crisp double contour for that sharp cabinet look.
      ctx.lineWidth = 1;
      ctx.strokeStyle = boardIsLight ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.22)';
      ctx.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1);
      ctx.strokeStyle = boardIsLight ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.50)';
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    },
  },
  glass: {
    palette: [
      null,
      '#3ff5ff', // I – cyan (vibrant)
      '#ffd560', // O – yellow (golden)
      '#d960ff', // T – purple (refined)
      '#50ffaa', // S – green (lifted)
      '#ff6fa0', // Z – pink (harmonic)
      '#7080ff', // J – blue (balanced)
      '#ff9560', // L – orange (warm)
    ],
    drawBlockFn(ctx, col, row, color, size, neighbors = 0) {
      const x = col * size;
      const y = row * size;
      const rx = x + 1, ry = y + 1, w = size - 2, h = size - 2;
      const radius = Math.max(2, size * 0.16);
      const radii = cornerRadii(neighbors, radius);
      const t = renderClock;
      const pulse = (Math.sin(t * 3.2 + col * 0.5 + row * 0.4) + 1) * 0.5;

      // Translucent diagonal body.
      const base = ctx.createLinearGradient(rx, ry, rx + w, ry + h);
      base.addColorStop(0, shade(color, 0.30));
      base.addColorStop(0.4, color);
      base.addColorStop(1, shade(color, boardIsLight ? -0.12 : -0.28));
      roundRectPath(ctx, rx, ry, w, h, radii);
      ctx.fillStyle = base;
      ctx.fill();

      ctx.save();
      roundRectPath(ctx, rx, ry, w, h, radii);
      ctx.clip();

      // Top specular highlight — glossy glass sheen.
      const spec = ctx.createLinearGradient(0, ry, 0, ry + h * 0.6);
      spec.addColorStop(0, `rgba(255,255,255,${0.40 + pulse * 0.18})`);
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.fillRect(rx, ry, w, h * 0.6);

      // Animated diagonal light sweep.
      const span = w + h + 12;
      const sweep = ((t * 55) + (col - row) * 6) % span - 6;
      const glow = boardIsLight
        ? `rgba(255,250,235,${0.16 + pulse * 0.12})`
        : `rgba(210,250,255,${0.12 + pulse * 0.16})`;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rx + sweep - h, ry + h);
      ctx.lineTo(rx + sweep, ry);
      ctx.stroke();

      // Soft inner shadow along the bottom for depth.
      const sh = ctx.createLinearGradient(0, ry + h - h * 0.4, 0, ry + h);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = sh;
      ctx.fillRect(rx, ry + h - h * 0.4, w, h * 0.4);
      ctx.restore();

      // Bright glass rim + crisp outer edge.
      roundRectPath(ctx, rx + 0.5, ry + 0.5, w - 1, h - 1, radii);
      ctx.strokeStyle = `rgba(255,255,255,${0.30 + pulse * 0.16})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      roundRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, radii);
      ctx.strokeStyle = boardIsLight ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.34)';
      ctx.stroke();
    },
  },
};

// ── Active skin ───────────────────────────────────────────────
let activeSkin = 'pastel';

// Set once per render pass so skins/ghost can render light-aware without
// querying the DOM per block. The next-piece preview always lives on the dark
// right panel, so it forces this to false.
let boardIsLight = false;
let renderClock = 0;

// Skins animate the board canvas via JS; honor the OS reduced-motion setting.
const prefersReducedMotion =
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Frozen timestamp when reduced motion is requested, so glass renders static.
function skinClock() {
  return prefersReducedMotion ? 0 : performance.now() * 0.001;
}

function getPalette() {
  return SKINS[activeSkin].palette;
}

function setSkin(name) {
  if (!SKINS[name]) return;
  activeSkin = name;

  try { localStorage.setItem('imktetris.skin', name); } catch (_) {}

  document.querySelectorAll('.skin-btn').forEach(btn => {
    const isActive = btn.dataset.skin === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Only re-render if the game is already running (current is defined)
  if (current) {
    draw();
    drawNextPiece();
  }

  // Brief crossfade flash on both canvases (neutralized by reduced-motion CSS).
  [boardCanvas, nextCanvas].forEach(cv => {
    cv.classList.remove('skin-swap');
    void cv.offsetWidth; // restart the animation
    cv.classList.add('skin-swap');
  });
}

// Piece definitions: each is a square matrix.
// Index matches the skin palettes (1-7).
const PIECES = [
  null,
  // I (4×4)
  [[0,0,0,0],
   [1,1,1,1],
   [0,0,0,0],
   [0,0,0,0]],
  // O (2×2)
  [[2,2],
   [2,2]],
  // T (3×3)
  [[0,3,0],
   [3,3,3],
   [0,0,0]],
  // S (3×3)
  [[0,4,4],
   [4,4,0],
   [0,0,0]],
  // Z (3×3)
  [[5,5,0],
   [0,5,5],
   [0,0,0]],
  // J (3×3)
  [[6,0,0],
   [6,6,6],
   [0,0,0]],
  // L (3×3)
  [[0,0,7],
   [7,7,7],
   [0,0,0]],
];

// Points per cleared lines (multiplied by level)
const LINE_SCORES = [0, 100, 300, 500, 800];

// ── DOM References ────────────────────────────────────────────
const boardCanvas  = document.getElementById('board');
const boardCtx     = boardCanvas.getContext('2d');
const boardWrapper = document.querySelector('.board-wrapper');
const nextCanvas   = document.getElementById('next');
const nextCtx      = nextCanvas.getContext('2d');

const elScore      = document.getElementById('score');
const elLines      = document.getElementById('lines');
const elLevel      = document.getElementById('level');
const elCombo      = document.getElementById('combo');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-sub');
const themeToggle  = document.getElementById('theme-toggle');
const freezeToggle = document.getElementById('freeze-toggle');
const pauseMenu          = document.getElementById('pause-menu');
const btnResume          = document.getElementById('btn-resume');
const btnRestart         = document.getElementById('btn-restart');
const btnStartScreen     = document.getElementById('btn-start-screen');
const btnLevelDec        = document.getElementById('btn-level-dec');
const btnLevelInc        = document.getElementById('btn-level-inc');
const startLevelDisplay  = document.getElementById('start-level-display');

const countdownEl        = document.getElementById('countdown');
const countdownNumber    = document.getElementById('countdown-number');

const startScreen     = document.getElementById('start-screen');
const startHsBody     = document.getElementById('start-hs-body');
const startResetBtn   = document.getElementById('start-reset-btn');
const startThemeToggle = document.getElementById('start-theme-toggle');
const pressEnter       = document.querySelector('.press-enter');

const nameEntry    = document.getElementById('name-entry');
const nameInput    = document.getElementById('name-input');
const nameSaveBtn  = document.getElementById('name-save-btn');

const overlayHsSection = document.getElementById('overlay-hs-section');
const overlayHsBody    = document.getElementById('overlay-hs-body');
const overlayResetBtn  = document.getElementById('overlay-reset-btn');

// ── Game State ────────────────────────────────────────────────
let board;        // ROWS × COLS matrix
let current;      // { matrix, x, y, colorIdx }
let next;         // next piece
let score;
let lines;
let level;
let combo;        // consecutive clear streak
let maxCombo;     // session max combo
let maxLinesSession; // session max lines cleared in one move
let dropInterval; // ms between auto-drops
let lastTime;     // last frame timestamp
let accumulated;  // time accumulated since last drop
let paused;
let frozen;
let gameOver;
let animId;       // requestAnimationFrame handle
let counting;     // true during the pre-game 3-2-1 countdown
let countStart;   // performance timestamp when the countdown began (null until first frame)
let countShown;   // last number rendered (so we only animate/beep on change)
let waitingForName; // true when game-over name-entry is pending
let newRecordIdx;   // index in highscores where new entry was inserted
let hardDropMouseDown;

// ── Animation state ───────────────────────────────────────────
let clearing = false;   // true while a line-clear animation plays
let clearRows = [];     // row indices being cleared
let clearStart = 0;     // performance.now() when clear anim began
let spawnAt = 0;        // performance.now() of the last spawn (pop-in)
let shakeStart = 0;     // performance.now() of last hard-drop impact
let shakeAmp = 0;       // current shake amplitude (0 = inactive)
let hardDropTrail = null; // snapshot of the last hard-drop path for the trail FX

// Starting level for next game (persists across games in session)
let startLevel = 1;

// ── localStorage helpers ──────────────────────────────────────
function loadHighScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function saveHighScores(hs) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(hs));
  } catch (_) { /* ignore quota errors */ }
}

function resetHighScores() {
  try {
    localStorage.removeItem(HS_KEY);
  } catch (_) {}
}

function confirmResetHighScores() {
  return window.confirm('Are you sure you want to delete all records? This cannot be undone.');
}

const HS_NAME_CHAR_RE = /[\p{L}\p{N}]/u;

function sanitizeHsName(raw) {
  const source = String(raw ?? '').normalize('NFC').toUpperCase();
  const chars = [];
  for (const ch of source) {
    if (!HS_NAME_CHAR_RE.test(ch)) continue;
    chars.push(ch);
    if (chars.length >= HS_NAME_MAX_LEN) break;
  }
  return chars.join('');
}

function getValidHsName(raw) {
  const cleaned = sanitizeHsName(raw);
  return cleaned || HS_NAME_FALLBACK;
}

/** Returns true if score qualifies for top-5. */
function qualifiesForTop5(s) {
  const hs = loadHighScores();
  return hs.length < MAX_HS || s >= hs[hs.length - 1].score;
}

/** Insert a record, sort desc, keep top 5. Returns the new index (-1 if not kept). */
function insertHighScore(record) {
  const hs = loadHighScores();
  // Tag entries so the sort stays stable but the just-added record wins ties.
  // qualifiesForTop5 lets a score that *ties* the lowest entry through, so the
  // new record must sort ahead of equal-score existing ones or it would be
  // trimmed away and silently lost.
  const tagged = hs.map(r => ({ r, isNew: false }));
  tagged.push({ r: record, isNew: true });
  tagged.sort((a, b) => (b.r.score - a.r.score) || (a.isNew ? -1 : b.isNew ? 1 : 0));
  const trimmed = tagged.slice(0, MAX_HS).map(t => t.r);
  saveHighScores(trimmed);
  return trimmed.indexOf(record);
}

// ── High-score table rendering ────────────────────────────────
function renderHsTable(tbody, highlightIdx) {
  const hs = loadHighScores();
  tbody.innerHTML = '';
  if (hs.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'No records yet';
    td.style.textAlign = 'center';
    td.style.color = 'var(--muted)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  hs.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIdx) tr.classList.add('hs-new');
    const safeName = getValidHsName(entry.name);
    [i + 1, safeName, entry.score, entry.lines, entry.combo].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ── Start Screen ──────────────────────────────────────────────
function showStartScreen() {
  renderHsTable(startHsBody, -1);
  startScreen.classList.remove('hidden');
  Sfx.startMenuMusic();
}

function hideStartScreen() {
  startScreen.classList.add('hidden');
}

// Launch a fresh game from the start screen (Enter or click). Plays the
// dedicated start flourish; init() then handles ambience + countdown.
function startGameFromStartScreen() {
  Sfx.unlock();
  Sfx.play('gamestart');
  Sfx.stopMenuMusic();
  hideStartScreen();
  init();
}

// Tear the running game down and return to the start screen.
function returnToStartScreen() {
  counting = false;
  countStart = null;
  paused = false;
  frozen = false;
  clearing = false;
  gameOver = true;            // halt the loop
  hardDropMouseDown = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  Sfx.stopGameplayMusic();
  hideCountdown();
  hidePauseMenu();
  hideOverlay();
  updateFreezeToggleButton();
  board = createBoard();      // reset the playfield
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  showStartScreen();
}

startResetBtn.addEventListener('click', () => {
  if (!confirmResetHighScores()) return;
  resetHighScores();
  renderHsTable(startHsBody, -1);
});

overlayResetBtn.addEventListener('click', () => {
  if (!confirmResetHighScores()) return;
  resetHighScores();
  newRecordIdx = -1;
  renderHsTable(overlayHsBody, -1);
});

// ── Initialization ────────────────────────────────────────────
function init() {
  board       = createBoard();
  score       = 0;
  lines       = 0;
  level       = startLevel;
  combo       = 0;
  maxCombo    = 0;
  maxLinesSession = 0;
  dropInterval = calcDropInterval(level);
  lastTime    = null;
  accumulated = 0;
  paused      = false;
  frozen      = false;
  gameOver    = false;
  counting    = true;
  countStart  = null;
  countShown  = null;
  waitingForName = false;
  clearing    = false;
  clearRows   = [];
  shakeAmp    = 0;
  hardDropTrail = null;
  newRecordIdx = -1;
  hardDropMouseDown = false;

  // Load saved skin preference (migrate legacy 'aurora' -> 'glass')
  try {
    let saved = localStorage.getItem('imktetris.skin');
    if (saved === 'aurora') saved = 'glass';
    if (saved && SKINS[saved]) {
      activeSkin = saved;
      document.querySelectorAll('.skin-btn').forEach(btn => {
        const isActive = btn.dataset.skin === saved;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    }
  } catch (_) {}

  updateHUD();
  hideOverlay();
  hidePauseMenu();
  updateFreezeToggleButton();

  next = randomPiece();
  spawn();

  showCountdown();

  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ── Board ─────────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// ── Pieces ────────────────────────────────────────────────────
function randomPiece() {
  const idx = Math.floor(Math.random() * 7) + 1; // 1-7
  return { matrix: PIECES[idx].map(row => [...row]), x: 0, y: 0, colorIdx: idx };
}

/** Places the next piece as current and generates a new "next". */
function spawn() {
  current = next;
  current.x = Math.floor((COLS - current.matrix[0].length) / 2);
  current.y = 0;
  next = randomPiece();
  spawnAt = performance.now();

  drawNextPiece();

  // If the new piece collides on spawn → Game Over
  if (collide(current)) {
    endGame();
  }
}

// ── Collision ─────────────────────────────────────────────────
function collide(piece) {
  const { matrix, x, y } = piece;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

// ── Rotation ──────────────────────────────────────────────────
/** Transpose + reverse rows → 90° clockwise rotation. */
function rotateCW(matrix) {
  return matrix[0].map((_, c) => matrix.map(row => row[c]).reverse());
}

/** Tries to rotate with wall kicks (±1, ±2 columns). */
function tryRotate() {
  const rotated = rotateCW(current.matrix);
  const kicks   = [0, 1, -1, 2, -2];

  for (const kick of kicks) {
    const test = { ...current, matrix: rotated, x: current.x + kick };
    if (!collide(test)) {
      current = test;
      Sfx.play('rotate');
      return;
    }
  }
}

// ── Movement ──────────────────────────────────────────────────
function moveLeft()  { tryMove(-1); }
function moveRight() { tryMove(1);  }

function tryMove(dx) {
  const test = { ...current, x: current.x + dx };
  if (!collide(test)) {
    current = test;
    Sfx.play('move');
  }
}

function softDrop() {
  const test = { ...current, y: current.y + 1 };
  if (!collide(test)) {
    current = test;
    score += 1; // +1 per row on soft drop
    Sfx.play('softdrop');
    updateHUD();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  const fromY = current.y;
  let dropped = 0;
  while (true) {
    const test = { ...current, y: current.y + 1 };
    if (collide(test)) break;
    current = test;
    dropped++;
  }
  score += dropped * 2; // +2 per cell on hard drop
  Sfx.play('harddrop');
  triggerHardDropTrail(current, fromY, dropped);
  triggerShake(dropped);
  updateHUD();
  lockPiece(true);
}

// ── Lock piece ────────────────────────────────────────────────
function lockPiece(viaHardDrop = false) {
  const { matrix, x, y } = current;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const ny = y + r;
      if (ny < 0) { endGame(); return; }
      board[ny][x + c] = matrix[r][c];
    }
  }
  const full = getFullRows();
  // Hard-drop impact already provides settle feedback, so skip the lock click.
  if (!viaHardDrop) Sfx.play('lock');
  if (full.length > 0) Sfx.play('lineclear', full.length);
  if (full.length === 0) {
    combo = 0; // reset combo on lock with no clears
    updateHUD();
    spawn();
    return;
  }

  if (prefersReducedMotion) {
    applyLineClear(full);
    updateHUD();
    spawn();
    return;
  }

  // Defer the actual clear until the flash + collapse animation finishes.
  clearing = true;
  clearRows = full;
  clearStart = performance.now();
}

// ── Clear lines ───────────────────────────────────────────────
/** Returns indices of every full row (no mutation). */
function getFullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(cell => cell !== 0)) rows.push(r);
  }
  return rows;
}

/** Removes the given full rows and applies scoring/level/combo updates. */
function applyLineClear(rows) {
  const cleared = rows.length;
  if (cleared === 0) return 0;

  const drop = new Set(rows);
  const kept = board.filter((_, r) => !drop.has(r));
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
  board = kept;

  combo++;
  if (combo > maxCombo) maxCombo = combo;
  if (cleared > maxLinesSession) maxLinesSession = cleared;

  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  const prevLevel = level;
  level  = startLevel + Math.floor(lines / 10);
  dropInterval = calcDropInterval(level);
  if (level > prevLevel) Sfx.play('levelup');
  return cleared;
}

// ── Drop speed ────────────────────────────────────────────────
function calcDropInterval(lvl) {
  return Math.max(50, 1000 - (lvl - 1) * 90);
}

function isBoardLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

// ── Ghost piece ───────────────────────────────────────────────
function getGhostY() {
  let gy = current.y;
  while (true) {
    const test = { ...current, y: gy + 1 };
    if (collide(test)) break;
    gy++;
  }
  return gy;
}

// ── Rendering ─────────────────────────────────────────────────
function draw() {
  boardIsLight = isBoardLightTheme();
  renderClock = skinClock();
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  const shake = getShakeOffset();
  if (shake) { boardCtx.save(); boardCtx.translate(shake.x, shake.y); }

  if (boardIsLight) drawGrid();
  drawBoard();
  drawHardDropTrail();
  drawGhost();
  drawActivePiece();
  if (clearing) drawClearAnim();

  if (shake) boardCtx.restore();
}

// ── Hard-drop impact shake ────────────────────────────────────
function triggerShake(dist) {
  if (prefersReducedMotion || dist <= 0) return;
  shakeStart = performance.now();
  shakeAmp = Math.min(7, 2 + dist * 0.45);
}

function getShakeOffset() {
  if (!shakeAmp) return null;
  const t = (performance.now() - shakeStart) / SHAKE_DURATION;
  if (t >= 1) { shakeAmp = 0; return null; }
  const a = shakeAmp * (1 - t);
  return { x: 0, y: Math.sin(t * Math.PI * 6) * a };
}

// ── Hard-drop motion trail ────────────────────────────────────
// Purely visual: the piece has already locked at its final position. The trail
// renders fading streaks + afterimages along the path it travelled so a hard
// drop reads as fast motion instead of a teleport. Skipped under reduced motion.
function triggerHardDropTrail(piece, fromY, dropped) {
  if (prefersReducedMotion || dropped <= 0) return;
  hardDropTrail = {
    matrix: piece.matrix.map(row => [...row]),
    x: piece.x,
    colorIdx: piece.colorIdx,
    fromY,
    toY: piece.y,
    start: performance.now(),
  };
}

function drawHardDropTrail() {
  if (!hardDropTrail) return;
  const t = (performance.now() - hardDropTrail.start) / TRAIL_DURATION;
  if (t >= 1) { hardDropTrail = null; return; }

  const { matrix, x, colorIdx, fromY, toY } = hardDropTrail;
  const color = getPalette()[colorIdx];
  const fade = 1 - t;
  const spanPx = (toY - fromY) * BLOCK;

  // Vertical streaks: one gradient column per filled column of the piece,
  // brightest near the landing point and dissolving toward the start.
  boardCtx.save();
  for (let c = 0; c < matrix[0].length; c++) {
    let topR = -1, botR = -1;
    for (let r = 0; r < matrix.length; r++) {
      if (matrix[r][c]) { if (topR < 0) topR = r; botR = r; }
    }
    if (topR < 0) continue;
    const px = (x + c) * BLOCK;
    const yTop = (fromY + topR) * BLOCK;
    const yBot = (toY + botR + 1) * BLOCK;
    const grad = boardCtx.createLinearGradient(0, yTop, 0, yBot);
    grad.addColorStop(0, hexToRgba(color, 0));
    grad.addColorStop(1, hexToRgba(color, 0.5 * fade));
    boardCtx.fillStyle = grad;
    boardCtx.fillRect(px + BLOCK * 0.14, yTop, BLOCK * 0.72, yBot - yTop);
  }
  boardCtx.restore();

  // Afterimages: a few ghost copies of the piece spaced along the path.
  const GHOSTS = 3;
  for (let i = 1; i <= GHOSTS; i++) {
    const f = i / (GHOSTS + 1);
    boardCtx.save();
    boardCtx.globalAlpha = fade * 0.3 * f;
    boardCtx.translate(0, -spanPx * (1 - f));
    drawPiece({ matrix, x, y: toY, colorIdx }, boardCtx, BLOCK);
    boardCtx.restore();
  }
}

// ── Active-piece pop-in ───────────────────────────────────────
function spawnProgress() {
  if (prefersReducedMotion) return 1;
  return Math.min(1, (performance.now() - spawnAt) / SPAWN_DURATION);
}

/** Pixel center of a piece's filled bounding box at the given block size. */
function pieceCenterPx(piece, size) {
  const { matrix, x, y } = piece;
  let minR = matrix.length, maxR = -1, minC = matrix[0].length, maxC = -1;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
  }
  return {
    cx: (x + (minC + maxC + 1) / 2) * size,
    cy: (y + (minR + maxR + 1) / 2) * size,
  };
}

/** easeOutBack — small overshoot for a lively pop. */
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawActivePiece() {
  const p = spawnProgress();
  if (p >= 1) { drawPiece(current, boardCtx, BLOCK); return; }
  const s = 0.84 + 0.16 * easeOutBack(p);
  const { cx, cy } = pieceCenterPx(current, BLOCK);
  boardCtx.save();
  boardCtx.globalAlpha = 0.45 + 0.55 * p;
  boardCtx.translate(cx, cy);
  boardCtx.scale(s, s);
  boardCtx.translate(-cx, -cy);
  drawPiece(current, boardCtx, BLOCK);
  boardCtx.restore();
}

// ── Line-clear flash + collapse overlay ───────────────────────
function drawClearAnim() {
  const p = Math.min(1, (performance.now() - clearStart) / CLEAR_DURATION);
  const W = COLS * BLOCK;
  for (const r of clearRows) {
    const y = r * BLOCK;
    if (p < 0.5) {
      // Flash: bright pulse over the cleared blocks.
      const a = Math.sin((p / 0.5) * Math.PI) * 0.92;
      boardCtx.fillStyle = `rgba(255,255,255,${a})`;
      boardCtx.fillRect(0, y, W, BLOCK);
    } else {
      // Collapse: erase the row and squash a glowing bar toward its center.
      const q = (p - 0.5) / 0.5;
      boardCtx.clearRect(0, y, W, BLOCK);
      const h = Math.max(1, BLOCK * (1 - q));
      const yy = y + (BLOCK - h) / 2;
      boardCtx.save();
      boardCtx.globalAlpha = 1 - q;
      const glow = boardCtx.createLinearGradient(0, yy, 0, yy + h);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.5, 'rgba(220,245,255,0.85)');
      glow.addColorStop(1, 'rgba(255,255,255,0.95)');
      boardCtx.fillStyle = glow;
      boardCtx.fillRect(0, yy, W, h);
      boardCtx.restore();
    }
  }
}

function drawGrid() {
  const gridColor = getComputedStyle(boardWrapper || document.body)
    .getPropertyValue('--board-canvas-grid').trim() || 'rgba(20,24,40,0.08)';
  boardCtx.strokeStyle = gridColor;
  boardCtx.lineWidth   = 1;
  boardCtx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const gx = c * BLOCK + 0.5;
    boardCtx.moveTo(gx, 0);
    boardCtx.lineTo(gx, ROWS * BLOCK);
  }
  for (let r = 1; r < ROWS; r++) {
    const gy = r * BLOCK + 0.5;
    boardCtx.moveTo(0, gy);
    boardCtx.lineTo(COLS * BLOCK, gy);
  }
  boardCtx.stroke();
}

function drawBoard() {
  const palette = getPalette();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        drawBlock(boardCtx, c, r, palette[board[r][c]], BLOCK, boardNeighbors(r, c));
      }
    }
  }
}

function drawGhost() {
  const gy = getGhostY();
  let ghostAlpha = 0.32;
  if (boardIsLight) ghostAlpha *= 0.7;
  boardCtx.globalAlpha = ghostAlpha;
  const { matrix, x } = current;
  const palette = getPalette();
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        drawBlock(boardCtx, x + c, gy + r, palette[current.colorIdx], BLOCK, matrixNeighbors(matrix, r, c));
      }
    }
  }
  boardCtx.globalAlpha = 1;
}

function drawPiece(piece, ctx, size) {
  const palette = getPalette();
  const { matrix, x, y } = piece;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        drawBlock(ctx, x + c, y + r, palette[piece.colorIdx], size, matrixNeighbors(matrix, r, c));
      }
    }
  }
}

/** Dispatches to the active skin's draw function. */
function drawBlock(ctx, col, row, color, size, neighbors = 0) {
  SKINS[activeSkin].drawBlockFn(ctx, col, row, color, size, neighbors);
}

/** 4-bit mask of same-color filled board neighbors (top/right/bottom/left). */
function boardNeighbors(r, c) {
  const v = board[r][c];
  let m = 0;
  if (r > 0 && board[r - 1][c] === v) m |= NB_TOP;
  if (c < COLS - 1 && board[r][c + 1] === v) m |= NB_RIGHT;
  if (r < ROWS - 1 && board[r + 1][c] === v) m |= NB_BOTTOM;
  if (c > 0 && board[r][c - 1] === v) m |= NB_LEFT;
  return m;
}

/** 4-bit mask of filled matrix neighbors (cells within one piece). */
function matrixNeighbors(matrix, r, c) {
  let m = 0;
  if (r > 0 && matrix[r - 1][c]) m |= NB_TOP;
  if (c < matrix[r].length - 1 && matrix[r][c + 1]) m |= NB_RIGHT;
  if (r < matrix.length - 1 && matrix[r + 1] && matrix[r + 1][c]) m |= NB_BOTTOM;
  if (c > 0 && matrix[r][c - 1]) m |= NB_LEFT;
  return m;
}

function drawNextPiece() {
  // Preview sits on the dark right panel regardless of hub theme.
  boardIsLight = false;
  renderClock = skinClock();
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

  const palette = getPalette();
  const { matrix, colorIdx } = next;
  const rows = matrix.length;
  const cols = matrix[0].length;
  let minRow = rows;
  let maxRow = -1;
  let minCol = cols;
  let maxCol = -1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!matrix[r][c]) continue;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
    }
  }

  const occupiedRows = maxRow >= minRow ? maxRow - minRow + 1 : rows;
  const occupiedCols = maxCol >= minCol ? maxCol - minCol + 1 : cols;
  const pxOffsetX = Math.floor((nextCanvas.width  - occupiedCols * NEXT_BLOCK) / 2) - minCol * NEXT_BLOCK;
  const pxOffsetY = Math.floor((nextCanvas.height - occupiedRows * NEXT_BLOCK) / 2) - minRow * NEXT_BLOCK;

  nextCtx.save();
  nextCtx.translate(pxOffsetX, pxOffsetY);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c]) {
        drawBlock(nextCtx, c, r, palette[colorIdx], NEXT_BLOCK, matrixNeighbors(matrix, r, c));
      }
    }
  }
  nextCtx.restore();
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  elScore.textContent = score;
  elLines.textContent = lines;
  elLevel.textContent = level;
  elCombo.textContent = combo;
}

// ── Overlay ───────────────────────────────────────────────────
function hideOverlay() {
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayHsSection.classList.add('hidden');
}

// ── Game Over ─────────────────────────────────────────────────
function endGame() {
  gameOver = true;
  counting = false;
  countStart = null;
  hideCountdown();
  cancelAnimationFrame(animId);
  Sfx.play('gameover');
  Sfx.stopGameplayMusic();

  overlayTitle.textContent = 'GAME OVER';
  overlay.classList.remove('hidden');

  if (qualifiesForTop5(score)) {
    // Show name-entry
    waitingForName = true;
    nameEntry.classList.remove('hidden');
    overlayHsSection.classList.add('hidden');
    overlaySub.textContent = '';
    nameInput.value = '';
    nameInput.focus();
  } else {
    // Just show the table and restart prompt
    waitingForName = false;
    nameEntry.classList.add('hidden');
    renderHsTable(overlayHsBody, -1);
    overlayHsSection.classList.remove('hidden');
    overlaySub.textContent = 'Press ENTER to restart';
    overlayTitle.focus();
  }
}

// ── Countdown ─────────────────────────────────────────────────
function showCountdown() {
  countShown = null;
  countdownNumber.textContent = '';
  countdownEl.classList.remove('hidden');
}

function hideCountdown() {
  countdownEl.classList.add('hidden');
}

function renderCountdown(n) {
  if (n === countShown) return;
  countShown = n;
  countdownNumber.textContent = String(n);
  // Restart the CSS pop animation for each new number.
  countdownNumber.style.animation = 'none';
  void countdownNumber.offsetWidth; // force reflow
  countdownNumber.style.animation = '';
  Sfx.play('countbeep', false);
}

// ── Pause Menu ────────────────────────────────────────────────
function showPauseMenu() {
  pauseMenu.classList.remove('hidden');
  btnResume.focus();
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function saveNameEntry() {
  if (!waitingForName) return;
  const name = getValidHsName(nameInput.value);
  const record = { name, score, combo: maxCombo, lines };
  newRecordIdx = insertHighScore(record);
  waitingForName = false;
  nameEntry.classList.add('hidden');
  renderHsTable(overlayHsBody, newRecordIdx);
  overlayHsSection.classList.remove('hidden');
  overlaySub.textContent = 'Press ENTER to restart';
}

nameSaveBtn.addEventListener('click', saveNameEntry);

nameInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) {
    e.preventDefault();
    nameInput.value = sanitizeHsName(nameInput.value + e.key);
  }
  if (e.code === 'Enter') {
    e.stopPropagation();
    saveNameEntry();
  }
});

nameInput.addEventListener('input', () => {
  nameInput.value = sanitizeHsName(nameInput.value);
});

// ── Pause ─────────────────────────────────────────────────────
function togglePause() {
  if (gameOver || counting) return;
  paused = !paused;
  if (paused) {
    Sfx.play('pause');
    Sfx.stopGameplayMusic();
    cancelAnimationFrame(animId);
    showPauseMenu();
  } else {
    Sfx.play('resume');
    Sfx.startGameplayMusic();
    hidePauseMenu();
    if (!frozen) {
      lastTime   = null;
      accumulated = 0;
      animId = requestAnimationFrame(loop);
    }
  }
}

function updateFreezeToggleButton() {
  const isFrozen = Boolean(frozen);
  const label = isFrozen ? 'Unfreeze game' : 'Freeze game for testing';
  freezeToggle.textContent = '';
  freezeToggle.setAttribute('aria-label', label);
  freezeToggle.setAttribute('title', label);
  freezeToggle.setAttribute('aria-pressed', String(isFrozen));
  freezeToggle.setAttribute('data-mode', isFrozen ? 'on' : 'off');
}

function toggleFreeze() {
  if (gameOver || counting) return;
  frozen = !frozen;
  updateFreezeToggleButton();
  if (frozen) {
    cancelAnimationFrame(animId);
  } else if (!paused) {
    lastTime = null;
    accumulated = 0;
    animId = requestAnimationFrame(loop);
  }
  if (current) draw();
}

// ── Game Loop ─────────────────────────────────────────────────
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime  = timestamp;

  // Pre-game countdown owns the frame: gravity is frozen until it finishes.
  if (counting) {
    if (countStart == null) countStart = timestamp;
    const elapsed = timestamp - countStart;
    if (elapsed >= COUNTDOWN_MS) {
      counting = false;
      countStart = null;
      hideCountdown();
      Sfx.play('countbeep', true); // "go" blip as the piece is released
      Sfx.startGameplayMusic();    // music kicks in exactly when play begins
      accumulated = 0;     // start gravity fresh, no banked time from the count
    } else {
      const n = 3 - Math.floor(elapsed / 1000); // 3, 2, 1
      renderCountdown(n);
      draw();
      animId = requestAnimationFrame(loop);
      return;
    }
  }

  // Line-clear animation owns the frame: no gravity, no input-driven drops.
  if (clearing) {
    if (timestamp - clearStart >= CLEAR_DURATION) {
      clearing = false;
      applyLineClear(clearRows);
      clearRows = [];
      accumulated = 0;
      updateHUD();
      spawn();
    }
    draw();
    if (!gameOver && !paused && !frozen) animId = requestAnimationFrame(loop);
    return;
  }

  accumulated += dt;

  if (accumulated >= dropInterval) {
    accumulated -= dropInterval;
    const test = { ...current, y: current.y + 1 };
    if (collide(test)) {
      lockPiece();
    } else {
      current = test;
    }
  }

  // If game ended or paused during this tick, don't reschedule.
  if (gameOver || paused || frozen) return;

  draw();
  animId = requestAnimationFrame(loop);
}

// ── Theme ──────────────────────────────────────────────────────
// The toggle themes the whole hub (page, panels, sidebars) while the board
// itself stays dark at all times. State lives on <html data-theme="light">.
function isHubLight() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function updateThemeToggleButton() {
  const isLight = isHubLight();
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  
  // Update hub toggle
  themeToggle.textContent = '';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('title', label);
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('data-mode', isLight ? 'light' : 'dark');
  
  // Update start-screen toggle to match
  startThemeToggle.textContent = '';
  startThemeToggle.setAttribute('aria-label', label);
  startThemeToggle.setAttribute('title', label);
  startThemeToggle.setAttribute('aria-pressed', String(isLight));
  startThemeToggle.setAttribute('data-mode', isLight ? 'light' : 'dark');
}

function toggleTheme() {
  const goingLight = !isHubLight();
  if (goingLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem('imktetris.theme', goingLight ? 'light' : 'dark'); } catch (_) {}
  updateThemeToggleButton();
}

updateThemeToggleButton();
themeToggle.addEventListener('click', toggleTheme);
startThemeToggle.addEventListener('click', toggleTheme);
updateFreezeToggleButton();
freezeToggle.addEventListener('click', toggleFreeze);

// ── Skin selector ─────────────────────────────────────────────
document.querySelectorAll('.skin-btn').forEach(btn => {
  btn.addEventListener('click', () => setSkin(btn.dataset.skin));
});

// ── Audio controls ────────────────────────────────────────────
const soundToggle  = document.getElementById('sound-toggle');
const startSoundToggle = document.getElementById('start-sound-toggle');
const volumeSlider = document.getElementById('volume-slider');

function updateSoundToggleButton() {
  const isMuted = Sfx.isMuted();
  const label = isMuted ? 'Unmute sound' : 'Mute sound';
  [soundToggle, startSoundToggle].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute('data-mode', isMuted ? 'off' : 'on');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', String(!isMuted));
  });
}

function handleSoundToggle() {
  Sfx.unlock();
  const nowMuted = Sfx.toggleMute();
  updateSoundToggleButton();
  if (!nowMuted) Sfx.play('uiclick'); // confirm with a blip when re-enabling
}

soundToggle.addEventListener('click', handleSoundToggle);
if (startSoundToggle) startSoundToggle.addEventListener('click', handleSoundToggle);

volumeSlider.value = String(Math.round(Sfx.getVolume() * 100));
volumeSlider.addEventListener('input', () => {
  Sfx.unlock();
  Sfx.setVolume(Number(volumeSlider.value) / 100);
});
volumeSlider.addEventListener('change', () => Sfx.play('uiclick'));
updateSoundToggleButton();

// Centralized, low-effort UI feedback for interface controls. The mute toggle
// and Resume button handle their own semantic sounds, so they are excluded.
const UI_SFX_SELECTOR =
  '.theme-btn:not(.sound-toggle-btn):not(#btn-resume), .reset-btn, .skin-btn, ' +
  '.name-save-btn, .start-theme-toggle-btn, .level-btn';
document.addEventListener('click', (e) => {
  if (e.target.closest(UI_SFX_SELECTOR)) Sfx.play('uiclick');
}, true);

// ── Keyboard controls ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // If the name input is focused, let it handle its own keys
  if (document.activeElement === nameInput) return;

  // Start screen: Enter starts game
  if (!startScreen.classList.contains('hidden')) {
    if (e.code === 'Enter') {
      startGameFromStartScreen();
    }
    return;
  }

  if (gameOver) {
    if (e.code === 'Enter' && !waitingForName) {
      init();
    }
    return;
  }

  // One-shot actions: ignore auto-repeat so a held key can't spam the action
  // (and its sound). Movement / soft-drop keep their repeat behavior.
  if (e.repeat &&
      (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape' ||
       e.code === 'Enter' || e.code === 'KeyF')) {
    e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      if (!paused && !frozen && !clearing && !counting) moveLeft();
      break;
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      if (!paused && !frozen && !clearing && !counting) moveRight();
      break;
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      if (!paused && !frozen && !clearing && !counting) tryRotate();
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      if (!paused && !frozen && !clearing && !counting) softDrop();
      break;
    case 'Space':
      e.preventDefault();
      if (!paused && !frozen && !clearing && !counting) hardDrop();
      break;
    case 'KeyF':
      e.preventDefault();
      toggleFreeze();
      break;
    case 'KeyP':
    case 'Escape':
    case 'Enter':
      e.preventDefault();
      togglePause();
      break;
  }
});

boardCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

boardCanvas.addEventListener('mousedown', (e) => {
  if (!startScreen.classList.contains('hidden') || gameOver) return;

  if (e.button === 0) {
    e.preventDefault();
    if (!paused && !frozen && !clearing && !counting && !hardDropMouseDown) {
      hardDropMouseDown = true;
      hardDrop();
    }
    return;
  }

  if (e.button === 2) {
    e.preventDefault();
    if (!paused && !frozen && !clearing && !counting) tryRotate();
    return;
  }

  if (e.button === 1) {
    e.preventDefault();
    togglePause();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    hardDropMouseDown = false;
  }
});

// ── Pause menu button wiring ──────────────────────────────────
btnResume.addEventListener('click', () => {
  if (paused) togglePause();
});

btnRestart.addEventListener('click', () => {
  if (paused) hidePauseMenu();
  paused = false;
  init();
});

btnStartScreen.addEventListener('click', returnToStartScreen);

if (pressEnter) {
  pressEnter.addEventListener('click', () => {
    if (!startScreen.classList.contains('hidden')) startGameFromStartScreen();
  });
}

function updateStartLevelDisplay() {
  startLevelDisplay.textContent = startLevel;
}

btnLevelDec.addEventListener('click', () => {
  if (startLevel > 1) {
    startLevel--;
    updateStartLevelDisplay();
  }
});

btnLevelInc.addEventListener('click', () => {
  if (startLevel < 10) {
    startLevel++;
    updateStartLevelDisplay();
  }
});

// ── Boot ──────────────────────────────────────────────────────
updateStartLevelDisplay();
showStartScreen();

// Exported for unit testing in Node/Jest. Not part of the browser API.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    shade, hexToRgba, rotateCW, cornerRadii, easeOutBack,
    calcDropInterval, sanitizeHsName, getValidHsName,
    qualifiesForTop5, insertHighScore,
    NB_TOP, NB_RIGHT, NB_BOTTOM, NB_LEFT,
    LINE_SCORES, COLS, ROWS, BLOCK,
  };
}