(function () {
  'use strict';
  const button = document.getElementById('openAr');
  const dialog = document.getElementById('arDialog');
  const video = document.getElementById('arCamera');
  const status = document.getElementById('arStatus');
  const startCamera = document.getElementById('arStart');
  const figure = document.getElementById('arFigure');
  const sample = document.createElement('canvas');
  const pen = sample.getContext('2d',{willReadFrequently:true});
  const root = new URL('assets/ar/',document.baseURI);
  let stream, worker, timer, watchdog, generation=0, prepared;
  const lostAfter=300;

  function loadImage(path) {
    return new Promise((resolve,reject)=>{
      const image=new Image();
      const timeout=setTimeout(()=>reject(new Error('image timeout')),8500);
      image.onload=()=>{clearTimeout(timeout);resolve(image);};
      image.onerror=error=>{clearTimeout(timeout);reject(error);};
      image.src=new URL(path,root).href;
    });
  }

  async function loadAssets() {
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),7500);
    let reply;
    try {reply=await fetch(new URL('targets.json?v=1',root),{signal:abort.signal});}
    finally {clearTimeout(timeout);}
    if (!reply.ok) throw new Error('targets');
    const manifest=await reply.json();
    const {spriteQuad,spriteTransform}=await import('./ar-pose.js?v=2');
    const entries=await Promise.all(manifest.map(async target=>{
      const [reference,art]=await Promise.all([loadImage(target.image),loadImage(target.sprite.image)]);
      const surface=document.createElement('canvas');
      surface.width=reference.naturalWidth;
      surface.height=reference.naturalHeight;
      const ctx=surface.getContext('2d');
      ctx.drawImage(reference,0,0);
      const frame=ctx.getImageData(0,0,surface.width,surface.height);
      return {...target,height:surface.height,frame,art};
    }));
    return {entries,spriteQuad,spriteTransform};
  }

  function stop() {
    generation++;
    clearInterval(timer);
    clearTimeout(watchdog);
    worker?.terminate();
    worker=undefined;
    stream?.getTracks().forEach(track=>track.stop());
    stream=undefined;
    video.pause();
    video.srcObject=null;
    figure.hidden=true;
    dialog.dataset.camera='off';
    startCamera.hidden=false;
    startCamera.disabled=false;
  }
  function fail(message) {
    stop();
    status.textContent=message;
    startCamera.textContent='重试';
  }

  function scan(assets,id) {
    const {entries,spriteQuad,spriteTransform}=assets;
    const currentWorker=new Worker('ar-worker.js?v=2');
    worker=currentWorker;
    let ready=false, waiting=false, deadline=0, lastSeen=-Infinity, pendingId, hits=0;
    let activeId, displayed, drawQuad, lastVideoTime=-1;
    currentWorker.onerror=()=> {
      if(id===generation) fail('识别加载失败，请重试');
    };
    function render(hit) {
      const target=entries.find(entry=>entry.id===hit.id);
      const width=figure.parentElement.clientWidth, height=figure.parentElement.clientHeight;
      const scale=Math.max(width/sample.width,height/sample.height);
      const screen=([x,y])=>[x*scale+(width-sample.width*scale)/2,y*scale+(height-sample.height*scale)/2];
      const quad=spriteQuad(hit,target,sample.width,sample.height,target.art.width,target.art.height)
        .map(p=>p && screen(p));
      if(quad.some(p=>!p)) return;
      if(activeId===hit.id && drawQuad && Math.hypot(...quad[2].map((v,i)=>v-drawQuad[2][i]))<65) {
        drawQuad=quad.map((p,j)=>p.map((v,k)=>.28*drawQuad[j][k]+.72*v));
      } else drawQuad=quad;
      const [x,y]=target.targetAnchor.map((v,i)=>v+target.sprite.offset[i]);
      const [a,b,c,d,e,f,g,h,i]=hit.h;
      const z=g*x+h*y+i;
      const pin={sprite:target.sprite.anchor,screen:screen([(a*x+b*y+c)/z,(d*x+e*y+f)/z])};
      const transform=spriteTransform(drawQuad,target.art.width,target.art.height,pin);
      if(!transform) return;
      if(displayed!==hit.kind){
        figure.src=target.art.src;
        figure.style.width=target.art.width+'px';
        figure.style.height=target.art.height+'px';
        figure.style.opacity=target.sprite.opacity;
        displayed=hit.kind;
      }
      figure.style.transform=transform;
      figure.hidden=false;
      activeId=hit.id;
      lastSeen=performance.now();
    }
    currentWorker.onmessage=({data})=>{
      if(id!==generation) return;
      if(data.ready){ready=true;return;}
      waiting=false;
      if(!data.hit){pendingId=undefined;hits=0;return;}
      if(pendingId===data.hit.kind) hits++;
      else {pendingId=data.hit.kind;hits=1;}
      if(data.hit.id===activeId || hits>=2) render(data.hit);
    };
    currentWorker.postMessage({targets:entries.map(({id,kind,mask,frame})=>({id,kind,mask,frame}))});
    const readyBy=performance.now()+8000;
    timer=setInterval(()=>{
      const now=performance.now();
      if(now-lastSeen>lostAfter){figure.hidden=true;activeId=undefined;drawQuad=null;}
      if((!ready && now>readyBy) || (waiting && now>deadline)){
        fail('识别超时，请重试');
        return;
      }
      if(!ready || waiting || video.readyState<2 || !video.videoWidth) return;
      if(video.currentTime===lastVideoTime) return;
      lastVideoTime=video.currentTime;
      const ratio=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
      const width=Math.round(video.videoWidth*ratio),height=Math.round(video.videoHeight*ratio);
      if(sample.width!==width || sample.height!==height){
        sample.width=width;sample.height=height;
        figure.hidden=true;drawQuad=null;activeId=undefined;
      }
      pen.drawImage(video,0,0,width,height);
      const frame=pen.getImageData(0,0,width,height);
      waiting=true;
      deadline=now+3500;
      currentWorker.postMessage({frame},[frame.data.buffer]);
    },45);
  }

  startCamera.onclick=async()=>{
    if(startCamera.disabled || !dialog.open) return;
    if(!navigator.mediaDevices?.getUserMedia || !window.Worker || !pen){
      fail('相机不可用，请用 Safari 或 Chrome 打开 HTTPS 页面后重试');
      return;
    }
    startCamera.disabled=true;
    status.textContent='正在开启相机…';
    const id=++generation;
    try {
      watchdog=setTimeout(()=>{
        if(id===generation) fail('等待相机权限超时，请重试');
      },25000);
      const camera=await navigator.mediaDevices.getUserMedia({
        audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}}
      });
      if(id!==generation || !dialog.open){camera.getTracks().forEach(track=>track.stop());return;}
      clearTimeout(watchdog);
      stream=camera;
      for(const track of stream.getVideoTracks()) track.addEventListener('ended',()=>{
        if(id===generation) fail('相机已中断，请重试');
      },{once:true});
      video.srcObject=stream;
      watchdog=setTimeout(()=>{
        if(id===generation) fail('相机画面或识别素材加载超时，请重试');
      },12000);
      prepared ||= loadAssets().catch(error=>{prepared=undefined;throw error;});
      const [,assets]=await Promise.all([video.play(),prepared]);
      if(id!==generation) return;
      clearTimeout(watchdog);
      scan(assets,id);
      dialog.dataset.camera='on';
      status.textContent='将镜头对准祈福牌';
      startCamera.hidden=true;
    } catch(error) {
      if(id!==generation) return;
      const message={
        NotAllowedError:'请在浏览器设置中允许相机权限后重试',
        NotFoundError:'未找到可用相机，请检查后重试',
        NotReadableError:'相机可能正在被占用，请关闭其他相机应用后重试'
      }[error.name] || '相机或识别素材加载失败，请重试';
      fail(message);
    }
  };

  function close() {
    if(!dialog.open) return;
    stop();
    dialog.close();
    window.dispatchEvent(new Event('dazougu-ar-change'));
    button.focus({preventScroll:true});
  }
  button.onclick=()=>{
    if(dialog.open || document.querySelector('#app').dataset.state!=='home') return;
    status.textContent='将镜头对准祈福牌';
    startCamera.textContent='开启相机';
    dialog.showModal();
    window.dispatchEvent(new Event('dazougu-ar-change'));
  };
  document.getElementById('arClose').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && dialog.open) fail('相机已暂停，可重试');
  });
  window.addEventListener('pagehide',close);
  window.addEventListener('dazougu-login',close);
})();
