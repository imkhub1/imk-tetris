'use strict';

// Mock canvas context — jsdom provides HTMLCanvasElement but getContext() returns null.
const mockCtx = {
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  arcTo: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  clip: jest.fn(),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  getPropertyValue: jest.fn(() => ''),
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
};
HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);

// Minimal DOM structure matching all getElementById/querySelector calls in game.js
document.body.innerHTML = `
  <canvas id="board" width="300" height="600"></canvas>
  <canvas id="next" width="120" height="120"></canvas>
  <div class="board-wrapper"></div>
  <span id="score">0</span>
  <span id="lines">0</span>
  <span id="level">1</span>
  <span id="combo">0</span>
  <div id="overlay">
    <p id="overlay-title" tabindex="-1"></p>
    <div id="name-entry" class="hidden">
      <label for="name-input"></label>
      <input id="name-input" type="text" maxlength="10" />
      <button id="name-save-btn"></button>
    </div>
    <div id="overlay-hs-section" class="hidden">
      <table><tbody id="overlay-hs-body"></tbody></table>
      <button id="overlay-reset-btn"></button>
    </div>
    <p id="overlay-sub"></p>
  </div>
  <button id="theme-toggle"></button>
  <button id="freeze-toggle"></button>
  <div id="pause-menu" class="hidden">
    <button id="btn-resume"></button>
    <button id="btn-restart"></button>
    <button id="btn-start-screen"></button>
    <button id="btn-level-dec"></button>
    <button id="btn-level-inc"></button>
    <span id="start-level-display"></span>
    <input id="volume-slider" type="range" min="0" max="100" value="70" />
  </div>
  <div id="countdown" class="hidden">
    <span id="countdown-number"></span>
  </div>
  <div id="start-screen">
    <table><tbody id="start-hs-body"></tbody></table>
    <button id="start-reset-btn"></button>
    <button id="start-sound-toggle"></button>
    <button id="start-theme-toggle"></button>
    <p class="press-enter">PRESS ENTER TO PLAY</p>
  </div>
  <button id="sound-toggle"></button>
`;

// Mock global Sfx (normally provided by audio.js, loaded before game.js in browser)
global.Sfx = {
  play: jest.fn(),
  isMuted: jest.fn(() => false),
  getVolume: jest.fn(() => 0.7),
  setVolume: jest.fn(),
  toggleMute: jest.fn(() => false),
  setMuted: jest.fn(),
  unlock: jest.fn(),
  startMenuMusic: jest.fn(),
  stopMenuMusic: jest.fn(),
  isMenuMusicOn: jest.fn(() => false),
  startGameplayMusic: jest.fn(),
  stopGameplayMusic: jest.fn(),
  isGameplayMusicOn: jest.fn(() => false),
};

// Mock matchMedia — used by game.js to detect prefers-reduced-motion.
window.matchMedia = jest.fn(() => ({ matches: false }));

// Mock rAF/cAF — prevent the game loop from actually running during tests.
window.requestAnimationFrame = jest.fn(() => 1);
window.cancelAnimationFrame = jest.fn();

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: jest.fn(k => store[k] ?? null),
  setItem: jest.fn((k, v) => { store[k] = v; }),
  removeItem: jest.fn(k => { delete store[k]; }),
  clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// Mock window.confirm (used by reset high scores)
window.confirm = jest.fn(() => true);

// getComputedStyle mock for drawGrid()
window.getComputedStyle = jest.fn(() => ({ getPropertyValue: jest.fn(() => '') }));
