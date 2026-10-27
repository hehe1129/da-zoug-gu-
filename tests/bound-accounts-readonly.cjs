'use strict';
// Owner-authorized accounts only. Credentials arrive through stdin, never files.
// This test blocks all score/name/wish writes and never registers a new player.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8')),results=[],errors=[];let writes=0,registrations=0;
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'127.0.0.1,localhost'},args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});
 try{
  for(const account of input.accounts){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/rest/v1/rpc/*',route=>{if(/dzg_(submit_score|save_wish|set_display_name)/.test(route.request().url())){writes++;return route.abort();}return route.continue();});
   p.on('request',r=>{if(r.url().includes('/auth/v1/signup'))registrations++;});
   await p.goto(input.url||'http://127.0.0.1:4177/?v=36');await p.waitForFunction(()=>state==='login',null,{timeout:120000});
   await p.fill('#accountUsername',account.username);await p.fill('#accountPassword',account.password);await p.click('#accountSubmit');await p.waitForFunction(()=>state==='home',null,{timeout:30000});
   const profile=await p.evaluate(()=>({id:onlineLeaderboard.client.playerId,name:onlineLeaderboard.nickname,username:onlineLeaderboard.client.accountProfile.username,best:onlineLeaderboard.getBestScore(),passwordCleared:!$('accountPassword').value}));
   assert.equal(profile.id,account.id);assert.equal(profile.username,account.username);assert.equal(profile.best,account.score);assert.ok(profile.passwordCleared);
   results.push({username:account.username,playerId:profile.id,score:profile.best});console.log('PASS original account ID and score restored:',account.username,profile.best);
   await p.click('#openSettings');await p.click('#logout');await p.waitForFunction(()=>state==='login');await context.close();
  }
  assert.equal(writes,0);assert.equal(registrations,0);assert.deepEqual(errors,[]);
  const out=path.resolve(__dirname,'../output/supabase');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'v36-bound-verification.json'),JSON.stringify({results,writes,registrations,errors},null,2));
  console.log('PASS no registrations, leaderboard mutations or browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
