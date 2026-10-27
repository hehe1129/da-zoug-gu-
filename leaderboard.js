/* The community UI never owns the game clock or waits before starting a round. */
(function(){
  'use strict';
  const api=window.DazouguOnline;if(!api)return;
  const byId=id=>document.getElementById(id),app=byId('app');let sdkPromise,active=null,origin=null,continuation=null,inertBefore=[];
  function loadSDK(){
    if(window.supabase?.createClient)return Promise.resolve(window.supabase);
    if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(new Error('sdk-timeout'));},8000);
      script.src='assets/vendor/supabase-2.118.0.js';script.async=true;script.dataset.optional='leaderboard';
      script.onload=()=>{clearTimeout(timer);window.supabase?.createClient?resolve(window.supabase):reject(new Error('sdk-unavailable'));};
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('sdk-load-failed'));};document.head.append(script);
    }).catch(error=>{sdkPromise=null;throw error;});return sdkPromise;
  }
  const guestClient=new api.LeaderboardClient({config:window.DAZOUGU_LEADERBOARD_CONFIG,loadSDK});let client=guestClient;
  const rankCache=new Map(),rankRequests=new Map(),previewKey=client.key+'.rank-preview';let cacheRevision=0,lastSynced=null;
  const freshFor=30000;let retryTimer=0,retryAttempt=0;
  function publicSnapshot(data){return{...data,entries:data.entries.map(row=>({...row,is_current:false})),current_player:null};}
  function visibleSnapshot(entry){return entry.owner===client.playerId?entry.data:publicSnapshot(entry.data);}
  function restorePreview(){
    try{
      const saved=JSON.parse(localStorage.getItem(previewKey)||sessionStorage.getItem(previewKey));const data=saved?.data;
      const rowOK=row=>row&&Number.isInteger(row.rank)&&row.rank>0&&api.validNickname(row.nickname)&&api.validWish(row.wish)&&Number.isInteger(row.best_score)&&row.best_score>=0&&row.best_score<=api.MAX_SCORE;
      if(saved.at<=Date.now()&&Date.now()-saved.at<7*86400000&&data.page===1&&data.page_size===20&&Number.isInteger(data.total)&&data.total>=0&&Array.isArray(data.entries)&&data.entries.length<=20&&data.entries.every(rowOK)){
        rankCache.set(1,{data:publicSnapshot(data),owner:null,at:0,revision:cacheRevision});
      }
    }catch{}
  }
  function invalidateRankCache(){cacheRevision++;for(const entry of rankCache.values())entry.at=0;}
  function fetchRank(page){
    const revision=cacheRevision,key=revision+':'+(client.playerId||'public')+':'+page;
    if(rankRequests.has(key))return rankRequests.get(key);
    const task=(async()=>{
      const owner=client.session?.access_token?client.playerId:null;
      const data=await client.rankings(page),entry={data,owner,at:Date.now(),revision};
      if(owner!==client.playerId){entry.data=publicSnapshot(data);entry.owner=null;}
      const newer=rankCache.get(data.page);
      if(revision===cacheRevision&&!(newer?.owner&&newer.owner===client.playerId&&entry.owner!==client.playerId)){
        rankCache.set(data.page,entry);while(rankCache.size>8)rankCache.delete(rankCache.keys().next().value);
        if(data.page===1)try{const value=JSON.stringify({at:entry.at,data:publicSnapshot(data)});localStorage.setItem(previewKey,value);sessionStorage.setItem(previewKey,value);}catch{}
      }
      return entry;
    })().finally(()=>rankRequests.delete(key));rankRequests.set(key,task);return task;
  }
  function prefetchRank(){
    if(!client.config.ready)return Promise.resolve(null);
    const cached=rankCache.get(1);if(cached&&Date.now()-cached.at<freshFor&&cached.owner===client.playerId)return Promise.resolve(cached);
    return fetchRank(1).catch(()=>null);
  }
  function scheduleRetry(){
    if(retryTimer||!client.pending()||document.hidden||navigator.onLine===false||retryAttempt>=5)return;
    const delay=[2000,6000,15000,35000,60000][retryAttempt++]+Math.random()*500;
    retryTimer=setTimeout(()=>{retryTimer=0;client.flush().finally(()=>renderSubmission());},delay);
  }
  restorePreview();
  function renderSubmission(status=client.status){
    const messages={idle:'',unconfigured:'排行榜暂未开放',sending:'最高分同步中',synced:'最高分已同步',failed:'成绩已保留，待同步',identity_changed:'旧成绩未同步',invalid:'成绩未提交'};
    byId('scoreSyncText').textContent=messages[status.state]||'';
    const retry=['failed','identity_changed'].includes(status.state)&&!!client.pending();
    byId('scoreSyncRetry').hidden=!retry;byId('scoreSyncRetry').disabled=!!client.inflight;
    byId('scoreSync').dataset.status=status.state;
    if(status.state==='failed')scheduleRetry();
    if(status.state==='synced'){clearTimeout(retryTimer);retryTimer=0;retryAttempt=0;}
    if(status.state==='synced'){
      const signature=client.playerId+':'+status.bestScore;
      if(signature!==lastSynced){lastSynced=signature;invalidateRankCache();if(active===byId('leaderboardDialog'))refresh(currentPage,true);else prefetchRank();}
    }
  }
  function open(id){
    if(active||!['home','over'].includes(app.dataset.state))return false;
    active=byId(id);origin=document.activeElement;
    inertBefore=Array.from(app.children).filter(el=>el!==active).map(el=>[el,el.inert]);
    for(const [el] of inertBefore)el.inert=true;
    active.hidden=false;active.querySelector('input,button')?.focus({preventScroll:true});return true;
  }
  function close(){
    if(!active)return;active.hidden=true;active=null;
    for(const [el,was] of inertBefore)el.inert=was;inertBefore=[];
    origin?.focus?.({preventScroll:true});origin=null;
  }
  function requestNickname(next){
    if(client.nickname){next();return;}
    continuation=next;byId('nicknameInput').value='';byId('nicknameError').textContent='';byId('nicknameCount').textContent='0 / 12';open('nicknameDialog');
  }
  byId('nicknameForm').addEventListener('submit',event=>{
    event.preventDefault();const input=byId('nicknameInput');
    if(!api.validNickname(input.value)){byId('nicknameError').textContent=api.cleanNickname(input.value)?'昵称最多12个字':'请写下昵称';input.setAttribute('aria-invalid','true');input.focus();return;}
    client.setNickname(input.value);input.removeAttribute('aria-invalid');input.blur();const next=continuation;continuation=null;close();
    client.warm();next?.(); // still inside a user gesture: mobile audio can unlock
  });
  byId('nicknameInput').addEventListener('input',event=>{byId('nicknameCount').textContent=Array.from(api.cleanNickname(event.target.value)).length+' / 12';event.target.removeAttribute('aria-invalid');byId('nicknameError').textContent='';});
  byId('nicknameCancel').onclick=()=>{continuation=null;close();};
  let currentMe=null,currentPage=1,totalPages=1,wishOrigin=null,wishOwner=null;
  function wishPreview(value){const chars=Array.from(value);return chars.slice(0,6).join('')+(chars.length>6?'…':'');}
  function closeWish(){
    byId('wishDialog').hidden=true;byId('leaderboardDialog').querySelector('.leaderboard-sheet').inert=false;
    if(wishOrigin?.isConnected)wishOrigin.focus({preventScroll:true});else byId(byId('rankMine').hidden?'rankRefresh':'editWish').focus({preventScroll:true});wishOrigin=null;
  }
  function openWish(row,trigger){
    if(byId('wishSave').disabled)return;
    wishOrigin=trigger;wishOwner=client.playerId;byId('wishDialog').hidden=false;
    byId('leaderboardDialog').querySelector('.leaderboard-sheet').inert=true;
    byId('wishTitle').textContent=row.is_current?'我的心愿':row.nickname+'的心愿';
    byId('wishForm').hidden=!row.is_current;byId('wishFull').hidden=!!row.is_current;
    byId('wishFull').textContent=row.wish||'愿鼓乐常相伴';
    byId('wishInput').value=row.wish;byId('wishError').textContent='';byId('wishSave').textContent='保存心愿';
    updateWishCount();(row.is_current?byId('wishInput'):byId('wishClose')).focus({preventScroll:true});
  }
  function updateWishCount(){
    const value=byId('wishInput').value,count=Array.from(api.cleanWish(value)).length;
    byId('wishCount').textContent=count+' / 50';byId('wishInput').setAttribute('aria-invalid',String(count>50));
  }
  function wishButton(row){
    const button=document.createElement('button');button.type='button';button.className='wish-preview';
    button.textContent=wishPreview(row.wish)||(row.is_current?'写心愿':'');
    button.setAttribute('aria-label',row.is_current?'查看或修改我的心愿':'展开'+row.nickname+'的心愿');
    button.disabled=!row.is_current&&!row.wish;button.onclick=()=>openWish(row,button);return button;
  }
  byId('wishInput').addEventListener('input',updateWishCount);
  byId('wishClose').onclick=closeWish;
  byId('editWish').onclick=()=>{if(currentMe)openWish(currentMe,byId('editWish'));};
  byId('wishForm').addEventListener('submit',async event=>{
    event.preventDefault();if(byId('wishSave').disabled)return;
    if(!api.validWish(byId('wishInput').value)){byId('wishError').textContent='心愿最多50个字';return;}
    byId('wishSave').disabled=true;byId('wishInput').disabled=true;byId('wishError').textContent='';
    try{await client.saveWish(byId('wishInput').value,wishOwner);invalidateRankCache();closeWish();await refresh(currentPage,true);}
    catch{byId('wishError').textContent='未能保存，请重试';byId('wishSave').textContent='重试保存';}
    finally{byId('wishSave').disabled=false;byId('wishInput').disabled=false;}
  });
  function rowElement(row){
    const tr=document.createElement('tr');if(row.is_current){tr.className='current-player';tr.setAttribute('aria-current','true');}
    for(const [index,value] of [row.rank,row.nickname,row.best_score].entries()){
      const td=document.createElement('td');
      if(index===0&&row.rank<=3){const medal=document.createElement('span');medal.className='rank-medal';medal.textContent=String(value);td.append(medal);}
      else td.textContent=String(value);
      tr.append(td);
    }
    const wishCell=document.createElement('td');wishCell.append(wishButton(row));tr.append(wishCell);
    return tr;
  }
  function renderRanks(data){
    currentPage=data.page;totalPages=Math.max(1,Math.ceil(data.total/data.page_size));currentMe=data.current_player;
    byId('rankPaging').hidden=totalPages<=1;byId('rankPage').textContent=currentPage+' / '+totalPages;
    byId('rankPrevious').disabled=currentPage<=1;byId('rankNext').disabled=currentPage>=totalPages;
    if(!data.entries.length){byId('rankStatus').textContent='还没有成绩';byId('rankStatus').hidden=false;byId('rankTable').hidden=true;}
    else{byId('rankRows').replaceChildren(...data.entries.map(rowElement));byId('rankTable').hidden=false;byId('rankStatus').hidden=true;}
    byId('rankMine').hidden=!data.current_player;
    if(data.current_player){
      const me=data.current_player;byId('myRank').textContent=String(me.rank);byId('myNickname').textContent=me.nickname;byId('myBestScore').textContent=String(me.best_score);
      byId('editWish').textContent=me.wish?'改心愿':'写心愿';
    }
  }
  let requestGeneration=0;
  async function refresh(page=currentPage,force=false){
    const generation=++requestGeneration,cached=rankCache.get(page);
    byId('rankRetry').hidden=true;byId('rankFreshness').textContent=cached?'更新中':'';
    if(cached)renderRanks(visibleSnapshot(cached));
    else{
      byId('rankRows').replaceChildren();byId('rankTable').hidden=true;byId('rankMine').hidden=true;
      byId('rankStatus').hidden=false;byId('rankStatus').textContent=client.config.ready?'正在听取好成绩…':'排行榜暂未开放';
    }
    if(cached&&!force&&Date.now()-cached.at<freshFor&&cached.owner===client.playerId){byId('rankFreshness').textContent='';byId('rankRefresh').disabled=false;byId('rankBody').setAttribute('aria-busy','false');return;}
    byId('rankRefresh').disabled=true;byId('rankPrevious').disabled=true;byId('rankNext').disabled=true;byId('rankBody').setAttribute('aria-busy','true');
    if(!client.config.ready){byId('rankBody').setAttribute('aria-busy','false');byId('rankRefresh').disabled=false;return;}
    try{
      const entry=await fetchRank(page);if(generation!==requestGeneration||entry.revision!==cacheRevision)return;
      renderRanks(visibleSnapshot(entry));byId('rankFreshness').textContent='';
      if(!cached)byId('rankBody').scrollTop=0;
    }catch{if(generation===requestGeneration){byId('rankFreshness').textContent=cached?'暂离线 · 上次榜单':'';byId('rankStatus').textContent='暂时连不上，稍后再试';if(!cached)byId('rankStatus').hidden=false;byId('rankRetry').hidden=false;}}
    finally{if(generation===requestGeneration){byId('rankRefresh').disabled=false;byId('rankBody').setAttribute('aria-busy','false');}}
  }
  for(const id of ['homeLeaderboard','resultLeaderboard'])byId(id).onclick=()=>{if(open('leaderboardDialog')){currentPage=1;refresh(1);client.warm();}};
  byId('rankHome').onclick=()=>{requestGeneration++;closeWish();close();if(app.dataset.state==='over')byId('back').click();else byId('start').focus({preventScroll:true});};
  byId('rankRetry').onclick=()=>refresh(currentPage,true);byId('rankRefresh').onclick=()=>refresh(currentPage,true);
  byId('rankPrevious').onclick=()=>refresh(Math.max(1,currentPage-1));byId('rankNext').onclick=()=>refresh(Math.min(totalPages,currentPage+1));
  byId('scoreSyncRetry').onclick=()=>{clearTimeout(retryTimer);retryTimer=0;retryAttempt=0;byId('scoreSyncRetry').disabled=true;client.flush().finally(()=>renderSubmission());};
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!byId('wishDialog').hidden){closeWish();return;}requestGeneration++;continuation=null;close();return;}
    if(event.key!=='Tab')return;event.stopImmediatePropagation();
    const scope=byId('wishDialog').hidden?active:byId('wishDialog');
    const controls=Array.from(scope.querySelectorAll('button,input,textarea,[tabindex="0"]')).filter(el=>!el.hidden&&!el.disabled&&!el.closest('[inert]')&&el.getClientRects().length);
    if(!controls.length)return;
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!controls.includes(document.activeElement))){event.preventDefault();first.focus();}
  },true);
  function reconnect(){
    if(document.hidden||!client.config.ready)return;clearTimeout(retryTimer);retryTimer=0;retryAttempt=0;
    if(['loading','login'].includes(app.dataset.state)){prefetchRank();return;}
    if(client.pending())client.flush().finally(()=>renderSubmission());else client.warm();
    client.syncDisplayName?.();
    if(active===byId('leaderboardDialog'))refresh(currentPage,true);else prefetchRank();
  }
  window.addEventListener('online',reconnect);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(retryTimer);retryTimer=0;}else reconnect();});
  window.addEventListener('pageshow',event=>{if(event.persisted)reconnect();});
  function identityChanged(){
    // Called synchronously by Supabase's auth listener: defer ALL work to avoid
    // starting another auth operation while its internal lock is held.
    setTimeout(()=>{if(active===byId('leaderboardDialog'))refresh(currentPage,true);else prefetchRank();},0);
  }
  function selectClient(next){
    clearTimeout(retryTimer);retryTimer=0;retryAttempt=0;lastSynced=null;
    client=next;client.onStatus=status=>{if(client===next)renderSubmission(status);};
    client.onIdentity=()=>{if(client!==next)return;identityChanged();if(next.isAccount&&!next.playerId)window.gameSession?.sessionExpired();};
    invalidateRankCache();renderSubmission();prefetchRank();
  }
  selectClient(guestClient);
  window.addEventListener('storage',event=>{if(event.key===client.nicknameKey&&api.validNickname(event.newValue))client.nickname=api.cleanNickname(event.newValue);});
  const restored=new MutationObserver(()=>{if(app.dataset.state==='home'){restored.disconnect();if(client.pending())client.flush().finally(()=>renderSubmission());}});
  restored.observe(app,{attributes:true,attributeFilter:['data-state']});
  let warmScheduled=false;
  const warmObserver=new MutationObserver(()=>{
    if(app.dataset.state!=='home'||warmScheduled)return;warmScheduled=true;warmObserver.disconnect();
    client.warm();
  });
  warmObserver.observe(app,{attributes:true,attributeFilter:['data-state']});
  if(app.dataset.state==='home'){warmScheduled=true;warmObserver.disconnect();client.warm();}
  // Fetch the small public page during startup, independently of authentication.
  // Optional artwork is already in CSS; no SDK or multi-megabyte name font on
  // this critical path. Cache stays visible while fresh network data arrives.
  prefetchRank();
  window.onlineLeaderboard={
    get nickname(){return client.nickname;},get hasDialog(){return!!active;},
    requestNickname,
    selectClient,
    guestClient,
    createAccountClient:()=>new api.LeaderboardClient({config:window.DAZOUGU_LEADERBOARD_CONFIG,loadSDK,account:true}),
    refreshProfile(){invalidateRankCache();if(active===byId('leaderboardDialog'))refresh(currentPage,true);else prefetchRank();},
    getBestScore:()=>client.localBest(),
    rememberScore:score=>client.rememberBest(score),
    onGameEnd(result){client.capture(result).finally(()=>renderSubmission());},
    prefetch:prefetchRank,
    get client(){return client;} // active identity only; never administrator keys
  };
  renderSubmission();
})();
