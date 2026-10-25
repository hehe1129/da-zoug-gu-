'use strict';
const assert=require('node:assert/strict');
const {LeaderboardClient,cleanNickname,validNickname,validResult,checkConfig,newRunId,REVISION}=require('../../leaderboard-client.js');
async function test(){
 assert.equal(cleanNickname('  鼓\u00a0友\u200b  '),'鼓 友');assert.equal(validNickname(' \u200b\u3000'),false);assert.equal(validNickname('鼓'.repeat(13)),false);assert.equal(validNickname('鼓'.repeat(12)),true);assert.equal(validNickname('<img src=x>'),true);
 assert.equal(checkConfig({supabaseUrl:'https://example.supabase.co',publishableKey:'sb_secret_never_allowed'}).ready,false);
 const legacy=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(checkConfig({supabaseUrl:'https://example.supabase.co',publishableKey:legacy('service_role')}).ready,false);
 assert.equal(checkConfig({supabaseUrl:'https://example.supabase.co',publishableKey:legacy('anon')}).ready,true);
 assert.equal(checkConfig({supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test_only'}).ready,true);
 const result={runId:newRunId(),score:900,hits:40,perfects:10,chartRevision:REVISION};assert.ok(validResult(result));assert.ok(!validResult({...result,score:17810}));assert.ok(!validResult({...result,score:900.5}));assert.ok(!validResult({...result,hits:500}));
 console.log('PASS nickname, public key guards, integer score bounds and run tokens');
 const raw=new Map(),storage={getItem:key=>raw.get(key)??null,setItem:(key,val)=>raw.set(key,val),removeItem:key=>raw.delete(key)};
 let signed=0,submitted=0,currentSession=null,fail=true;const playerId='11111111-1111-4111-8111-111111111111';
 const sdk={createClient:()=>({auth:{onAuthStateChange(){},async getSession(){return{data:{session:currentSession}};},async signInAnonymously(){signed++;currentSession={user:{id:playerId},access_token:'unit-anonymous-session-a'};return{data:{session:currentSession}};}},rpc(name,args){return{setHeader(key,value){assert.equal(key,'Authorization');assert.ok(value.startsWith('Bearer unit-anonymous-session-'));submitted++;return Promise.resolve(fail?{error:new Error('offline')}:{data:{best_score:Math.max(1200,args.p_score)}});}};}})};
 const options={config:{supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test_only'},loadSDK:async()=>sdk,storage,locks:{request:(_name,_options,fn)=>fn()}};
 const client=new LeaderboardClient(options);client.setNickname('鼓友');
 await Promise.all([client.identity(),client.identity(),client.identity()]);assert.equal(signed,1);
 await client.capture(result);assert.equal(client.status.state,'failed');assert.equal(client.pending().runId,result.runId);assert.equal(client.pending().ownerId,playerId);
 await client.capture({...result,runId:newRunId(),score:600,hits:30,perfects:10});assert.equal(client.pending().score,900);console.log('PASS anonymous sign-in coalesced; offline outbox keeps the highest round');
 fail=false;const count=submitted;await Promise.all([client.flush(),client.flush(),client.flush()]);assert.equal(submitted,count+1);assert.equal(client.pending(),null);assert.equal(client.status.bestScore,1200);
 await client.capture(result);assert.equal(submitted,count+1);console.log('PASS duplicate submissions and concurrent retries coalesce');
 const reloaded=new LeaderboardClient(options);assert.equal(reloaded.nickname,'鼓友');await reloaded.identity();assert.equal(signed,1);console.log('PASS nickname and auth session are reused');
 fail=true;await reloaded.capture({...result,runId:newRunId()});currentSession={user:{id:'22222222-2222-4222-8222-222222222222'},access_token:'unit-anonymous-session-b'};fail=false;const previous=submitted;await reloaded.flush();assert.equal(reloaded.status.state,'identity_changed');assert.equal(submitted,previous);assert.equal(reloaded.pending(),null);assert.equal(reloaded.orphaned()[0].ownerId,playerId);console.log('PASS a lost/changed identity archives old pending scores without reassigning them');
 await reloaded.capture({...result,runId:newRunId(),score:600,hits:30,perfects:10});assert.equal(reloaded.status.state,'synced');assert.equal(submitted,previous+1);console.log('PASS identity loss cannot block a new player from submitting their own score');
 const unavailable=new LeaderboardClient({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}},config:{},loadSDK:async()=>{throw Error('must not load');}});unavailable.setNickname('离线鼓友');await unavailable.capture({...result,runId:newRunId()});assert.equal(unavailable.status.state,'unconfigured');assert.equal(unavailable.nickname,'离线鼓友');console.log('PASS missing configuration or blocked storage does not crash the game');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
