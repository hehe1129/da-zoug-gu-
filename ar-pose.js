import './assets/vendor/jsfeat-0.0.8.js';

const normalize = v => {
  const length = Math.hypot(...v);
  return v.map(x => x/length);
};
const cross = (a,b) => [
  a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]
];

// Approximate pinhole intrinsics. Anchor comes from the actual image
// homography; only the projection of the lifted part uses this focal estimate.
export function spriteQuad(hit, target, width, height, spriteWidth, spriteHeight) {
  const {h} = hit, {sprite} = target;
  const [ax,ay] = target.targetAnchor.map((v,i) => v+sprite.offset[i]);
  const cx=width/2, cy=height/2, focal=Math.max(width,height)*.88;
  const inverseCamera=(x,y,z)=>[(x-cx*z)/focal,(y-cy*z)/focal,z];
  const xAxis=inverseCamera(h[0],h[3],h[6]);
  const yAxis=inverseCamera(h[1],h[4],h[7]);
  const normal=normalize(cross(xAxis,yAxis));
  const heightScale=Math.hypot(...yAxis);
  const anchor=inverseCamera(
    h[0]*ax+h[1]*ay+h[2],h[3]*ax+h[4]*ay+h[5],h[6]*ax+h[7]*ay+h[8]
  );
  const tilt=sprite.tilt*Math.PI/180, rotation=sprite.rotation*Math.PI/180;
  const unit=target.height* .92 / spriteHeight *sprite.scale;
  return [[0,0],[spriteWidth,0],[spriteWidth,spriteHeight],[0,spriteHeight]].map(([x,y])=>{
    const u=(x-sprite.anchor[0])*unit, v=(y-sprite.anchor[1])*unit;
    const px=Math.cos(rotation)*u-Math.sin(rotation)*v;
    const py=Math.sin(rotation)*u+Math.cos(rotation)*v;
    const point=anchor.map((a,i)=>a+xAxis[i]*px+
      (Math.cos(tilt)*yAxis[i]+Math.sin(tilt)*heightScale*normal[i])*py);
    return point[2]>.09 ? [cx+focal*point[0]/point[2],cy+focal*point[1]/point[2]] : null;
  });
}

export function spriteTransform(quad, width, height) {
  if(quad.some(p=>!p || p.some(v=>!Number.isFinite(v)))) return null;
  const q=quad.flat();
  const cv=window.jsfeat;
  const m=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
  cv.math.perspective_4point_transform(m,0,0,q[0],q[1],width,0,q[2],q[3],
    width,height,q[4],q[5],0,height,q[6],q[7]);
  const [a,b,c,d,e,f,g,h,i]=m.data;
  return `matrix3d(${[a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,i].join(',')})`;
}
