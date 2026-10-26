'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={console,Set,Map,Math,Promise,performance:{now:()=>0},window:{},setTimeout:()=>0,clearTimeout(){}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../audio.js'),'utf8')+'\nglobalThis.TestAudio=RhythmAudio;',sandbox);
(async()=>{
 const a=new sandbox.TestAudio();let calls=0,ready=0,errors=0;
 a.setup=()=>{};a.prepare=()=>Promise.resolve(true);a.master={};a.onReady=()=>ready++;a.onError=()=>errors++;
 a.ctx={state:'suspended',sampleRate:44100,currentTime:0,createBuffer(){return{};},createBufferSource(){return{connect(){},disconnect(){},start(){}};},resume(){calls++;if(calls===1)return new Promise(()=>{});this.state='running';return Promise.resolve();}};
 a.unlock();a.unlock();await Promise.resolve();await Promise.resolve();
 assert.equal(calls,2,'a blocked pointerdown attempt must not suppress the later eligible touchend/click attempt');assert.equal(a.ctx.state,'running');assert.ok(ready>=1);assert.equal(errors,0);console.log('PASS pending early resume does not lock out subsequent user gestures');
 const b=new sandbox.TestAudio();b.setup=()=>{};b.prepare=()=>Promise.resolve();b.ctx={...a.ctx,state:'suspended',resume:()=>Promise.reject(new Error('NotAllowedError'))};b.master={};b.onError=()=>errors++;
 b.unlock();await Promise.resolve();await Promise.resolve();assert.equal(errors,0,'autoplay waiting is not a user mute/error');console.log('PASS autoplay restrictions are treated as waiting, not incorrect muted errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
