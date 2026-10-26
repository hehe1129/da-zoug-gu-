'use strict';
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});try{
 const p=await b.newPage();await p.route('**/leaderboard-config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.DAZOUGU_LEADERBOARD_CONFIG={};'}));await p.goto('http://127.0.0.1:4177/?v=33');await p.waitForFunction(()=>state==='home');
 const result=await p.evaluate(async()=>{
  const rms=(x,start=0,end=x.length)=>{let sum=0;for(let i=start;i<end;i++)sum+=x[i]*x[i];return Math.sqrt(sum/(end-start));};
  async function render(withRain,withMusic,withHits){
   const ctx=new OfflineAudioContext(2,5*44100,44100),proxy=new Proxy(ctx,{get:(o,k)=>k==='state'?'running':typeof o[k]==='function'?o[k].bind(o):o[k]});
   const Context=window.AudioContext;let a;
   try{window.AudioContext=function(){return proxy;};a=new RhythmAudio();a.setup();}finally{window.AudioContext=Context;}
   a.buffers=audio.buffers;a.startTransport();
   if(withMusic){const source=ctx.createBufferSource();source.buffer=a.buffers.ensemble;source.connect(a.bg);source.start(0,20);}
   if(withRain)a.setRain('heavy',false,.32);
   if(withHits){a.sound('drum',.8,a.session);a.sound('cymbal',1.8,a.session);a.sound('gong',2.8,a.session);a.sound('wood',3.8,a.session);}
   return(await ctx.startRendering()).getChannelData(0);
  }
  const rain=await render(true,false,false),music=await render(false,true,false),mix=await render(true,true,true),instruments=[];
  for(const [kind,t] of [['drum',.8],['cymbal',1.8],['gong',2.8],['wood',3.8]]){const start=Math.round((t+.005)*44100),end=Math.round((t+.15)*44100);instruments.push({kind,rain:rms(rain,start,end),combined:rms(mix,start,end)});}
  let peak=0;for(const v of mix)peak=Math.max(peak,Math.abs(v));
  return{rainRMS:rms(rain,44100),musicRMS:rms(music,44100),mixRMS:rms(mix,44100),peak,instruments};
 });
 assert.ok(result.peak<.98,'combined music/rain/hits clip: '+result.peak);assert.ok(result.rainRMS<result.musicRMS*.6,'rain masks backing');assert.ok(result.instruments.every(x=>x.combined>x.rain*1.5),'a click is masked by rain');
 const out=path.resolve(__dirname,'../output/playwright/v33');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/audio-mix.json',JSON.stringify(result,null,2));console.log('PASS actual production mixing graph: rain below backing, four click types audible, peak below full scale',JSON.stringify(result));
 }finally{await b.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
