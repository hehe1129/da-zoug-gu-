'use strict';
// Temporary cloud account only; records its exact ID for controlled cleanup.
// Never logs or writes the generated PIN, access token or refresh token.
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),crypto=require('node:crypto'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../output/supabase');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'127.0.0.1,localhost'},args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});
 const {username}=JSON.parse(fs.readFileSync(out+'/v35-live-test-plan.json','utf8')),password=String(crypto.randomInt(1000000)).padStart(6,'0'),results=[],created=[];
 if(!/^验35[a-f0-9]{8}$/.test(username))throw new Error('Exact approved test username required');
 fs.writeFileSync(out+'/v35-live-test-intent.json',JSON.stringify({username,startedAt:new Date().toISOString()},null,2));
 const check=(name,ok)=>{assert.ok(ok,name);results.push(name);console.log('PASS',name);};
 let a,b,cleanupReady=false;
 try{
  a=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await a.goto('http://127.0.0.1:4177/?v=35-live');await a.waitForFunction(()=>state==='login');
  await a.evaluate(()=>window.liveAccount=onlineLeaderboard.createAccountClient());
  const hook=await a.evaluate(async username=>{const c=window.liveAccount,r=await c.request(c.config.url+'/rest/v1/rpc/dzg_cleanup_v35_test',{method:'POST',headers:{apikey:c.config.key,'Content-Type':'application/json'},body:JSON.stringify({p_username:username})});return r.status;},username);
  if(hook===404)throw new Error('Controlled cleanup hook is absent; no cloud test data will be created');cleanupReady=true;
  const registration=await a.evaluate(async({username,password})=>{try{await liveAccount.login('register',username,password);return{id:liveAccount.playerId,username:liveAccount.accountProfile.username,best:liveAccount.bestScore};}catch(error){return{error:error.code||error.message};}},{username,password});
  if(registration.id){created.push({player_id:registration.id,username});fs.writeFileSync(out+'/v35-live-test-accounts.json',JSON.stringify(created,null,2));}
  check('actual username/PIN registration succeeds without email or paid service',!!registration.id&&registration.username===username&&registration.best===0);
  const duplicate=await a.evaluate(async({username,password})=>{try{await onlineLeaderboard.createAccountClient().login('register',username.toUpperCase(),password);return 'unexpected';}catch(error){return error.code;}},{username,password});check('actual registration rejects a duplicate case-folded username',duplicate==='username_taken');
  const wrong=await a.evaluate(async({username,password})=>{try{await onlineLeaderboard.createAccountClient().login('login',username,password);return 'unexpected';}catch(error){return error.code;}},{username,password:password==='999999'?'888888':'999999'});check('actual wrong PIN is rejected',wrong==='invalid_credentials');
  await a.evaluate(()=>{liveAccount.onStatus=()=>{};return liveAccount.capture({runId:DazouguOnline.newRunId(),score:800,hits:40,perfects:0,chartRevision:DazouguOnline.REVISION});});check('actual account stores its highest score',await a.evaluate(()=>liveAccount.status.bestScore===800));
  await a.evaluate(name=>liveAccount.setDisplayName(name),'联调'+username.slice(3));
  b=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await b.goto('http://127.0.0.1:4177/?v=35-live');await b.waitForFunction(()=>state==='login');await b.evaluate(()=>window.liveAccount=onlineLeaderboard.createAccountClient());
  const login=await b.evaluate(async({username,password})=>{await liveAccount.login('login',username,password);return{id:liveAccount.playerId,best:liveAccount.bestScore,name:liveAccount.nickname};},{username,password});check('actual account/name/best are shared across independent browsers',login.id===registration.id&&login.best===800&&login.name==='联调'+username.slice(3));
  await b.evaluate(()=>liveAccount.capture({runId:DazouguOnline.newRunId(),score:400,hits:20,perfects:0,chartRevision:DazouguOnline.REVISION}));check('actual lower result cannot replace the higher score',await b.evaluate(()=>liveAccount.status.bestScore===800));
  await a.evaluate(()=>liveAccount.logout());await b.evaluate(()=>liveAccount.logout());check('temporary sessions sign out cleanly',await a.evaluate(()=>liveAccount.playerId===null)&&await b.evaluate(()=>liveAccount.playerId===null));
  fs.writeFileSync(out+'/v35-live-verification.json',JSON.stringify({results,temporary_accounts:created,needs_cleanup:true},null,2));
 }finally{
  // Same-process cleanup is mandatory, even if an assertion or network call
  // failed. The server endpoint only accepts this exact approved username,
  // derives owner from JWT and refuses all pre-existing/legacy player IDs.
  let cleaned=!cleanupReady;
  if(a&&cleanupReady){try{
   cleaned=await a.evaluate(async({username,password})=>{
    let current=window.liveAccount;
    if(!current?.session?.access_token){current=onlineLeaderboard.createAccountClient();await current.login('login',username,password);}
    const token=current.session.access_token;
    try{await current.logout();}catch{}
    const response=await current.request(current.config.url+'/rest/v1/rpc/dzg_cleanup_v35_test',{method:'POST',headers:{apikey:current.config.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_username:username})});
    return response.ok&&(await response.json()).cleaned===true;
   },{username,password});
  }catch{}}
  if(b)try{await b.evaluate(()=>window.liveAccount?.logout());}catch{}
  fs.writeFileSync(out+'/v35-live-cleanup.json',JSON.stringify({username,cleaned},null,2));console.log(cleaned?'PASS exact temporary account, score and receipts deleted':'CLEANUP NEEDS CONTROLLED REVIEW');
  if(cleaned&&fs.existsSync(out+'/v35-live-verification.json')){const report=JSON.parse(fs.readFileSync(out+'/v35-live-verification.json','utf8'));report.needs_cleanup=false;fs.writeFileSync(out+'/v35-live-verification.json',JSON.stringify(report,null,2));}
  await browser.close();if(!cleaned)process.exitCode=1;
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
