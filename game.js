/* Four-lane falling-note game. Keeps the original point-at-the-tile input,
   long-note completion and three-miss limit; no framework or build step. */
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('board'), pen = canvas.getContext('2d');
const names = {drum:'大鼓',gong:'小锣',cymbal:'铜钹',wood:'木鱼',suona:'唢呐'};
const colors = ['#ffedbf','#fff0c9','#ffe9b3'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// A finger that began on a tile must never activate a newly appeared dialog
// underneath it when released. Keep the pointer origin through its native click.
const pointerOrigins = new Map();
let lastReleasedOrigin = null;
document.addEventListener('pointerdown',e=>{ pointerOrigins.set(e.pointerId,e.target.closest('button')); },true);
document.addEventListener('pointerup',e=>{
  lastReleasedOrigin = {button:pointerOrigins.get(e.pointerId),at:performance.now()};
  setTimeout(()=>pointerOrigins.delete(e.pointerId),1000);
},true);
document.addEventListener('pointercancel',e=>pointerOrigins.delete(e.pointerId),true);
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button || e.detail===0) return;
  const origin=pointerOrigins.has(e.pointerId) ? {button:pointerOrigins.get(e.pointerId)} : lastReleasedOrigin && performance.now()-lastReleasedOrigin.at<500 ? lastReleasedOrigin : null;
  if(origin && origin.button!==button) { e.preventDefault(); e.stopImmediatePropagation(); }
},true);
const SONG_LEAD = RECORDING_SCORE.leadIn;
const PERFECT_WINDOW=.070; // seconds around the recorded head attack
const stages = [
  {name:'开锣',travel:2.65,shell:'#1959be',field:'#1855af',lane:'#164fa6',ink:'#fffbed',accent:'#ffdc4c',accentInk:'#153e83',motif:'rings'},
  {name:'起势',travel:2.50,shell:'#cd638e',field:'#8f3e70',lane:'#984b7a',ink:'#153e83',accent:'#185ac6',accentInk:'#fffbed',motif:'ribbons'},
  {name:'入巷',travel:2.36,shell:'#c2953b',field:'#805b2f',lane:'#896437',ink:'#153e83',accent:'#185ac6',accentInk:'#fffbed',motif:'fans'},
  {name:'合奏',travel:2.22,shell:'#386db3',field:'#27588c',lane:'#306194',ink:'#fffbed',accent:'#ffb6d3',accentInk:'#153e83',motif:'waves'},
  {name:'沸腾',travel:2.08,shell:'#a15487',field:'#693e78',lane:'#754d82',ink:'#fffbed',accent:'#185ac6',accentInk:'#fffbed',motif:'confetti'},
  {name:'满堂',travel:1.96,shell:'#154b90',field:'#183c78',lane:'#214681',ink:'#fffbed',accent:'#185ac6',accentInk:'#fffbed',motif:'sunburst'}
];
let state = 'home', notes = [], holds = new Map(), effects = [], particles = [], score = 0, misses = 0, combo = 0, maxCombo = 0, hits = 0, perfects = 0;
let w = 0, h = 0, line = 0, tile = 0, startClock = 0, elapsed = 0, raf = 0, nextIndex = 0, noteId = 0;
let noticeUntil = 0, phase = -1;
let damageUntil = 0, shownLives = -1;
let burstIndex = 0, perfectBurstIndex = 0;
let sessionLanes = [];
let stageCueUntil = 0, themeAt = 0, themeBefore = stages[0];
const scenery=document.createElement('canvas');
let countStarted = 0, countDuration = 3, lastCount = -1, transitionTimer = 0, resultFrame = 0, messageTimer = 0;
let waitingAudio = false, loadStarted = 0, resumeCountdown = false;

