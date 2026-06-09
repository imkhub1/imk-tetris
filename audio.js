/* ============================================================
   TETRIS – audio.js
   Lightweight Web Audio SFX manager. Vanilla JS, no assets.

   All sounds are generated on the fly (oscillators + filtered noise)
   so there is zero download footprint. Exposes a single global `Sfx`.

   Gain staging:  voice -> gameplayBus (1.0) / uiBus (0.5) -> master -> out
   The master gain carries the persisted volume (and mute), so UI SFX
   always sit quieter than gameplay SFX.
   ============================================================ */

'use strict';

const Sfx = (function () {
  const VOL_KEY  = 'imktetris.audio.volume';
  const MUTE_KEY = 'imktetris.audio.muted';

  const DEFAULT_VOLUME = 0.7;
  const MAX_VOICES     = 14; // hard cap to prevent audio buildup / clipping

  let ctx = null;
  let master = null;       // persisted volume / mute lives here
  let gameplayBus = null;  // full-level gameplay SFX
  let uiBus = null;        // quieter interface SFX
  let ambientBus = null;   // background music (under master, so mute/volume apply)
  let music = null;        // active music graph, or null when stopped
  let wantedMusic = null;  // requested music mode: 'menu' | 'game' | null
  let activeVoices = 0;

  const lastPlayed = Object.create(null); // sound name -> performance.now() ms

  let volume = loadVolume();
  let muted  = loadMuted();

  function loadVolume() {
    try {
      const v = parseFloat(localStorage.getItem(VOL_KEY));
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
    } catch (_) { return DEFAULT_VOLUME; }
  }

  function loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
  }

  // ── Context lifecycle (browser-safe, lazy) ──────────────────
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (_) { return null; }

    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    gameplayBus = ctx.createGain();
    gameplayBus.gain.value = 1.0;
    gameplayBus.connect(master);

    uiBus = ctx.createGain();
    uiBus.gain.value = 0.5; // interface SFX quieter than gameplay
    uiBus.connect(master);

    // Ambience sits under master too, so the persisted volume/mute affect it.
    // Kept distinctly quiet so it never competes with gameplay SFX.
    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0.34;
    ambientBus.connect(master);

    return ctx;
  }

  // Resume/create the context from a trusted gesture. Idempotent.
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => {
        if (wantedMusic && !music) startMusic(wantedMusic);
      }).catch(() => {});
      return;
    }
    if (wantedMusic && !music) startMusic(wantedMusic);
  }

  // First user gesture unlocks audio (autoplay-policy safe).
  (function armUnlock() {
    const handler = () => unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, handler, { once: true, passive: true }));
  })();

  function throttled(name, minGapMs) {
    const now = performance.now();
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < minGapMs) return false;
    lastPlayed[name] = now;
    return true;
  }

  // ── Voice builders ──────────────────────────────────────────
  function tone(opts) {
    const c = ensureCtx();
    if (!c || muted) return;
    // Only schedule on a running context so voice counting can't leak while
    // the context is still suspended (voices would never fire `onended`).
    if (c.state !== 'running') return;
    if (activeVoices >= MAX_VOICES) return;

    const {
      freq, type = 'sine', dur = 0.08, attack = 0.005,
      gain = 0.2, bus = gameplayBus, freqEnd = null, when = 0,
    } = opts;

    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(bus || gameplayBus);

    activeVoices++;
    osc.onended = () => { activeVoices--; };
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(opts) {
    const c = ensureCtx();
    if (!c || muted) return;
    if (c.state !== 'running') return;
    if (activeVoices >= MAX_VOICES) return;

    const { dur = 0.12, gain = 0.2, bus = gameplayBus, lpf = 2000, when = 0 } = opts;

    const t0 = c.currentTime + when;
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lpf;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(bus || gameplayBus);

    activeVoices++;
    src.onended = () => { activeVoices--; };
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ── Sound map (soft, short, low-fatigue) ────────────────────
  const sounds = {
    move() {
      if (!throttled('move', 25)) return;
      tone({ freq: 200, type: 'triangle', dur: 0.05, gain: 0.11 });
    },
    rotate() {
      if (!throttled('rotate', 30)) return;
      tone({ freq: 320, freqEnd: 384, type: 'triangle', dur: 0.07, gain: 0.12 });
    },
    softdrop() {
      if (!throttled('softdrop', 55)) return;
      tone({ freq: 150, type: 'sine', dur: 0.035, gain: 0.07 });
    },
    harddrop() {
      tone({ freq: 165, freqEnd: 60, type: 'sine', dur: 0.14, gain: 0.22 });
      noise({ dur: 0.10, gain: 0.11, lpf: 1100 });
    },
    lock() {
      if (!throttled('lock', 40)) return;
      tone({ freq: 180, freqEnd: 140, type: 'square', dur: 0.05, gain: 0.07 });
    },
    // Ascending arpeggio; more lines = more notes + a sparkle on a tetris.
    lineclear(n) {
      const steps = Math.min(Math.max(n | 0, 1), 4);
      const root = 392; // G4
      const ratios = [1, 1.25, 1.5, 2, 2.5];
      const count = steps + 1; // 2..5 notes
      for (let i = 0; i < count; i++) {
        tone({ freq: root * ratios[i], type: 'triangle', dur: 0.12, gain: 0.12, when: i * 0.06 });
      }
      if (steps === 4) {
        tone({ freq: root * 3, type: 'sine', dur: 0.26, gain: 0.10, when: count * 0.06 });
      }
    },
    levelup() {
      const root = 523.25; // C5
      const ratios = [1, 1.26, 1.5];
      ratios.forEach((r, i) =>
        tone({ freq: root * r, type: 'triangle', dur: 0.16, gain: 0.12, when: i * 0.07 }));
    },
    pause() {
      tone({ freq: 440, type: 'sine', dur: 0.10, gain: 0.11 });
      tone({ freq: 330, type: 'sine', dur: 0.14, gain: 0.11, when: 0.08 });
    },
    resume() {
      tone({ freq: 330, type: 'sine', dur: 0.10, gain: 0.11 });
      tone({ freq: 440, type: 'sine', dur: 0.14, gain: 0.11, when: 0.08 });
    },
    gameover() {
      const notes = [392, 349.23, 311.13, 261.63]; // descending, somber
      notes.forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.14, when: i * 0.16 }));
    },
    uiclick() {
      tone({ freq: 420, type: 'sine', dur: 0.045, gain: 0.16, bus: uiBus });
    },
    // Bright "here we go" flourish when launching a game from the start screen.
    gamestart() {
      const notes = [392, 523.25, 659.25]; // G4 → C5 → E5 rising triad
      notes.forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.13, when: i * 0.08 }));
      tone({ freq: 784, type: 'sine', dur: 0.22, gain: 0.10, when: 0.24 }); // sparkle
    },
    // Single soft blip used by the pre-game 3-2-1 countdown.
    countbeep(go) {
      tone({ freq: go ? 660 : 440, type: 'sine', dur: go ? 0.18 : 0.09, gain: 0.13 });
    },
  };

  // ── Public API ──────────────────────────────────────────────
  function play(name, arg) {
    if (muted || volume <= 0) return;
    const fn = sounds[name];
    if (!fn) return;
    const c = ensureCtx();
    if (!c) return;
    // Autoplay policy: the very first gesture's resume() is async, so the
    // context may still be 'suspended' on this tick. Defer the voice until the
    // context is actually running so the sound isn't silently dropped.
    if (c.state !== 'running') {
      c.resume().then(() => { if (!muted && volume > 0) fn(arg); }).catch(() => {});
      return;
    }
    fn(arg);
  }

  // ── Modern background music (menu + gameplay) ────────────────
  // Two different synth-driven themes:
  // - menu: very slow, smooth, spacious groove for start screen
  // - game: mid-tempo smooth groove for active play
  // Both route through ambientBus -> master and use a look-ahead sequencer.
  const STEPS_PER_BAR = 16;
  const THEMES = {
    menu: {
      bpm: 92,
      leadWave: 'sine',
      leadDurMult: 3.4,
      leadGain: 0.34,
      padGain: 0.36,
      bassWave: 'triangle',
      bassGain: 0.40,
      drumGain: 0.30,
      leadPattern: [0, 1, 2, 1, 3, 2, 1, 4],
      progression: [
        { root: 98.00,  lead: [196.00, 246.94, 293.66, 392.00, 493.88], pad: [196.00, 246.94, 293.66] }, // G
        { root: 87.31,  lead: [174.61, 220.00, 261.63, 349.23, 440.00], pad: [174.61, 220.00, 261.63] }, // F
        { root: 110.00, lead: [220.00, 277.18, 329.63, 440.00, 554.37], pad: [220.00, 277.18, 329.63] }, // A
        { root: 82.41,  lead: [164.81, 207.65, 246.94, 329.63, 415.30], pad: [164.81, 207.65, 246.94] }, // E
      ],
      kickPattern: [0, 8, 12],
      snarePattern: [4, 12],
      hatPattern: [7, 15],
      hatCutoff: 6800,
      hatGain: 0.10,
      outGain: 0.9,
      fadeIn: 1.2,
      fadeOut: 0.6,
      lookAhead: 0.24,
      schedulerMs: 70,
    },
    game: {
      bpm: 112,
      leadWave: 'sine',
      leadDurMult: 2.6,
      leadGain: 0.38,
      padGain: 0.30,
      bassWave: 'triangle',
      bassGain: 0.44,
      drumGain: 0.40,
      leadPattern: [0, 2, 1, 3, 2, 4, 3, 1],
      progression: [
        { root: 130.81, lead: [261.63, 329.63, 392.00, 523.25, 659.25], pad: [261.63, 329.63, 392.00] }, // C
        { root: 164.81, lead: [329.63, 415.30, 493.88, 659.25, 830.61], pad: [329.63, 415.30, 493.88] }, // E
        { root: 146.83, lead: [293.66, 369.99, 440.00, 587.33, 739.99], pad: [293.66, 369.99, 440.00] }, // D
        { root: 174.61, lead: [349.23, 440.00, 523.25, 698.46, 880.00], pad: [349.23, 440.00, 523.25] }, // F
      ],
      kickPattern: [0, 6, 8, 14],
      snarePattern: [4, 12],
      hatPattern: [3, 7, 11, 15],
      hatCutoff: 7600,
      hatGain: 0.15,
      outGain: 0.95,
      fadeIn: 1.0,
      fadeOut: 0.5,
      lookAhead: 0.22,
      schedulerMs: 60,
    },
  };

  function createNoiseBuffer(c) {
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playSynthNote(c, opts) {
    const {
      at,
      freq,
      dest,
      type = 'sine',
      dur = 0.2,
      peak = 0.8,
      attack = 0.01,
      freqEnd = null,
    } = opts;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(dest);
    o.start(at);
    o.stop(at + dur + 0.03);
  }

  function playKick(c, at, dest, amount = 1) {
    playSynthNote(c, {
      at,
      freq: 130,
      freqEnd: 46,
      dest,
      type: 'sine',
      dur: 0.18,
      peak: 0.95 * amount,
      attack: 0.004,
    });
  }

  function playSnare(c, at, dest, noiseBuf, amount = 1) {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.46 * amount, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
    s.connect(bp);
    bp.connect(g);
    g.connect(dest);
    s.start(at);
    s.stop(at + 0.2);
  }

  function playHat(c, at, dest, noiseBuf, cutoff, gain) {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    s.connect(hp);
    hp.connect(g);
    g.connect(dest);
    s.start(at);
    s.stop(at + 0.08);
  }

  function fadeOutMusic(oldMusic, fadeOutSec = 0.4) {
    if (!oldMusic) return;
    if (oldMusic.stop) oldMusic.stop();
    clearInterval(oldMusic.timer);
    const c = ctx;
    if (!c) return;
    const now = c.currentTime;
    try {
      oldMusic.out.gain.cancelScheduledValues(now);
      oldMusic.out.gain.setValueAtTime(oldMusic.out.gain.value, now);
      oldMusic.out.gain.linearRampToValueAtTime(0.0001, now + fadeOutSec);
    } catch (_) {}
    setTimeout(() => {
      try { oldMusic.out.disconnect(); } catch (_) {}
    }, Math.ceil((fadeOutSec + 0.25) * 1000));
  }

  function stopMusicNow(oldMusic) {
    if (!oldMusic) return;
    if (oldMusic.stop) oldMusic.stop();
    clearInterval(oldMusic.timer);
    try { oldMusic.out.disconnect(); } catch (_) {}
  }

  function startMusic(kind) {
    const config = THEMES[kind];
    if (!config) return;
    wantedMusic = kind;

    const c = ensureCtx();
    if (!c) return;
    if (c.state !== 'running') {
      c.resume().then(() => {
        if (wantedMusic === kind) startMusic(kind);
      }).catch(() => {});
      return;
    }

    if (music && music.kind === kind) return;

    const oldMusic = music;
    music = null;
    if (oldMusic) stopMusicNow(oldMusic);

    const stepDur = (60 / config.bpm) / 4;
    const now = c.currentTime;

    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(config.outGain, now + config.fadeIn);
    out.connect(ambientBus);

    const lead = c.createGain();
    lead.gain.value = config.leadGain;
    const leadLp = c.createBiquadFilter();
    leadLp.type = 'lowpass';
    leadLp.frequency.value = kind === 'menu' ? 3400 : 3000;
    leadLp.Q.value = 0.7;
    lead.connect(leadLp);
    leadLp.connect(out);

    const pad = c.createGain();
    pad.gain.value = config.padGain;
    const padLp = c.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = kind === 'menu' ? 1600 : 1400;
    padLp.Q.value = 0.3;
    pad.connect(padLp);
    padLp.connect(out);

    const bass = c.createGain();
    bass.gain.value = config.bassGain;
    const bassLp = c.createBiquadFilter();
    bassLp.type = 'lowpass';
    bassLp.frequency.value = kind === 'menu' ? 880 : 980;
    bass.connect(bassLp);
    bassLp.connect(out);

    const drums = c.createGain();
    drums.gain.value = config.drumGain;
    drums.connect(out);

    const noiseBuf = createNoiseBuffer(c);

    function scheduleStep(at, step) {
      const bar = Math.floor(step / STEPS_PER_BAR) % config.progression.length;
      const inBar = step % STEPS_PER_BAR;
      const chord = config.progression[bar];

      // Lead on eighth-notes for melodic motion.
      if (inBar % 2 === 0) {
        const leadIdx = config.leadPattern[(step / 2) % config.leadPattern.length];
        playSynthNote(c, {
          at,
          freq: chord.lead[leadIdx % chord.lead.length],
          dest: lead,
          type: config.leadWave,
          dur: stepDur * config.leadDurMult,
          peak: 0.75,
          attack: 0.012,
        });
      }

      // Warm pad chord on each beat.
      if (inBar % 4 === 0) {
        chord.pad.forEach((freq, idx) => {
          playSynthNote(c, {
            at: at + idx * 0.004,
            freq,
            dest: pad,
            type: 'triangle',
            dur: stepDur * 3.8,
            peak: 0.45,
            attack: 0.018,
          });
        });
      }

      // Bass pulse on each beat.
      if (inBar % 4 === 0) {
        playSynthNote(c, {
          at,
          freq: chord.root,
          dest: bass,
          type: config.bassWave,
          dur: stepDur * 2.9,
          peak: 0.9,
          attack: 0.008,
        });
      }

      if (config.kickPattern.includes(inBar)) playKick(c, at, drums, 1);
      if (config.snarePattern.includes(inBar)) playSnare(c, at, drums, noiseBuf, 1);
      if (config.hatPattern.includes(inBar)) playHat(c, at, drums, noiseBuf, config.hatCutoff, config.hatGain);
    }

    let stopped = false;
    let step = 0;
    let nextTime = now + 0.12;
    function scheduler() {
      if (stopped) return;
      while (nextTime < c.currentTime + config.lookAhead) {
        scheduleStep(nextTime, step);
        step++;
        nextTime += stepDur;
      }
    }
    scheduler();
    const timer = setInterval(scheduler, config.schedulerMs);

    music = { kind, out, timer, stop: () => { stopped = true; } };
  }

  function stopMusic(kind = null) {
    if (kind == null) wantedMusic = null;
    else if (wantedMusic === kind) wantedMusic = null;
    if (!music) return;
    if (kind && music.kind !== kind) return;
    const oldMusic = music;
    music = null;
    fadeOutMusic(oldMusic, THEMES[oldMusic.kind]?.fadeOut || 0.4);
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    try { localStorage.setItem(VOL_KEY, String(volume)); } catch (_) {}
    if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) {}
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.01);
  }

  function toggleMute() { setMuted(!muted); return muted; }

  return {
    play,
    unlock,
    setVolume,
    getVolume: () => volume,
    setMuted,
    toggleMute,
    isMuted: () => muted,
    startMenuMusic: () => startMusic('menu'),
    stopMenuMusic: () => stopMusic('menu'),
    isMenuMusicOn: () => !!music && music.kind === 'menu',
    startGameplayMusic: () => startMusic('game'),
    stopGameplayMusic: () => stopMusic('game'),
    isGameplayMusicOn: () => !!music && music.kind === 'game',
    // Backward-compatible aliases for existing game logic.
    startAmbient: () => startMusic('game'),
    stopAmbient: () => stopMusic('game'),
    isAmbientOn: () => !!music && music.kind === 'game',
  };
})();

window.Sfx = Sfx;
