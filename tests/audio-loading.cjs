'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
function harness(mode){
 const calls={},decodes={};let fail=true;
 const sandbox={console,Set,Map,Math,Uint8Array,ArrayBuffer,Promise,AbortController,setTimeout,clearTimeout,performance:{now:()=>0},window:{},RECORDING_SCORE:{duration:183.817}};
 sandbox.fetch=async url=>{const kind=url.split('/').at(-1).split('.')[0];calls[kind]=(calls[kind]||0)+1;if(fail&&kind==='ensemble'&&['prefetch-fail','partial'].includes(mode)){fail=false;throw new Error('network interrupted');}return{ok:true,arrayBuffer:async()=>new Uint8Array([Object.keys(calls).indexOf(kind)+1]).buffer};};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../audio.js'),'utf8')+'\nglobalThis.TestAudio=RhythmAudio;',sandbox);
 const a=new sandbox.TestAudio();a.ctx={decodeAudioData(bytes,ok,bad){const key=String(new Uint8Array(bytes)[0]);decodes[key]=(decodes[key]||0)+1;const buffer={length:100,duration:184};queueMicrotask(()=>ok(buffer));if(mode==='callback-only')return;return Promise.resolve(buffer);}};
 return{a,calls};
}

async function slowDownload(stalled=false){
 let now=0,identifier=0,finished=false;const timers=new Map();
 const schedule=(callback,ms)=>{const id=++identifier;timers.set(id,{at:now+ms,callback});return id;},cancel=id=>timers.delete(id);
 const sandbox={console,Set,Map,Math,Uint8Array,ArrayBuffer,Promise,AbortController,setTimeout:schedule,clearTimeout:cancel,performance:{now:()=>now},window:{},RECORDING_SCORE:{duration:183.817}};
 sandbox.fetch=async(url,options)=>{
   if(!url.endsWith('ensemble.mp3'))return{ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer};
   let chunks=0;
   return{ok:true,headers:{get:()=>4},body:{getReader:()=>({read:()=>{
     if(chunks>=4)return Promise.resolve({done:true});
     return new Promise((resolve,reject)=>{
       const abort=()=>reject(new Error('aborted'));options.signal.addEventListener('abort',abort,{once:true});
       if(!stalled)schedule(()=>{options.signal.removeEventListener('abort',abort);chunks++;resolve({done:false,value:new Uint8Array([1])});},25000);
     });
   }})}};
 };
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../audio.js'),'utf8')+'\nglobalThis.TestAudio=RhythmAudio;',sandbox);
 const a=new sandbox.TestAudio();a.ctx={decodeAudioData(bytes,ok){const buffer={length:100,duration:184};queueMicrotask(()=>ok(buffer));return Promise.resolve(buffer);}};
 const pending=a.prepare().then(()=>finished=true);
 for(let step=0;step<50&&!finished;step++){
   for(let i=0;i<25;i++)await Promise.resolve();if(finished)break;
   const entry=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(entry,'download promise has no completion');timers.delete(entry[0]);now=entry[1].at;entry[1].callback();
 }
 await pending;
 if(stalled){assert.equal(a.status,'partial');assert.ok(a.failed.includes('ensemble'));assert.equal(now,30000);}
 else {assert.equal(a.status,'ready');assert.equal(now,100000);}
 console.log('PASS',stalled?'stalled download aborts with explicit failure':'100-second progressing recording is not aborted at the old total timeout');
}

(async()=>{
 const pre=harness('prefetch-fail');pre.a.preload();await new Promise(setImmediate);await pre.a.prepare();assert.equal(pre.a.status,'ready');assert.equal(pre.calls.ensemble,2,'failed prefetch was reused');console.log('PASS failed idle prefetch is fetched again');
 const partial=harness('partial');await partial.a.prepare();assert.equal(partial.a.status,'partial');assert.ok(partial.a.failed.includes('ensemble'));assert.equal(partial.a.buffers.ensemble,undefined);await partial.a.prepare(true);assert.equal(partial.a.status,'ready');assert.equal(partial.calls.ensemble,2);assert.equal(partial.calls.drum,1,'successful samples should stay cached');console.log('PASS retry missing ensemble only, retain decoded instrument samples');
 const callback=harness('callback-only');await callback.a.prepare();assert.equal(callback.a.status,'ready');assert.equal(Object.keys(callback.a.buffers).length,8);console.log('PASS callback-only decoder, including both rain recordings');
 const truncated=harness('normal');let first=true;const decode=truncated.a.decode.bind(truncated.a);truncated.a.decode=async bytes=>{const b=await decode(bytes);if(first){first=false;return{length:100,duration:2};}return b;};await truncated.a.prepare();assert.equal(truncated.a.status,'partial');assert.equal(truncated.a.buffers.ensemble,undefined);await truncated.a.prepare(true);assert.equal(truncated.a.status,'ready');console.log('PASS truncated ensemble rejected, retry recovers');
 await slowDownload();await slowDownload(true);
})().catch(e=>{console.error(e);process.exitCode=1});
