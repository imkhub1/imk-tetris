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

// ── Skins ─────────────────────────────────────────────────────
const SKINS = {
  pastel: {
    palette: [
      null,
      '#6cc5d4', // I – cyan/teal
      '#f1ce72', // O – yellow
      '#bb8ed8', // T – purple
      '#7bc98a', // S – green
      '#ec8ca6', // Z – pink
      '#5a78dd', // J – royal blue
      '#ed9f5e', // L – orange
    ],
    drawBlockFn(ctx, col, row, color, size) {
      const x = col * size;
      const y = row * size;
      const radius = 4;
      const rx = x + 1, ry = y + 1, w = size - 2, h = size - 2;

      const trace = () => {
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, w, h, radius);
          return;
        }
        // Manual rounded rect fallback
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + w - radius, ry);
        ctx.arcTo(rx + w, ry, rx + w, ry + radius, radius);
        ctx.lineTo(rx + w, ry + h - radius);
        ctx.arcTo(rx + w, ry + h, rx + w - radius, ry + h, radius);
        ctx.lineTo(rx + radius, ry + h);
        ctx.arcTo(rx, ry + h, rx, ry + h - radius, radius);
        ctx.lineTo(rx, ry + radius);
        ctx.arcTo(rx, ry, rx + radius, ry, radius);
        ctx.closePath();
      };

      ctx.fillStyle = color;
      trace();
      ctx.fill();

      if (boardIsLight) {
        // Candy gloss: bright crown fading into a soft base shade, with a
        // defined edge so soft pastels keep identity on a white field.
        const g = ctx.createLinearGradient(0, ry, 0, ry + h);
        g.addColorStop(0, 'rgba(255,255,255,0.52)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.08)');
        g.addColorStop(0.55, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.17)');
        ctx.fillStyle = g;
        trace();
        ctx.fill();

        ctx.strokeStyle = 'rgba(48,54,92,0.55)';
        ctx.lineWidth = 1;
        trace();
        ctx.stroke();
        return;
      }

      // Stronger contrast accents for readability on bright boards
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 1, y + 1, size - 2, 1.5);
      ctx.fillRect(x + 1, y + 1, 1.5, size - 2);

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 1, y + size - 3, size - 2, 2);
      ctx.fillRect(x + size - 3, y + 1, 2, size - 2);

      ctx.strokeStyle = 'rgba(65,70,110,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    },
  },
};

// Piece colors by index (0 = empty) – kept for legacy reference; use getPalette() in rendering
const COLORS = [
  null,
  '#00f5ff', // I – cyan
  '#ffd000', // O – yellow
  '#aa00ff', // T – purple
  '#00ff6a', // S – green
  '#ff2d78', // Z – pink
  '#1e90ff', // J – blue
  '#ff7700', // L – orange
];

// ── Active skin ───────────────────────────────────────────────
let activeSkin = 'pastel';

// Set once per render pass so skins/ghost can render light-aware without
// querying the DOM per block. The next-piece preview always lives on the dark
// right panel, so it forces this to false.
let boardIsLight = false;

function getPalette() {
  return SKINS[activeSkin].palette;
}

function setSkin(name) {
  if (!SKINS[name]) return;
  activeSkin = name;

  try { localStorage.setItem('imktetris.skin', name); } catch (_) {}

  document.querySelectorAll('.skin-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skin === name);
  });

  // Only re-render if the game is already running (current is defined)
  if (current) {
    draw();
    drawNextPiece();
  }
}

// Piece definitions: each is a square matrix.
// Index matches COLORS (1-7).
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
const pauseMenu          = document.getElementById('pause-menu');
const btnResume          = document.getElementById('btn-resume');
const btnRestart         = document.getElementById('btn-restart');
const btnLevelDec        = document.getElementById('btn-level-dec');
const btnLevelInc        = document.getElementById('btn-level-inc');
const startLevelDisplay  = document.getElementById('start-level-display');

const startScreen     = document.getElementById('start-screen');
const startHsBody     = document.getElementById('start-hs-body');
const startResetBtn   = document.getElementById('start-reset-btn');

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
let gameOver;
let animId;       // requestAnimationFrame handle
let waitingForName; // true when game-over name-entry is pending
let newRecordIdx;   // index in highscores where new entry was inserted
let hardDropMouseDown;

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

/** Insert a record, sort desc, keep top 5. Returns the new index. */
function insertHighScore(record) {
  const hs = loadHighScores();
  hs.push(record);
  hs.sort((a, b) => b.score - a.score);
  const trimmed = hs.slice(0, MAX_HS);
  saveHighScores(trimmed);
  return trimmed.findIndex(r => r.name === record.name && r.score === record.score && r.lines === record.lines);
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
}

