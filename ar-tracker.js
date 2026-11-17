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
    return targets.map(({id,kind,frame,mask})=>({
      id,kind,width:frame.width,height:frame.height,
      points:features(frame,[1,.79,.62,.49],140,mask)
    }));
  }
  function match(frame, targets) {
    const scene=features(frame,[1,.79,.62],300);
    const candidates=[];
    for(const target of targets){
      const proposals=[];
      for(const a of target.points){
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
      if(pairs.length<9) continue;
      const model=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
      const inliers=new cv.matrix_t(pairs.length,1,type);
      const kernel=new cv.motion_model.homography2d();
      const params=new cv.ransac_params_t(4,3.5,.52,.9995);
      if(!cv.motion_estimator.ransac(params,kernel,pairs.map(p=>p.a),pairs.map(p=>p.b),pairs.length,model,inliers,650)) continue;
      const good=pairs.filter((_,i)=>inliers.data[i]);
      if(good.length<9 || good.length<.32*pairs.length) continue;
      const xs=good.map(p=>p.a.x),ys=good.map(p=>p.a.y);
      if(Math.max(...xs)-Math.min(...xs)<target.width*.22 ||
         Math.max(...ys)-Math.min(...ys)<target.height*.35) continue;
      if(!kernel.run(good.map(p=>p.a),good.map(p=>p.b),model,good.length)) continue;
      const h=Array.from(model.data.slice(0,9));
      const corners=[[0,0],[target.width,0],[target.width,target.height],[0,target.height]];
      if(corners.some(([x,y])=>h[6]*x+h[7]*y+h[8]<.12)) continue;
      const quad=corners.map(([x,y])=>project(h,x,y));
      const valid=quad.every(([x,y],i)=>{
        const [bx,by]=quad[(i+1)%4], [cx,cy]=quad[(i+2)%4];
        return Number.isFinite(x+y) && (bx-x)*(cy-by)-(by-y)*(cx-bx)>160;
      });
      const meanError=good.reduce((sum,{a,b})=>{
        const [x,y]=project(h,a.x,a.y);
        return sum+Math.hypot(x-b.x,y-b.y);
      },0)/good.length;
      if(valid && meanError<3.2) candidates.push({id:target.id,kind:target.kind,h,quad,inliers:good.length,meanError});
    }
    candidates.sort((a,b)=>b.inliers-a.inliers || a.meanError-b.meanError);
    const [best]=candidates;
    if(!best) return null;
    const other=candidates.find(c=>c.kind!==best.kind);
    return !other || best.inliers>=other.inliers+3 ? best : null;
  }
  const api={prepare,match,project};
  if(typeof module==='object') module.exports=api;
  else root.ArTracker=api;
})(typeof self==='object' ? self : globalThis);
