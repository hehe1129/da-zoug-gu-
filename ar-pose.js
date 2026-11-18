const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const length=v=>Math.hypot(...v);
const normalize=v=>v.map(x=>x/length(v));
const cross=(a,b)=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]
];
const orthogonal=(v,axis)=>normalize(v.map((x,i)=>x-dot(v,axis)*axis[i]));
const project=(h,x,y)=>[h[0]*x+h[1]*y+h[2],h[3]*x+h[4]*y+h[5],h[6]*x+h[7]*y+h[8]];
const compose=(a,b)=>a.map((_,i)=>{
  const j=Math.floor(i/3)*3,k=i%3;
  return a[j]*b[k]+a[j+1]*b[k+3]+a[j+2]*b[k+6];
});

export function recoverPose(hit, target, width, height) {
  const h=target.fromCanonical ? compose(hit.h,target.fromCanonical) : hit.h;
  const {sprite}=target.canonical;
  const [ax,ay]=target.canonical.targetAnchor.map((v,i)=>v+sprite.offset[i]);
  const cx=width/2,cy=height/2,focal=Math.max(width,height)*.88;
  const inverseCamera=([x,y,z])=>[(x-cx*z)/focal,(y-cy*z)/focal,z];
  const anchor=inverseCamera(project(h,ax,ay));
  if(anchor[2]<=0 || !anchor.every(Number.isFinite)) return null;
  const measuredX=inverseCamera([h[0],h[3],h[6]]);
  const measuredY=inverseCamera([h[1],h[4],h[7]]);
  const x=normalize(measuredX),y=orthogonal(measuredY,x);
  const size=(length(measuredX)+length(measuredY))/2;
  if(![...x,...y,size].every(Number.isFinite) || size<=0) return null;
  // Express directions and physical scale at an anchor depth of 1.
  return {x,y,scale:size/anchor[2],anchor:anchor.map(v=>v/anchor[2]),cx,cy,focal};
}

export function smoothPose(pose, previous) {
  if(!previous || dot(pose.x,previous.x)<.85 || dot(pose.y,previous.y)<.85) return pose;
  const mix=(a,b)=>a.map((v,i)=>.78*v+.22*b[i]);
  const x=normalize(mix(pose.x,previous.x));
  const y=orthogonal(mix(pose.y,previous.y),x);
  return {...pose,x,y,scale:.78*pose.scale+.22*previous.scale};
}

export function standeeMatrix(pose, canonical, viewport) {
  const {sprite,art,height}=canonical;
  const twist=sprite.rotation*Math.PI/180;
  const scale=pose.scale*height*.92/art.height*sprite.scale;
  const horizontal=pose.x.map((v,i)=>scale*(Math.cos(twist)*v+Math.sin(twist)*pose.y[i]));
  // Rising along the tag's normal makes the standee exactly perpendicular.
  // Its horizontal axis stays in the printed plane, including side-on views.
  const vertical=cross(pose.x,pose.y).map(v=>scale*v);
  const [ax,ay]=sprite.anchor;
  const origin=pose.anchor.map((v,i)=>v-horizontal[i]*ax-vertical[i]*ay);
  if([origin[2],origin[2]+horizontal[2]*art.width,
      origin[2]+vertical[2]*art.height,
      origin[2]+horizontal[2]*art.width+vertical[2]*art.height].some(z=>z<.05)) return null;
  const projectColumn=([x,y,z])=>[
    viewport.xScale*(pose.focal*x+pose.cx*z)+viewport.left*z,
    viewport.yScale*(pose.focal*y+pose.cy*z)+viewport.top*z,0,z
  ];
  // Direct perspective matrix stays valid as the projected quad narrows.
  return [...projectColumn(horizontal),...projectColumn(vertical),0,0,1,0,...projectColumn(origin)];
}
