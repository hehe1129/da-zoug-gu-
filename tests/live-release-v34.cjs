'use strict';
// Read-only live smoke. Never creates an Auth identity or submits a score.
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/v34'),commit=process.argv[2],local=process.argv.includes('--local'),website=local?'http://127.0.0.1:4177/':'https://hehe1129.github.io/da-zoug-gu-/';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'127.0.0.1,localhost'},args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});
 const results=[],errors=[];let reads=0,signups=0,writes=0;
 const check=(name,ok,data)=>{assert.ok(ok,name+' '+JSON.stringify(data));results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/dzg_leaderboard_page'))reads++;if(r.url().includes('/auth/v1/signup'))signups++;if(/dzg_(submit_score|save_wish)/.test(r.url()))writes++;});
  await page.goto(website+'?v=34&release='+(commit||'local'),{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>state==='home',null,{timeout:120000});
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.endsWith('.rank-preview')),null,{timeout:20000});
  check('actual shared Supabase public endpoint preloads without SDK or Auth',reads>=1&&!await page.evaluate(()=>!!window.supabase?.createClient)&&signups===0,{reads});
  const showMS=await page.evaluate(()=>{const t=performance.now();$('homeLeaderboard').click();return{ms:performance.now()-t,count:$('rankRows').children.length};});
  check('live shared rows appear synchronously from the prefetched cache',showMS.ms<100&&showMS.count>0,showMS);
  await page.tap('#rankHome');await page.evaluate(()=>{onlineLeaderboard.client.setNickname('发布核验');onlineLeaderboard.client.warm=()=>Promise.resolve(null);onlineLeaderboard.onGameEnd=()=>{};});
  await page.tap('#start');await page.waitForFunction(()=>state==='playing');await page.evaluate(()=>cancelAnimationFrame(raf));
  await page.evaluate(async()=>{window.smokeHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.smokeHidden});document.dispatchEvent(new Event('visibilitychange'));await audio.ctx.suspend();});
  await page.evaluate(()=>{window.smokeHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.tap('#resume');await page.waitForFunction(()=>state==='playing');await page.evaluate(()=>cancelAnimationFrame(raf));await page.waitForTimeout(200);
  const output=await page.evaluate(()=>{const x=new Float32Array(audio.analyser.fftSize);audio.analyser.getFloatTimeDomainData(x);return{context:audio.ctx.state,song:!!audio.song,clock:!!audio.clock,rain:audio.rainType,peak:Math.max(...x.map(Math.abs))};});
  check('published music and rain recover after real context suspension',output.context==='running'&&output.song&&output.clock&&output.rain==='rainHeavy'&&output.peak>.001,output);
  if(!local){
   assert.match(commit||'',/^[a-f0-9]{40}$/);
   const release=await(await page.request.get(website+'release.json?check='+commit)).json();check('V34 is deployed at the unchanged original URL',release.version==='V34'&&release.status==='release'&&release.website===website);
   for(const file of ['index.html','audio.js','game.js','weather.js','leaderboard.js','leaderboard-client.js']){
    const response=await page.request.get(website+file+'?check='+commit),actual=await response.body(),expected=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',commit+':'+file],{cwd:root,maxBuffer:4000000});assert.equal(response.status(),200);assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),crypto.createHash('sha256').update(expected).digest('hex'),file);
   }check('published code matches the validated commit',true);
   for(const file of ['assets/audio/ensemble-v34.mp3','assets/modal-frame-v34.webp','assets/fonts/names-v34/009f.woff2']){
    const response=await page.request.get(website+file);assert.equal(response.status(),200);assert.equal((await response.body()).length,fs.statSync(path.join(root,file)).size);
   }check('optimized music, panel and font ranges are accessible',true);
  }
  check('no temporary players, scores, wishes or uncaught errors',signups===0&&writes===0&&errors.length===0,{signups,writes,errors});
  fs.writeFileSync(path.join(out,local?'live-backend-local.json':'live-release.json'),JSON.stringify({website,commit,results,errors,signups,writes},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
