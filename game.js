/* ============================================================
   TETRIS – game.js
   Lógica completa del juego. Vanilla JS + Canvas 2D API.
   ============================================================ */

'use strict';

// ── Constantes ────────────────────────────────────────────────
const COLS         = 10;
const ROWS         = 20;
const BLOCK        = 30;
const NEXT_BLOCK   = 24;

// Colores por índice de pieza (0 = vacío)
const COLORS = [
  null,
  '#00f5ff', // I – cian
  '#ffd000', // O – amarillo
  '#aa00ff', // T – púrpura
  '#00ff6a', // S – verde
  '#ff2d78', // Z – rosa
  '#1e90ff', // J – azul
  '#ff7700', // L – naranja
];

// Definición de piezas: cada una es una matriz cuadrada.
// El índice coincide con COLORS (1-7).
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

// Puntos por líneas eliminadas de una sola vez, multiplicados por nivel
const LINE_SCORES = [0, 100, 300, 500, 800];

// ── Referencias al DOM ────────────────────────────────────────
const boardCanvas = document.getElementById('board');
const boardCtx   = boardCanvas.getContext('2d');
const nextCanvas  = document.getElementById('next');
const nextCtx    = nextCanvas.getContext('2d');

const elScore = document.getElementById('score');
const elLines = document.getElementById('lines');
const elLevel = document.getElementById('level');
const overlay  = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-sub');
const themeToggle  = document.getElementById('theme-toggle');

const startOverlay      = document.getElementById('start-overlay');
const startScoresBody   = document.getElementById('start-scores-body');
const startResetBtn     = document.getElementById('start-reset-btn');

const nameEntry         = document.getElementById('name-entry');
const nameInput         = document.getElementById('name-input');
const saveBtn           = document.getElementById('save-btn');

const gameoverScoresContainer = document.getElementById('gameover-scores-container');
const gameoverScoresBody      = document.getElementById('gameover-scores-body');
const gameoverResetBtn        = document.getElementById('gameover-reset-btn');

// ── Estado del juego ──────────────────────────────────────────
let board;        // matriz ROWS × COLS
let current;      // { matrix, x, y, colorIdx }
let next;         // próxima pieza
let score;
let lines;
let level;
let dropInterval; // ms entre cada bajada automática
let lastTime;     // timestamp del último frame
let accumulated;  // tiempo acumulado desde la última bajada
let paused;
let gameOver;
let animId;       // requestAnimationFrame handle
let gameStarted;  // false until player presses Enter on start screen

// ── Combo tracking ────────────────────────────────────────────
let combo;
let maxCombo;
let maxLinesCleared;

// ── localStorage helpers ──────────────────────────────────────
const HS_KEY = 'imktetris.highscores';

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    return [];
  }
}

function saveHighScores(scores) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(scores));
  } catch (e) {
    // ignore quota / security errors
  }
}

function qualifiesForTop5(currentScore) {
  const scores = loadHighScores();
  if (scores.length < 5) return true;
  return currentScore > scores[scores.length - 1].score;
}

function insertHighScore(name, currentScore, currentLines, currentMaxCombo) {
  const scores = loadHighScores();
  const entry = {
    name: (name || 'AAA').toUpperCase().padEnd(3, ' ').slice(0, 3),
    score: currentScore,
    lines: currentLines,
    combo: currentMaxCombo,
  };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top5 = scores.slice(0, 5);
  saveHighScores(top5);
  return top5;
}

function resetRecords() {
  try {
    localStorage.removeItem(HS_KEY);
  } catch (e) {
    // ignore
  }
  renderScoresTable(startScoresBody, loadHighScores(), -1);
  renderScoresTable(gameoverScoresBody, loadHighScores(), -1);
}

