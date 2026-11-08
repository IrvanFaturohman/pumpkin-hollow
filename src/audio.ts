// Procedural sound effects and music with the Web Audio API (no audio files).

const PENTA = [0, 2, 4, 7, 9];

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  ambient!: GainNode;
  enabled = true;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private lastPlay: Record<string, number> = {};

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.11;
    this.music.connect(this.master);
    this.ambient = this.ctx.createGain();
    this.ambient.gain.value = 0.18;
    this.ambient.connect(this.master);

    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startMusic();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** Avoid machine-gun repeats of the same sound in one frame. */
  private gate(name: string, minGap: number) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if ((this.lastPlay[name] ?? -1) + minGap > t) return false;
    this.lastPlay[name] = t;
    return true;
  }

  private tone(opts: {
    freq: number; dur: number; type?: OscillatorType; vol?: number; attack?: number;
    freqEnd?: number; delay?: number; out?: AudioNode; detune?: number;
  }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + (opts.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur);
    const vol = opts.vol ?? 0.3;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(opts.out ?? this.sfx);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  private noise(opts: {
    dur: number; vol?: number; filter?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; delay?: number; out?: AudioNode; attack?: number;
  }) {
    if (!this.ctx || !this.noiseBuf) return;
    const c = this.ctx;
    const t0 = c.currentTime + (opts.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = opts.filter ?? 'lowpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    const vol = opts.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f).connect(g).connect(opts.out ?? this.sfx);
    src.start(t0, Math.random());
    src.stop(t0 + opts.dur + 0.05);
  }

  // ---------------- SFX ----------------

  pickup(index: number) {
    if (!this.gate('pickup', 0.03)) return;
    const n = PENTA[index % 5] + 12 * Math.floor(index / 5);
    const f = 523.25 * Math.pow(2, Math.min(n, 30) / 12);
    this.tone({ freq: f, dur: 0.12, type: 'sine', vol: 0.22 });
    this.tone({ freq: f * 2, dur: 0.07, type: 'triangle', vol: 0.06 });
  }

  drop(index = 0) {
    if (!this.gate('drop', 0.03)) return;
    const f = 380 + (index % 6) * 40;
    this.tone({ freq: f, freqEnd: f * 0.55, dur: 0.1, type: 'triangle', vol: 0.25 });
    this.noise({ dur: 0.05, vol: 0.05, freq: 2000, filter: 'bandpass' });
  }

  cash() {
    if (!this.gate('cash', 0.035)) return;
    const f = 1568 + Math.random() * 200;
    this.tone({ freq: f, dur: 0.07, type: 'triangle', vol: 0.12 });
    this.tone({ freq: f * 1.5, dur: 0.09, type: 'sine', vol: 0.07, delay: 0.035 });
  }

  chaChing() {
    if (!this.gate('chaching', 0.08)) return;
    this.noise({ dur: 0.08, vol: 0.1, freq: 6000, filter: 'highpass' });
    this.tone({ freq: 1318.5, dur: 0.18, type: 'square', vol: 0.05, delay: 0.04 });
    this.tone({ freq: 1975.5, dur: 0.3, type: 'triangle', vol: 0.14, delay: 0.08 });
  }

  payTick(progress: number) {
    if (!this.gate('pay', 0.045)) return;
    const f = 500 + progress * 900;
    this.tone({ freq: f, dur: 0.04, type: 'square', vol: 0.045 });
  }

  unlock() {
    this.noise({ dur: 0.5, vol: 0.18, filter: 'bandpass', freq: 400, freqEnd: 4000, q: 2, attack: 0.15 });
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.18, delay: 0.25 + i * 0.07 }));
    this.tone({ freq: 2093, dur: 0.6, type: 'sine', vol: 0.08, delay: 0.55 });
  }

  levelUp() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    seq.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.22, type: 'square', vol: 0.06, delay: i * 0.09 });
      this.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.15, delay: i * 0.09 });
    });
    this.tone({ freq: 261.6, dur: 0.9, type: 'triangle', vol: 0.15, delay: 0.55 });
  }

  horn() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.08);
    g.gain.setValueAtTime(0.32, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    lp.connect(g).connect(this.sfx);
    for (const f of [110, 138.6, 164.8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.97, t0);
      o.frequency.linearRampToValueAtTime(f, t0 + 0.1);
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 1.35);
    }
  }

  honk() {
    if (!this.gate('honk', 0.4)) return;
    this.tone({ freq: 415, dur: 0.14, type: 'square', vol: 0.06 });
    this.tone({ freq: 523, dur: 0.14, type: 'square', vol: 0.05 });
  }

  gull() {
    if (!this.gate('gull', 0.3)) return;
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 1900, freqEnd: 950, dur: 0.16, type: 'sawtooth', vol: 0.05, delay: i * 0.18 });
      this.tone({ freq: 2400, freqEnd: 1300, dur: 0.12, type: 'triangle', vol: 0.06, delay: i * 0.18 });
    }
  }

  splash() {
    if (!this.gate('splash', 0.2)) return;
    this.noise({ dur: 0.6, vol: 0.22, freq: 1800, freqEnd: 250, attack: 0.02 });
  }

  whoosh() {
    if (!this.gate('whoosh', 0.1)) return;
    this.noise({ dur: 0.3, vol: 0.12, filter: 'bandpass', freq: 600, freqEnd: 2500, q: 1.5, attack: 0.08 });
  }

  pop() {
    if (!this.gate('pop', 0.04)) return;
    this.tone({ freq: 420, freqEnd: 900, dur: 0.08, type: 'sine', vol: 0.2 });
  }

  serve() {
    if (!this.gate('serve', 0.06)) return;
    this.tone({ freq: 880, dur: 0.08, type: 'sine', vol: 0.12 });
    this.tone({ freq: 1320, dur: 0.1, type: 'sine', vol: 0.1, delay: 0.06 });
  }

  bonus() {
    const seq = [783.99, 987.77, 1174.66, 1567.98];
    seq.forEach((f, i) => this.tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.16, delay: i * 0.06 }));
    this.noise({ dur: 0.4, vol: 0.06, freq: 8000, filter: 'highpass', delay: 0.2 });
  }

  denied() {
    if (!this.gate('denied', 0.3)) return;
    this.tone({ freq: 180, dur: 0.15, type: 'square', vol: 0.06 });
    this.tone({ freq: 140, dur: 0.18, type: 'square', vol: 0.06, delay: 0.1 });
  }

  // ---------------- Farm ----------------

  plant(i = 0) {
    if (!this.gate('plant', 0.04)) return;
    const f = 300 * Math.pow(2, (PENTA[i % 5] + 12 * (Math.floor(i / 5) % 2)) / 12);
    this.noise({ dur: 0.07, vol: 0.12, freq: 600, filter: 'lowpass' });
    this.tone({ freq: f, freqEnd: f * 1.5, dur: 0.1, type: 'sine', vol: 0.14, delay: 0.02 });
  }

  rustle() {
    if (!this.gate('rustle', 0.06)) return;
    this.noise({ dur: 0.16, vol: 0.09, freq: 4200, filter: 'bandpass', q: 0.7 });
    this.tone({ freq: 700 + Math.random() * 200, freqEnd: 300, dur: 0.12, type: 'triangle', vol: 0.06, delay: 0.1 });
  }

  squish() {
    if (!this.gate('squish', 0.08)) return;
    this.noise({ dur: 0.18, vol: 0.12, freq: 900, freqEnd: 300, filter: 'lowpass', q: 4 });
    this.tone({ freq: 220, freqEnd: 120, dur: 0.15, type: 'sine', vol: 0.1 });
  }

  ding() {
    if (!this.gate('ding', 0.1)) return;
    this.tone({ freq: 1568, dur: 0.5, type: 'sine', vol: 0.12 });
    this.tone({ freq: 2093, dur: 0.4, type: 'sine', vol: 0.06, delay: 0.03 });
  }

  cheer() {
    this.noise({ dur: 0.9, vol: 0.1, freq: 1800, filter: 'bandpass', q: 0.6, attack: 0.08 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.1, delay: i * 0.07 }));
  }

  carDoor() {
    if (!this.gate('car', 0.4)) return;
    this.noise({ dur: 0.08, vol: 0.08, freq: 500, filter: 'lowpass' });
  }

  tractor() {
    this.tone({ freq: 60, freqEnd: 90, dur: 0.6, type: 'sawtooth', vol: 0.08, attack: 0.05 });
    this.tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.03, delay: 0.1 });
    this.tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.03, delay: 0.3 });
  }

  private engG: GainNode | null = null;
  private engLevel = -1;
  setEngine(level: number) {
    if (!this.ctx || level === this.engLevel) return;
    this.engLevel = level;
    if (!this.engG) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 52;
      const lfo = c.createOscillator();
      lfo.frequency.value = 9;
      const lg = c.createGain();
      lg.gain.value = 8;
      lfo.connect(lg).connect(o.frequency);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      this.engG = c.createGain();
      this.engG.gain.value = 0;
      o.connect(lp).connect(this.engG).connect(this.sfx);
      o.start();
      lfo.start();
    }
    this.engG.gain.setTargetAtTime(level * 0.09, this.ctx.currentTime, 0.2);
  }

  // ---------------- Junk Town specific ----------------

  private vacGain: GainNode | null = null;
  private vacFilter: BiquadFilterNode | null = null;
  private grindGain: GainNode | null = null;

  private ensureLoops() {
    if (!this.ctx || !this.noiseBuf || this.vacGain) return;
    const c = this.ctx;
    // vacuum: filtered noise + a soft motor hum
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.vacFilter = c.createBiquadFilter();
    this.vacFilter.type = 'bandpass';
    this.vacFilter.frequency.value = 900;
    this.vacFilter.Q.value = 0.8;
    this.vacGain = c.createGain();
    this.vacGain.gain.value = 0;
    src.connect(this.vacFilter).connect(this.vacGain).connect(this.sfx);
    const hum = c.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 118;
    const humLp = c.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 400;
    const humG = c.createGain();
    humG.gain.value = 0.25;
    hum.connect(humLp).connect(humG).connect(this.vacGain);
    src.start();
    hum.start();
    // shredder grind
    const g2 = c.createBufferSource();
    g2.buffer = this.noiseBuf;
    g2.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.grindGain = c.createGain();
    this.grindGain.gain.value = 0;
    const rumble = c.createOscillator();
    rumble.type = 'square';
    rumble.frequency.value = 46;
    const rg = c.createGain();
    rg.gain.value = 0.15;
    rumble.connect(rg).connect(this.grindGain);
    g2.connect(lp).connect(this.grindGain).connect(this.sfx);
    g2.start();
    rumble.start();
  }

  /** 0..1 suction intensity. */
  setVacuum(level: number) {
    if (!this.ctx) return;
    this.ensureLoops();
    const t = this.ctx.currentTime;
    this.vacGain!.gain.setTargetAtTime(level * 0.14, t, 0.06);
    this.vacFilter!.frequency.setTargetAtTime(700 + level * 900, t, 0.1);
  }

  setGrind(level: number) {
    if (!this.ctx) return;
    this.ensureLoops();
    this.grindGain!.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.05);
  }

  /** Suck pop with combo pitch. */
  slurp(combo: number) {
    if (!this.gate('slurp', 0.025)) return;
    const n = PENTA[combo % 5] + 12 * Math.min(2, Math.floor(combo / 5));
    const f = 392 * Math.pow(2, n / 12);
    this.tone({ freq: f * 0.8, freqEnd: f * 1.6, dur: 0.09, type: 'sine', vol: 0.16 });
    this.noise({ dur: 0.05, vol: 0.05, freq: 3000, filter: 'bandpass', q: 3 });
  }

  coin(i = 0) {
    if (!this.gate('coin', 0.03)) return;
    const f = 1760 + (i % 4) * 120;
    this.tone({ freq: f, dur: 0.06, type: 'square', vol: 0.03 });
    this.tone({ freq: f * 1.5, dur: 0.12, type: 'sine', vol: 0.09, delay: 0.03 });
  }

  treasure() {
    const seq = [880, 1108.7, 1318.5, 1760];
    seq.forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.13, delay: i * 0.05 }));
    this.noise({ dur: 0.3, vol: 0.04, freq: 9000, filter: 'highpass', delay: 0.15 });
  }

  bagFull() {
    if (!this.gate('bagfull', 0.8)) return;
    this.tone({ freq: 330, dur: 0.12, type: 'square', vol: 0.06 });
    this.tone({ freq: 262, dur: 0.18, type: 'square', vol: 0.06, delay: 0.12 });
  }

  tapeSnap() {
    this.noise({ dur: 0.18, vol: 0.2, filter: 'highpass', freq: 2500, attack: 0.002 });
    this.tone({ freq: 900, freqEnd: 200, dur: 0.2, type: 'triangle', vol: 0.12 });
  }

  truck() {
    if (!this.gate('truck', 1)) return;
    this.tone({ freq: 70, dur: 1.2, type: 'sawtooth', vol: 0.05, attack: 0.2 });
    this.tone({ freq: 1000, dur: 0.12, type: 'square', vol: 0.025, delay: 0.9 });
    this.tone({ freq: 1000, dur: 0.12, type: 'square', vol: 0.025, delay: 1.2 });
  }

  // ---------------- Ambient + music ----------------

  private startWaves() {
    if (!this.ctx || !this.noiseBuf) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const g = c.createGain();
    g.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.ambient);
    src.start();
    lfo.start();
  }

  private startMusic() {
    if (!this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.2;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 80);
  }

  private scheduleMusic() {
    if (!this.ctx) return;
    const c = this.ctx;
    const bpm = 104;
    const eighth = 60 / bpm / 2;
    // C - Am - F - G, 8 eighths per chord
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ];
    const melody = [0, 2, 1, 2, 0, 2, 1, 2];
    while (this.nextNoteTime < c.currentTime + 0.3) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 8) % 4;
      const s = this.step % 8;
      const ch = chords[bar];
      const delay = t - c.currentTime;
      if (s === 0 || s === 4) {
        this.tone({ freq: ch[0] / 2, dur: eighth * 3.5, type: 'triangle', vol: 0.5, delay, out: this.music, attack: 0.01 });
      }
      const note = ch[melody[s]] * (s % 4 === 3 ? 2 : 2);
      this.tone({ freq: note, dur: eighth * 1.6, type: 'sine', vol: 0.32, delay, out: this.music });
      this.tone({ freq: note * 2, dur: eighth * 0.6, type: 'triangle', vol: 0.06, delay, out: this.music });
      if (s % 2 === 1) this.noise({ dur: 0.04, vol: 0.05, freq: 7000, filter: 'highpass', delay, out: this.music });
      this.nextNoteTime += eighth;
      this.step++;
    }
  }
}

export const sfx = new AudioEngine();