function hideStartScreen() {
  startScreen.classList.add('hidden');
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
  gameOver    = false;
  waitingForName = false;
  newRecordIdx = -1;
  hardDropMouseDown = false;

  // Load saved skin preference
  try {
    const saved = localStorage.getItem('imktetris.skin');
    if (saved && SKINS[saved]) {
      activeSkin = saved;
      document.querySelectorAll('.skin-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.skin === saved);
      });
    }
  } catch (_) {}

  updateHUD();
  hideOverlay();
  hidePauseMenu();

  next = randomPiece();
  spawn();

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
      return;
    }
  }
}

// ── Movement ──────────────────────────────────────────────────
function moveLeft()  { tryMove(-1); }
function moveRight() { tryMove(1);  }

function tryMove(dx) {
  const test = { ...current, x: current.x + dx };
  if (!collide(test)) current = test;
}

function softDrop() {
  const test = { ...current, y: current.y + 1 };
  if (!collide(test)) {
    current = test;
    score += 1; // +1 per row on soft drop
    updateHUD();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  let dropped = 0;
  while (true) {
    const test = { ...current, y: current.y + 1 };
    if (collide(test)) break;
    current = test;
    dropped++;
  }
  score += dropped * 2; // +2 per cell on hard drop
  updateHUD();
  lockPiece();
}

// ── Lock piece ────────────────────────────────────────────────
function lockPiece() {
  const { matrix, x, y } = current;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const ny = y + r;
      if (ny < 0) { endGame(); return; }
      board[ny][x + c] = matrix[r][c];
    }
  }
  const cleared = clearLines();
  if (cleared === 0) {
    combo = 0; // reset combo on lock with no clears
  }
  updateHUD();
  spawn();
}

// ── Clear lines ───────────────────────────────────────────────
/** Clears full rows, updates score/level/combo. Returns number cleared. */
function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++; // re-check same row index (now contains what was above)
    }
  }
  if (cleared === 0) return 0;

  combo++;
  if (combo > maxCombo) maxCombo = combo;
  if (cleared > maxLinesSession) maxLinesSession = cleared;

  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level  = startLevel + Math.floor(lines / 10);
  dropInterval = calcDropInterval(level);
  updateHUD();
  return cleared;
}

// ── Drop speed ────────────────────────────────────────────────
function calcDropInterval(lvl) {
  return Math.max(50, 1000 - (lvl - 1) * 90);
}

function isBoardLightTheme() {
  return !!boardWrapper && boardWrapper.getAttribute('data-theme') === 'light';
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
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  if (boardIsLight) drawGrid();
  drawBoard();
  drawGhost();
  drawPiece(current, boardCtx, BLOCK);
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
  // Preview sits on the dark right panel regardless of board theme.
  boardIsLight = false;
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
function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent   = sub;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayHsSection.classList.add('hidden');
}

// ── Game Over ─────────────────────────────────────────────────
function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

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
  }
}

// ── Pause Menu ────────────────────────────────────────────────
function showPauseMenu() {
  pauseMenu.classList.remove('hidden');
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
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    showPauseMenu();
  } else {
    hidePauseMenu();
    lastTime   = null;
    accumulated = 0;
    animId = requestAnimationFrame(loop);
  }
}

// ── Game Loop ─────────────────────────────────────────────────
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime  = timestamp;

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
  if (gameOver || paused) return;

  draw();
  animId = requestAnimationFrame(loop);
}

// ── Theme ──────────────────────────────────────────────────────
function updateThemeToggleButton() {
  const isLight = boardWrapper && boardWrapper.getAttribute('data-theme') === 'light';
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  themeToggle.textContent = '';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('title', label);
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('data-mode', isLight ? 'light' : 'dark');
}

function toggleTheme() {
  const isLight = boardWrapper && boardWrapper.getAttribute('data-theme') === 'light';
  if (isLight) {
    boardWrapper.removeAttribute('data-theme');
  } else {
    if (boardWrapper) {
      boardWrapper.setAttribute('data-theme', 'light');
    }
  }
  updateThemeToggleButton();
  if (current) draw();
}

updateThemeToggleButton();
themeToggle.addEventListener('click', toggleTheme);

// ── Skin selector ─────────────────────────────────────────────
document.querySelectorAll('.skin-btn').forEach(btn => {
  btn.addEventListener('click', () => setSkin(btn.dataset.skin));
});

// ── Keyboard controls ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // If the name input is focused, let it handle its own keys
  if (document.activeElement === nameInput) return;

  // Start screen: Enter starts game
  if (!startScreen.classList.contains('hidden')) {
    if (e.code === 'Enter') {
      hideStartScreen();
      init();
    }
    return;
  }

  if (gameOver) {
    if (e.code === 'Enter' && !waitingForName) {
      init();
    }
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      if (!paused) moveLeft();
      break;
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      if (!paused) moveRight();
      break;
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      if (!paused) tryRotate();
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      if (!paused) softDrop();
      break;
    case 'Space':
      e.preventDefault();
      if (!paused) hardDrop();
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
    if (!paused && !hardDropMouseDown) {
      hardDropMouseDown = true;
      hardDrop();
    }
    return;
  }

  if (e.button === 2) {
    e.preventDefault();
    if (!paused) tryRotate();
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
