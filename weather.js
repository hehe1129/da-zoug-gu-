/* Ambient weather never owns the music clock or creates another render loop. */
(function(){
  'use strict';
  const between=(min,max)=>min+Math.random()*(max-min);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  function coverLayer(selector,count,near){
    const layer=document.querySelector(selector);if(!layer)return;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const drop=document.createElement('i');
      const duration=between(near?1.45:2.8,near?3.7:6.3);
      const from=between(-24,24),to=from+between(-85,55);
      drop.style.cssText=`--x:${between(-7,107).toFixed(3)}%;--rain-width:${between(near?1.2:.65,near?2.7:1.45).toFixed(2)}px;--rain-length:${between(near?24:13,near?62:35).toFixed(1)}px;--delay:${(-Math.random()*duration).toFixed(3)}s;--duration:${duration.toFixed(3)}s;--rain-opacity:${between(near?.16:.10,near?.34:.22).toFixed(3)};--rain-from:${from.toFixed(1)}px;--rain-to:${to.toFixed(1)}px;--rain-angle:${between(-5,12).toFixed(2)}deg`;
      fragment.append(drop);
    }
    layer.replaceChildren(fragment);
  }
  coverLayer('.cover-rain-back',44,false);
  coverLayer('.cover-rain-front',40,true);

  const dry=Object.freeze({drops:0,speed:0,length:0,opacity:0});
  const levels=Object.freeze([dry,dry,
    Object.freeze({drops:18,speed:.44,length:18,opacity:.15}),
    Object.freeze({drops:32,speed:.58,length:25,opacity:.19}),
    Object.freeze({drops:50,speed:.76,length:34,opacity:.23}),
    Object.freeze({drops:72,speed:.94,length:45,opacity:.27})
  ]);
  const fieldDrops=Array.from({length:72},()=>({x:Math.random(),y:Math.random(),speed:between(.72,1.3),length:between(.65,1.25),drift:between(-.045,.025)}));
  let fieldTime=null,fieldTravel=0;
  function forLevel(level){return levels[Math.max(0,Math.min(5,Math.floor(level)-1))]||dry;}
  function drawFieldRain(context,time,width,height,phase,reduce=false){
    const settings=forLevel(phase+1);
    const delta=fieldTime===null||time<fieldTime?0:Math.min(.1,time-fieldTime);
    if(fieldTime!==null&&time<fieldTime)fieldTravel=0;
    fieldTime=time;
    if(!settings.drops){fieldTravel=0;return;}
    if(reduce||motion.matches||!width||!height)return;
    fieldTravel+=delta*settings.speed; // stage speed changes never teleport existing drops
    // A single batched path, beneath every tile, hit effect and timing line.
    const cycle=height+100;
    context.save();context.strokeStyle='#b9e0ff';context.globalAlpha=settings.opacity;
    context.lineWidth=1.2;context.lineCap='round';context.beginPath();
    for(let i=0;i<settings.drops;i++){
      const drop=fieldDrops[i],y=((drop.y*cycle+fieldTravel*height*drop.speed)%cycle+cycle)%cycle-60;
      const length=settings.length*drop.length,x=drop.x*width+drop.drift*width*(y/height);
      context.moveTo(x,y);context.lineTo(x+drop.drift*length,y+length);
    }
    context.stroke();context.restore();
  }
  window.DazouguWeather=Object.freeze({forLevel,drawFieldRain});
})();
