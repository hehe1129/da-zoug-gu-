(function(root){
  const tracker=typeof module==='object' ? require('./ar-tracker.js') : root.ArTracker;
  const {cv,project,fit,inside}=tracker;
  const type=cv.U8_t|cv.C1_t;
  const patchOffsets=[-5,-2.5,0,2.5,5];

  function samplePatch(image,h,{x,y}){
    const values=[];
    for(const dy of patchOffsets) for(const dx of patchOffsets){
      const [px,py]=project(h,x+dx,y+dy);
      const i=Math.floor(px),j=Math.floor(py);
      if(i<0 || j<0 || i>=image.cols-1 || j>=image.rows-1) return null;
      const a=px-i,b=py-j,k=j*image.cols+i,w=image.cols;
      values.push((1-b)*((1-a)*image.data[k]+a*image.data[k+1])+
        b*((1-a)*image.data[k+w]+a*image.data[k+w+1]));
    }
    const mean=values.reduce((sum,v)=>sum+v,0)/values.length;
    const centered=values.map(v=>v-mean);
    const energy=Math.hypot(...centered);
    return energy>34 ? centered.map(v=>v/energy) : null;
  }

  function pyramid(frame, reuse){
    const pyr=reuse||new cv.pyramid_t(3);
    if(!reuse) pyr.allocate(frame.width,frame.height,type);
    cv.imgproc.grayscale(frame.data,frame.width,frame.height,pyr.data[0]);
    pyr.build(pyr.data[0],true);
    return pyr;
  }

  function create(targets){
    let previous,next,lock;
    function start(frame){
      next=pyramid(frame,next);
      const match=tracker.match(frame,targets);
      if(!match) return null;
      const target=targets.find(t=>t.id===match.id);
      // Seed only within the printed region; the moving ring, shadows and
      // the material behind transparent acrylic never become tracked points.
      const matrix=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
      matrix.data.set(match.h);
      const inverse=new cv.matrix_t(3,3,cv.F32_t|cv.C1_t);
      cv.matmath.invert_3x3(matrix,inverse);
      const extras=tracker.features(frame,[1],130,match.quad).map(b=>{
        const [x,y]=project(inverse.data,b.x,b.y);
        return {a:{x,y},b};
      });
      const seeds=[];
      for(const {a,b} of [...match.pairs,...extras]){
        if(![[0,0],[-5,0],[5,0],[0,-5],[0,5]].every(([dx,dy])=>inside(a.x+dx,a.y+dy,target.mask))) continue;
        if(seeds.some(point=>Math.hypot(point.b.x-b.x,point.b.y-b.y)<6)) continue;
        const print=samplePatch(next.data[0],match.h,a);
        if(print) seeds.push({a,b,print});
        if(seeds.length>=55) break;
      }
      if(seeds.length>=7){
        lock={target,seeds};
        [previous,next]=[next,previous];
      }
      return {...match,source:'recognition'};
    }
    function track(frame){
      next=pyramid(frame,next);
      const {seeds,target}=lock;
      const count=seeds.length;
      const before=Float32Array.from(seeds.flatMap(({b})=>[b.x,b.y]));
      const after=new Float32Array(count*2), backward=new Float32Array(count*2);
      const forwardOK=new Uint8Array(count), backwardOK=new Uint8Array(count);
      cv.optical_flow_lk.track(previous,next,before,after,count,19,22,forwardOK,.01,.0001);
      cv.optical_flow_lk.track(next,previous,after,backward,count,19,22,backwardOK,.01,.0001);
      const possible=seeds.flatMap((seed,i)=>{
        if(!forwardOK[i] || !backwardOK[i] ||
           Math.hypot(before[2*i]-backward[2*i],before[2*i+1]-backward[2*i+1])>1.5) return [];
        return [{...seed,b:{x:after[2*i],y:after[2*i+1]}}];
      });
      const rules={minimum:7,ratio:.63,error:2.8,coherent:true};
      const candidate=fit(target,possible,rules);
      if(!candidate) return null;
      // Recheck the first locked image in target coordinates. Forward/back
      // flow alone can follow edges on an occluder after the print vanishes.
      const verified=candidate.pairs.filter(({a,print})=>{
        const current=samplePatch(next.data[0],candidate.h,a);
        return current && print.reduce((sum,v,i)=>sum+v*current[i],0)>.66;
      });
      if(verified.length<Math.max(7,candidate.pairs.length*.57)) return null;
      const hit=fit(target,verified,rules);
      if(!hit) return null;
      lock.seeds=hit.pairs;
      [previous,next]=[next,previous];
      return {...hit,source:'flow'};
    }
    return {
      update(frame){
        if((previous||next) && ((previous||next).data[0].cols!==frame.width ||
           (previous||next).data[0].rows!==frame.height)) previous=next=lock=null;
        if(!lock) return start(frame);
        const hit=track(frame);
        if(!hit) lock=null; // Next frame performs a fresh image search.
        return hit;
      }
    };
  }
  if(typeof module==='object') module.exports={create};
  else root.ArFlow={create};
})(typeof self==='object'?self:globalThis);
