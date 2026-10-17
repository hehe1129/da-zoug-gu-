/* Four-lane falling-note game. Keeps the original point-at-the-tile input,
   long-note completion and three-miss limit; no framework or build step. */
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('board'), pen = canvas.getContext('2d');
const names = {drum:'大鼓',gong:'小锣',cymbal:'铜钹',wood:'木鱼',suona:'唢呐'};
const colors = ['#ffd85c','#7abfff','#f58fbc'];
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
const stages = [{name:'热身',bpm:108,travel:2.55},{name:'入拍',bpm:120,travel:2.3},{name:'合奏',bpm:132,travel:2.05}];
let state = 'home', notes = [], holds = new Map(), effects = [], particles = [], score = 0, misses = 0, combo = 0, maxCombo = 0, hits = 0;
let w = 0, h = 0, line = 0, tile = 0, startClock = 0, elapsed = 0, raf = 0, nextAt = 2.55, noteId = 0;
let available = [0,0,0,0], beatIndex = 0, lastLane = -1, holdUntil = 0, noticeUntil = 0, phase = -1;
let damageUntil = 0, shownLives = -1;
let beatEvents = [], audioBeat = 0, countStarted = 0, countDuration = 3, lastCount = -1, transitionTimer = 0, resultFrame = 0, messageTimer = 0;

