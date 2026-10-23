/* Keep source artwork files unchanged; render their silhouettes in the warm
   gold palette of the new reference UI. No faces are added to instruments. */
'use strict';
const instrumentSprites = {
 suona:{x:315,y:310,width:250,height:265},wood:{x:620,y:20,width:230,height:275},
 gong:{x:40,y:45,width:215,height:255},cymbal:{x:275,y:65,width:300,height:210},
 drum:{x:635,y:335,width:235,height:240}
};
const instrumentSheet = new Image();
const instrumentArt={};
function cleanPaperMatte(image,width,height,paperSeeds=[]) {
  const pixels=image.data,source=new Uint8ClampedArray(pixels),count=width*height;
  const visited=new Uint8Array(count),queue=new Uint32Array(count);
  let head=0,tail=0;
  const visit=index=>{
    if(visited[index])return;visited[index]=1;
    const offset=index*4;
    // JPEG fringes can be yellow/pink tinted, not just neutral gray. Follow
    // all near-white paper connected to the exterior, keeping enclosed detail.
    if(Math.min(source[offset],source[offset+1],source[offset+2])<220)return;
    pixels[offset+3]=0;queue[tail++]=index;
  };
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  // The gong's rope encloses actual background. Seed only those known holes;
  // enclosed white artwork elsewhere (drum skin, performer masks) stays intact.
  for(const p of paperSeeds)if(p.x>=0&&p.x<width&&p.y>=0&&p.y<height)visit(p.y*width+p.x);
  while(head<tail){
    const index=queue[head++],x=index%width,y=Math.floor(index/width);
    if(x>0)visit(index-1);if(x<width-1)visit(index+1);
    if(y>0)visit(index-width);if(y<height-1)visit(index+width);
  }

  // Find a narrow silhouette band. Everything deeper inside the artwork is
  // left byte-for-byte unchanged, including cream skins and the fish's eye.
  const distance=new Uint8Array(count);
  for(let i=0;i<count;i++)distance[i]=pixels[i*4+3]?255:0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x>0)distance[i]=Math.min(distance[i],distance[i-1]+1);
    if(y>0)distance[i]=Math.min(distance[i],distance[i-width]+1);
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x<width-1)distance[i]=Math.min(distance[i],distance[i+1]+1);
    if(y<height-1)distance[i]=Math.min(distance[i],distance[i+width]+1);
  }
  for(let i=0;i<count;i++){
    if(distance[i]===0||distance[i]>3)continue;
    const o=i*4,x=i%width,y=Math.floor(i/width);
    const observed=[255-source[o],255-source[o+1],255-source[o+2]];
    const energy=observed[0]**2+observed[1]**2+observed[2]**2;
    if(energy<120){pixels[o+3]=0;continue;}
    let best=Infinity,coverage=1;
    // Estimate foreground from nearby interior colors. Solve C=aF+(1-a)white
    // instead of leaving white-contaminated edge RGB as opaque little spikes.
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
      const j=ny*width+nx;if(distance[j]<2)continue;
      const p=j*4,f=[255-source[p],255-source[p+1],255-source[p+2]];
      const norm=f[0]**2+f[1]**2+f[2]**2;if(norm<1800)continue;
      const a=Math.max(0,Math.min(1,(observed[0]*f[0]+observed[1]*f[1]+observed[2]*f[2])/norm));
      const residual=((observed[0]-a*f[0])**2+(observed[1]-a*f[1])**2+(observed[2]-a*f[2])**2)/energy;
      const cost=residual+.0015*(dx*dx+dy*dy)+(distance[j]<4?.12:0);
      if(cost<best){best=cost;coverage=a;}
    }
    if(best>.32||coverage>.985)continue;
    if(coverage<.08){pixels[o+3]=0;continue;}
    for(let channel=0;channel<3;channel++)pixels[o+channel]=Math.max(0,Math.min(255,Math.round(255+(source[o+channel]-255)/coverage)));
    pixels[o+3]=Math.round(coverage*255);
  }
}
function prepareInstrumentArt() {
  for(const [kind,s] of Object.entries(instrumentSprites)) {
    const surface=document.createElement('canvas');surface.width=s.width;surface.height=s.height;
    const context=surface.getContext('2d');
    context.drawImage(instrumentSheet,s.x,s.y,s.width,s.height,0,0,s.width,s.height);
    try {
      const image=context.getImageData(0,0,s.width,s.height);
      // Native atlas extraction: unmix the supplied cream paper, also inside
      // the gong rope. Recover its pigment rather than painting over its colors.
      const d=image.data;
      const paper=[255,242,216];
      for(let i=0;i<d.length;i+=4){
        const contrast=Math.max(...paper.map((p,k)=>p-d[i+k]));
        const alpha=Math.min(1,Math.max(0,(contrast-3)/65));
        if(alpha<.035){d[i+3]=0;continue;}
        for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,paper[k]+(d[i+k]-paper[k])/alpha));
        d[i+3]=Math.round(alpha*255);
      }
      context.putImageData(image,0,0);
      instrumentArt[kind]={surface,url:surface.toDataURL('image/png')};
    } catch {
      // A restricted file:// origin can prohibit pixel access. Keep original
      // opaque artwork in that case; never fall back to color-tint blending.
    }
  }
  document.querySelectorAll('[data-instrument]').forEach(el=>{el.innerHTML=instrumentSVG(el.dataset.instrument);});
}
instrumentSheet.onload=prepareInstrumentArt;
instrumentSheet.src = 'assets/instruments-source-v22.jpg';
function drawInstrument(context,kind,x,y,width,height) {
  const s=instrumentSprites[kind];
  if(!s || !instrumentSheet.complete || !instrumentSheet.naturalWidth) return;
  const scale=Math.min(width/s.width,height/s.height), dw=s.width*scale, dh=s.height*scale;
  context.save();
  context.globalCompositeOperation='source-over';
  context.imageSmoothingEnabled=true; context.imageSmoothingQuality='high';
  if(instrumentArt[kind])context.drawImage(instrumentArt[kind].surface,x+(width-dw)/2,y+(height-dh)/2,dw,dh);
  else context.drawImage(instrumentSheet,s.x,s.y,s.width,s.height,x+(width-dw)/2,y+(height-dh)/2,dw,dh);
  context.restore();
}
let spriteInstance=0;
function instrumentSVG(kind) {
  const s=instrumentSprites[kind];
  if(instrumentArt[kind])return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href="${instrumentArt[kind].url}" width="${s.width}" height="${s.height}"/></svg>`;
  const clip=`sprite-${kind}-${spriteInstance++}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${s.x} ${s.y} ${s.width} ${s.height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id="${clip}"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"/></clipPath></defs><image clip-path="url(#${clip})" href="assets/instruments-source-v22.jpg" width="900" height="612"/></svg>`;
}
// Render the exact supplied performers as independent sprites. The source file
// stays untouched; the same edge matte preserves their original interior colors.
const performerSheet = new Image();
const performerSprites = [
  {x:95,y:0,width:419,height:589},
  {x:516,y:77,width:379,height:532},
  {x:134,y:615,width:328,height:593},
  {x:529,y:612,width:357,height:604}
];
performerSheet.onload=()=>{
  performerSprites.forEach((s,index)=>{
    const el=document.querySelector(`[data-performer="${index}"]`);if(!el)return;
    const surface=document.createElement('canvas');surface.width=s.width;surface.height=s.height;
    const context=surface.getContext('2d');
    context.drawImage(performerSheet,s.x,s.y,s.width,s.height,0,0,s.width,s.height);
    try{const image=context.getImageData(0,0,s.width,s.height);cleanPaperMatte(image,s.width,s.height);context.putImageData(image,0,0);}catch{}
    el.append(surface);el.classList.add('ready');
  });
};
// The current cover is already painted. Do not process four obsolete sprites.
if(document.querySelector('.cover-scene')&&getComputedStyle(document.querySelector('.cover-scene')).display!=='none')performerSheet.src='assets/performers-v7.jpg';
const uiPaths={
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',volume:'<path d="M11 5L6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',muted:'<path d="M11 5L6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="3.5"/>',play:'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke-width="0"/>',again:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',heart:'<path d="M12 20 4 12C-2 5 7 0 12 6c5-6 14-1 8 6Z"/>',tap:'<rect x="7" y="2" width="10" height="14" rx="3"/><path d="M3 17h18m-9-6v11"/>',hold:'<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10 6h4m-2 3v8"/>'
};
function uiSVG(kind){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiPaths[kind]}</svg>`;}
document.querySelectorAll('[data-instrument]').forEach(el=>{el.innerHTML=instrumentSVG(el.dataset.instrument);});
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=uiSVG(el.dataset.icon);});
