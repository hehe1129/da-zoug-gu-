'use strict';
// Render the actual recorded-source graph; no network service or live score write.
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const preview=process.env.DAZOUGU_PREVIEW_URL||'http://127.0.0.1:4177/';
(async()=>{const browser=await chromium.launch({executablePath:process.env.DAZOUGU_BROWSER_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined),headless:true});try{
 const p=await browser.newPage();await p.route('**/__audio_feedback__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline audio test</title>'}));await p.goto(preview+'__audio_feedback__');await p.addScriptTag({url:preview+'audio.js'});
 const result=await p.evaluate(async()=>{
  const decoder=new AudioContext(),buffers={};
  for(const kind of ['cymbal','suona'])buffers[kind]=await decoder.decodeAudioData(await(await fetch('assets/audio/'+kind+'.mp3')).arrayBuffer());
  const rms=(data,from=0,to=data.length)=>{let energy=0;for(let i=from;i<to;i++)energy+=data[i]*data[i];return Math.sqrt(energy/(to-from));};
  const cymbals=[];
  for(let variant=0;variant<6;variant++){
   const ctx=new OfflineAudioContext(1,96000,48000),a=new RhythmAudio();a.ctx=new Proxy(ctx,{get:(o,k)=>k==='state'?'running':typeof o[k]==='function'?o[k].bind(o):o[k]});a.buffers=buffers;a.nextVariation=()=>variant;a.sound('cymbal',0,ctx.destination,1,{vary:true});const data=(await ctx.startRendering()).getChannelData(0);cymbals.push({variant,rms:rms(data)});
  }
  const ctx=new OfflineAudioContext(1,7*48000,48000),a=new RhythmAudio();let time=0;
  a.ctx=new Proxy(ctx,{get:(o,k)=>k==='state'?'running':k==='currentTime'?time:typeof o[k]==='function'?o[k].bind(o):o[k]});a.buffers=buffers;a.session=ctx.createGain();a.session.connect(ctx.destination);
  const stop=a.voice(),loopDuration=a.sustainBuffer.duration;time=6;stop();stop();const data=(await ctx.startRendering()).getChannelData(0),held=[];
  for(let at=.25;at<5.9;at+=.5)held.push({at,rms:rms(data,Math.floor(at*48000),Math.floor((at+.2)*48000))});
  const released=rms(data,Math.floor(6.25*48000),Math.floor(6.8*48000)),remainingNodes=a.nodes.size;
  await decoder.close();return{cymbals,held,released,remainingNodes,loopDuration};
 });
 const levels=result.cymbals.map(v=>v.rms),low=Math.min(...levels),high=Math.max(...levels);
 assert.ok(low>.032,'quiet cymbal still too weak: '+low);assert.ok(high/low<2.2,'cymbal variation loudness spread too wide');
 assert.ok(result.held.every(v=>v.rms>.035),'held suona contains a quiet gap');assert.ok(result.released<.00001,'released suona is still audible');assert.equal(result.remainingNodes,0,'suona node leaked');assert.ok(result.loopDuration>.15&&result.loopDuration<.3);
 const out=path.resolve(__dirname,'../output/playwright/v30');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/audio-feedback.json',JSON.stringify(result,null,2));
 console.log('PASS all six cymbal variations audible; RMS min/max',low.toFixed(5),high.toFixed(5));console.log('PASS six-second held suona stays voiced and release becomes silent; no source nodes remain');
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
