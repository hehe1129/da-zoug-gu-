const fs=require('fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const score=vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../score.js'),'utf8')+';RECORDING_SCORE');
assert.equal(score.sections.length,7);assert.equal(score.sections[0],0);assert.equal(score.sections.at(-1),score.duration);
const held=score.notes.filter(n=>n.kind==='suona');
for(let i=0;i<score.notes.length;i++){
 const n=score.notes[i];assert.ok(Number.isFinite(n.time)&&n.time>=0&&n.time+n.duration<=score.duration+.01);assert.ok(['drum','gong','wood','cymbal','suona'].includes(n.kind));
 assert.equal(n.stage,Math.min(5,score.sections.slice(1).filter(t=>n.time>=t).length));
 if(i){const gap=n.time-score.notes[i-1].time;assert.ok(gap===0||gap>=.205,'Unreadable adjacent input spacing');}
 if(n.kind==='suona'){assert.ok(n.duration>0);for(const q of score.notes)if(q!==n)assert.ok(q.time<=n.time-.59||q.time>=n.time+n.duration+.59,'Required tap inside a hold/recovery window');}
 else assert.equal(n.duration,0);
}
assert.ok(held.length>0);for(let i=0;i<6;i++)assert.ok(score.notes.some(n=>n.stage===i));
const groups=new Map();for(const n of score.notes){const group=groups.get(n.time)||[];group.push(n);groups.set(n.time,group);}
for(const group of groups.values())if(group.length>1){
 assert.equal(group.length,2,'At most two simultaneous inputs');
 assert.equal(new Set(group.map(n=>n.kind)).size,2,'A chord represents two different instruments');
 assert.equal(new Set(group.map(n=>n.lane)).size,2,'Reference chord lanes must differ');
 assert.ok(group.every(n=>n.duration===0),'No chord during a suona sustain');
}
console.log(`PASS ${score.notes.length} notes: ordered input groups, two-instrument chords on distinct lanes, ${held.length} holds with recovery space, all six sections`);
