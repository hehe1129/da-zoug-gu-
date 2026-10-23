const fs=require('fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const score=vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../score.js'),'utf8')+';RECORDING_SCORE');
assert.equal(score.sections.length,7);assert.equal(score.sections[0],0);assert.equal(score.sections.at(-1),score.duration);
const held=score.notes.filter(n=>n.kind==='suona');
for(let i=0;i<score.notes.length;i++){
 const n=score.notes[i];assert.ok(Number.isFinite(n.time)&&n.time>=0&&n.time+n.duration<=score.duration+.01);assert.ok(['drum','gong','wood','cymbal','suona'].includes(n.kind));
 assert.equal(n.stage,Math.min(5,score.sections.slice(1).filter(t=>n.time>=t).length));
 if(i)assert.ok(n.time-score.notes[i-1].time>=.205,'Unreadable adjacent input spacing');
 if(n.kind==='suona'){assert.ok(n.duration>0);for(const q of score.notes)if(q!==n)assert.ok(q.time<=n.time-.59||q.time>=n.time+n.duration+.59,'Required tap inside a hold/recovery window');}
 else assert.equal(n.duration,0);
}
assert.ok(held.length>0);for(let i=0;i<6;i++)assert.ok(score.notes.some(n=>n.stage===i));
console.log(`PASS ${score.notes.length} recording-aligned notes: sorted, unique, playable input gaps, ${held.length} holds with recovery space, all six sections`);
