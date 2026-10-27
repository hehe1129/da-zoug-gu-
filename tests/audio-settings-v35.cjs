'use strict';
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});const results=[];try{
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await p.route('**/leaderboard-config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.DAZOUGU_LEADERBOARD_CONFIG={};'}));await p.goto('http://127.0.0.1:4177/');await p.waitForFunction(()=>state==='login');await p.click('#guestLogin');
 const check=(name,ok,data)=>{assert.ok(ok,name+' '+JSON.stringify(data));results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
 await p.click('#start');await p.waitForFunction(()=>state==='playing');await p.evaluate(()=>cancelAnimationFrame(raf));
 await p.evaluate(async()=>{window.hiddenTest=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hiddenTest});document.dispatchEvent(new Event('visibilitychange'));await audio.ctx.suspend();});await p.evaluate(()=>{hiddenTest=false;document.dispatchEvent(new Event('visibilitychange'));});await p.click('#resume');await p.waitForFunction(()=>state==='playing');await p.evaluate(()=>cancelAnimationFrame(raf));await p.waitForTimeout(200);
 check('guest login flow retains real background-return music/rain recovery',await p.evaluate(()=>audio.ctx.state==='running'&&audio.clock&&audio.song&&audio.rainType==='rainHeavy'&&misses===0));
 const levels=await p.evaluate(async()=>{
  async function render(game,rain){
   const c=new OfflineAudioContext(2,44100*3,44100),proxy=new Proxy(c,{get:(o,k)=>k==='state'?'running':typeof o[k]==='function'?o[k].bind(o):o[k]}),Context=window.AudioContext;let a;
   try{window.AudioContext=function(){return proxy;};a=new RhythmAudio();a.setup();}finally{window.AudioContext=Context;}
   a.buffers=audio.buffers;a.setVolumes(game,rain);a.startTransport();
   const music=c.createBufferSource();music.buffer=a.buffers.ensemble;music.connect(a.bg);music.start(0,20);a.setRain('heavy',false,.32);a.sound('drum',.5,a.session);
   const data=(await c.startRendering()).getChannelData(0);let energy=0,peak=0;for(let i=44100;i<data.length;i++){energy+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));}return{rms:Math.sqrt(energy/(data.length-44100)),peak};
  }
  return{both:await render(1,1),game:await render(1,0),rain:await render(0,1),silent:await render(0,0)};
 });
 check('separate volume buses mute game or rain independently, with both-zero silent',levels.game.rms>.05&&levels.rain.rms>.003&&levels.silent.peak===0&&levels.both.peak<.98,levels);
 await p.evaluate(()=>audio.setVolumes(.35,.6));await p.reload();await p.waitForFunction(()=>state==='login');check('volume preference survives reload before a session is selected',await p.evaluate(()=>audio.volumes.game===.35&&audio.volumes.rain===.6));
 const out=path.resolve(__dirname,'../output/playwright/v35');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/audio-settings.json',JSON.stringify(results,null,2));
 }finally{await b.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
