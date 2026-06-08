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
  let ambientBus = null;   // background ambience (under master, so mute/volume apply)
  let ambient = null;      // active ambience graph, or null when stopped
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
    if (c.state === 'suspended') c.resume();
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

  // ── Ambient bed (chiptune game groove) ──────────────────────
  // A driving, instrumental chiptune loop: a square-wave arpeggio lead over an
  // i–VI–III–VII progression (Am–F–C–G), a triangle bassline, and a simple
  // kick / snare / hi-hat drum kit (all synthesised). A look-ahead step
  // sequencer schedules sixteenth notes so the groove loops seamlessly.
  // Everything routes through ambientBus -> master, so mute/volume apply. Not
  // voice-counted, so the bed never starves gameplay SFX.
  const AMBIENT_BPM = 128;
  const AMBIENT_STEP = (60 / AMBIENT_BPM) / 4; // one sixteenth note, seconds
  const AMBIENT_STEPS_PER_BAR = 16;
  // Each chord: bass root + the four arpeggio notes (root, 3rd, 5th, octave).
  const AMBIENT_PROG = [
    { root: 110.00, arp: [220.00, 261.63, 329.63, 440.00] }, // Am
    { root:  87.31, arp: [174.61, 220.00, 261.63, 349.23] }, // F
    { root: 130.81, arp: [261.63, 329.63, 392.00, 523.25] }, // C
    { root:  98.00, arp: [196.00, 246.94, 293.66, 392.00] }, // G
  ];
  // Bouncing arpeggio figure indexed into the chord's four notes (loops by mod).
  const AMBIENT_ARP = [0, 1, 2, 3, 2, 3, 1, 2];

  function startAmbient() {
    const c = ensureCtx();
    if (!c) return;
    if (ambient) return; // already running
    if (c.state !== 'running') c.resume().catch(() => {});

    const now = c.currentTime;

    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + 0.8); // quick fade-in
    out.connect(ambientBus);

    // Sub-mixes so the lead, bass and drums sit at fixed relative levels.
    const lead = c.createGain();
    lead.gain.value = 0.13;
    const leadLp = c.createBiquadFilter();
    leadLp.type = 'lowpass';
    leadLp.frequency.value = 2800;
    leadLp.Q.value = 0.6;
    lead.connect(leadLp);
    leadLp.connect(out);

    const bass = c.createGain();
    bass.gain.value = 0.20;
    bass.connect(out);

    const drums = c.createGain();
    drums.gain.value = 0.5;
    drums.connect(out);

    // One short noise buffer reused by the snare / hi-hat.
    const noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    function blip(at, freq, dur, peak, type, dest) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(dest);
      o.start(at);
      o.stop(at + dur + 0.02);
    }

    function kick(at) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(125, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.9, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.connect(g);
      g.connect(drums);
      o.start(at);
      o.stop(at + 0.2);
    }

    function snare(at) {
      const s = c.createBufferSource();
      s.buffer = noiseBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.45, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      s.connect(bp);
      bp.connect(g);
      g.connect(drums);
      s.start(at);
      s.stop(at + 0.18);
    }

    function hat(at) {
      const s = c.createBufferSource();
      s.buffer = noiseBuf;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = c.createGain();
      g.gain.setValueAtTime(0.18, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      s.connect(hp);
      hp.connect(g);
      g.connect(drums);
      s.start(at);
      s.stop(at + 0.06);
    }

    function scheduleStep(at, s) {
      const bar = Math.floor(s / AMBIENT_STEPS_PER_BAR) % AMBIENT_PROG.length;
      const inBar = s % AMBIENT_STEPS_PER_BAR;
      const chord = AMBIENT_PROG[bar];
      // Arpeggio lead on every sixteenth.
      blip(at, chord.arp[AMBIENT_ARP[s % AMBIENT_ARP.length]], AMBIENT_STEP * 0.9, 0.9, 'square', lead);
      // Bassline on every beat.
      if (inBar % 4 === 0) blip(at, chord.root, AMBIENT_STEP * 3.4, 0.9, 'triangle', bass);
      // Drum kit.
      if (inBar === 0 || inBar === 8) kick(at);
      if (inBar === 4 || inBar === 12) snare(at);
      if (inBar % 2 === 1) hat(at);
    }

    let stopped = false;
    let step = 0;
    let nextTime = now + 0.12;
    function scheduler() {
      if (stopped) return;
      while (nextTime < c.currentTime + 0.2) {
        scheduleStep(nextTime, step);
        step++;
        nextTime += AMBIENT_STEP;
      }
    }
    scheduler();
    const timer = setInterval(scheduler, 60);

    ambient = { out, timer, stop: () => { stopped = true; } };
  }

  function stopAmbient() {
    if (!ambient) return;
    const old = ambient;
    ambient = null; // release the slot immediately so a restart is safe
    if (old.stop) old.stop();
    clearInterval(old.timer);
    const c = ctx;
    if (!c) return;
    const now = c.currentTime;
    try {
      old.out.gain.cancelScheduledValues(now);
      old.out.gain.setValueAtTime(old.out.gain.value, now);
      old.out.gain.linearRampToValueAtTime(0.0001, now + 0.4); // fade out
    } catch (_) {}
    setTimeout(() => {
      try { old.out.disconnect(); } catch (_) {}
    }, 700);
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
    startAmbient,
    stopAmbient,
    isAmbientOn: () => !!ambient,
  };
})();

window.Sfx = Sfx;
