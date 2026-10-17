/* Synthesized preview only. Based on the original Web Audio instruments.
   A future recording can replace the background transport without changing input rules. */
'use strict';
class RhythmAudio {
  constructor() { this.ctx = null; this.master = null; this.session = null; this.bg = null; this.muted = false; this.unlocking = false; this.noiseBuffer = null; }
  setup() {
    if (this.ctx) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    this.ctx = new Audio();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .52;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 256;
    this.master.connect(comp); comp.connect(this.analyser); this.analyser.connect(this.ctx.destination);
  }
  unlock() {
    // Called directly inside a real user gesture; never gate screen transitions on a promise.
    try {
      this.setup();
      if (this.ctx.state === 'running' || this.unlocking) return;
      this.unlocking = true;
      const timer = setTimeout(() => { if (this.ctx.state !== 'running' && !this.muted) this.onError?.(); }, 1800);
      this.ctx.resume().then(() => { if (this.ctx.state === 'running') this.onReady?.(); }).catch(() => this.onError?.()).finally(() => { clearTimeout(timer); this.unlocking = false; });
    } catch { if (!this.muted) this.onError?.(); }
  }
  setMuted(muted) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : .52, this.ctx.currentTime, .025);
  }
  startTransport() {
    this.stopTransport();
    if (!this.ctx) return;
    this.session = this.ctx.createGain(); this.session.connect(this.master);
    this.bg = this.ctx.createGain(); this.bg.gain.value = .33; this.bg.connect(this.session);
  }
  stopTransport() {
    const old = this.session, oldBg = this.bg;
    if (old && this.ctx) {
      old.gain.setTargetAtTime(.0001, this.ctx.currentTime, .012);
      setTimeout(() => { old.disconnect(); oldBg?.disconnect(); }, 100);
    }
    this.session = null; this.bg = null;
  }
  tone(freq, dur, amp, type, t, dest, end) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur * .7);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .02); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  noise(dur, amp, t, dest) {
    const ctx = this.ctx;
    if (!this.noiseBuffer) { this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .7), ctx.sampleRate); const data = this.noiseBuffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = this.noiseBuffer;
    f.type = 'highpass'; f.frequency.value = 5400;
    g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  sound(kind, t = this.ctx?.currentTime ?? 0, dest = this.session, level = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || !dest) return;
    if (kind === 'drum') { this.tone(155,.42,.7*level,'sine',t,dest,58); this.tone(320,.08,.1*level,'triangle',t,dest,85); }
    if (kind === 'wood') { this.tone(820,.09,.32*level,'sine',t,dest,600); this.tone(1260,.045,.12*level,'triangle',t,dest); }
    if (kind === 'gong') [220,331,467,613,902].forEach((f,i) => this.tone(f,1.5-i*.19,.18*level/(i+1),'sine',t,dest,f*1.045));
    if (kind === 'cymbal') { this.noise(.6,.23*level,t,dest); [1810,2430,3270,4120].forEach(f => this.tone(f,.32,.024*level,'square',t,dest)); }
  }
  tick(accent = false) { if (this.ctx?.state === 'running' && this.session) this.tone(accent ? 1046 : 784,.07,.12,'sine',this.ctx.currentTime,this.session); }
  miss() {
    if(this.ctx?.state!=='running' || !this.master) return;
    // A brief falling cue, distinct from a hit. It survives the last-miss music stop.
    const t=this.ctx.currentTime;
    this.tone(190,.085,.15,'triangle',t,this.master,130);
    this.tone(115,.13,.12,'triangle',t+.055,this.master,75);
  }
  voice() {
    if (this.ctx?.state !== 'running' || !this.session) return () => {};
    const ctx = this.ctx, bus = ctx.createGain(), filter = ctx.createBiquadFilter(), nodes = [];
    filter.type = 'lowpass'; filter.frequency.value = 2100;
    bus.gain.setValueAtTime(.0001,ctx.currentTime); bus.gain.exponentialRampToValueAtTime(.09,ctx.currentTime+.04);
    bus.connect(filter); filter.connect(this.session);
    for (const [f,a] of [[440,.7],[880,.2],[1320,.1]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = a;
      o.connect(g); g.connect(bus); o.start(); nodes.push(o,g);
    }
    let stopped = false;
    return () => { if (stopped) return; stopped = true; bus.gain.setTargetAtTime(.0001,ctx.currentTime,.012); nodes.filter(n => n instanceof OscillatorNode).forEach(o => o.stop(ctx.currentTime+.06)); setTimeout(() => { bus.disconnect(); filter.disconnect(); nodes.forEach(n => n.disconnect()); },120); };
  }
}
const audio = new RhythmAudio();
