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
  clearLines();
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
  if (cleared === 0) return;

  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level  = Math.floor(lines / 10) + 1;
  dropInterval = calcDropInterval(level);
  updateHUD();
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
  boardCtx.strokeStyle = 'rgba(255,255,255,0.04)';
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

// ── Game Over ─────────────────────────────────────────────────
function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  showOverlay('GAME OVER', 'Presiona ENTER para reiniciar');
}

// ── Pausa ─────────────────────────────────────────────────────
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    showOverlay('PAUSA', 'Presiona P para continuar');
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

// ── Controles de teclado ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (gameOver) {
    if (e.code === 'Enter') init();
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
init();
