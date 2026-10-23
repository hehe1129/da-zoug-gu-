/* Supplied recordings only. No oscillator / noise stand-ins. */
'use strict';
const AUDIO_SOURCES = {
  ensemble:{bytes:4413225,file:'ensemble.mp3'},
  drum:{bytes:48479,file:'drum.mp3',offset:.294,length:.64,gain:.62},
  cymbal:{bytes:68541,file:'cymbal.mp3',offset:.541,length:1.35,gain:1.25},
  gong:{bytes:35313,file:'gong.mp3',offset:.085,length:.72,gain:1.6},
  wood:{bytes:7728,file:'wood.mp3',offset:0,length:.237,gain:3.1},
  suona:{bytes:104276,file:'suona.mp3',offset:0,length:4.279,gain:.5}
};
class RhythmAudio {
  constructor() {
    this.ctx=null;this.master=null;this.session=null;this.bg=null;this.song=null;
    this.muted=false;this.unlocking=false;this.buffers={};this.nodes=new Set();this.variations={};this.lastHit=null;this.lastGameRead=null;this.visualClock=null;
    // Preload and decode before the cover; audible output unlocks on a gesture.
    this.raw={};this.transfers={};this.fetchErrors={};this.primed=false;this.status='idle';this.failed=[];this.clock=null;this.boost=null;
  }
  preload(retry=false) {
    for(const [kind,meta] of Object.entries(AUDIO_SOURCES)) {
      if(this.buffers[kind]||this.raw[kind])continue;
      const controller=new AbortController();
      // Allow a slow but progressing recording download; fail a stalled one.
      let stallTimer;const refresh=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>controller.abort(),kind==='ensemble'?30000:20000);};
      const deadline=setTimeout(()=>controller.abort(),kind==='ensemble'?180000:60000);refresh();
      this.transfers[kind]=0;delete this.fetchErrors[kind];
      const request=fetch('assets/audio/'+meta.file,{signal:controller.signal,cache:retry?'reload':'default'})
        .then(async response=>{
          if(!response.ok)throw new Error('audio '+response.status);
          if(!response.body?.getReader){clearTimeout(stallTimer);return response.arrayBuffer();}
          refresh();
          const reader=response.body.getReader(),chunks=[];let received=0;
          const expected=Number(response.headers.get('content-length'))||meta.bytes;
          while(true){const {done,value}=await reader.read();if(done)break;refresh();chunks.push(value);received+=value.byteLength;this.transfers[kind]=Math.min(.9,received/expected*.9);}
          const bytes=new Uint8Array(received);let offset=0;
          for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
          return bytes.buffer;
        }).finally(()=>{clearTimeout(stallTimer);clearTimeout(deadline);});
      this.raw[kind]=request;
      // A rejected prefetch must not poison the next load attempt forever.
      request.catch(error=>{if(this.raw[kind]===request)delete this.raw[kind];this.fetchErrors[kind]=error;});
    }
  }
  loadProgress() {
    let loaded=0,total=0;
    for(const [kind,meta] of Object.entries(AUDIO_SOURCES)){total+=meta.bytes;loaded+=meta.bytes*(this.buffers[kind]?1:(this.transfers[kind]||0));}
    return total?loaded/total:0;
  }
  decode(bytes) {
    // Callback support also covers embedded browsers with legacy decoding APIs.
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('audio decode timeout')),20000);
      const done=value=>{clearTimeout(timer);resolve(value);},failed=error=>{clearTimeout(timer);reject(error);};
      try{const pending=this.ctx.decodeAudioData(bytes.slice(0),done,failed);pending?.then?.(done,failed);}catch(error){failed(error);}
    });
  }
  setup() {
    if(this.ctx)return;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw new Error('Web Audio unavailable');
    this.ctx=new Context({latencyHint:'interactive'});
    this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.72;
    const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;comp.knee.value=12;
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=256;
    this.master.connect(comp);comp.connect(this.analyser);this.analyser.connect(this.ctx.destination);
    this.ctx.addEventListener('statechange',()=>{if(this.clock&&this.ctx.state!=='running')this.onInterrupted?.();});
  }
  prepare(retry=false) {
    if(this.loading&&(!retry||this.status==='loading'))return this.loading;
    try{this.setup();}catch{this.status='unavailable';return Promise.resolve(false);}
    this.preload(retry);
    this.status='loading';
    this.loading=Promise.all(Object.keys(AUDIO_SOURCES).map(async kind=>{
      if(this.buffers[kind])return;
      try{
        const bytes=await this.raw[kind],buffer=await this.decode(bytes);
        if(!buffer?.length||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw new Error('empty audio');
        if(kind==='ensemble'&&typeof RECORDING_SCORE!=='undefined'&&buffer.duration<RECORDING_SCORE.duration-1)throw new Error('incomplete ensemble');
        this.buffers[kind]=buffer;this.transfers[kind]=1;delete this.raw[kind];delete this.fetchErrors[kind];
      }catch(error){delete this.raw[kind];this.fetchErrors[kind]=error;}

    })).then(()=>{
      this.failed=Object.keys(AUDIO_SOURCES).filter(kind=>!this.buffers[kind]);
      this.status=this.failed.length?'partial':'ready';return !!this.buffers.ensemble;
    });
    return this.loading;
  }
  unlock(retry=false) {
    try {
      this.setup();this.prepare(retry);
      // Prime the mobile output route inside the user's gesture, with silence.
      if(!this.primed){const source=this.ctx.createBufferSource();source.buffer=this.ctx.createBuffer(1,1,this.ctx.sampleRate);source.connect(this.master);source.onended=()=>source.disconnect();source.start();this.primed=true;}
      if(this.ctx.state==='running'||this.unlocking)return;
      this.unlocking=true;
      const timer=setTimeout(()=>{if(this.ctx.state!=='running'&&!this.muted)this.onError?.();},1800);
      this.ctx.resume().then(()=>{if(this.ctx.state==='running')this.onReady?.();})
        .catch(()=>this.onError?.()).finally(()=>{clearTimeout(timer);this.unlocking=false;});
    }catch{if(!this.muted)this.onError?.();}
  }
  setMuted(muted) {this.muted=muted;if(this.ctx)this.master.gain.setTargetAtTime(muted?0:.72,this.ctx.currentTime,.025);}
  startTransport() {
    this.stopTransport();if(!this.ctx)return;
    this.session=this.ctx.createGain();this.session.connect(this.master);
    this.bg=this.ctx.createGain();this.bg.gain.value=.66;this.bg.connect(this.session);
    const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1400;filter.Q.value=.65;
    this.boost=this.ctx.createGain();this.boost.gain.value=0;filter.connect(this.boost);this.boost.connect(this.session);this.melodyFilter=filter;
  }
  startSong(gameTime) {
    if(!this.ctx||!this.session)return;
    this.clock=this.ctx.state==='running'?{context:this.ctx.currentTime,game:gameTime}:null;this.lastGameRead=null;this.visualClock=null;
    this.ensureSong(gameTime);
  }
  transportTime() {return this.clock?this.clock.game+this.ctx.currentTime-this.clock.context:null;}
  gameTime() {
    if(!this.clock)return null;
    let context=this.ctx.currentTime;
    // Follow the output device position, not just the already-queued graph.
    // Reject stale / zero timestamps and clamp implausible driver estimates.
    let stamp;try{stamp=this.ctx.getOutputTimestamp?.();}catch{}
    const wall=performance.now();
    const output=stamp?.contextTime+(wall-(stamp?.performanceTime||0))/1000;
    if(stamp?.contextTime>0&&stamp.performanceTime>0&&Math.abs(wall-stamp.performanceTime)<250&&context-output>=0&&context-output<.25)context=output;
    else context-=Math.min(.15,Math.max(0,(this.ctx.baseLatency||0)+(this.ctx.outputLatency||0)));
    const target=this.clock.game+context-this.clock.context;
    // Audio clocks can advance in blocks, or switch between output timestamps
    // and the latency fallback. A monotonic max alone turns those changes into
    // stationary frames followed by jumps, even with an idle GPU and no network.
    // Advance on the high-resolution wall clock; gently follow the audible
    // position without letting clock corrections stop or jerk falling notes.
    const previous=this.visualClock;
    if(!previous)this.visualClock={wall,value:target};
    else {
      const dt=Math.max(0,(wall-previous.wall)/1000),predicted=previous.value+dt;
      const error=target-predicted,limit=dt*.025;
      const correction=Math.max(-limit,Math.min(limit,error*Math.min(1,dt/.8)));
      previous.wall=wall;previous.value=predicted+correction;
    }
    this.lastClockError=target-this.visualClock.value;
    this.lastGameRead=Math.max(this.lastGameRead??this.visualClock.value,this.visualClock.value);return this.lastGameRead;
  }
  ensureSong(gameTime) {
    if(this.song||!this.buffers.ensemble||!this.bg||this.ctx.state!=='running')return;
    const position=Math.max(0,gameTime-RECORDING_SCORE.leadIn),delay=Math.max(0,RECORDING_SCORE.leadIn-gameTime);
    if(position>=this.buffers.ensemble.duration)return;
    const s=this.ctx.createBufferSource();s.buffer=this.buffers.ensemble;
    s.connect(this.bg);s.connect(this.melodyFilter);
    this.track(s);this.song=s;s.start(this.ctx.currentTime+delay,position);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();/* song remains a sentinel until transport reset. */};
  }
  track(node) {this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);node.disconnect();};}
  stopTransport() {
    const old=this.session,oldBg=this.bg,filter=this.melodyFilter,boost=this.boost;
    if(old&&this.ctx){old.gain.setTargetAtTime(.0001,this.ctx.currentTime,.008);
      for(const node of this.nodes){try{node.stop(this.ctx.currentTime+.04);}catch{}}
      this.nodes.clear();setTimeout(()=>{old.disconnect();oldBg?.disconnect();filter?.disconnect();boost?.disconnect();},75);
    }
    this.session=this.bg=this.song=this.boost=this.melodyFilter=null;this.clock=null;this.lastGameRead=null;this.visualClock=null;
  }
  resetVariations() {this.variations={};this.lastHit=null;}
  nextVariation(kind,at) {
    const previous=this.variations[kind];
    const repeated=this.lastHit?.kind===kind&&at>=this.lastHit.at&&at-this.lastHit.at<1.25;
    // Fast repeats contrast dark/short and bright/full articulations, choosing
    // randomly within each family instead of looping a fixed six-hit sequence.
    const choices=[0,1,2,3,4,5].filter(v=>v!==previous?.variant&&(!repeated||v%2!==previous.variant%2));
    const variant=choices[Math.floor(Math.random()*choices.length)];
    this.variations[kind]={variant,at};this.lastHit={kind,at};return variant;
  }
  sound(kind,t=this.ctx?.currentTime??0,dest=this.session,level=1,options={}) {
    if(this.ctx?.state!=='running'||!dest||!this.buffers[kind])return;
    const meta=AUDIO_SOURCES[kind],s=this.ctx.createBufferSource(),g=this.ctx.createGain();s.buffer=this.buffers[kind];
    const at=Math.max(t,this.ctx.currentTime),variant=options.vary?this.nextVariation(kind,at):0;
    const detune=options.vary?[.966,1.031,.981,1.044,.990,1.018][variant]:1;
    // Lower the drum's body and remove the bright membrane slap. Other
    // instruments keep their root pitch; variations still use the same sample.
    const rate=(kind==='drum'?.88:1)*detune;s.playbackRate.value=rate;
    const velocity=options.vary?[.78,1.12,.88,1.02,.84,1.08][variant]:1;
    const cutoffs={drum:[420,1350,560,1050,720,1550],wood:[750,4500,1050,3300,1350,6000],gong:[1400,5200,1900,4200,2400,6500],cymbal:[3600,11500,4800,9000,4100,13000]};
    const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=(cutoffs[kind]||[8000])[variant]||8000;filter.Q.value=.55;
    const body=this.ctx.createBiquadFilter();body.type=kind==='drum'?'lowshelf':'highshelf';body.frequency.value=kind==='drum'?170:kind==='wood'?600:kind==='cymbal'?4000:1800;body.gain.value=kind==='drum'?[4.5,2.5,4,3,5,2.8][variant]:[-5,3.5,-3.5,2.5,-4.5,4][variant];
    const sourceLength=Math.min(meta.length,s.buffer.duration-meta.offset),length=sourceLength/rate;
    const gain=meta.gain*level*velocity*(options.accent||1)*(options.perfect?1.06:1);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+.002);
    const decay=[.50,.98,.62,.86,.56,.94][variant];
    g.gain.setValueAtTime(gain,at+.025);g.gain.linearRampToValueAtTime(gain*.48,at+length*decay*.72);g.gain.linearRampToValueAtTime(0,at+length*decay);
    s.connect(filter);filter.connect(body);body.connect(g);g.connect(dest);this.track(s);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();filter.disconnect();body.disconnect();g.disconnect();};s.start(at,meta.offset,sourceLength);
  }

  judgeSuona(points,perfect=false) {
    if(this.ctx?.state!=='running'||!this.session||!this.buffers.suona)return;
    // A short voiced articulation from the supplied sample, not its unrelated
    // four-second melody. Length is deliberately too short to become a phrase.
    const ctx=this.ctx,s=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    const t=ctx.currentTime,variant=this.nextVariation('suona',t),duration=points===30?.105:points===20?.085:.065;
    s.buffer=this.buffers.suona;s.playbackRate.value=[.988,1.014,.994,1.019,.991,1.009][variant];f.type='lowpass';f.frequency.value=[1950,2850,2150,2700,2050,3000][variant];
    const level=(points===30?.55:points===20?.46:.38)*(perfect?1.08:1)*[.88,1.08,.94,1.03,.91,1.06][variant];
    if(this.bg){this.bg.gain.setTargetAtTime(.57,t,.006);this.bg.gain.setTargetAtTime(.66,t+duration,.04);}
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.006);g.gain.setValueAtTime(level,t+duration*.45);g.gain.linearRampToValueAtTime(0,t+duration);
    s.connect(f);f.connect(g);g.connect(this.session);this.track(s);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();f.disconnect();g.disconnect();};s.start(t,.51,duration);
  }
  tick(accent=false) {this.sound('wood',undefined,this.session,accent?.55:.35);}
  miss() {this.sound('drum',undefined,this.master,.2);}
  voice() {
    if(this.ctx?.state!=='running'||!this.session)return()=>{};
    if(this.song&&this.boost) {
      // Highlight the melody in the SAME time-aligned recording. A different
      // four-second suona performance must not play out of key over the song.
      const gain=this.boost,ctx=this.ctx;gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setTargetAtTime(.28,ctx.currentTime,.025);
      let stopped=false;return()=>{if(stopped)return;stopped=true;gain.gain.setTargetAtTime(0,ctx.currentTime,.018);};
    }
    // Only if the ensemble failed to load: use the supplied suona excerpt,
    // gated by the finger. Still a recording, never a synthesized substitute.
    if(!this.buffers.suona)return()=>{};
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),ctx=this.ctx;s.buffer=this.buffers.suona;s.loop=true;g.gain.value=.4;s.connect(g);g.connect(this.session);this.track(s);s.start();let stopped=false;
    return()=>{if(stopped)return;stopped=true;g.gain.setTargetAtTime(0,ctx.currentTime,.012);s.stop(ctx.currentTime+.06);setTimeout(()=>g.disconnect(),90);};
  }
}
const audio=new RhythmAudio();
