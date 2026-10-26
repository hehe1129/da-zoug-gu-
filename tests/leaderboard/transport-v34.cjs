'use strict';
const assert=require('node:assert/strict');
const {LeaderboardClient,newRunId,REVISION}=require('../../leaderboard-client.js');
(async()=>{
 const config={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test_only'},id='11111111-1111-4111-8111-111111111111';
 const page={page:1,page_size:20,total:0,entries:[],current_player:null};let sdk=0,requests=0;
 const publicClient=new LeaderboardClient({config,loadSDK:async()=>{sdk++;throw Error('SDK unavailable');},fetch:async()=>{requests++;return{ok:true,status:200,json:async()=>page};}});publicClient.setNickname('鼓友');
 assert.deepEqual(await publicClient.rankings(),page);assert.equal(sdk,0);assert.equal(requests,1);console.log('PASS public read never waits for SDK or authentication, even with a saved nickname');
 publicClient.acceptSession({user:{id},access_token:'expired-token'});let headers=[];
 publicClient.fetcher=async(_url,init)=>{headers.push({...init.headers});return headers.length===1?{ok:false,status:401}:{ok:true,status:200,json:async()=>page};};
 await publicClient.rankings();assert.equal(headers[0].Authorization,'Bearer expired-token');assert.equal(headers[1].Authorization,undefined);console.log('PASS rejected personal token falls back to the public board without losing identity');
 let refreshes=0,submits=0;const tokens=[],receipts=[];let session={user:{id},access_token:'old'};
 const writer=new LeaderboardClient({config,loadSDK:async()=>({createClient:()=>({auth:{onAuthStateChange(){},async getSession(){return{data:{session}};},async refreshSession(){refreshes++;session={user:{id},access_token:'fresh'};return{data:{session}};}},rpc(_name,args){return{setHeader(_key,token){tokens.push(token);receipts.push(args.p_run_id);submits++;return Promise.resolve(submits===1?{error:{code:'PGRST301'}}:{data:{best_score:900}});}};}})}),locks:{request:(_key,_options,fn)=>fn()}});writer.setNickname('鼓友');
 const result={runId:newRunId(),score:900,hits:40,perfects:10,chartRevision:REVISION};assert.equal(await writer.capture(result),true);
 assert.equal(refreshes,1);assert.deepEqual(tokens,['Bearer old','Bearer fresh']);assert.equal(receipts[0],receipts[1]);assert.equal(writer.pending(),null);assert.equal(writer.playerId,id);console.log('PASS expired-token write refreshes once with the identical receipt and owner');
})().catch(error=>{console.error(error);process.exitCode=1;});
