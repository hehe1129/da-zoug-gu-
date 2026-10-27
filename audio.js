/* Supplied recordings only. No oscillator / noise stand-ins. */
'use strict';
const AUDIO_SOURCES = {
  ensemble:{bytes:2589682,file:'ensemble-v34.mp3'},
  drum:{bytes:48479,file:'drum.mp3',offset:.294,length:.64,gain:.62},
  cymbal:{bytes:68541,file:'cymbal.mp3',offset:.541,length:1.35,gain:1.25},
  gong:{bytes:35313,file:'gong.mp3',offset:.085,length:.72,gain:1.6},
  wood:{bytes:7728,file:'wood.mp3',offset:0,length:.237,gain:3.1},
  suona:{bytes:104276,file:'suona.mp3',offset:0,length:4.279,gain:.5},
  rainLight:{bytes:131134,file:'rain-light-v32.mp3'},
  rainHeavy:{bytes:481175,file:'rain-heavy-v32.mp3'}
};
class RhythmAudio {
  constructor() {
    this.ctx=null;this.master=null;this.session=null;this.bg=null;this.song=null;
    this.muted=false;this.unlocking=false;this.buffers={};this.nodes=new Set();this.variations={};this.lastHit=null;this.lastGameRead=null;this.visualClock=null;
    // Preload and decode before the cover; audible output unlocks on a gesture.
    this.raw={};this.transfers={};this.fetchErrors={};this.primed=false;this.status='idle';this.failed=[];this.clock=null;this.boost=null;
    this.rain=null;this.rainLayers=new Set();this.rainLoops={};this.rainType=null;
    this.outputReady=false;this.unlockAttempts=0;this.needsWake=false;
    this.volumes={game:1,rain:1};try{const saved=JSON.parse(localStorage.getItem('dazougu.volumes.v35'));for(const key of ['game','rain'])if(Number.isFinite(saved?.[key]))this.volumes[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
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
    if(this.ctx?.state==='closed'){
      this.ctx=null;this.master=null;this.session=null;this.clock=null;this.song=null;
      this.rain=null;this.rainType=null;this.rainLayers.clear();this.outputReady=false;
    }
    if(this.ctx)return;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw new Error('Web Audio unavailable');
    this.ctx=new Context({latencyHint:'interactive'});
    this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.72;
    this.gameBus=this.ctx.createGain();this.gameBus.gain.value=this.volumes.game;this.gameBus.connect(this.master);
    const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;comp.knee.value=12;
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=256;
    this.master.connect(comp);comp.connect(this.analyser);this.analyser.connect(this.ctx.destination);
    // Rain has its own filtered, levelled bus; it never changes the music gain,
    // sound-effect gain, source timing or transport lifecycle.
    this.ambienceBus=this.ctx.createGain();
    this.ambienceBus.gain.value=this.volumes.rain;
    const low=this.ctx.createBiquadFilter(),high=this.ctx.createBiquadFilter(),leveler=this.ctx.createDynamicsCompressor();
    high.type='highpass';high.frequency.value=240;high.Q.value=.5;
    low.type='lowpass';low.frequency.value=3000;low.Q.value=.5;
    leveler.threshold.value=-20;leveler.ratio.value=2;leveler.knee.value=18;leveler.attack.value=.06;leveler.release.value=.4;
    this.ambienceBus.connect(high);high.connect(low);low.connect(leveler);leveler.connect(this.master);
    this.ctx.addEventListener('statechange',()=>{
      if(this.ctx.state==='running')this.markOutputReady();
      else{this.outputReady=false;this.onActivationChange?.();if(this.clock)this.onInterrupted?.();}
    });
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
      this.suonaSustain(); // prepare the short, crossfaded recording loop before play
      this.rainLoop('rainLight');this.rainLoop('rainHeavy');
      this.failed=Object.keys(AUDIO_SOURCES).filter(kind=>!this.buffers[kind]);
      this.status=this.failed.length?'partial':'ready';return !!this.buffers.ensemble;
    });
    return this.loading;
  }
  markOutputReady() {
    if(this.ctx?.state!=='running')return;
    this.unlocking=false;this.needsWake=false;const first=!this.outputReady;this.outputReady=true;
    if(first)this.onReady?.();this.onActivationChange?.();
  }
  unlock(retry=false) {
    try {
      this.setup();this.prepare(retry);
      // Declare one music-playback session where the browser supports it.
      // Do this only inside real activation, never on the initial page load.
      try{const nav=window.navigator;if(nav?.userActivation?.isActive&&nav.audioSession&&nav.audioSession.type!=='playback')nav.audioSession.type='playback';}catch{}
      if(this.ctx.state==='running'&&!this.needsWake){this.markOutputReady();return true;}
      // A pre-gesture resume may stay pending on iOS. Never let that request
      // suppress a new resume issued synchronously by touchend / click.
      const ctx=this.ctx;this.unlocking=true;this.unlockAttempts++;
      const source=ctx.createBufferSource();source.buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.02),ctx.sampleRate);
      source.connect(this.master);source.onended=()=>source.disconnect();source.start();this.primed=true;
      Promise.resolve(ctx.resume()).then(()=>{
        if(this.ctx===ctx){this.unlocking=false;this.markOutputReady();}
      }).catch(error=>{
        if(this.ctx===ctx){this.lastUnlockError=error;this.unlocking=false;this.onActivationChange?.();}
      });
      this.onActivationChange?.();return false;
    }catch(error){this.lastUnlockError=error;this.unlocking=false;this.onActivationChange?.();return false;}
  }
  backgrounded(){
    // A mobile browser may keep reporting `running` while its output route was
    // suspended by the OS. Prime that route again on return / the next gesture.
    this.needsWake=true;this.outputReady=false;this.setRain(null);this.onActivationChange?.();
  }
  recoverOutput(){
    if(!this.muted)this.unlock();
  }
  setMuted(muted) {this.muted=muted;if(this.ctx)this.master.gain.setTargetAtTime(muted?0:.72,this.ctx.currentTime,.025);}
  setVolumes(game,rain){
    this.volumes={game:Math.max(0,Math.min(1,Number(game)||0)),rain:Math.max(0,Math.min(1,Number(rain)||0))};
    try{localStorage.setItem('dazougu.volumes.v35',JSON.stringify(this.volumes));}catch{}
    if(this.ctx){this.gameBus?.gain.setTargetAtTime(this.volumes.game,this.ctx.currentTime,.025);this.ambienceBus?.gain.setTargetAtTime(this.volumes.rain,this.ctx.currentTime,.025);}
  }
  rainLoop(kind) {
    if(this.rainLoops[kind])return this.rainLoops[kind];
    const input=this.buffers[kind];if(!input?.getChannelData||!this.ctx?.createBuffer)return null;
    // Equal-power seam preserves steady rain energy across repeated playback.
    const overlap=Math.min(Math.floor(input.sampleRate*.28),Math.floor(input.length/4)),frames=input.length-overlap;
    const loop=this.ctx.createBuffer(input.numberOfChannels,frames,input.sampleRate);
    for(let c=0;c<input.numberOfChannels;c++){
      const samples=input.getChannelData(c),out=loop.getChannelData(c);
      out.set(samples.subarray(0,frames));
      for(let i=0;i<overlap;i++){
        const angle=(i+.5)/overlap*Math.PI/2;
        out[i]=samples[i]*Math.sin(angle)+samples[frames+i]*Math.cos(angle);
      }
    }
    this.rainLoops[kind]=loop;return loop;
  }
  setRain(type,cover=false,amount=null) {
    if(!this.ctx||!this.master)return;
    const kind=type==='heavy'?'rainHeavy':type==='light'?'rainLight':null;
    const wanted=kind&&this.ctx.state==='running'?kind:null;
    const level=amount??(cover?.48:wanted==='rainHeavy'?.3:.14);
    const now=this.ctx.currentTime;
    if(wanted===this.rainType){if(this.rain)this.rain.gain.gain.setTargetAtTime(level,now,.18);return;}
    const previous=this.rain;this.rain=null;this.rainType=wanted;
    if(previous){
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setTargetAtTime(0,now,.09);
      try{previous.source.stop(now+.55);}catch{}
    }
    if(!wanted)return;
    const buffer=this.rainLoop(wanted);if(!buffer){this.rainType=null;return;}
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;
    source.loopEnd=buffer.duration;gain.gain.setValueAtTime(0,now);gain.gain.setTargetAtTime(level,now,.18);
    source.connect(gain);gain.connect(this.ambienceBus||this.master);
    const layer={source,gain};this.rainLayers.add(layer);this.rain=layer;
    source.onended=()=>{this.rainLayers.delete(layer);source.disconnect();gain.disconnect();};
    source.start(now);
  }
  startTransport() {
    this.stopTransport();if(!this.ctx)return;
    this.session=this.ctx.createGain();this.session.connect(this.gameBus||this.master);
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
  inputTime(eventStamp) {
    const current=this.gameTime();
    if(current===null)return null;
    const wall=performance.now();let stamp=Number(eventStamp);
    // Modern PointerEvent timestamps use performance.timeOrigin. A few embedded
    // browsers use epoch milliseconds; normalize only that explicit format.
    if(stamp>1e12)stamp-=performance.timeOrigin||(Date.now()-wall);
    const age=wall-stamp;
    const delay=Number.isFinite(stamp)&&stamp>0&&age>=0&&age<=250?age/1000:0;
    // Use the SAME continuous audible-clock mapping as the falling tiles, but
    // evaluate it at hardware input time, rather than handler dispatch time.
    // Do not rewind the rendering clock or add latency compensation twice.
    this.lastInputSample={dispatchDelayMs:delay*1000,eventWall:wall-delay*1000};
    return current-delay;
  }
  ensureSong(gameTime) {
    if(this.song||!this.buffers.ensemble||!this.bg||this.ctx.state!=='running')return;
    const contextNow=this.ctx.currentTime;
    const transport=this.clock?this.clock.game+contextNow-this.clock.context:gameTime;
    const position=Math.max(0,transport-RECORDING_SCORE.leadIn);
    const when=this.clock?Math.max(contextNow,this.clock.context+RECORDING_SCORE.leadIn-this.clock.game):contextNow+Math.max(0,RECORDING_SCORE.leadIn-gameTime);
    if(position>=this.buffers.ensemble.duration)return;
    const s=this.ctx.createBufferSource();s.buffer=this.buffers.ensemble;
    s.connect(this.bg);s.connect(this.melodyFilter);
    this.track(s);this.song=s;s.start(when,position);
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
    const rate=(kind==='drum'?.78:1)*detune;s.playbackRate.value=rate;
    const velocity=options.vary?(kind==='cymbal'?[1.03,1.12,1.04,1.02,1.04,1.08]:[.78,1.12,.88,1.02,.84,1.08])[variant]:1;
    const cutoffs={drum:[320,680,390,590,450,750],wood:[750,4500,1050,3300,1350,6000],gong:[1400,5200,1900,4200,2400,6500],cymbal:[5200,11500,6200,9000,5600,13000]};
    const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=(cutoffs[kind]||[8000])[variant]||8000;filter.Q.value=.55;
    const body=this.ctx.createBiquadFilter();body.type=kind==='drum'?'lowshelf':'highshelf';body.frequency.value=kind==='drum'?180:kind==='wood'?600:kind==='cymbal'?4000:1800;body.gain.value=kind==='drum'?[6,4,5.5,4.5,6,4.2][variant]:kind==='cymbal'?[-1.5,3.5,-1,2.5,-1.25,4][variant]:[-5,3.5,-3.5,2.5,-4.5,4][variant];
    const sourceLength=Math.min(meta.length,s.buffer.duration-meta.offset),length=sourceLength/rate;
    const gain=meta.gain*level*velocity*(options.accent||1)*(options.perfect?1.06:1);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+.002);
    const decay=(kind==='drum'?[.36,.67,.42,.59,.39,.65]:kind==='cymbal'?[.72,.98,.80,.86,.76,.94]:[.50,.98,.62,.86,.56,.94])[variant];
    g.gain.setValueAtTime(gain,at+.025);g.gain.linearRampToValueAtTime(gain*.48,at+length*decay*.72);g.gain.linearRampToValueAtTime(0,at+length*decay);
    s.connect(filter);filter.connect(body);body.connect(g);g.connect(dest);this.track(s);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();filter.disconnect();body.disconnect();g.disconnect();};s.start(at,meta.offset,sourceLength);
  }

  judgeSuona(points,perfect=false) {
    if(this.ctx?.state!=='running'||!this.session||!this.buffers.suona)return;
    // A short voiced articulation from the supplied sample, not its unrelated
    // four-second melody. Length is deliberately too short to become a phrase.
    const ctx=this.ctx,s=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    const t=ctx.currentTime,variant=this.nextVariation('suona',t),duration=points===30?.22:points===20?.17:.13;
    s.buffer=this.buffers.suona;s.playbackRate.value=[.988,1.014,.994,1.019,.991,1.009][variant];f.type='lowpass';f.frequency.value=[1950,2850,2150,2700,2050,3000][variant];
    const level=(points===30?.72:points===20?.62:.52)*(perfect?1.08:1)*[.88,1.08,.94,1.03,.91,1.06][variant];
    if(this.bg){this.bg.gain.setTargetAtTime(.57,t,.006);this.bg.gain.setTargetAtTime(.66,t+duration,.04);}
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.006);g.gain.setValueAtTime(level,t+duration*.45);g.gain.linearRampToValueAtTime(0,t+duration);
    s.connect(f);f.connect(g);g.connect(this.session);this.track(s);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();f.disconnect();g.disconnect();};s.start(t,.51,duration);
  }
  tick(accent=false) {this.sound('wood',undefined,this.session,accent?.55:.35);}
  miss() {this.sound('drum',undefined,this.gameBus||this.master,.2);}
  suonaSustain() {
    const source=this.buffers.suona;
    if(!source?.getChannelData||!this.ctx?.createBuffer)return null;
    if(this.sustainSource===source&&this.sustainBuffer)return this.sustainBuffer;
    // The supplied excerpt has a silent gap near 1.1 s. Loop a voiced A-note
    // region instead of restarting that gap or another four-second melody.
    const rate=source.sampleRate,start=Math.floor(.51*rate),length=Math.min(Math.floor(.24*rate),source.length-start);
    if(length<rate*.05)return null;
    const overlap=Math.min(Math.floor(.024*rate),Math.floor(length/4)),frames=length-overlap;
    const buffer=this.ctx.createBuffer(source.numberOfChannels,frames,rate);
    for(let channel=0;channel<source.numberOfChannels;channel++){
      const input=source.getChannelData(channel),out=buffer.getChannelData(channel);
      for(let i=0;i<frames;i++)out[i]=i<overlap?input[start+i]*(i/overlap)+input[start+frames+i]*(1-i/overlap):input[start+i];
    }
    this.sustainSource=source;this.sustainBuffer=buffer;return buffer;
  }
  voice() {
    if(this.ctx?.state!=='running'||!this.session||!this.buffers.suona)return()=>{};
    const ctx=this.ctx,s=ctx.createBufferSource(),g=ctx.createGain(),filter=ctx.createBiquadFilter();
    s.buffer=this.suonaSustain()||this.buffers.suona;s.loop=true;s.loopStart=0;s.loopEnd=s.buffer.duration;
    filter.type='lowpass';filter.frequency.value=4800;filter.Q.value=.5;
    const t=ctx.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1.4,t+.012);
    s.connect(filter);filter.connect(g);g.connect(this.session);this.track(s);
    s.onended=()=>{this.nodes.delete(s);s.disconnect();filter.disconnect();g.disconnect();};s.start(t);
    let stopped=false;
    return()=>{if(stopped)return;stopped=true;const now=ctx.currentTime;g.gain.cancelScheduledValues(now);g.gain.setTargetAtTime(.0001,now,.012);try{s.stop(now+.08);}catch{}};
  }
}
const audio=new RhythmAudio();
