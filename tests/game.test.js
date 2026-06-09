'use strict';

// game.js is loaded once and exports its pure utilities.
// The DOM + globals are set up in tests/setup.js (runs before this file).
const {
  shade,
  hexToRgba,
  rotateCW,
  cornerRadii,
  calcDropInterval,
  sanitizeHsName,
  getValidHsName,
  qualifiesForTop5,
  insertHighScore,
  easeOutBack,
  NB_TOP,
  NB_RIGHT,
  NB_BOTTOM,
  NB_LEFT,
  LINE_SCORES,
  COLS,
  ROWS,
  BLOCK,
} = require('../game.js');

// ── shade ─────────────────────────────────────────────────────
describe('shade', () => {
  test('pure black lightens to white at amt=1', () => {
    expect(shade('#000000', 1)).toBe('rgb(255,255,255)');
  });

  test('pure white stays white when lightened', () => {
    expect(shade('#ffffff', 0.5)).toBe('rgb(255,255,255)');
  });

  test('pure white darkens to black at amt=-1', () => {
    expect(shade('#ffffff', -1)).toBe('rgb(0,0,0)');
  });

  test('mid-grey lightens correctly', () => {
    // #808080 = 128,128,128; lightened by 0.5 → 128 + (255-128)*0.5 ≈ 191
    expect(shade('#808080', 0.5)).toBe('rgb(191,191,191)');
  });

  test('amt=0 returns original color', () => {
    expect(shade('#ff0000', 0)).toBe('rgb(255,0,0)');
  });
});

// ── hexToRgba ─────────────────────────────────────────────────
describe('hexToRgba', () => {
  test('converts red', () => {
    expect(hexToRgba('#ff0000', 1)).toBe('rgba(255,0,0,1)');
  });

  test('converts black with zero alpha', () => {
    expect(hexToRgba('#000000', 0)).toBe('rgba(0,0,0,0)');
  });

  test('converts white with half alpha', () => {
    expect(hexToRgba('#ffffff', 0.5)).toBe('rgba(255,255,255,0.5)');
  });

  test('handles mixed channel values', () => {
    expect(hexToRgba('#1e90ff', 0.8)).toBe('rgba(30,144,255,0.8)');
  });
});

// ── rotateCW ──────────────────────────────────────────────────
describe('rotateCW', () => {
  const I_HORIZ = [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  test('rotates I piece to vertical', () => {
    const rotated = rotateCW(I_HORIZ);
    // All filled cells should be in column 2
    expect(rotated[0][2]).toBe(1);
    expect(rotated[1][2]).toBe(1);
    expect(rotated[2][2]).toBe(1);
    expect(rotated[3][2]).toBe(1);
    // Column 1 should be empty
    expect(rotated[0][1]).toBe(0);
  });

  test('4 CW rotations return to original', () => {
    const T = [[0, 3, 0], [3, 3, 3], [0, 0, 0]];
    let m = T;
    for (let i = 0; i < 4; i++) m = rotateCW(m);
    expect(m).toEqual(T);
  });

  test('does not mutate input matrix', () => {
    const orig = [[1, 0], [1, 1]];
    const copy = orig.map(r => [...r]);
    rotateCW(orig);
    expect(orig).toEqual(copy);
  });
});

// ── cornerRadii ───────────────────────────────────────────────
describe('cornerRadii', () => {
  test('no neighbors → all corners rounded', () => {
    expect(cornerRadii(0, 4)).toEqual({ tl: 4, tr: 4, br: 4, bl: 4 });
  });

  test('top neighbor → top corners flat', () => {
    expect(cornerRadii(NB_TOP, 4)).toEqual({ tl: 0, tr: 0, br: 4, bl: 4 });
  });

  test('right neighbor → right corners flat', () => {
    expect(cornerRadii(NB_RIGHT, 4)).toEqual({ tl: 4, tr: 0, br: 0, bl: 4 });
  });

  test('bottom neighbor → bottom corners flat', () => {
    expect(cornerRadii(NB_BOTTOM, 4)).toEqual({ tl: 4, tr: 4, br: 0, bl: 0 });
  });

  test('left neighbor → left corners flat', () => {
    expect(cornerRadii(NB_LEFT, 4)).toEqual({ tl: 0, tr: 4, br: 4, bl: 0 });
  });

  test('all neighbors → all flat', () => {
    const all = NB_TOP | NB_RIGHT | NB_BOTTOM | NB_LEFT;
    expect(cornerRadii(all, 4)).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });
  });
});

// ── calcDropInterval ──────────────────────────────────────────
describe('calcDropInterval', () => {
  test('level 1 is 1000ms', () => {
    expect(calcDropInterval(1)).toBe(1000);
  });

  test('each level is faster than the last', () => {
    for (let lvl = 2; lvl <= 11; lvl++) {
      expect(calcDropInterval(lvl)).toBeLessThan(calcDropInterval(lvl - 1));
    }
  });

  test('floor is 50ms (never faster)', () => {
    expect(calcDropInterval(100)).toBe(50);
    expect(calcDropInterval(1000)).toBe(50);
  });
});