function setState(value) { state = value; $('app').dataset.state = value; }
function now() { return state === 'playing' ? (performance.now() - startClock) / 1000 : elapsed; }
function restartAnimation(el, className) { el.classList.remove(className); void el.offsetWidth; el.classList.add(className); }
function feedback(text, kind = '', duration = .8) { $('notice').textContent = text; $('notice').dataset.kind = kind; noticeUntil = now() + duration; if (!reducedMotion) restartAnimation($('notice'), 'bump'); }
function dimensions() {
  const r = canvas.getBoundingClientRect(); w = r.width; h = r.height;
  const d = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(w*d); canvas.height = Math.round(h*d); pen.setTransform(d,0,0,d,0,0);
  line = h * .81; tile = Math.max(68, Math.min(94,h*.17));
}
function hud() {
  $('score').textContent = String(score).padStart(5,'0');
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
function addEffect(lane, kind, points = '') { effects.push({lane,kind,points,at:now()}); if(effects.length>18) effects.shift(); }
function hitParticles(lane,longNote) {
  if(reducedMotion) return;
  const count=longNote?22:14, x=(lane+.5)*w/4, at=now();
  for(let i=0;i<count;i++) {
    // Deterministic variation keeps visual effects out of the chart's random sequence.
    const unit=(i*.61803398875+hits*.137)%1, angle=-Math.PI*.9+unit*Math.PI*.8;
    const velocity=130+((i*37+hits*11)%130);
    particles.push({lane,at,x,y:line+6,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,life:.38+(i%5)*.055,size:i%3===0?5:3.5,color:['#ffdd2d','#f24494','#ffffff'][i%3],square:i%2===0});
  }
  if(particles.length>112) particles.splice(0,particles.length-112);
}

function fail(n, text = '漏拍了', lane = n?.lane) {
  if(state !== 'playing' || n?.done) return;
  if(n) finishNote(n);
  // A note is marked done before updating lives, so release/miss/cancel cannot charge it twice.
  misses = Math.min(3,misses+1); combo = 0; hud(); feedback(text,'miss',1.2);
  damageUntil = now()+1.8;
  $('damageReason').textContent = `${text} · 剩余 ${3-misses} 次`;
  $('damageFeedback').hidden = false;
  if(!reducedMotion) { restartAnimation($('damageFeedback'),'damage-in'); restartAnimation($('field'),'damage-shake'); }
  audio.miss();
  try { navigator.vibrate?.(misses===3 ? 55 : 30); } catch {}
  if(lane !== undefined) addEffect(lane,'miss');
  if(misses === 3) end(text);
}
function success(n) {
  if(state !== 'playing' || n.done) return;
  finishNote(n); combo++; hits++; maxCombo = Math.max(maxCombo,combo);
  const multiplier = Math.min(3,1+Math.floor(combo/10));
  const points = (n.kind === 'suona' ? 30 : 10) * multiplier; score += points; hud();
  addEffect(n.lane,'hit','+'+points);
  hitParticles(n.lane,n.kind==='suona');
  feedback(combo % 10 === 0 ? `${combo} 连击 · 很有鼓气！` : n.kind === 'suona' ? '长音完成 +'+points : '好拍点 +'+points, combo % 10 === 0 ? 'combo' : 'hit');
}

function spawn(t) {
  while(nextAt < t + 3.5) {
    const stage = stages[Math.min(2,Math.floor(beatIndex/32))], beat = 60/stage.bpm;
    const candidates = available.map((v,i) => v <= nextAt ? i : -1).filter(i => i >= 0);
    // One long note at a time; at most one additional tap per beat. Keep thumbs free.
    const canHold = beatIndex >= 6 && holdUntil < nextAt;
    const kind = canHold && Math.random() < .23 ? 'suona' : ['drum','gong','cymbal','wood'][Math.floor(Math.random()*4)];
    const nonRepeat = candidates.filter(i => i !== lastLane), pool = nonRepeat.length ? nonRepeat : candidates;
    if(pool.length) {
      const lane = pool[Math.floor(Math.random()*pool.length)], dur = kind === 'suona' ? beat*(beatIndex < 32 ? 2 : 3) : 0;
      notes.push({id:noteId++,lane,kind,color:colors[Math.floor(Math.random()*colors.length)],at:nextAt,dur,travel:stage.travel,done:false,held:false,stage:stages.indexOf(stage)});
      available[lane] = nextAt + dur + Math.max(beat*1.6,.85); lastLane = lane;
      if(kind === 'suona') holdUntil = nextAt+dur+beat;
    }
    // These beat times drive the synthesized background and keep the chart on the same grid.
    beatEvents.push({at:nextAt,beat:beatIndex,stage:stages.indexOf(stage)});
    nextAt += beat; beatIndex++;
  }
}
function geometry(n,t) {
  const speed = line/n.travel, bottom = line+(t-n.at)*speed, length = n.kind === 'suona' ? n.dur*speed : tile;
  return {x:n.lane*w/4+5,y:bottom-length,width:w/4-10,height:length,bottom,speed};
}
function update(t) {
  spawn(t);
  for(const n of notes) {
    if(n.done) continue;
    if(n.held && t >= n.at+n.dur) { success(n); continue; }
    const grace = n.kind === 'suona' ? .22 : tile/(line/n.travel)+.06;
    if(!n.held && t > n.at+grace) { fail(n); if(state !== 'playing') break; }
  }
  notes = notes.filter(n => !n.done || t < n.at+n.dur+1);
  effects = effects.filter(e => t-e.at < (e.kind==='miss' ? .85 : .65));
  particles = particles.filter(p=>t-p.at<p.life);
  if(t > damageUntil) $('damageFeedback').hidden = true;
  const active = beatEvents.findLast(e => e.at <= t);
  const current = active ? active.stage : 0;
  if(current !== phase) { phase = current; const s = stages[phase]; $('phase').innerHTML = `<i></i> ${s.name} · ${s.bpm} BPM`; }
  if(t > noticeUntil) {
    const activeHold = notes.find(n=>n.held&&!n.done);
    $('notice').textContent = activeHold ? `按住 · 还剩 ${Math.max(0,activeHold.at+activeHold.dur-t).toFixed(1)} 秒` : combo >= 5 ? '拍点正好，继续！' : '方块碰线时点击'; $('notice').dataset.kind = '';
  }
}
function background(t) {
  if(audio.ctx?.state !== 'running' || !audio.bg) return;
  // Short Web Audio lookahead: frame jitter does not move a scheduled beat.
  while(audioBeat < beatEvents.length && beatEvents[audioBeat].at < t+.11) {
    const e = beatEvents[audioBeat++];
    if(e.at < t-.08) continue;
    const at = audio.ctx.currentTime+Math.max(.005,e.at-t);
    if(e.beat%2 === 0) audio.sound('drum',at,audio.bg,.7);
    audio.sound('wood',at,audio.bg,.3);
    if(e.beat%8 === 0) audio.sound('gong',at,audio.bg,.32);
    if(e.beat%8 === 6) audio.sound('cymbal',at,audio.bg,.3);
  }
}
function roundRect(x,y,width,height,radius,fill,stroke) {
  pen.beginPath();
  // arcTo also works on older mobile browsers without Canvas.roundRect.
  const r = Math.max(0,Math.min(radius,width/2,height/2));
  pen.moveTo(x+r,y); pen.arcTo(x+width,y,x+width,y+height,r); pen.arcTo(x+width,y+height,x,y+height,r); pen.arcTo(x,y+height,x,y,r); pen.arcTo(x,y,x+width,y,r); pen.closePath();
  if(fill) { pen.fillStyle=fill; pen.fill(); } if(stroke) { pen.strokeStyle=stroke; pen.stroke(); }
}
function draw(t) {
  pen.clearRect(0,0,w,h); pen.fillStyle='#134ead'; pen.fillRect(0,0,w,h);
  const laneWidth=w/4;
  for(let i=0;i<4;i++) {
    if(i%2 === 0) { pen.fillStyle='#1758bd'; pen.fillRect(i*laneWidth,0,laneWidth,h); }
    pen.strokeStyle='#ffffff24'; pen.lineWidth=1; pen.beginPath(); pen.moveTo(i*laneWidth,0); pen.lineTo(i*laneWidth,h); pen.stroke();
  }
  pen.strokeStyle='#ffffff18'; pen.setLineDash([2,9]);
  for(let i=0;i<5;i++) { const y = (i/5)*line; pen.beginPath(); pen.moveTo(0,y); pen.lineTo(w,y); pen.stroke(); } pen.setLineDash([]);
  // Misses tint only their lane, below the notes. The HUD banner remains unobstructed.
  for(const e of effects) {
    const age=t-e.at, strength=Math.max(0,1-age/(e.kind==='miss' ? .85 : .42));
    if(e.kind==='miss' && strength>0) { pen.fillStyle=`rgba(242,68,148,${strength*.13})`; pen.fillRect(e.lane*laneWidth,0,laneWidth,h); pen.fillStyle=`rgba(242,68,148,${strength*.9})`; pen.fillRect(e.lane*laneWidth+2,0,3,h); pen.fillRect((e.lane+1)*laneWidth-5,0,3,h); }
    else if(age<.42) { pen.fillStyle=`rgba(255,221,45,${strength*.2})`; pen.fillRect(e.lane*laneWidth,line-28,laneWidth,65); }
  }
  // Bounded confetti is drawn behind both tiles and the reference line.
  for(const p of particles) {
    const age=t-p.at, progress=age/p.life;
    const x=Math.max(p.lane*laneWidth+4,Math.min((p.lane+1)*laneWidth-4,p.x+p.vx*age));
    const y=Math.max(line-52,Math.min(line+68,p.y+p.vy*age+190*age*age));
    pen.globalAlpha=Math.max(0,1-progress); pen.fillStyle=p.color;
    if(p.square) { pen.save(); pen.translate(x,y); pen.rotate(age*4+p.lane); pen.fillRect(-p.size,-p.size/2,p.size*2,p.size); pen.restore(); }
    else { pen.beginPath(); pen.arc(x,y,p.size,0,Math.PI*2); pen.fill(); }
  }
  pen.globalAlpha=1;
  for(const n of notes) {
    if(n.done) continue;
    const r = geometry(n,t); if(r.bottom < -5 || r.y > h) continue;
    roundRect(r.x,r.y,r.width,r.height,9,n.color);
    if(n.kind==='suona' && n.held) {
      // The tile itself is the progress display: its body changes color and fills
      // from the head towards the tail. No separate rail, number or outline.
      const progress=Math.max(0,Math.min(1,(t-n.at)/n.dur));
      pen.save(); roundRect(r.x,r.y,r.width,r.height,9); pen.clip();
      const rgb=parseInt(n.color.slice(1),16), red=rgb>>16, green=(rgb>>8)&255, blue=rgb&255;
      pen.fillStyle=`rgb(${Math.round(red+(255-red)*progress)},${Math.round(green+(221-green)*progress)},${Math.round(blue+(125-blue)*progress)})`;
      pen.fillRect(r.x,r.y,r.width,r.height);
      pen.fillStyle='#ffdd2d'; pen.fillRect(r.x,r.bottom-r.height*progress,r.width,r.height*progress);
      pen.restore();
    }
    const imageHeight=tile-24, imageY=n.held ? line-imageHeight-9 : r.bottom-tile+5;
    drawInstrument(pen,n.kind,r.x+6,imageY,r.width-12,imageHeight);
    pen.fillStyle='#0b2050'; pen.font='bold 10px "Microsoft YaHei",Arial'; pen.textAlign='center';
    if(!n.held) pen.fillText(names[n.kind],r.x+r.width/2,r.bottom-10);
    else { pen.font='bold 9px "Microsoft YaHei",Arial'; pen.fillText('按住',r.x+r.width/2,line+17); }
  }
  for(const e of effects) {
    const age=t-e.at, alpha=Math.max(0,1-age/(e.kind==='miss'?.85:.5)), x=(e.lane+.5)*laneWidth;
    pen.globalAlpha=alpha;
    if(e.kind==='hit') {
      pen.strokeStyle='#ffdd2d'; pen.lineWidth=2;
      if(!reducedMotion) { pen.beginPath(); pen.ellipse(x,line,10+age*40,5+age*14,0,0,Math.PI*2); pen.stroke(); }
      pen.fillStyle='#ffdd2d'; pen.font='900 15px Arial'; pen.textAlign='center'; pen.fillText(e.points,x,line+41-(reducedMotion?0:age*12));
    } else { pen.fillStyle='#f24494'; pen.font='900 20px Arial'; pen.textAlign='center'; pen.fillText('−1',x,line+36); }
    pen.globalAlpha=1;
  }
  // Always on top of both confetti and tiles; the timing reference stays clear.
  pen.fillStyle='#ffdd2d'; pen.fillRect(0,line-1.5,w,3);
  for(let i=0;i<4;i++) { pen.beginPath(); pen.arc((i+.5)*laneWidth,line,4,0,Math.PI*2); pen.fill(); }
}
function frame() {
  if(state === 'countdown') {
    const left=countDuration-(performance.now()-countStarted)/1000;
    if(left <= 0) {
      $('countdown').hidden=true; setState('playing'); startClock=performance.now()-elapsed*1000; feedback('开敲！','combo',.6);
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
  $('countLabel').textContent=resuming?'回到拍点上':'准备好了吗';
  $('countHint').textContent=resuming?'稳住，马上继续':'方块碰线时，点击方块';
  lastCount=-1; countDuration=seconds; countStarted=performance.now(); frame();
}
function resetGame() {
  stopAllSound(); clearPointers(); cancelAnimationFrame(resultFrame);
  notes=[]; effects=[]; particles=[]; score=misses=combo=maxCombo=hits=0; elapsed=0; nextAt=2.55; beatIndex=audioBeat=noteId=0;
  available=[0,0,0,0]; lastLane=-1; holdUntil=0; phase=-1; beatEvents=[]; noticeUntil=0; damageUntil=0; shownLives=-1; hud();
  $('damageFeedback').hidden=true; $('field').classList.remove('damage-shake');
  $('notice').textContent='跟着拍点来'; $('notice').dataset.kind=''; $('phase').innerHTML='<i></i> 热身 · 108 BPM';
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
  $('pauseScore').textContent=score; $('pauseCombo').textContent=combo; $('resume').focus({preventScroll:true});
}
function resume() {
  if(state !== 'paused') return;
  audio.unlock();
  // Shift the chart as a whole if a held tile has to be picked up again. This
  // preserves same-lane spacing and leaves a fair re-entry window after pause.
  const activeHolds=notes.filter(n=>n.held&&!n.done);
  if(activeHolds.length) {
    const shift=.8;
    for(const n of notes) if(!n.done) {
      if(n.held) { n.dur=Math.max(.2,n.at+n.dur-elapsed); n.at=elapsed+shift; n.held=false; delete n.pointer; }
      else n.at+=shift;
    }
    for(let i=audioBeat;i<beatEvents.length;i++) beatEvents[i].at+=shift;
    nextAt+=shift; holdUntil+=shift; available=available.map(v=>v+shift);
  }
  // A beat scheduled just before pause belongs to the old disconnected bus.
  audioBeat=beatEvents.findIndex(e=>e.at>=elapsed+.015); if(audioBeat<0) audioBeat=beatEvents.length;
  audio.startTransport(); $('paused').hidden=true; $('game').inert=false; beginCountdown(2,true);
}
function home() {
  clearTimeout(transitionTimer); cancelAnimationFrame(raf); cancelAnimationFrame(resultFrame); stopAllSound(); clearPointers(); setState('home');
  $('game').hidden=true; $('game').inert=false; $('paused').hidden=true; $('over').hidden=true; $('countdown').hidden=true;
  $('home').hidden=false; $('home').classList.remove('leaving'); if(!reducedMotion) restartAnimation($('home'),'entering'); $('start').focus({preventScroll:true});
}
function end(reason='三次失误') {
  elapsed=now(); setState('over'); cancelAnimationFrame(raf); stopAllSound(); clearPointers();
  $('game').inert=true; $('over').hidden=false; $('countdown').hidden=true;
  $('over').querySelector('.result-eyebrow').textContent = `${reason} · 三次失误，本场结束`;
  $('finalCombo').innerHTML=`${maxCombo}<small> COMBO</small>`; $('finalHits').innerHTML=`${hits}<small> 个</small>`;
  let best=0; try { best=Number(localStorage.getItem('dazougu-best-v1'))||0; if(score>best) localStorage.setItem('dazougu-best-v1',String(score)); } catch {}
  $('bestLabel').textContent=score>best?'个人新纪录 · 好有鼓气！':`个人最佳 ${Math.max(best,score)} · 下场再响一点`;
  const started=performance.now(), target=score; cancelAnimationFrame(resultFrame);
  const count=()=>{ const p=reducedMotion?1:Math.min(1,(performance.now()-started)/700); $('finalScore').textContent=Math.round(target*(1-Math.pow(1-p,3))); if(p<1 && state==='over') resultFrame=requestAnimationFrame(count); };
  count(); $('retry').focus({preventScroll:true});
}

canvas.addEventListener('pointerdown',e=>{
  if(state !== 'playing') return; e.preventDefault(); audio.unlock();
  const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top, t=now();
  // Hit-test the actual rectangle, with only a small touch allowance. No lane-wide taps.
  const n=notes.find(n=>{ if(n.done || n.held) return false; const g=geometry(n,t); return x>=g.x-3 && x<=g.x+g.width+3 && y>=g.y-6 && y<=g.bottom+6; });
  if(!n) {
    // Ignore a second finger landing in an already consumed tile's footprint.
    if(notes.some(n=>{ if(!n.done&&!n.held) return false; const g=geometry(n,t); return x>=g.x-3&&x<=g.x+g.width+3&&y>=g.y-6&&y<=g.bottom+6; })) return;
    fail(null,'空拍了',Math.max(0,Math.min(3,Math.floor(x/(w/4))))); return;
  }
  const g=geometry(n,t), inWindow=g.y<=line+10 && g.bottom>=line-10;
  if(!inWindow || (n.kind==='suona' && t>n.at+.22)) { fail(n,g.bottom<line-10?'还没到线':'晚了一拍'); return; }
  if(n.kind === 'suona') {
    n.held=true; n.pointer=e.pointerId; holds.set(e.pointerId,n); n.voice=audio.voice();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    feedback('按住，让长音走完','',.3);
  } else { audio.sound(n.kind); success(n); }
});
function release(e) {
  const n=holds.get(e.pointerId); if(!n) return; holds.delete(e.pointerId);
  if(state !== 'playing' || n.done) return;
  if(now()>=n.at+n.dur-.065) success(n); else fail(n,'长音松早了');
}
function cancelPointer(e) { const n=holds.get(e.pointerId); if(n && state==='playing') fail(n,'长音中断了'); }
canvas.addEventListener('pointerup',release); canvas.addEventListener('pointercancel',cancelPointer); canvas.addEventListener('lostpointercapture',cancelPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('start').onclick=start; $('retry').onclick=()=>{ $('game').inert=false; start(); }; $('pause').onclick=pause; $('resume').onclick=resume; $('quit').onclick=home; $('back').onclick=home;
function soundButtons() { document.querySelectorAll('.sound-toggle').forEach(el=>{ el.innerHTML=uiSVG(audio.muted?'muted':'volume'); el.setAttribute('aria-label',audio.muted?'开启声音':'关闭声音'); el.setAttribute('aria-pressed',String(audio.muted)); }); }
document.querySelectorAll('.sound-toggle').forEach(el=>{ el.onclick=()=>{ audio.setMuted(!audio.muted); if(!audio.muted) audio.unlock(); soundButtons(); }; });
audio.onError=()=>{ clearTimeout(messageTimer); $('error').textContent='声音未开启，可点右上角声音按钮重试'; $('error').hidden=false; messageTimer=setTimeout(()=>{ $('error').hidden=true; },4000); };
audio.onReady=()=>{ $('error').hidden=true; };
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
