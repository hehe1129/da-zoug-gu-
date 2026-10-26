/* Supabase is the authority for identity and scores. Storage is only session,
   nickname preference, and a retry outbox; never an online leaderboard. */
(function(root,factory){
  const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DazouguOnline=api;
})(typeof window==='undefined'?globalThis:window,function(root){
  'use strict';
  const REVISION='v25-attack-calibration-1',MAX_SCORE=17800,MAX_HITS=445;
  function cleanNickname(value){return String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').replace(/\s+/g,' ').trim();}
  function validNickname(value){const name=cleanNickname(value);return name.length>0&&Array.from(name).length<=12;}
  const cleanWish=cleanNickname;
  function validWish(value){return typeof value==='string'&&Array.from(cleanWish(value)).length<=50;}
  function newRunId(){
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    const bytes=new Uint8Array(16);if(root.crypto?.getRandomValues)root.crypto.getRandomValues(bytes);else for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'); // a run token, NEVER a player ID
  }
  function checkConfig(config){
    const url=String(config?.supabaseUrl||'').trim(),key=String(config?.publishableKey||'').trim();
    if(!url||!key)return{ready:false,reason:'missing'};
    let parsed;try{parsed=new URL(url);}catch{return{ready:false,reason:'invalid'};}
    const local=['localhost','127.0.0.1'].includes(parsed.hostname)&&['localhost','127.0.0.1'].includes(root.location?.hostname);
    if((parsed.protocol!=='https:'&&!local)||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')return{ready:false,reason:'invalid'};
    let publicKey=key.startsWith('sb_publishable_');
    // Legacy anon JWTs are supported, but service_role / secret keys are refused.
    if(!publicKey&&key.split('.').length===3)try{const raw=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');publicKey=JSON.parse(root.atob(raw)).role==='anon';}catch{}
    if(!publicKey||key.startsWith('sb_secret_'))return{ready:false,reason:'private-key'};
    return{ready:true,url:parsed.origin,key,namespace:parsed.hostname.replace(/[^a-zA-Z0-9-]/g,'-')};
  }
  function validResult(result){return result&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.runId)&&result.chartRevision===REVISION&&Number.isInteger(result.score)&&result.score>=0&&result.score<=MAX_SCORE&&result.score%10===0&&Number.isInteger(result.hits)&&result.hits>=0&&result.hits<=MAX_HITS&&Number.isInteger(result.perfects)&&result.perfects>=0&&result.perfects<=result.hits&&result.score>=10*result.hits+10*result.perfects&&result.score<=40*result.hits;}
  function storageAdapter(storage){
    const memory=new Map();return{
      getItem(key){try{return storage?.getItem(key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},
      setItem(key,value){memory.set(key,value);try{storage?.setItem(key,value);}catch{}},
      removeItem(key){memory.delete(key);try{storage?.removeItem(key);}catch{}}
    };
  }
  class LeaderboardClient{
    constructor(options={}){
      this.config=checkConfig(options.config);let storage=options.storage;try{storage??=root.localStorage;}catch{}
      this.storage=storageAdapter(storage);this.onStatus=options.onStatus||(()=>{});this.loadSDK=options.loadSDK;
      this.fetcher=options.fetch||((...args)=>root.fetch(...args));this.locks=options.locks??root.navigator?.locks;
      this.key='dazougu.online.'+(this.config.namespace||'unconfigured');this.nicknameKey='dazougu.nickname.v1';
      const saved=cleanNickname(this.storage.getItem(this.nicknameKey));this.nickname=validNickname(saved)?saved:'';
      this.status={state:this.config.ready?'idle':'unconfigured'};this.playerId=null;this.session=null;this.seen=new Set();
    }
    setStatus(state,extra={}){this.status={state,...extra};try{this.onStatus(this.status);}catch{}}
    setNickname(value){const name=cleanNickname(value);if(!validNickname(name))throw new Error('invalid-nickname');this.nickname=name;this.storage.setItem(this.nicknameKey,name);return name;}
    queue(){try{const value=JSON.parse(this.storage.getItem(this.key+'.outbox'));return(Array.isArray(value)?value:value?[value]:[]).filter(item=>validResult(item)&&validNickname(item.nickname));}catch{return[];}}
    pending(){return this.queue()[0]||null;}
    saveQueue(items){if(items.length)this.storage.setItem(this.key+'.outbox',JSON.stringify(items));else this.storage.removeItem(this.key+'.outbox');}
    orphaned(){try{return JSON.parse(this.storage.getItem(this.key+'.orphaned'))||[];}catch{return[];}}
    archiveOrphans(items){if(items.length)this.storage.setItem(this.key+'.orphaned',JSON.stringify([...this.orphaned(),...items].slice(-10)));}
    async request(input,init={},timeout=8000){
      const controller=new AbortController(),abort=()=>controller.abort();
      if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(abort,timeout);
      try{
        const response=await this.fetcher(input,{...init,signal:controller.signal});
        // Keep the deadline active through the small JSON body's transfer.
        // fetch() alone resolves at headers, which used to leave a stalled
        // mobile response waiting forever before any retry could begin.
        if(response.arrayBuffer&&typeof Response==='function'){
          const bytes=await response.arrayBuffer();
          return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
        }
        return response;
      }
      finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
    }
    acceptSession(session){
      const before=this.playerId;this.session=session||null;this.playerId=session?.user?.id||null;
      if(before!==this.playerId)this.onIdentity?.(this.playerId);
    }
    async getClient(){
      if(!this.config.ready)throw new Error('not-configured');
      if(!this.clientPromise)this.clientPromise=(async()=>{
        const sdk=await this.loadSDK();
        const boundedFetch=(input,init={})=>this.request(input,init);
        const client=sdk.createClient(this.config.url,this.config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:this.key+'.auth',storage:this.storage,lockAcquireTimeout:12000},global:{fetch:boundedFetch}});
        client.auth.onAuthStateChange((event,session)=>{if(session?.user?.id||event==='SIGNED_OUT')this.acceptSession(session);});
        return client;
      })().catch(error=>{this.clientPromise=null;throw error;});
      return this.clientPromise;
    }
    async identityTask(){
      const client=await this.getClient(),restored=await client.auth.getSession();
      if(restored.error)throw restored.error;
      let session=restored.data?.session;
      if(!session){const signed=await client.auth.signInAnonymously();if(signed.error)throw signed.error;session=signed.data?.session;}
      if(!session?.user?.id||!session.access_token)throw new Error('anonymous-auth-unavailable');
      this.acceptSession(session);return{client,playerId:this.playerId,accessToken:session.access_token};
    }
    async identity(){
      if(!this.identityPromise){
        const task=()=>this.identityTask();
        // Do not wait forever behind a background/frozen tab's identity lock.
        const controller=new AbortController();let timer;
        const locked=()=>{clearTimeout(timer);return task();};
        if(this.locks?.request)timer=setTimeout(()=>controller.abort(),8000);
        this.identityPromise=(this.locks?.request?this.locks.request(this.key+'.identity',{mode:'exclusive',signal:controller.signal},locked):this.identityLease(task)).finally(()=>{clearTimeout(timer);this.identityPromise=null;});
      }
      return this.identityPromise;
    }
    async identityLease(task){
      // Web Locks covers modern browsers. This short, rechecked local lease is
      // only the fallback to avoid two tabs creating anonymous users at once.
      const key=this.key+'.lease',token=newRunId(),wait=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<160;i++){
        let existing;try{existing=JSON.parse(this.storage.getItem(key));}catch{}
        if(!existing||existing.until<Date.now()){
          this.storage.setItem(key,JSON.stringify({token,until:Date.now()+16000}));await wait(35);
          try{if(JSON.parse(this.storage.getItem(key))?.token!==token)continue;}catch{continue;}
          try{return await task();}finally{try{if(JSON.parse(this.storage.getItem(key))?.token===token)this.storage.removeItem(key);}catch{}}
        }
        await wait(100);
      }
      throw new Error('identity-busy');
    }
    warm(){if(this.config.ready&&this.nickname)return this.identity().catch(()=>null);return Promise.resolve(null);}
    capture(result){
      if(this.seen.has(result?.runId))return this.inflight||Promise.resolve(false);
      if(!validResult(result)||!validNickname(this.nickname)){this.setStatus('invalid');return Promise.resolve(false);}
      this.seen.add(result.runId);if(this.seen.size>100)this.seen.delete(this.seen.values().next().value);
      if(!this.config.ready){this.setStatus('unconfigured');return Promise.resolve(false);}
      const items=this.queue(),ownerId=this.playerId||null;
      const old=items.find(item=>(item.ownerId||null)===ownerId);
      // Only the best offline round needs to reach a best-score leaderboard.
      // Its original run token survives retries/reloads and uncertain responses.
      if(!old||result.score>old.score)this.saveQueue([...items.filter(item=>item!==old),{...result,nickname:this.nickname,ownerId}]);
      return this.flush();
    }
    flush(){
      if(this.inflight)return this.inflight;
      if(!this.config.ready){this.setStatus('unconfigured');return Promise.resolve(false);}
      if(!this.pending())return Promise.resolve(true);
      this.inflight=(async()=>{
        this.setStatus('sending');
        try{
          const identity=await this.identity(),{client,playerId}=identity;let accessToken=identity.accessToken,best;
          if(this.playerId!==playerId)throw new Error('identity-changed-during-submit');
          const queued=this.queue(),orphans=queued.filter(item=>item.ownerId&&item.ownerId!==playerId);
          this.archiveOrphans(orphans);
          const own=queued.filter(item=>!item.ownerId||item.ownerId===playerId).sort((a,b)=>b.score-a.score);
          this.saveQueue(own.length?[{...own[0],ownerId:playerId}]:[]);
          if(!own.length&&orphans.length){this.setStatus('identity_changed');return false;}
          for(let i=0;i<4;i++){
            const item=this.pending();if(!item)break;
            if(this.playerId!==playerId||(item.ownerId&&item.ownerId!==playerId))throw new Error('identity-changed-during-submit');
            // Pin the exact anonymous session used to bind this outbox item.
            // A concurrent tab switching auth cannot relabel this request.
            const submit=()=>client.rpc('dzg_submit_score',{p_run_id:item.runId,p_nickname:item.nickname,p_score:item.score,p_hits:item.hits,p_perfects:item.perfects,p_chart_revision:item.chartRevision}).setHeader('Authorization','Bearer '+accessToken);
            let {data,error}=await submit();
            if(error&&['PGRST301','PGRST303'].includes(error.code)&&client.auth.refreshSession){
              const refreshed=await client.auth.refreshSession();
              if(refreshed.error||refreshed.data?.session?.user?.id!==playerId)throw refreshed.error||new Error('identity-changed-during-refresh');
              this.acceptSession(refreshed.data.session);accessToken=refreshed.data.session.access_token;
              ({data,error}=await submit()); // same receipt, same owner, once
            }
            if(error)throw error;
            if(!Number.isInteger(data?.best_score)||data.best_score<item.score||data.best_score>MAX_SCORE)throw new Error('invalid-acknowledgement');
            best=data.best_score;
            this.saveQueue(this.queue().filter(queued=>queued.runId!==item.runId));
          }
          if(this.pending()){this.setStatus('failed');return false;}
          this.setStatus('synced',{bestScore:best});return true;
        }catch(error){this.lastError=error;this.setStatus('failed');return false;}
      })().finally(()=>{this.inflight=null;});return this.inflight;
    }
    async saveWish(value,expectedPlayer=this.playerId){
      if(!validWish(value))throw new Error('invalid-wish');
      const wish=cleanWish(value),{client,accessToken}=await this.identity();
      if(expectedPlayer&&this.playerId!==expectedPlayer)throw new Error('wish-identity-changed');
      const {data,error}=await client.rpc('dzg_save_wish',{p_wish:wish}).setHeader('Authorization','Bearer '+accessToken);
      if(error)throw error;
      if(!data||data.wish!==wish)throw new Error('invalid-wish-acknowledgement');
      return data.wish;
    }
    async rankings(page=1){
      // Public scores must not wait for SDK download, signup, token refresh or
      // an auth lock. A ready anonymous session adds only the personal row.
      if(!this.config.ready)throw new Error('not-configured');
      const session=this.session,usable=session?.access_token&&(!session.expires_at||session.expires_at*1000>Date.now()+30000);
      const headers={'apikey':this.config.key,'Content-Type':'application/json'};
      if(usable)headers.Authorization='Bearer '+session.access_token;
      else if(!this.config.key.startsWith('sb_publishable_'))headers.Authorization='Bearer '+this.config.key;
      const read=()=>this.request(this.config.url+'/rest/v1/rpc/dzg_leaderboard_page',{method:'POST',headers,body:JSON.stringify({p_page:page})},6000);
      let response=await read();
      if(response.status===401&&usable){delete headers.Authorization;if(!this.config.key.startsWith('sb_publishable_'))headers.Authorization='Bearer '+this.config.key;response=await read();}
      if(!response.ok){const error=new Error('leaderboard '+response.status);error.status=response.status;throw error;}
      const data=await response.json();
      if(!data||!Array.isArray(data.entries)||data.entries.length>20||!Number.isInteger(data.page)||data.page<1||!Number.isInteger(data.total)||data.total<0||data.page_size!==20)throw new Error('invalid-leaderboard');
      const valid=row=>row&&Number.isInteger(row.rank)&&row.rank>0&&validNickname(row.nickname)&&Number.isInteger(row.best_score)&&row.best_score>=0&&row.best_score<=MAX_SCORE&&typeof row.is_current==='boolean'&&validWish(row.wish);
      if(data.entries.some(row=>!valid(row))||(data.current_player&&!valid(data.current_player)))throw new Error('invalid-leaderboard');
      return data;
    }
  }
  return{LeaderboardClient,cleanNickname,validNickname,cleanWish,validWish,validResult,checkConfig,newRunId,REVISION,MAX_SCORE};
});
