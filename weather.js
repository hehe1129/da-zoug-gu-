/* Ambient weather never owns the music clock or creates another render loop. */
(function(){
  'use strict';
  const between=(min,max)=>min+Math.random()*(max-min);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  // One gentle wind for the whole scene. Random spacing and speed do not
  // change its direction; streak orientation follows the same falling vector.
  const rainSlope=()=>between(-.057,-.047);
  function coverLayer(selector,count,near){
    const layer=document.querySelector(selector);if(!layer)return;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const drop=document.createElement('i');
      const duration=between(near?1.45:2.8,near?3.7:6.3);
      const from=between(-18,18),slope=rainSlope();
      const to=`calc(${(from+slope*190).toFixed(3)}px + ${(slope*100).toFixed(3)}dvh)`;
      drop.style.cssText=`--x:${between(-7,107).toFixed(3)}%;--rain-width:${between(near?1.2:.65,near?2.7:1.45).toFixed(2)}px;--rain-length:${between(near?24:13,near?62:35).toFixed(1)}px;--delay:${(-Math.random()*duration).toFixed(3)}s;--duration:${duration.toFixed(3)}s;--rain-opacity:${between(near?.16:.10,near?.34:.22).toFixed(3)};--rain-from:${from.toFixed(3)}px;--rain-to:${to};--rain-angle:${(Math.atan(-slope)*180/Math.PI).toFixed(3)}deg`;
      fragment.append(drop);
    }
    layer.replaceChildren(fragment);
  }
  coverLayer('.cover-rain-back',44,false);
  coverLayer('.cover-rain-front',40,true);

  const dry=Object.freeze({drops:0,speed:0,length:0,opacity:0,sound:null,gain:0});
  const levels=Object.freeze([
    Object.freeze({drops:72,speed:.94,length:45,opacity:.27,sound:'heavy',gain:.32}),
    Object.freeze({drops:54,speed:.80,length:36,opacity:.24,sound:'heavy',gain:.25}),
    Object.freeze({drops:38,speed:.65,length:28,opacity:.20,sound:'light',gain:.18}),
    Object.freeze({drops:24,speed:.52,length:22,opacity:.17,sound:'light',gain:.13}),
    Object.freeze({drops:12,speed:.42,length:16,opacity:.14,sound:'light',gain:.09}),dry
  ]);
  // Match the cover: a translucent tapered blue streak, separate foreground /
  // background depths, individually seeded durations, with one common wind.
  // Tiny offscreen textures are prepared once; no per-frame gradient or DOM.
  const streaks=Array.from({length:8},(_,index)=>{
    const sprite=document.createElement('canvas');sprite.width=12;sprite.height=132;
    const c=sprite.getContext('2d'),gradient=c.createLinearGradient(0,2,0,130);
    gradient.addColorStop(0,'#4b91c900');gradient.addColorStop(.45,'#4b91c9');gradient.addColorStop(1,'#2167a5');
    c.fillStyle=gradient;c.beginPath();c.moveTo(6,2);c.arcTo(8,2,8,130,2);c.arcTo(8,130,4,130,2);c.arcTo(4,130,4,2,2);c.arcTo(4,2,8,2,2);c.closePath();c.fill();return sprite;
  });
  const fieldDrops=Array.from({length:72},(_,i)=>{
    const front=i%3===0;
    return{x:between(-.04,1.1),y:Math.random(),speed:between(front?.95:.52,front?1.65:.92),length:between(front?.7:.45,front?1.4:.9),
      width:between(front?1.2:.65,front?2.7:1.45),opacity:between(front?.55:.4,front?1:.78),slope:rainSlope(),front,sprite:streaks[i%8]};
  });
  let fieldTime=null,fieldTravel=0;
  function forLevel(level){return levels[Math.max(0,Math.min(5,Math.floor(level)-1))]||dry;}
  function drawFieldRain(context,time,width,height,phase,reduce=false,layer='back'){
    const settings=forLevel(phase+1);
    // Both layers use one simulation step, even when drawn twice this frame.
    if(time!==fieldTime){
      const delta=fieldTime===null||time<fieldTime?0:Math.min(.1,time-fieldTime);
      if(fieldTime!==null&&time<fieldTime)fieldTravel=0;
      fieldTime=time;fieldTravel+=delta*settings.speed;
    }
    if(!settings.drops){fieldTravel=0;return;}
    if(reduce||motion.matches||!width||!height)return;
    // Same drop pool / game RAF; neither layer can alter the music timeline.
    const cycle=height+150;
    const front=layer==='front';
    context.save();
    for(let i=0;i<settings.drops;i++){
      const drop=fieldDrops[i];if(drop.front!==front)continue;
      const position=((drop.y*cycle+fieldTravel*height*.52*drop.speed)%cycle+cycle)%cycle;
      const y=position-85,fade=Math.min(1,position/(cycle*.06),(cycle-position)/(cycle*.09));
      const length=settings.length*drop.length*(front?1.08:.92),x=drop.x*width+drop.slope*(y+60);
      context.save();context.globalAlpha=settings.opacity*drop.opacity*fade*1.35;
      context.translate(x,y);context.rotate(Math.atan(-drop.slope));
      context.drawImage(drop.sprite,0,0,12,132,-drop.width*1.5,0,drop.width*3,length);context.restore();
    }
    context.restore();
  }
  window.DazouguWeather=Object.freeze({forLevel,drawFieldRain});
})();
