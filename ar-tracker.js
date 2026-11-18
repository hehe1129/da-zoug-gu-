/* Used in a worker. Frame pixels never leave the browser. */
(function (root) {
  const cv = typeof module === 'object' ? require('./assets/vendor/jsfeat-0.0.8.js') : root.jsfeat;
  const type = cv.U8_t | cv.C1_t;
  const corners = [];
  const project = (h, x, y) => {
    const z = h[6]*x + h[7]*y + h[8];
    return [(h[0]*x + h[1]*y + h[2])/z, (h[3]*x + h[4]*y + h[5])/z];
  };
  function inside(x, y, polygon) {
    let hit = false;
    for (let i=0, j=polygon.length-1; i<polygon.length; j=i++) {
      const [ax,ay] = polygon[i], [bx,by] = polygon[j];
      if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) hit = !hit;
    }
    return hit;
  }
  function features(frame, scales, limit, mask) {
    const gray = new cv.matrix_t(frame.width, frame.height, type);
    cv.imgproc.grayscale(frame.data, frame.width, frame.height, gray);
    const result = [];
    for (const scale of scales) {
      const w = Math.round(frame.width*scale), h = Math.round(frame.height*scale);
      const image = new cv.matrix_t(w,h,type);
      if (scale<1) cv.imgproc.resample(gray,image,w,h);
      else gray.copy_to(image);
      const maxCorners = Math.ceil(w/2)*Math.ceil(h/2);
      while(corners.length<maxCorners) corners.push(new cv.keypoint_t());
      const count = cv.yape06.detect(image,corners,17);
      const points = corners.slice(0,count).filter(p => !mask || inside(p.x/scale,p.y/scale,mask));
      points.sort((a,b) => b.score-a.score);
      const perCell = new Map();
      const selected = points.filter(p => {
        const cell = Math.floor(p.x/22)+Math.floor(p.y/22)*w;
        const n = perCell.get(cell) || 0;
        perCell.set(cell,n+1);
        return n<7;
      }).slice(0,limit);
      if (!selected.length) continue;
      for (const p of selected) {
        let mx=0,my=0;
        for (let dy=-12;dy<=12;dy++) {
          const span=Math.floor(Math.sqrt(144-dy*dy));
          const start=(p.y+dy)*w+p.x;
          for(let dx=-span;dx<=span;dx++){
            const v=image.data[start+dx];
            mx+=dx*v;my+=dy*v;
          }
        }
        p.angle=Math.atan2(my,mx);
      }
      cv.imgproc.gaussian_blur(image,image,5,1.1);
      const desc = new cv.matrix_t(32,selected.length,type);
      cv.orb.describe(image,selected,selected.length,desc);
      for(let i=0;i<selected.length;i++){
        const p=selected[i];
        result.push({x:p.x/scale,y:p.y/scale,bits:desc.buffer.i32.slice(8*i,8*i+8)});
      }
    }
    return result;
  }
  function obliqueView(frame, mask, yaw, pitch) {
    const {width,height,data}=frame;
    const cx=width/2, cy=height/2, focal=Math.max(width,height)*1.15;
    const a=Math.cos(yaw),b=Math.sin(yaw),c=Math.cos(pitch),d=Math.sin(pitch);
    const mapped=([x,y])=>{
      const dx=x-cx, dy=y-cy;
      const z=1+(b*dx+a*d*dy)/focal;
      return [cx+(a*dx-b*d*dy)/z,cy+c*dy/z];
    };
    const corners=[[0,0],[width,0],[width,height],[0,height]];
    const inverse=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
    cv.math.perspective_4point_transform(inverse,...corners.flatMap(p=>[...mapped(p),...p]));
    const unmap=(x,y)=>project(inverse.data,x,y);
    const warped=new Uint8ClampedArray(data.length);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
      const [sx,sy]=unmap(x,y);
      const ix=Math.floor(sx),iy=Math.floor(sy);
      if(ix<0 || iy<0 || ix>=width-1 || iy>=height-1) continue;
      const dx=sx-ix,dy=sy-iy,i=(iy*width+ix)*4,o=(y*width+x)*4;
      for(let c=0;c<3;c++){
        warped[o+c]=(1-dy)*((1-dx)*data[i+c]+dx*data[i+c+4])+
          dy*((1-dx)*data[i+c+width*4]+dx*data[i+c+width*4+4]);
      }
    }
    return features({width,height,data:warped},[1,.76],75,mask.map(mapped)).map(p=>{
      const [x,y]=unmap(p.x,p.y);
      return {x,y,bits:p.bits};
    });
  }
  function distance(a,b) {
    let n=0;
    for(let i=0;i<8;i++){
      let x=a[i]^b[i];
      x-=(x>>>1)&0x55555555;
      x=(x&0x33333333)+((x>>>2)&0x33333333);
      n+=(((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;
    }
    return n;
  }
  function prepare(targets) {
    return targets.map(({id,kind,frame,mask})=>{
      const tilted=[];
      for(const angle of [-1.02,-.67,.67,1.02]){
        tilted.push(...obliqueView(frame,mask,angle,0),...obliqueView(frame,mask,0,angle));
      }
      for(const yaw of [-.72,.72]) for(const pitch of [-.38,.38]){
        tilted.push(...obliqueView(frame,mask,yaw,pitch));
      }
      return {id,kind,width:frame.width,height:frame.height,mask,tilted,
        points:features(frame,[1,.79,.62,.49],140,mask)};
    });
  }
  function fit(target,pairs,{minimum=9,ratio=.32,error=3.5,coherent=false}={}) {
    if(pairs.length<minimum) return null;
    const model=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
    const inliers=new cv.matrix_t(pairs.length,1,type);
    const kernel=new cv.motion_model.homography2d();
    const params=new cv.ransac_params_t(4,error,.52,.9995);
    const from=pairs.map(p=>p.a),to=pairs.map(p=>p.b);
    let good=[];
    if(coherent && kernel.run(from,to,model,pairs.length)){
      good=pairs.filter(({a,b})=>{
        const [x,y]=project(model.data,a.x,a.y);
        return Math.hypot(x-b.x,y-b.y)<error;
      });
    }
    if(good.length<Math.max(minimum,ratio*pairs.length)){
      if(!cv.motion_estimator.ransac(params,kernel,from,to,pairs.length,model,inliers,520)) return null;
      good=pairs.filter((_,i)=>inliers.data[i]);
    }
    if(good.length<minimum || good.length<ratio*pairs.length) return null;
    const xs=good.map(p=>p.a.x),ys=good.map(p=>p.a.y);
    if(Math.max(...xs)-Math.min(...xs)<target.width*.22 ||
       Math.max(...ys)-Math.min(...ys)<target.height*.35) return null;
    if(!kernel.run(good.map(p=>p.a),good.map(p=>p.b),model,good.length)) return null;
    const h=Array.from(model.data.slice(0,9));
    const bounds=[[0,0],[target.width,0],[target.width,target.height],[0,target.height]];
    if(bounds.some(([x,y])=>h[6]*x+h[7]*y+h[8]<.12)) return null;
    const quad=bounds.map(([x,y])=>project(h,x,y));
    const valid=quad.every(([x,y],i)=>{
      const [bx,by]=quad[(i+1)%4], [cx,cy]=quad[(i+2)%4];
      return Number.isFinite(x+y) && (bx-x)*(cy-by)-(by-y)*(cx-bx)>160;
    });
    const meanError=good.reduce((sum,{a,b})=>{
      const [x,y]=project(h,a.x,a.y);
      return sum+Math.hypot(x-b.x,y-b.y);
    },0)/good.length;
    return valid && meanError<error*.92 ?
      {id:target.id,kind:target.kind,h,quad,inliers:good.length,meanError,pairs:good} : null;
  }
  function identify(scene, targets, bank) {
    const candidates=[];
    for(const target of targets){
      const proposals=[];
      for(const a of target[bank]){
        let first=null, second=null, best=256, next=256;
        for(const b of scene){
          const d=distance(a.bits,b.bits);
          if(d<best){second=first;next=best;first=b;best=d;}
          else if(d<next){second=b;next=d;}
        }
        // Pyramid levels can describe the same scene point more than once.
        if(second && Math.hypot(first.x-second.x,first.y-second.y)<7){
          next=256;
          for(const b of scene) if(Math.hypot(first.x-b.x,first.y-b.y)>=7)
            next=Math.min(next,distance(a.bits,b.bits));
        }
        if(first && best<77 && best<.82*next) proposals.push({a,b:first,d:best});
      }
      proposals.sort((a,b)=>a.d-b.d);
      const pairs=[];
      for(const p of proposals){
        if(!pairs.some(q=>Math.hypot(p.b.x-q.b.x,p.b.y-q.b.y)<5 ||
                          Math.hypot(p.a.x-q.a.x,p.a.y-q.a.y)<5)) pairs.push(p);
      if(pairs.length>=100) break;
      }
      const hit=fit(target,pairs) || (pairs.length>32 ? fit(target,pairs.slice(0,32)) : null);
      if(hit) candidates.push(hit);
    }
    candidates.sort((a,b)=>b.inliers-a.inliers || a.meanError-b.meanError);
    const [best]=candidates;
    if(!best) return null;
    const other=candidates.find(c=>c.kind!==best.kind);
    return !other || best.inliers>=other.inliers+3 ? best : null;
  }
  function match(frame, targets) {
    const scene=features(frame,[1,.79,.62],300);
    const frontal=identify(scene,targets,'points');
    if(frontal?.inliers>=19) return frontal;
    const tilted=identify(scene,targets,'tilted');
    if(!frontal || frontal.kind===tilted?.kind) {
      return (tilted?.inliers || 0)>(frontal?.inliers || 0) ? tilted : frontal;
    }
    return !tilted || frontal.inliers>=tilted.inliers+4 ? frontal :
      tilted.inliers>=frontal.inliers+4 ? tilted : null;
  }
  const api={prepare,match,project,fit,inside,features,cv};
  if(typeof module==='object') module.exports=api;
  else root.ArTracker=api;
})(typeof self==='object' ? self : globalThis);
