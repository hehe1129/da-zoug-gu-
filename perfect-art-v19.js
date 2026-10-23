/* Cut the user's five original figures at runtime; keep masks and original ink. */
'use strict';
const perfectArt=[];
// Pre-render soft circular lights once; no per-particle blur/filter on a frame.
const perfectGlowColors=['78,116,222','255,214,76','245,80,157','202,221,244','111,151,235','255,177,133'];
const perfectGlow=perfectGlowColors.map(rgb=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
  const c=canvas.getContext('2d'),g=c.createRadialGradient(12,12,0,12,12,12);
  g.addColorStop(0,`rgba(${rgb},.98)`);g.addColorStop(.2,`rgba(${rgb},.9)`);
  g.addColorStop(.5,`rgba(${rgb},.25)`);g.addColorStop(1,`rgba(${rgb},0)`);
  c.fillStyle=g;c.fillRect(0,0,24,24);return canvas;
});
const perfectSheet=new Image();
perfectSheet.onload=()=>{
  for(const [x,y,width,height] of [[80,25,350,465],[430,55,305,455],[740,250,300,515],[95,515,300,495],[445,515,285,505]]){
    const surface=document.createElement('canvas'),scale=Math.min(112/width,132/height);
    surface.width=Math.round(width*scale);surface.height=Math.round(height*scale);
    const c=surface.getContext('2d',{willReadFrequently:true});
    c.drawImage(perfectSheet,x,y,width,height,0,0,surface.width,surface.height);
    const image=c.getImageData(0,0,surface.width,surface.height);
    cleanPaperMatte(image,surface.width,surface.height);c.putImageData(image,0,0);
    const fragments=[];
    for(let sy=0;sy<surface.height;sy+=6)for(let sx=0;sx<surface.width;sx+=6){
      const sw=Math.min(6,surface.width-sx),sh=Math.min(6,surface.height-sy);let ink=0,red=0,green=0,blue=0;
      for(let yy=sy;yy<sy+sh;yy++)for(let xx=sx;xx<sx+sw;xx++){
        const i=(yy*surface.width+xx)*4,alpha=image.data[i+3];ink+=alpha;
        red+=image.data[i]*alpha;green+=image.data[i+1]*alpha;blue+=image.data[i+2]*alpha;
      }
      if(ink<350)continue;
      const r=red/ink,g=green/ink,b=blue/ink;
      const tint=b>r*1.25&&b>g?0:r>200&&g>140&&b<150?1:r>180&&b>90&&g<140?2:Math.min(r,g,b)>175?3:r>140&&g>80&&b<160?5:4;
      const index=fragments.length,angle=index*2.399963;
      const dx=(sx+sw/2-surface.width/2)/surface.width,dy=(sy+sh/2-surface.height/2)/surface.height;
      fragments.push({sx:sx+sw/2,sy:sy+sh/2,tint,size:3.1+(index%4)*.45,vx:dx*68+Math.cos(angle)*15,vy:dy*60+Math.sin(angle)*14-19,delay:(index*.618034%1)*.09});
    }
    // A fixed budget keeps dense perfect sequences lightweight on phones.
    if(fragments.length>240){const sampled=Array.from({length:240},(_,i)=>fragments[Math.floor(i*fragments.length/240)]);fragments.splice(0,fragments.length,...sampled);}
    perfectArt.push({surface,fragments});
  }
};
perfectSheet.src='assets/perfect-performers-v16.jpg';
function drawPerfectPerformer(c,e,age,reduced,viewportWidth=c.canvas.clientWidth,particleBudget=240){
  const art=perfectArt[e.style-3];if(!art||age<0||age>1)return;
  const scale=Math.min(1,Math.max(.72,viewportWidth/390)),sw=art.surface.width,sh=art.surface.height;
  const x=e.origin.x-sw*scale/2,y=e.origin.y-sh*scale/2;
  c.save();
  const peak=.36*(e.strength??1),appear=1-Math.pow(1-Math.min(1,age/.18),3);
  if(reduced){
    c.globalAlpha=peak*Math.max(0,1-age/.45);c.drawImage(art.surface,x,y,sw*scale,sh*scale);
  }else{
    // Cross-fade the intact silhouette into fine round lights, rather than
    // abruptly replacing the picture with rectangular image fragments.
    const dissolve=Math.max(0,Math.min(1,(age-.27)/.24));
    c.globalAlpha=peak*appear*(1-dissolve);
    if(dissolve<1)c.drawImage(art.surface,x,y,sw*scale,sh*scale);
    if(age>=.27){
      c.globalCompositeOperation='screen';
      const count=Math.min(art.fragments.length,particleBudget);
      for(let i=0;i<count;i++){
        const f=art.fragments[Math.floor(i*art.fragments.length/count)];
        const progress=Math.max(0,Math.min(1,(age-.27-f.delay)/.61));if(progress<=0||progress>=1)continue;
        const drift=1-Math.pow(1-progress,2),fadeIn=Math.min(1,progress/.17);
        c.globalAlpha=peak*1.25*fadeIn*Math.pow(1-progress,1.25);
        const radius=f.size*(1-progress*.35)*scale;
        c.drawImage(perfectGlow[f.tint],x+(f.sx+f.vx*drift)*scale-radius,y+(f.sy+f.vy*drift)*scale-radius,radius*2,radius*2);
      }
    }
  }
  c.restore();
}