// ── sanitizeHsName ────────────────────────────────────────────
describe('sanitizeHsName', () => {
  test('normalises to uppercase', () => {
    expect(sanitizeHsName('player')).toBe('PLAYER');
  });

  test('strips symbols', () => {
    expect(sanitizeHsName('pl@y#r!')).toBe('PLYR');
  });

  test('strips spaces', () => {
    expect(sanitizeHsName('HI THERE')).toBe('HITHERE');
  });

  test('truncates at 10 characters', () => {
    expect(sanitizeHsName('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJ');
  });

  test('allows digits', () => {
    expect(sanitizeHsName('AAA123')).toBe('AAA123');
  });

  test('empty string → empty string', () => {
    expect(sanitizeHsName('')).toBe('');
  });

  test('null / undefined → empty string', () => {
    expect(sanitizeHsName(null)).toBe('');
    expect(sanitizeHsName(undefined)).toBe('');
  });
});

// ── getValidHsName ────────────────────────────────────────────
describe('getValidHsName', () => {
  test('falls back to AAA for empty input', () => {
    expect(getValidHsName('')).toBe('AAA');
  });

  test('falls back to AAA when all chars are stripped', () => {
    expect(getValidHsName('!!!---')).toBe('AAA');
  });

  test('returns sanitized name when valid', () => {
    expect(getValidHsName('Kevin')).toBe('KEVIN');
  });
});

// ── High scores (qualify + insert) ────────────────────────────
describe('high scores', () => {
  const HS_KEY = 'imktetris.highscores';

  beforeEach(() => {
    window.localStorage.clear();
  });

  const seed = (...scores) => {
    const hs = scores.map((score, i) => ({
      name: String.fromCharCode(65 + i).repeat(3),
      score,
      lines: 0,
      combo: 0,
    }));
    window.localStorage.setItem(HS_KEY, JSON.stringify(hs));
    return hs;
  };

  test('qualifies when the table is not full', () => {
    seed(1000);
    expect(qualifiesForTop5(1)).toBe(true);
  });

  test('qualifies when score beats the lowest of a full table', () => {
    seed(5000, 4000, 3000, 2000, 1000);
    expect(qualifiesForTop5(1500)).toBe(true);
    expect(qualifiesForTop5(500)).toBe(false);
  });

  test('a tie with the lowest full-table score is kept (regression)', () => {
    seed(3000, 2000, 1500, 1000, 1000);
    const record = { name: 'NEW', score: 1000, lines: 7, combo: 2 };
    expect(qualifiesForTop5(record.score)).toBe(true);

    const idx = insertHighScore(record);
    expect(idx).toBeGreaterThanOrEqual(0);

    const saved = JSON.parse(window.localStorage.getItem(HS_KEY));
    expect(saved).toHaveLength(5);
    expect(saved[idx]).toMatchObject({ name: 'NEW', score: 1000 });
    expect(saved.some(r => r.name === 'NEW')).toBe(true);
  });

  test('insert keeps only the top 5, sorted descending', () => {
    seed(3000, 2000, 1500, 1000, 500);
    insertHighScore({ name: 'TOP', score: 9000, lines: 1, combo: 1 });
    const saved = JSON.parse(window.localStorage.getItem(HS_KEY));
    expect(saved).toHaveLength(5);
    expect(saved[0]).toMatchObject({ name: 'TOP', score: 9000 });
    expect(saved.some(r => r.score === 500)).toBe(false);
  });
});

// ── easeOutBack ───────────────────────────────────────────────
describe('easeOutBack', () => {
  test('starts at 0', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
  });

  test('ends at 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  test('overshoots past 1 near the end (spring effect)', () => {
    // easeOutBack has an overshoot; at t≈0.7 the value exceeds 1
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });
});

// ── Constants sanity ──────────────────────────────────────────
describe('game constants', () => {
  test('board is 10×20 at 30px per block', () => {
    expect(COLS).toBe(10);
    expect(ROWS).toBe(20);
    expect(BLOCK).toBe(30);
  });

  test('canvas dimensions match COLS×BLOCK and ROWS×BLOCK', () => {
    expect(COLS * BLOCK).toBe(300);
    expect(ROWS * BLOCK).toBe(600);
  });

  test('LINE_SCORES increases with cleared lines', () => {
    expect(LINE_SCORES[1]).toBeGreaterThan(0);
    expect(LINE_SCORES[2]).toBeGreaterThan(LINE_SCORES[1]);
    expect(LINE_SCORES[3]).toBeGreaterThan(LINE_SCORES[2]);
    expect(LINE_SCORES[4]).toBeGreaterThan(LINE_SCORES[3]);
  });
});
