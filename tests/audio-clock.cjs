'use strict';
// Reproduce uneven device clock reports without depending on a browser, GPU,
// network or recording. Motion must stay continuous AND follow audible time.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
let wall=10000,real=10;
const sandbox={performance:{now:()=>wall},console,Set,Map,Math,window:{},setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../audio.js'),'utf8')+'\nglobalThis.TestAudio=RhythmAudio;',sandbox);
function check(mode,hz=60,seconds=10){
 const a=new sandbox.TestAudio();wall=10000;real=10;
 const quantum=mode==='block100'?.1:mode==='block50'?.05:mode==='block20'?.02:0;
 a.ctx={state:'running',get currentTime(){const value=mode==='drift'?10+(real-10)*.9998:real;return quantum?Math.floor((value+1e-9)/quantum)*quantum:value;},baseLatency:.01,outputLatency:.03};
 if(['normal','timestamp-change','drift'].includes(mode))a.ctx.getOutputTimestamp=()=>({contextTime:a.ctx.currentTime-(mode==='timestamp-change'&&Math.floor((wall-10000)/120)%2?.085:.04),performanceTime:wall});
 a.session={};a.ensureSong=()=>{};a.startSong(0);
 let previous=a.gameTime(),maxError=0;
 for(let frame=1;frame<=seconds*hz;frame++){
   wall=10000+frame*1000/hz;real=10+frame/hz;
   const value=a.gameTime(),advance=value-previous;
   assert.ok(advance>=(1/hz)*.974&&advance<=(1/hz)*1.026,mode+' stalled or jumped at frame '+frame+': '+advance);
   assert.equal(a.gameTime(),value,'two reads at the same instant must agree');
   const audible=a.ctx.currentTime-.04-10;
   // Quantized reports give only a bounded interval, not an exact device time.
   if(!quantum&&mode!=='timestamp-change')maxError=Math.max(maxError,Math.abs(value-audible));
   previous=value;
 }
 if(!quantum&&mode!=='timestamp-change')assert.ok(maxError<.003,mode+' audible drift '+maxError);
 // Starting a resumed transport resets the old interpolation anchor.
 a.session=null;a.stopTransport();assert.equal(a.gameTime(),null);
 a.session={};a.startSong(23);assert.ok(Math.abs(a.gameTime()-23)<.15,'resume kept old game time');
 console.log('PASS',mode,hz+' Hz',seconds+' s');
}
for(const hz of [30,60,120])for(const mode of ['normal','block20','block50','block100','timestamp-change'])check(mode,hz);
check('drift',60,190);
