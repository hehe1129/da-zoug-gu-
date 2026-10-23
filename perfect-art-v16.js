/* Cut the user's five original figures at runtime; keep masks and original ink. */
'use strict';
const perfectArt=[];
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
    for(let sy=0;sy<surface.height;sy+=9)for(let sx=0;sx<surface.width;sx+=9){
      const sw=Math.min(9,surface.width-sx),sh=Math.min(9,surface.height-sy);let ink=0;
      for(let yy=sy;yy<sy+sh;yy++)for(let xx=sx;xx<sx+sw;xx++)ink+=image.data[(yy*surface.width+xx)*4+3];
      if(ink<255)continue;
      const index=fragments.length,angle=index*2.399963;
      const dx=(sx+sw/2-surface.width/2)/surface.width,dy=(sy+sh/2-surface.height/2)/surface.height;
      fragments.push({sx,sy,sw,sh,vx:dx*75+Math.cos(angle)*18,vy:dy*65+Math.sin(angle)*16-18,delay:(index*.618034%1)*.11});
    }
    perfectArt.push({surface,fragments});
  }
};
perfectSheet.src='assets/perfect-performers-v16.jpg';
function drawPerfectPerformer(c,e,age,reduced){
  const art=perfectArt[e.style-3];if(!art||age<0||age>1)return;
  const scale=Math.min(1,Math.max(.72,c.canvas.clientWidth/390)),sw=art.surface.width,sh=art.surface.height;
  const x=e.origin.x-sw*scale/2,y=e.origin.y-sh*scale/2;
  c.save();
  const peak=.42*(e.strength??1),appear=1-Math.pow(1-Math.min(1,age/.18),3);
  if(reduced||age<.26){
    c.globalAlpha=reduced?peak*Math.max(0,1-age/.45):peak*appear;
    c.drawImage(art.surface,x,y,sw*scale,sh*scale);
  }else{
    for(const f of art.fragments){
      const progress=Math.max(0,Math.min(1,(age-.26-f.delay)/.58));if(progress>=1)continue;
      const drift=1-Math.pow(1-progress,2);
      c.globalAlpha=peak*Math.pow(1-progress,1.5);
      c.drawImage(art.surface,f.sx,f.sy,f.sw,f.sh,x+(f.sx+f.vx*drift)*scale,y+(f.sy+f.vy*drift)*scale,f.sw*scale,f.sh*scale);
    }
  }
  c.restore();
}