// ── Render scores table ───────────────────────────────────────
function renderScoresTable(tbody, scores, highlightScore) {
  tbody.innerHTML = '';
  if (!scores || scores.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'no-records';
    td.textContent = 'No records yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  scores.forEach((entry, i) => {
    const tr = document.createElement('tr');
    // highlight the newly inserted score
    if (highlightScore >= 0 && entry.score === highlightScore && i === scores.findIndex(e => e.score === highlightScore)) {
      tr.classList.add('highlight');
    }
    [i + 1, entry.name, entry.score, entry.lines, entry.combo].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ── Inicialización ────────────────────────────────────────────
function init() {
  board       = createBoard();
  score       = 0;
  lines       = 0;
  level       = 1;
  dropInterval = calcDropInterval(level);
  lastTime    = null;
  accumulated = 0;
  paused      = false;
  gameOver    = false;
  combo       = 0;
  maxCombo    = 0;
  maxLinesCleared = 0;

  updateHUD();
  hideOverlay();

  next = randomPiece();
  spawn();

  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ── Tablero ───────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// ── Piezas ────────────────────────────────────────────────────
function randomPiece() {
  const idx = Math.floor(Math.random() * 7) + 1; // 1-7
  return { matrix: PIECES[idx].map(row => [...row]), x: 0, y: 0, colorIdx: idx };
}

/** Coloca la próxima pieza como actual y genera una nueva "next". */
function spawn() {
  current = next;
  current.x = Math.floor((COLS - current.matrix[0].length) / 2);
  current.y = 0;
  next = randomPiece();

  drawNextPiece();

  // Si la nueva pieza colisiona al nacer → Game Over
  if (collide(current)) {
    endGame();
  }
}

// ── Colisión ──────────────────────────────────────────────────
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

// ── Rotación ──────────────────────────────────────────────────
/** Transpone + invierte filas → rotación 90° horaria. */
function rotateCW(matrix) {
  const N = matrix.length;
  return matrix[0].map((_, c) => matrix.map(row => row[c]).reverse());
}

/** Intenta rotar con wall kicks (±1, ±2 columnas). */
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

// ── Movimiento ────────────────────────────────────────────────
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
    score += 1; // +1 por fila en soft drop
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
  score += dropped * 2; // +2 por celda en hard drop
  updateHUD();
  lockPiece();
}

// ── Fijar pieza ───────────────────────────────────────────────
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
  const clearedCount = clearLines();
  if (clearedCount === 0) {
    combo = 0;
  }
  spawn();
}

// ── Eliminar líneas ───────────────────────────────────────────
function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++; // revisa la misma fila (ahora contiene la que estaba encima)
    }
  }
  if (cleared === 0) return 0;

  combo++;
  maxCombo = Math.max(maxCombo, combo);
  maxLinesCleared = Math.max(maxLinesCleared, cleared);

  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level  = Math.floor(lines / 10) + 1;
  dropInterval = calcDropInterval(level);
  updateHUD();
  return cleared;
}

// ── Velocidad de caída ────────────────────────────────────────
function calcDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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

// ── Renderizado ───────────────────────────────────────────────
function draw() {
  // Limpiar canvas
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  drawGrid();
  drawBoard();
  drawGhost();
  drawPiece(current, boardCtx, BLOCK);
}

/** Cuadrícula de fondo */
function drawGrid() {
  const gridColor = getComputedStyle(document.body).getPropertyValue('--canvas-grid').trim()
    || 'rgba(255,255,255,0.04)';
  boardCtx.strokeStyle = gridColor;
  boardCtx.lineWidth   = 0.5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      boardCtx.strokeRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
    }
  }
}

/** Bloques fijados en el tablero */
function drawBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        drawBlock(boardCtx, c, r, COLORS[board[r][c]], BLOCK);
      }
    }
  }
}

/** Ghost piece (proyección) */
function drawGhost() {
  const gy = getGhostY();
  boardCtx.globalAlpha = 0.18;
  const { matrix, x } = current;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        drawBlock(boardCtx, x + c, gy + r, COLORS[current.colorIdx], BLOCK);
      }
    }
  }
  boardCtx.globalAlpha = 1;
}

/** Pieza activa */
function drawPiece(piece, ctx, size) {
  const { matrix, x, y } = piece;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        drawBlock(ctx, x + c, y + r, COLORS[piece.colorIdx], size);
      }
    }
  }
}

/** Dibuja un bloque individual con borde iluminado */
function drawBlock(ctx, col, row, color, size) {
  const x = col * size;
  const y = row * size;
  const inset = 2;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);

  // Highlight top-left
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, size, inset);
  ctx.fillRect(x, y, inset, size);

  // Shadow bottom-right
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + size - inset, size, inset);
  ctx.fillRect(x + size - inset, y, inset, size);

  // Borde exterior
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth   = 0.5;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/** Siguiente pieza en el canvas pequeño */
function drawNextPiece() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const { matrix, colorIdx } = next;
  const rows = matrix.length;
  const cols = matrix[0].length;

  // Centrado en píxeles — soporta pieza I (4×4) sin perder el medio bloque de offset
  const pxOffsetX = Math.floor((nextCanvas.width  - cols * NEXT_BLOCK) / 2);
  const pxOffsetY = Math.floor((nextCanvas.height - rows * NEXT_BLOCK) / 2);

  nextCtx.save();
  nextCtx.translate(pxOffsetX, pxOffsetY);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c]) {
        drawBlock(nextCtx, c, r, COLORS[colorIdx], NEXT_BLOCK);
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
}

