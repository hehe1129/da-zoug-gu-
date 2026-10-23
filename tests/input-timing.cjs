'use strict';
// A delayed main-thread callback must not turn an on-time hardware input late.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
let wall=10000,real=10;
const origin=1780000000000;
const sandbox={console,Set,Map,Math,Date,performance:{now:()=>wall,timeOrigin:origin},window:{},setTimeout,clearTimeout,RECORDING_SCORE:{leadIn:2.8}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../audio.js'),'utf8')+';globalThis.TestAudio=RhythmAudio;',sandbox);
const chart=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../score.js'),'utf8')+';RECORDING_SCORE');
const identities=new Set(chart.notes.map(n=>n.eventId));assert.equal(identities.size,chart.notes.length);
assert.equal(chart.revision,'v25-attack-calibration-1');
function fixture(hz,drift=1){
  const a=new sandbox.TestAudio();wall=10000;real=10;
  a.ctx={state:'running',get currentTime(){return 10+(real-10)*drift;},baseLatency:.01,outputLatency:.03,getOutputTimestamp(){return{contextTime:this.currentTime-.04,performanceTime:wall};}};
  a.session={};a.ensureSong=()=>{};a.startSong(0);a.gameTime();return a;
}
for(const hz of [30,60,120])for(const drift of [1,.9998]){
 const a=fixture(hz,drift);let frame=0,maxDelta=0;
 for(const n of chart.notes){
   const at=n.time+chart.leadIn;
   const handlerWall=10000+(at+.04+.040)/drift*1000;
   while(10000+(frame+1)*1000/hz<handlerWall){frame++;wall=10000+frame*1000/hz;real=10+(wall-10000)/1000;a.gameTime();}
   wall=handlerWall;real=10+(wall-10000)/1000;
   const stamp=wall-.040/drift*1000;
   const mapped=a.inputTime(stamp),epochMapped=a.inputTime(origin+stamp);
   maxDelta=Math.max(maxDelta,Math.abs(mapped-at));
   assert.ok(Math.abs(mapped-at)<.002,`input drift ${hz}Hz ${n.eventId} ${mapped-at}`);
   assert.ok(Math.abs(mapped-epochMapped)<.000001,'legacy epoch mapping differs');
   const current=a.gameTime();assert.equal(a.inputTime(NaN),current);assert.equal(a.inputTime(0),current);assert.equal(a.inputTime(wall+1000),current);assert.equal(a.inputTime(wall-1000),current);
 }
 console.log('PASS all chart inputs, 40-ms queued delivery',hz+'Hz','drift',drift,'max delta ms',(maxDelta*1000).toFixed(3));
}
// Use real production thresholds from game.js, not a duplicate magic constant.
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const rules=vm.runInNewContext('('+game.match(/const TIMING_RULES=Object.freeze\(([^\n]+)\);/)[1]+')');
for(const hz of [30,60,120])for(const error of [-.071,-.069,0,.069,.071]){
 const a=fixture(hz);const at=5,delay=.045;
 for(let f=1;f<=Math.ceil((at+error+.04+delay)*hz);f++){wall=10000+f*1000/hz;real=10+f/hz;a.gameTime();}
 const stamp=10000+(at+error+.04)*1000;
 const delta=a.inputTime(stamp)-at;
 assert.equal(Math.abs(delta)<=rules.perfect,Math.abs(error)<=.070,`boundary changed ${hz}Hz ${error}: ${delta}`);
}
console.log('PASS perfect boundary independent of render cadence and dispatch delay');
// Actual AudioBufferSource scheduling must share exactly the transport anchor,
// including a delayed start and a resume offset inside the recording.
for(const resume of [0,23.145]){
 const a=new sandbox.TestAudio();let context=10,scheduled;
 const source={connect(){},disconnect(){},start(when,offset){scheduled={when,offset};}};
 a.ctx={state:'running',get currentTime(){context+=.003;return context;},createBufferSource:()=>source};a.session={};a.bg={};a.buffers.ensemble={duration:184};a.melodyFilter={};
 a.startSong(resume);
 const time=resume+2.8;
 const graph=a.clock.context+time-a.clock.game;
 const sourceAt=graph-scheduled.when+scheduled.offset;
 assert.ok(Math.abs(sourceAt-(time-2.8))<1e-9,JSON.stringify({resume,scheduled,sourceAt}));
}
console.log('PASS initial playback and resume share one sample-clock anchor');