function setState(value) { state = value; $('app').dataset.state = value; }
function now() { return state === 'playing' ? audio.gameTime() ?? (performance.now() - startClock) / 1000 : elapsed; }
function restartAnimation(el, className) { el.classList.remove(className); void el.offsetWidth; el.classList.add(className); }
function feedback(text, kind = '', duration = .8) { $('notice').textContent = text; $('notice').dataset.kind = kind; noticeUntil = now() + duration; if (!reducedMotion) restartAnimation($('notice'), 'bump'); }
function dimensions() {
  const r = canvas.getBoundingClientRect(); w = r.width; h = r.height;
  const d = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(w*d); canvas.height = Math.round(h*d); pen.setTransform(d,0,0,d,0,0);
  line = h * .81; tile = Math.max(68, Math.min(94,h*.17));
  paintScenery(Math.max(0,phase));
}
function stagePalette(t) {
  const stage=stages[Math.max(0,phase)], progress=reducedMotion?1:Math.min(1,Math.max(0,(t-themeAt)/.7));
  const blend=key=>{
    const a=parseInt(themeBefore[key].slice(1),16),b=parseInt(stage[key].slice(1),16);
    const channel=shift=>Math.round(((a>>shift)&255)*(1-progress)+((b>>shift)&255)*progress);
    return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
  };
  return {field:blend('field'),lane:blend('lane')};
}
function paintScenery(index) {
  scenery.width=Math.max(1,Math.ceil(w));scenery.height=Math.max(1,Math.ceil(h));
  const c=scenery.getContext('2d'),s=stages[index];
  c.strokeStyle='#fffbed';c.fillStyle='#fffbed';c.globalAlpha=.022;c.lineWidth=1.5;
  if(s.motif==='rings')for(let r=40;r<360;r+=48){c.beginPath();c.arc(w*.95,h*.2,r,0,Math.PI*2);c.stroke();}
  if(s.motif==='ribbons')for(let x=-h;x<w+h;x+=74){c.beginPath();c.moveTo(x,0);c.lineTo(x+h*.65,h);c.stroke();c.beginPath();c.moveTo(x+8,0);c.lineTo(x+8+h*.65,h);c.stroke();}
  if(s.motif==='fans')for(const [x,y] of [[0,h*.32],[w,h*.77]])for(let a=0;a<Math.PI*2;a+=Math.PI/12){c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*w,y+Math.sin(a)*w);c.stroke();}
  if(s.motif==='waves')for(let y=-40;y<h+80;y+=70){c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.3,y+95,w*.7,y-40,w,y+45);c.stroke();}
  if(s.motif==='confetti')for(let i=0;i<24;i++){const x=(i*73.3)%w,y=(i*97.1)%h;c.save();c.translate(x,y);c.rotate(i*1.3);c.fillRect(-2,-9,4,18);c.restore();}
  if(s.motif==='sunburst')for(let a=0;a<Math.PI*2;a+=Math.PI/14){c.beginPath();c.moveTo(w*.5,h*.35);c.lineTo(w*.5+Math.cos(a)*h*1.2,h*.35+Math.sin(a)*h*1.2);c.stroke();}
  c.fillStyle='#fff5d5';c.globalAlpha=.05;for(let i=0;i<Math.floor(w*h/95);i++){const x=(i*137.31)%w,y=(i*71.23)%h;c.fillRect(x,y,1,1);}
  c.globalAlpha=0;c.font='92px ClassicSong';c.textAlign='right';c.fillText(String(index+1).padStart(2,'0'),w-18,h*.39);
}
function enterStage(index,announce=true) {
  const old=phase;themeBefore=stages[Math.max(0,old)];themeAt=now();phase=index;
  const s=stages[index],app=$('app');app.dataset.level=String(index+1);
  for(const [key,value] of Object.entries({shell:s.shell,ink:s.ink,accent:s.accent,'accent-ink':s.accentInk}))app.style.setProperty('--stage-'+key,value);
  $('phase').innerHTML=`<b>${String(index+1).padStart(2,'0')}</b><span>${s.name}<small>原曲跟奏</small></span>`;
  $('levelCount').textContent=`${String(index+1).padStart(2,'0')} / 06`;
  $('stageTrack').setAttribute('aria-label',`第 ${index+1} 阶段，共 6 阶段：${s.name}`);
  $('stageTrack').querySelectorAll('span').forEach((el,i)=>{el.dataset.status=i<index?'done':i===index?'current':'next';el.firstElementChild.style.transform=`scaleX(${i<index?1:0})`;});
  paintScenery(index);
  if(announce&&old>=0&&old!==index){
    stageCueUntil=now()+2.1;
    $('stageCue').innerHTML=`<span>LEVEL <b>${String(index+1).padStart(2,'0')}</b> / 06</span><strong>${s.name}</strong><i aria-hidden="true">↗</i>`;
    $('stageCue').dataset.visible='true';
    if(!reducedMotion){restartAnimation($('phase'),'level-pop');restartAnimation($('game'),'stage-transition');}
  }
}
function hud() {
  $('score').textContent = String(score).padStart(4,'0');
  $('combo').innerHTML = `<b>${combo}</b> COMBO`; $('multiplier').textContent = '×' + Math.min(3,1+Math.floor(combo/10));
  // Rebuild hearts only when lives change. Hits must not restart a lost-heart animation.
  if(shownLives !== misses) {
    $('lives').innerHTML = `<span class="lives-count">${3-misses}/3</span>` + [0,1,2].map(i => uiSVG('heart').replace('<svg ',`<svg class="${i >= 3-misses ? 'lost' : ''} ${misses>0 && i===3-misses ? 'just-lost' : ''}" `)).join('');
    shownLives = misses;
  }
  $('lives').setAttribute('aria-label',`剩余${3-misses}次机会`);
}
function stopVoices() { for (const n of notes) { n.voice?.(); n.voice = null; } }
function stopAllSound() { stopVoices(); audio.stopTransport(); }
function clearPointers() { for (const id of holds.keys()) { try { if(canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch {} } holds.clear(); }
function finishNote(n) { n.done = true; n.voice?.(); n.voice = null; if (n.pointer !== undefined) holds.delete(n.pointer); }
function addEffect(lane, kind, points = '', origin = null, style = 0) { effects.push({lane,kind,points,at:now(),origin,style}); if(effects.length>18) effects.shift(); }
function hitParticles(lane,longNote,origin,perfect=false) {
  const burst=burstIndex++,style=perfect?3+(perfectBurstIndex++%5):burst%3;
  if(perfect)return style;
  if(reducedMotion) return style;
  const count=longNote?22:14, at=now();
  for(let i=0;i<count;i++) {
    // Each hit cycles confetti -> stars -> musical bubbles. Keep visual variation
    // deterministic so adding effects never changes the random musical chart.
    const unit=(i*.61803398875+burst*.137)%1;
    const angle=style===0?-Math.PI*.95+unit*Math.PI*.9:unit*Math.PI*2;
    const velocity=style===2?75+(i*19%80):120+(i*37+burst*11)%125;
    const shape=style===0?(i%2?'dot':'confetti'):style===1?(i%3?'ray':'star'):(i%4?'bubble':'note');
    particles.push({lane,at,burst,style,x:origin.x,y:origin.y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,life:style===1?.28+(i%4)*.04:.4+(i%5)*.045,size:shape==='star'?4.5:shape==='note'?4:2.5+(i%3),color:['#ffdd2d','#f58fbc','#fffbed'][i%3],shape});
  }
  if(particles.length>160) particles.splice(0,particles.length-160);
  return style;
}

function fail(n, text = '漏拍了', lane = n?.lane) {
  if(state !== 'playing' || n?.done) return;
  if(n) finishNote(n);
  // A note is marked done before updating lives, so release/miss/cancel cannot charge it twice.
  misses = Math.min(3,misses+1); combo = 0; hud(); feedback(text,'miss',1.2);
  damageUntil = now()+1.8;
  $('damageReason').textContent = `${text} · 剩余 ${3-misses} 次`;
  $('damageFeedback').hidden = false;$('field').classList.add('damage-active');
  if(!reducedMotion) { restartAnimation($('damageFeedback'),'damage-in'); restartAnimation($('field'),'damage-shake'); }
  audio.miss();
  try { navigator.vibrate?.(misses===3 ? 55 : 30); } catch {}
  if(lane !== undefined) addEffect(lane,'miss');
  if(misses === 3) end(text);
}
function success(n,origin=n.hitPoint,holdPoints=30) {
  if(state !== 'playing' || n.done) return;
  if(n.kind==='suona'){n.perfect=!!n.headPerfect&&holdPoints===30;audio.judgeSuona(holdPoints,n.perfect);}
  if(n.perfect)perfects++;
  finishNote(n); combo++; hits++; maxCombo = Math.max(maxCombo,combo);
  const multiplier = Math.min(3,1+Math.floor(combo/10));
  const basePoints=n.kind==='suona'?holdPoints:10*multiplier,bonus=n.perfect?10:0,points=basePoints+bonus;score+=points;hud();
  const point=origin||{x:(n.lane+.5)*w/4,y:line};
  // Rapid hits at one position retire the old figure gently, rather than
  // stacking several translucent images into an opaque patch.
  if(n.perfect)for(const e of effects)if(e.perfect&&Math.hypot(e.origin.x-point.x,e.origin.y-point.y)<64)e.strength=(e.strength??1)*.3;
  const style=hitParticles(n.lane,n.kind==='suona',point,n.perfect);
  addEffect(n.lane,'hit','+'+points,point,style);effects.at(-1).perfect=!!n.perfect;effects.at(-1).bonus=bonus;
  if(n.perfect){const active=effects.filter(e=>e.perfect);if(active.length>5)effects.splice(effects.indexOf(active[0]),1);}
  if(n.perfect){feedback('PERFECT · +'+basePoints+' +10','perfect',.75);return;}
  feedback(combo % 10 === 0 ? `${combo} 连击 · 很有鼓气！` : n.kind === 'suona' ? '长音 +'+points : '命中 +'+points, combo % 10 === 0 ? 'combo' : 'hit');
}

// Progress excludes any paused time and keeps accumulated held duration when rearmed.
function holdProgress(n,t=now()) {
  return Math.max(0,Math.min(1,((n.holdCredit||0)+Math.max(0,t-(n.holdStarted??t)))/(n.holdTotal||n.dur)));
}
function settleHold(n,origin=n.hitPoint) {
  const p=holdProgress(n),points=p>=2/3?30:p>=1/3?20:10;
  success(n,origin,points);
}
function makeLanePlan(random=Math.random) {
  // Plan once per run, never per frame: pause and pointer rearming keep lanes.
  // Use a conservative tile/line ratio for small portrait screens. Check the
  // whole shared on-screen interval, including stage speed changes and tails.
  const chart=RECORDING_SCORE.notes, ratio=Math.max(.25,line>0?tile/line:0);
  const history=[[],[],[],[]], plan=[];
  const height=n=>n.kind==='suona'?n.duration/stages[n.stage].travel:ratio*(n.heightRatio||1);
  const safe=(a,b)=>{
    const av=stages[a.stage].travel,bv=stages[b.stage].travel,ah=height(a),bh=height(b);
    const from=Math.max(a.time-av,b.time-bv);
    const to=Math.min(a.time+(ah+1/.81-1)*av,b.time+(bh+1/.81-1)*bv);
    if(from>to)return true;
    const gap=t=>(t-a.time)/av-ah-(t-b.time)/bv;
    return Math.min(gap(from),gap(to))>=.025;
  };
  const assign=index=>{
    if(index===chart.length)return true;
    const n=chart[index], choices=[0,1,2,3].filter(lane=>history[lane].every(a=>safe(a,n)));
    // Every safe lane has equal chance; adjacent repeats are allowed. Shuffling
    // avoids a four-lane cycle. Backtrack only if a future note has no safe lane.
    for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
    for(const lane of choices){
      history[lane].push(n);plan[index]=lane;
      if(assign(index+1))return true;
      history[lane].pop();
    }
    return false;
  };
  if(!assign(0))throw new Error('No playable lane arrangement for this board size');
  return plan;
}
function spawn(t) {
  const chart=RECORDING_SCORE.notes;
  while(nextIndex<chart.length && SONG_LEAD+chart[nextIndex].time<t+3.5) {
    const lane=sessionLanes[nextIndex],e=chart[nextIndex++],stage=stages[e.stage];
    // Source timing and instrument order stay fixed; lanes vary each new run.
    notes.push({id:noteId++,lane,kind:e.kind,color:colors[Math.floor(Math.random()*colors.length)],at:SONG_LEAD+e.time,dur:e.duration,travel:stage.travel,done:false,held:false,stage:e.stage,sourceTime:e.time,accent:e.accent||1,heightRatio:e.heightRatio||1});
  }
}
function geometry(n,t) {
  const speed = line/n.travel, bottom = line+(t-n.at)*speed, length = n.kind === 'suona' ? n.dur*speed : tile*(n.heightRatio||1);
  return {x:n.lane*w/4+1,y:bottom-length,width:w/4-2,height:length,bottom,speed};
}
function update(t) {
  spawn(t);
  for(const n of notes) {
    if(n.done) continue;
    if(n.held && t >= n.at+n.dur) { settleHold(n); continue; }
    const grace = n.kind === 'suona' ? Math.min(n.dur+.04,n.rearmed?.5:.22) : (tile*(n.heightRatio||1))/(line/n.travel)+.06;
    if(!n.held && t > n.at+grace) { fail(n); if(state !== 'playing') break; }
  }
  notes = notes.filter(n => !n.done || t < n.at+n.dur+1);
  effects = effects.filter(e => t-e.at < (e.kind==='miss' ? .85 : e.perfect ? 1 : .65));
  particles = particles.filter(p=>t-p.at<p.life);
  if(t > damageUntil){$('damageFeedback').hidden = true;$('field').classList.remove('damage-active');}
  const position=Math.max(0,t-SONG_LEAD), sections=RECORDING_SCORE.sections;
  const current=Math.min(5,sections.findIndex((v,i)=>i<6&&position>=v&&position<sections[i+1]));
  if(current>=0&&current!==phase)enterStage(current);
  if(t>=stageCueUntil)$('stageCue').dataset.visible='false';
  const progress=Math.max(0,Math.min(1,(position-sections[phase])/(sections[phase+1]-sections[phase])));
  $('stageTrack').children[phase].firstElementChild.style.transform=`scaleX(${progress})`;
  if(t>=SONG_LEAD+RECORDING_SCORE.duration+.35){end('全曲完成',true);return;}
  if(t > noticeUntil) {
    const activeHold = notes.find(n=>n.held&&!n.done);
    $('notice').textContent = activeHold ? `按住 · 当前 ${holdProgress(activeHold,t)>=2/3?30:holdProgress(activeHold,t)>=1/3?20:10} 分` : combo >= 5 ? '拍点正好，继续！' : '方块碰线时点击'; $('notice').dataset.kind = '';
  }
}
function background(t) {
  // The provided ensemble is the backing, not a second synthesized rhythm.
  // A delayed decode can join at the current source position, never from zero.
  audio.ensureSong(audio.transportTime()??t);
}
function roundRect(x,y,width,height,radius,fill,stroke) {
  pen.beginPath();
  // arcTo also works on older mobile browsers without Canvas.roundRect.
  const r = Math.max(0,Math.min(radius,width/2,height/2));
  pen.moveTo(x+r,y); pen.arcTo(x+width,y,x+width,y+height,r); pen.arcTo(x+width,y+height,x,y+height,r); pen.arcTo(x,y+height,x,y,r); pen.arcTo(x,y,x+width,y,r); pen.closePath();
  if(fill) { pen.fillStyle=fill; pen.fill(); } if(stroke) { pen.strokeStyle=stroke; pen.stroke(); }
}
function draw(t) {
  const palette=stagePalette(t);
  pen.clearRect(0,0,w,h); pen.fillStyle=palette.field; pen.fillRect(0,0,w,h);
  const laneWidth=w/4;
  for(let i=0;i<4;i++) {
    if(i%2 === 0) { pen.fillStyle=palette.lane; pen.fillRect(i*laneWidth,0,laneWidth,h); }
    pen.strokeStyle=t<damageUntil?'#f05b9f':'#fff1c279'; pen.lineWidth=1; pen.beginPath(); pen.moveTo(i*laneWidth,0); pen.lineTo(i*laneWidth,h); pen.stroke();
  }
  const wash=pen.createLinearGradient(0,h*.26,w*.4,h);
  wash.addColorStop(0,'#e2d9aa00');wash.addColorStop(1,'#eddeb449');pen.fillStyle=wash;pen.fillRect(0,0,w,h);
  pen.drawImage(scenery,0,0,w,h);
  // Misses tint only their lane, below the notes. The HUD banner remains unobstructed.
  for(const e of effects) {
    const age=t-e.at, strength=Math.max(0,1-age/(e.kind==='miss' ? .85 : .42));
    if(e.kind==='miss' && strength>0) { pen.fillStyle=`rgba(242,68,148,${strength*.45})`; pen.fillRect(e.lane*laneWidth,0,laneWidth,h); pen.fillStyle=`rgba(242,68,148,${strength*.9})`; pen.fillRect(e.lane*laneWidth+2,0,3,h); pen.fillRect((e.lane+1)*laneWidth-5,0,3,h); }
    else if(!e.perfect&&age<.42&&e.origin) { pen.fillStyle=`rgba(255,221,45,${strength*.12})`; pen.beginPath();pen.arc(e.origin.x,e.origin.y,13+Math.max(0,age)*30,0,Math.PI*2);pen.fill(); }
  }
  // All three bursts originate at the input point and remain behind playable
  // tiles and the timing line. Canvas clipping handles the outer field edges.
  for(const p of particles) {
    const age=Math.max(0,t-p.at), progress=Math.min(1,age/p.life);
    const travel=p.style===1?.32*(1-Math.pow(1-progress,3)):age;
    const angle=p.style===5?age*3.5:0,dx=p.vx*travel,dy=p.vy*travel;
    const x=p.x+dx*Math.cos(angle)-dy*Math.sin(angle),y=p.y+dx*Math.sin(angle)+dy*Math.cos(angle)+(p.style===0?180*age*age:p.style===2?-85*age*age:0);
    pen.globalAlpha=Math.max(0,Math.pow(1-progress,1.3));pen.fillStyle=p.color;pen.strokeStyle=p.color;pen.lineWidth=1.5;
    pen.save();pen.translate(x,y);
    if(p.shape==='confetti'){pen.rotate(age*5+p.lane);pen.fillRect(-p.size,-p.size/2,p.size*2,p.size);}
    if(p.shape==='petal'){pen.rotate(Math.atan2(p.vy,p.vx)+age*.8);pen.beginPath();pen.moveTo(-7,0);pen.quadraticCurveTo(0,-4,8,0);pen.quadraticCurveTo(0,4,-7,0);pen.fill();}
    if(p.shape==='spark'){pen.rotate(Math.atan2(p.vy,p.vx));pen.fillRect(-5,-1,10,2);}
    if(p.shape==='bead'){pen.beginPath();pen.arc(0,0,2.5,0,Math.PI*2);pen.fill();}
    if(p.shape==='dot'){pen.beginPath();pen.arc(0,0,p.size,0,Math.PI*2);pen.fill();}
    if(p.shape==='star'){
      pen.rotate(age*2);pen.beginPath();
      for(let j=0;j<8;j++){const a=j*Math.PI/4,r=j%2?p.size*.35:p.size*1.65;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(j===0)pen.moveTo(px,py);else pen.lineTo(px,py);}
      pen.closePath();pen.fill();
    }
    if(p.shape==='ray'){pen.rotate(Math.atan2(p.vy,p.vx));pen.beginPath();pen.moveTo(-p.size*1.2,0);pen.lineTo(p.size*1.2,0);pen.stroke();}
    if(p.shape==='bubble'){pen.beginPath();pen.arc(0,0,p.size*(1+progress*.65),0,Math.PI*2);pen.stroke();}
    if(p.shape==='note'){pen.rotate(-.2+age*.8);pen.beginPath();pen.ellipse(0,2,p.size,p.size*.7,-.35,0,Math.PI*2);pen.fill();pen.beginPath();pen.moveTo(p.size-1,2);pen.lineTo(p.size-1,-p.size*2);pen.lineTo(p.size+4,-p.size*1.5);pen.stroke();}
    pen.restore();
  }
  pen.globalAlpha=1;
  for(const e of effects)if(e.kind==='hit'){
    const age=t-e.at,alpha=Math.max(0,1-age/.5),x=e.origin.x,y=e.origin.y;
    if(e.perfect)drawPerfectPerformer(pen,e,age,reducedMotion);
    pen.globalAlpha=alpha;pen.strokeStyle='#ffdd2d';pen.lineWidth=1.5;
    if(!e.perfect&&!reducedMotion){pen.beginPath();pen.arc(x,y,8+age*46,0,Math.PI*2);pen.stroke();}
    if(e.perfect){pen.fillStyle='#fff4c7';pen.font='15px ClassicSong';pen.textAlign='center';pen.fillText('PERFECT',x,y-24);}
    pen.fillStyle='#ffdd2d';pen.font='14px ClassicSong';pen.textAlign='center';pen.fillText(e.points,x,y+25-(reducedMotion?0:age*18));
  }
  pen.globalAlpha=1;
  for(const n of notes) {
    if(n.done) continue;
    const r = geometry(n,t); if(r.bottom < -5 || r.y > h) continue;
    roundRect(r.x,r.y,r.width,r.height,0,n.color);
    if(n.kind==='suona' && n.held) {
      // The tile itself is the progress display: its body changes color and fills
      // from the head towards the tail. No separate rail, number or outline.
      const progress=holdProgress(n,t);
      pen.save(); roundRect(r.x,r.y,r.width,r.height,0); pen.clip();
      const rgb=parseInt(n.color.slice(1),16), red=rgb>>16, green=(rgb>>8)&255, blue=rgb&255;
      pen.fillStyle=`rgb(${Math.round(red+(255-red)*progress)},${Math.round(green+(221-green)*progress)},${Math.round(blue+(125-blue)*progress)})`;
      pen.fillRect(r.x,r.y,r.width,r.height);
      pen.fillStyle='#ffdd2d'; pen.fillRect(r.x,r.bottom-r.height*progress,r.width,r.height*progress);
      pen.restore();
    }
    const imageHeight=n.kind==='suona'?tile-24:Math.min(tile-24,r.height-12), imageY=n.held ? line-imageHeight-9 : r.bottom-imageHeight-9;
    drawInstrument(pen,n.kind,r.x+6,imageY,r.width-12,imageHeight);

  }
  for(const e of effects) {
    const age=t-e.at, alpha=Math.max(0,1-age/(e.kind==='miss'?.85:.5)), x=(e.lane+.5)*laneWidth;
    pen.globalAlpha=alpha;
    if(e.kind==='miss') { pen.fillStyle='#f24494'; pen.font='20px ClassicSong'; pen.textAlign='center'; pen.fillText('−1',x,line+36); }
    pen.globalAlpha=1;
  }
  // Always on top of both confetti and tiles; the timing reference stays clear.
  pen.fillStyle=t<damageUntil?'#f04e94':'#ffdc35'; pen.fillRect(0,line-1.5,w,3);
}
function frame() {
  if(state === 'countdown') {
    if(waitingAudio) {
      if(audio.status==='loading'&&performance.now()-loadStarted<10500) {
        draw(elapsed);raf=requestAnimationFrame(frame);return;
      }
      waitingAudio=false;countStarted=performance.now();$('countLabel').textContent='准备好了吗';$('countHint').textContent='跟着原曲，方块碰线时点击';
      if(audio.status!=='ready')audio.onAssetError?.();
    }
    const left=countDuration-(performance.now()-countStarted)/1000;
    if(left <= 0) {
      $('countdown').hidden=true; setState('playing'); startClock=performance.now()-elapsed*1000; audio.startSong(elapsed);
      for(const n of notes)if(n.held&&!n.done){n.holdStarted=elapsed;n.voice=audio.voice();}
      feedback('开敲！','combo',.6);
      // A long note paused during play is rearmed, rather than credited without a finger.
    } else {
      const value=Math.ceil(left);
      if(value !== lastCount) { lastCount=value; $('countNumber').textContent=value; if(!reducedMotion) restartAnimation($('countNumber'),'tick'); audio.tick(value===1); }
      draw(elapsed); raf=requestAnimationFrame(frame); return;
    }
  }
  if(state !== 'playing') return;
  const t=now(); update(t); if(state !== 'playing') return; background(t); draw(t); raf=requestAnimationFrame(frame);
}
function beginCountdown(seconds,resuming=false) {
  cancelAnimationFrame(raf); dimensions(); setState('countdown'); $('countdown').hidden=false;
  if(!sessionLanes.length)sessionLanes=makeLanePlan();
  $('countLabel').textContent=resuming?'回到拍点上':'准备好了吗';
  $('countHint').textContent=resuming?'稳住，马上继续':'方块碰线时，点击方块';
  resumeCountdown=resuming;waitingAudio=!resuming&&audio.status==='loading';loadStarted=performance.now();
  if(!resuming&&!waitingAudio&&audio.status!=='ready')audio.onAssetError?.();
  if(waitingAudio){$('countLabel').textContent='乐曲载入中';$('countNumber').textContent='♪';$('countHint').textContent='正在准备原曲与乐器声音';}
  lastCount=-1; countDuration=seconds; countStarted=performance.now(); frame();
}
function resetGame() {
  stopAllSound(); clearPointers(); cancelAnimationFrame(resultFrame);
  sessionLanes=[];audio.resetVariations();
  notes=[]; effects=[]; particles=[]; burstIndex=perfectBurstIndex=0; score=misses=combo=maxCombo=hits=perfects=0; elapsed=0; nextIndex=noteId=0;
  phase=-1; noticeUntil=0; damageUntil=0; shownLives=-1; waitingAudio=false; hud();
  $('damageFeedback').hidden=true; $('field').classList.remove('damage-shake','damage-active');
  stageCueUntil=0;$('stageCue').dataset.visible='false';$('stageCue').textContent='';
  enterStage(0,false);themeBefore=stages[0];
  $('notice').textContent='跟着拍点来'; $('notice').dataset.kind='';
}
function start() {
  if(['transition','countdown','playing'].includes(state)) return;
  audio.unlock(); // gesture synchronous, before any animation timeout
  clearTimeout(transitionTimer); resetGame(); audio.startTransport();
  $('error').hidden=true; const fromHome=!$('home').hidden; setState('transition');
  $('over').hidden=true; $('paused').hidden=true;
  const enter=()=>{
    $('home').hidden=true; $('home').classList.remove('leaving'); $('game').hidden=false;
    if(!reducedMotion) restartAnimation($('game'),'entering');
    beginCountdown(3);
    if(document.hidden) pause();
  };
  if(fromHome && !reducedMotion) { $('home').classList.add('leaving'); transitionTimer=setTimeout(enter,230); } else enter();
}
function pause() {
  if(state !== 'playing' && state !== 'countdown') return;
  if(state === 'playing') elapsed=now();
  setState('paused'); cancelAnimationFrame(raf); stopAllSound(); clearPointers();
  $('countdown').hidden=true; $('paused').hidden=false; $('game').inert=true;
  $('pauseStage').textContent=`LEVEL ${String(phase+1).padStart(2,'0')} · ${stages[Math.max(0,phase)].name}`;
  $('pauseScore').textContent=score; $('pauseCombo').textContent=combo; $('resume').focus({preventScroll:true});
}
function resume() {
  if(state !== 'paused') return;
  audio.unlock();
  // Keep the recording and every future tile at its original source time.
  // Rearm only the remaining held tile. It may be picked up during the resume
  // countdown, avoiding an impossible near-tail re-entry with a mouse or finger.
  for(const n of notes)if(n.held&&!n.done) {
    n.holdCredit=(n.holdCredit||0)+Math.max(0,elapsed-(n.holdStarted??elapsed));n.holdStarted=null;
    n.dur=Math.max(.015,n.at+n.dur-elapsed);n.at=elapsed;n.held=false;n.rearmed=true;delete n.pointer;
  }
  audio.startTransport(); $('paused').hidden=true; $('game').inert=false; beginCountdown(2,true);
}
function home() {
  clearTimeout(transitionTimer); cancelAnimationFrame(raf); cancelAnimationFrame(resultFrame); stopAllSound(); clearPointers(); setState('home');
  $('game').hidden=true; $('game').inert=false; $('paused').hidden=true; $('over').hidden=true; $('countdown').hidden=true;
  $('home').hidden=false; $('home').classList.remove('leaving'); if(!reducedMotion) restartAnimation($('home'),'entering'); $('start').focus({preventScroll:true});
}
function end(reason='三次失误',completed=false) {
  elapsed=now(); setState('over'); cancelAnimationFrame(raf); stopAllSound(); clearPointers();
  $('game').inert=true; $('over').hidden=false; $('countdown').hidden=true;
  $('over').querySelector('.result-eyebrow').textContent = completed ? '全曲完成 · 谢谢你的演奏' : `${reason} · 三次失误，本场结束`;
  $('finalCombo').innerHTML=`${maxCombo}<small> COMBO</small>`; $('finalHits').innerHTML=`${hits}<small> 个</small>`;
  $('finalLevel').textContent=`LEVEL ${String(phase+1).padStart(2,'0')} / 06 · ${stages[Math.max(0,phase)].name} · 完美 ${perfects} 次`;
  let best=0; try { best=Number(localStorage.getItem('dazougu-best-v1'))||0; if(score>best) localStorage.setItem('dazougu-best-v1',String(score)); } catch {}
  $('bestLabel').textContent=score>best?'个人新纪录 · 好有鼓气！':`个人最佳 ${Math.max(best,score)} · 下场再响一点`;
  const started=performance.now(), target=score; cancelAnimationFrame(resultFrame);
  const count=()=>{ const p=reducedMotion?1:Math.min(1,(performance.now()-started)/700); $('finalScore').textContent=Math.round(target*(1-Math.pow(1-p,3))); if(p<1 && state==='over') resultFrame=requestAnimationFrame(count); };
  count(); $('retry').focus({preventScroll:true});
}

canvas.addEventListener('pointerdown',e=>{
  const pickup=state==='countdown'&&resumeCountdown;
  if(state!=='playing'&&!pickup)return;e.preventDefault();audio.unlock();
  const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top, t=now();
  // Hit-test the actual rectangle, with only a small touch allowance. No lane-wide taps.
  const n=notes.find(n=>{ if(n.done || n.held || (pickup&&!n.rearmed)) return false; const g=geometry(n,t); return x>=g.x-3 && x<=g.x+g.width+3 && y>=g.y-6 && y<=g.bottom+6; });
  if(!n) {
    if(pickup)return;
    // Ignore a second finger landing in an already consumed tile's footprint.
    if(notes.some(n=>{ if(!n.done&&!n.held) return false; const g=geometry(n,t); return x>=g.x-3&&x<=g.x+g.width+3&&y>=g.y-6&&y<=g.bottom+6; })) return;
    fail(null,'空拍了',Math.max(0,Math.min(3,Math.floor(x/(w/4))))); return;
  }
  const g=geometry(n,t), inWindow=g.y<=line+10 && g.bottom>=line-10;
  if(!inWindow || (n.kind==='suona' && t>n.at+(n.rearmed?.5:.22))) { fail(n,g.bottom<line-10?'还没到线':'晚了一拍'); return; }
  n.hitPoint={x,y};if(!n.rearmed){n.timingError=t-n.at;n.headPerfect=Math.abs(n.timingError)<=PERFECT_WINDOW;}n.perfect=n.headPerfect;
  if(n.kind === 'suona') {
    n.held=true;n.holdTotal??=n.dur;n.holdStarted=pickup?null:t; n.pointer=e.pointerId; holds.set(e.pointerId,n); n.voice=pickup?null:audio.voice();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    feedback(n.headPerfect?'完美起音 · 按住计分':'按住累积，最高30分',n.headPerfect?'perfect':'',.4);
  } else { audio.sound(n.kind,undefined,audio.session,1,{vary:true,accent:n.accent,perfect:n.perfect}); success(n,n.hitPoint); }
});
function pointerPoint(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(w,e.clientX-r.left)),y:Math.max(0,Math.min(h,e.clientY-r.top))};}
canvas.addEventListener('pointermove',e=>{const n=holds.get(e.pointerId);if(n&&state==='playing'&&!n.done)n.hitPoint=pointerPoint(e);});
function release(e) {
  const n=holds.get(e.pointerId); if(!n) return; holds.delete(e.pointerId);
  if(state !== 'playing' || n.done) {if(state==='countdown'){n.held=false;n.voice?.();n.voice=null;}return;}
  settleHold(n,pointerPoint(e));
}
function cancelPointer(e) { const n=holds.get(e.pointerId); if(n && state==='playing')settleHold(n,pointerPoint(e)); else if(n&&state==='countdown'){n.held=false;holds.delete(e.pointerId);} }
canvas.addEventListener('pointerup',release); canvas.addEventListener('pointercancel',cancelPointer); canvas.addEventListener('lostpointercapture',cancelPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('start').onclick=start; $('retry').onclick=()=>{ $('game').inert=false; start(); }; $('pause').onclick=pause; $('resume').onclick=resume; $('quit').onclick=home; $('back').onclick=home;
function soundButtons() { document.querySelectorAll('.sound-toggle').forEach(el=>{ el.innerHTML=uiSVG(audio.muted?'muted':'volume'); el.setAttribute('aria-label',audio.muted?'开启声音':'关闭声音'); el.setAttribute('aria-pressed',String(audio.muted)); }); }
document.querySelectorAll('.sound-toggle').forEach(el=>{ el.onclick=()=>{ audio.setMuted(!audio.muted); if(!audio.muted){audio.unlock();if(audio.failed.length)audio.prepare(true).then(()=>{if(audio.failed.length)audio.onAssetError?.();});} soundButtons(); }; });
audio.onError=()=>{ clearTimeout(messageTimer); $('error').textContent='声音未开启，可点右上角声音按钮重试'; $('error').hidden=false; messageTimer=setTimeout(()=>{ $('error').hidden=true; },4000); };
audio.onReady=()=>{ if(audio.status==='partial')audio.onAssetError?.();else $('error').hidden=true;if(state==='playing'&&!audio.clock)audio.startSong(now()); };
audio.onInterrupted=()=>pause();
audio.onAssetError=()=>{clearTimeout(messageTimer);$('error').textContent='部分音频未载入，可无声试玩；关闭再开启声音重试';$('error').hidden=false;messageTimer=setTimeout(()=>{$('error').hidden=true;},6500);};
document.addEventListener('visibilitychange',()=>{ if(document.hidden) pause(); });
window.addEventListener('blur',()=>pause());
window.addEventListener('resize',()=>{ if(state==='playing'||state==='countdown') pause(); if(state==='paused'){ dimensions(); draw(elapsed); } });
// Trap focus in the active dialog and provide Escape as an optional desktop pause.
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') { if(state==='playing'||state==='countdown') pause(); else if(state==='paused') resume(); }
  if(e.key!=='Tab' || !['paused','over'].includes(state)) return;
  const buttons=Array.from($(state==='paused'?'paused':'over').querySelectorAll('button'));
  if(e.shiftKey && document.activeElement===buttons[0]) { e.preventDefault(); buttons.at(-1).focus(); }
  else if(!e.shiftKey && document.activeElement===buttons.at(-1)) { e.preventDefault(); buttons[0].focus(); }
});
hud(); soundButtons();
