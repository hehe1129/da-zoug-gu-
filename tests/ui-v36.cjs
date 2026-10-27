'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']}),out=path.resolve(__dirname,'../output/playwright/v36'),results=[];fs.mkdirSync(out,{recursive:true});
 try{
  for(const size of [{width:390,height:844},{width:320,height:568},{width:1440,height:900}]){
   const context=await b.newContext({viewport:size,isMobile:size.width<600,hasTouch:true}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   // Visual checks need no network identity or online score submission.
   await p.route('**/leaderboard-config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.DAZOUGU_LEADERBOARD_CONFIG={};'}));
   await p.goto('http://127.0.0.1:4177/?v=36');await p.waitForFunction(()=>state==='login',null,{timeout:60000});await p.screenshot({path:out+`/login-${size.width}.png`});
   await p.click('#registerTab');await p.locator('#guestLogin').scrollIntoViewIfNeeded();assert.ok(await p.locator('#guestLogin').isVisible());await p.screenshot({path:out+`/register-${size.width}.png`});await p.click('#guestLogin');await p.waitForFunction(()=>state==='home');
   const gear=await p.evaluate(()=>{const icon=$('openSettings').querySelector('svg'),s=getComputedStyle(icon),r=icon.getBoundingClientRect();return{visibility:s.visibility,display:s.display,color:s.stroke,width:r.width,height:r.height};});assert.equal(gear.visibility,'visible');assert.equal(gear.color,'rgb(21, 86, 165)');assert.ok(gear.width>=34);await p.screenshot({path:out+`/cover-${size.width}.png`});
   await p.click('#openSettings');await p.locator('#logout').scrollIntoViewIfNeeded();assert.ok(await p.locator('#logout').isVisible());await p.screenshot({path:out+`/settings-${size.width}.png`});await p.click('#settingsClose');
   await p.click('#start');await p.waitForFunction(()=>state==='playing');const rain=await p.evaluate(()=>{cancelAnimationFrame(raf);enterStage(0);draw(now());return{stages:[1,2,3,4,5,6].map(i=>DazouguWeather.forLevel(i).drops),game:$('game').getBoundingClientRect().height,rain:rainFrontCanvas.getBoundingClientRect().height};});assert.deepEqual(rain.stages,[216,162,114,72,36,0]);assert.equal(rain.game,rain.rain);await p.screenshot({path:out+`/rain-${size.width}.png`});
   const dry=await p.evaluate(()=>{enterStage(5);draw(now());return rainFrontPen.getImageData(0,0,rainFrontCanvas.width,rainFrontCanvas.height).data.every((v,i)=>i%4!==3||v===0);});assert.ok(dry);assert.deepEqual(errors,[]);results.push({size,gear,rain,dry});console.log('PASS visible gear, accessible panels and full-screen rain:',size.width);await context.close();
  }
  fs.writeFileSync(out+'/ui-verification.json',JSON.stringify(results,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