// ── Overlay ───────────────────────────────────────────────────
function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent   = sub;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

// ── Start Screen ──────────────────────────────────────────────
function showStartScreen() {
  gameStarted = false;
  gameOver    = false;
  paused      = false;

  const scores = loadHighScores();
  renderScoresTable(startScoresBody, scores, -1);

  startOverlay.classList.remove('hidden');
}

// ── Game Over ─────────────────────────────────────────────────
function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  const qualifies = qualifiesForTop5(score);

  // Show name entry if score qualifies, sub text changes after save
  if (qualifies) {
    showOverlay('GAME OVER', '');
    overlaySub.classList.add('hidden');
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
    // Hide scores table until saved
    gameoverScoresContainer.classList.add('hidden');
    gameoverResetBtn.classList.add('hidden');
  } else {
    showOverlay('GAME OVER', 'PRESS ENTER TO RESTART');
    nameEntry.classList.add('hidden');
    // Show scores immediately
    renderScoresTable(gameoverScoresBody, loadHighScores(), -1);
    gameoverScoresContainer.classList.remove('hidden');
    gameoverResetBtn.classList.remove('hidden');
  }
}

function saveScore() {
  const rawName = nameInput.value.trim() || 'AAA';
  const newScores = insertHighScore(rawName, score, lines, maxCombo);

  nameEntry.classList.add('hidden');
  overlaySub.textContent = 'PRESS ENTER TO RESTART';
  overlaySub.classList.remove('hidden');

  renderScoresTable(gameoverScoresBody, newScores, score);
  gameoverScoresContainer.classList.remove('hidden');
  gameoverResetBtn.classList.remove('hidden');
}

// ── Pausa ─────────────────────────────────────────────────────
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    showOverlay('PAUSE', 'Press P to continue');
  } else {
    hideOverlay();
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

  // Si la partida terminó (o se pausó) durante este tick, no reprogramar.
  if (gameOver || paused) return;

  draw();
  animId = requestAnimationFrame(loop);
}

// ── Tema ──────────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.body.removeAttribute('data-theme');
    themeToggle.textContent = '☀ LIGHT';
  } else {
    document.body.setAttribute('data-theme', 'light');
    themeToggle.textContent = '◑ DARK';
  }
}

themeToggle.addEventListener('click', toggleTheme);

// ── Reset records ─────────────────────────────────────────────
startResetBtn.addEventListener('click', resetRecords);
gameoverResetBtn.addEventListener('click', resetRecords);

// ── Save button ───────────────────────────────────────────────
saveBtn.addEventListener('click', saveScore);

// Force uppercase on name input
nameInput.addEventListener('input', () => {
  const pos = nameInput.selectionStart;
  nameInput.value = nameInput.value.toUpperCase();
  nameInput.setSelectionRange(pos, pos);
});

// ── Controles de teclado ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Start screen: Enter to begin
  if (!gameStarted && !gameOver) {
    if (e.code === 'Enter') {
      startOverlay.classList.add('hidden');
      gameStarted = true;
      init();
    }
    return;
  }

  // Name input focused: Enter to save
  if (gameOver && document.activeElement === nameInput && e.code === 'Enter') {
    e.preventDefault();
    saveScore();
    return;
  }

  if (gameOver) {
    // Only allow restart if name entry is done (hidden)
    if (e.code === 'Enter' && nameEntry.classList.contains('hidden')) {
      init();
    }
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      if (!paused) moveLeft();
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (!paused) moveRight();
      break;
    case 'ArrowUp':
    case 'KeyX':
      e.preventDefault();
      if (!paused) tryRotate();
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (!paused) softDrop();
      break;
    case 'Space':
      e.preventDefault();
      if (!paused) hardDrop();
      break;
    case 'KeyP':
      togglePause();
      break;
  }
});

// ── Arrancar ──────────────────────────────────────────────────
showStartScreen();
