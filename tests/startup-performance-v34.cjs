'use strict';
const {chromium}=require(process.env.DAZOUGU_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/v34');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=192 --max-semi-space-size=2','--disable-gpu']});
 const results=[];
 try{for(const version of ['V33','V34']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
   if(version==='V33'){
    const originals=new Map();for(const file of ['index.html','audio.js','game.js','weather.js','leaderboard.js','leaderboard-client.js'])originals.set(file,cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','aa00204:'+file],{cwd:root,maxBuffer:4000000}));
    await page.route('http://127.0.0.1:4177/**',route=>{const file=new URL(route.request().url()).pathname.slice(1)||'index.html';return originals.has(file)?route.fulfill({body:originals.get(file),contentType:file.endsWith('.js')?'application/javascript':'text/html'}):route.continue();});
   }
   await page.route('**/leaderboard-config.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.DAZOUGU_LEADERBOARD_CONFIG={};'}));
   const session=await context.newCDPSession(page);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
   // A repeatable constrained mobile connection. This is a lab comparison,
   // not a claim about any particular carrier or physical phone.
   await session.send('Network.emulateNetworkConditions',{offline:false,latency:120,downloadThroughput:200000,uploadThroughput:64000,connectionType:'cellular3g'});
   let bytes=0;session.on('Network.loadingFinished',e=>bytes+=e.encodedDataLength);
   const start=Date.now();await page.goto('http://127.0.0.1:4177/?perf='+version,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>state==='home',null,{timeout:120000});
   const result={version,readyMS:Date.now()-start,observedNetworkBytes:bytes,assets:await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({file:r.name.split('/').pop(),bytes:r.decodedBodySize}))),decoded:await page.evaluate(()=>Object.keys(audio.buffers).length)};
   result.resourceBytes=result.assets.reduce((sum,item)=>sum+item.bytes,0);
   results.push(result);console.log(version,JSON.stringify({readyMS:result.readyMS,bytes:result.resourceBytes,decoded:result.decoded}));await context.close();
  }
  assert.ok(results.every(r=>r.decoded===8));assert.ok(results[1].resourceBytes<results[0].resourceBytes*.75,'startup bytes did not fall by at least 25%');assert.ok(results[1].readyMS<results[0].readyMS,'constrained first load did not improve');
  fs.writeFileSync(out+'/startup-performance.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
