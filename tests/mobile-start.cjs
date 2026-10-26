'use strict';
const {chromium,webkit}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../output/playwright/v33');fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[],errors=[];const check=(engine,name,ok,data)=>{assert.ok(ok,engine+' '+name+' '+JSON.stringify(data));results.push({engine,name,data});console.log('PASS',engine,name);};
 for(const [engine,type,executablePath] of [['chromium',chromium,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],['webkit',webkit,'C:/Users/20620/Desktop/da-zou-gu-qa/browsers/webkit-2370/Playwright.exe']]){
  if(process.env.DAZOUGU_TEST_ENGINE&&process.env.DAZOUGU_TEST_ENGINE!==engine)continue;
  const b=await type.launch({executablePath,headless:true,...(engine==='chromium'?{args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']}: {})});try{
   if(engine==='webkit'){
    const probe=await b.newPage();await probe.goto('http://127.0.0.1:4177/',{waitUntil:'domcontentloaded'});
    const supported=await probe.evaluate(()=>typeof (window.AudioContext||window.webkitAudioContext)==='function');await probe.close();
    if(!supported){results.push({engine,name:'local build has no Web Audio interface',skipped:true});console.log('SKIP WebKit local build does not expose AudioContext; not an iPhone audio test');continue;}
   }
   async function pageFor(block){const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>{errors.push({engine,error:String(e)});console.error('PAGEERROR',String(e));});await p.addInitScript(block=>{
    localStorage.setItem('dazougu.nickname.v1','手机回归鼓友');window.allowAudio=!block;window.resumeAttempts=0;
    const Context=window.AudioContext||window.webkitAudioContext,native=Context.prototype.resume;
    let proto=Context.prototype,readState;while(proto&&!readState){readState=Object.getOwnPropertyDescriptor(proto,'state')?.get;proto=Object.getPrototypeOf(proto);}
    // Chromium may auto-resume on source.start(). Also hold the reported state
    // to reproduce the stricter embedded-iOS waiting policy deterministically.
    Object.defineProperty(Context.prototype,'state',{configurable:true,get(){return !window.allowAudio?'suspended':readState.call(this);}});
    Context.prototype.resume=function(){window.resumeAttempts++;if(!window.allowAudio||window.resumeAttempts===1)return new Promise(()=>{});return native.call(this);};
   },block);await p.route('**/leaderboard-config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.DAZOUGU_LEADERBOARD_CONFIG={};'}));await p.goto('http://127.0.0.1:4177/?v=33');await p.waitForFunction(()=>state==='home',null,{timeout:45000});return p;}
   const p=await pageFor(true);await p.tap('#start');await p.waitForTimeout(4200);
   const waiting=await p.evaluate(()=>({state,misses,elapsed,error:$('error').hidden,count:$('countNumber').textContent,attempts:resumeAttempts}));
   check(engine,'blocked audio freezes countdown without auto-pause, misses or false muted error',waiting.state==='countdown'&&waiting.misses===0&&waiting.elapsed===0&&waiting.error&&waiting.count==='3',waiting);
   await p.evaluate(()=>window.allowAudio=true);await p.tap('#board');await p.waitForFunction(()=>state==='playing',null,{timeout:10000});await p.evaluate(()=>cancelAnimationFrame(raf));
   check(engine,'later real touch recovers a pending resume and starts the song',await p.evaluate(()=>audio.ctx.state==='running'&&!!audio.song&&resumeAttempts>1));
   const before=await p.evaluate(()=>audio.ctx.currentTime);await p.waitForTimeout(150);check(engine,'actual audio clock advances after recovery',await p.evaluate(t=>audio.ctx.currentTime>t+.05,before));
   await p.setViewportSize({width:390,height:700});await p.waitForTimeout(150);check(engine,'height-only browser/keyboard resize does not pause play',await p.evaluate(()=>state==='playing'));
   const phases=await p.evaluate(()=>Array.from({length:6},(_,i)=>{enterStage(i);return{level:i+1,...DazouguWeather.forLevel(i+1),actual:audio.rainType};}));
   check(engine,'rain decreases in stages one to five, stops in six, with matching recordings',phases.map(s=>s.drops).join(',')==='72,54,38,24,12,0'&&phases.slice(1,5).every((s,i)=>s.speed<phases[i].speed&&s.length<phases[i].length)&&phases.slice(0,2).every(s=>s.actual==='rainHeavy')&&phases.slice(2,5).every(s=>s.actual==='rainLight')&&phases[5].actual===null,phases);
   const intact=await p.evaluate(()=>{const song=audio.song,clock=audio.clock,bg=audio.bg;for(const i of [0,1,2,3,4,5])enterStage(i);return{song:audio.song===song,clock:audio.clock===clock,bus:audio.bg===bg,level:audio.bg.gain.value,separate:audio.ambienceBus!==audio.session};});check(engine,'rain transitions leave music clock, source and music level intact',intact.song&&intact.clock&&intact.bus&&Math.abs(intact.level-.66)<.00001&&intact.separate,intact);
   await p.evaluate(()=>{score=17800;hits=445;perfects=445;maxCombo=445;end('测试');});await p.waitForTimeout(800);await p.screenshot({path:out+'/'+engine+'-result.png'});
   const entry=await p.evaluate(()=>{const card=document.querySelector('#over .modal-card').getBoundingClientRect(),button=$('resultLeaderboard').getBoundingClientRect(),number=$('finalScore').getBoundingClientRect();return{top:(button.top-card.top)/card.height,right:(card.right-button.right)/card.width,width:button.width,overlap:button.left<number.right&&button.right>number.left&&button.top<number.bottom&&button.bottom>number.top};});
   check(engine,'result ranking sits at the marked right-hand location',Math.abs(entry.top-.32)<.01&&Math.abs(entry.right-.105)<.01,entry);
   await p.click('#back');await p.close();
   const q=await pageFor(true);await q.evaluate(()=>window.allowAudio=true);await q.tap('#sound');await q.waitForFunction(()=>audio.ctx.state==='running');check(engine,'first tap on locked sound icon enables rather than mutes',await q.evaluate(()=>!audio.muted&&$('coverAudioHint').hidden));
   await q.waitForTimeout(700);const home=await q.evaluate(()=>{const a=new Float32Array(audio.analyser.fftSize);audio.analyser.getFloatTimeDomainData(a);return{rain:audio.rainType,peak:Math.max(...a.map(Math.abs))};});check(engine,'cover rain plays on the first eligible interaction',home.rain==='rainLight'&&home.peak>.001,home);
   await q.tap('#sound');check(engine,'subsequent sound tap still mutes normally',await q.evaluate(()=>audio.muted));await q.tap('#sound');check(engine,'unmute restores the shared master without resetting rain',await q.evaluate(()=>!audio.muted&&audio.rainType==='rainLight'));
   await q.tap('#start');await q.waitForTimeout(500);await q.setViewportSize({width:390,height:760});await q.waitForFunction(()=>state==='playing');check(engine,'normal start survives mobile viewport changes at countdown',await q.evaluate(()=>state==='playing'));await q.close();
  }finally{await b.close();}
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(out+'/mobile-start-'+(process.env.DAZOUGU_TEST_ENGINE||'all')+'.json',JSON.stringify({results,errors},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
