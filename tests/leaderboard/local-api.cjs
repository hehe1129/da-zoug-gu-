'use strict';
// Test-only GoTrue protocol fixture plus a REAL embedded PostgreSQL engine.
// Never deploy this server as the production backend. Supabase Auth is verified
// against the real project only after the owner supplies public configuration.
const http=require('node:http'),crypto=require('node:crypto');
const {createDatabase,rpc}=require('./database.cjs');
async function startLocalAPI(options={}){
 const {db}=await createDatabase(),secret=crypto.randomBytes(32),refreshTokens=new Map(),accounts=new Map(),stats={signups:0,refreshes:0,submits:0,reads:0};
 if(options.accounts){
  await db.exec('create role service_role nologin;');
  for(const [name,score] of [['曹多轩',16650],['童文静',16350]]){const id=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into dazougu_private.player_bests(player_id,nickname,best_score,wish) values($1,$2,$3,$4)',[id,name,score,'原有心愿']);}
  await db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../../supabase/migrations/20261027164643_game_accounts_v35.sql'),'utf8'));
 }
 const flags={offline:false,dropNextAck:false};let origin;
 function token(id){const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const payload=encode({sub:id,aud:'authenticated',role:'authenticated',is_anonymous:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,iss:origin+'/auth/v1'});const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+payload;return unsigned+'.'+crypto.createHmac('sha256',secret).update(unsigned).digest('base64url');}
 function user(id){const account=[...accounts.values()].find(a=>a.id===id);return{id,aud:'authenticated',role:'authenticated',email:account?.email||'',is_anonymous:!account,app_metadata:{provider:account?'email':'anonymous',providers:[account?'email':'anonymous']},user_metadata:{},identities:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}
 function session(id){const refresh=crypto.randomUUID();refreshTokens.set(refresh,id);return{access_token:token(id),refresh_token:refresh,token_type:'bearer',expires_in:3600,user:user(id)};}
 function owner(req){const jwt=req.headers.authorization?.replace(/^Bearer /i,'');if(!jwt||jwt.startsWith('sb_publishable_'))return null;try{const parts=jwt.split('.');if(parts.length!==3)return null;const expected=crypto.createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest('base64url');if(expected!==parts[2])return null;const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());return claims.exp>Date.now()/1000?claims.sub:null;}catch{return null;}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');
  const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{
   if(flags.offline){send(503,{message:'test network unavailable'});return;}
   const url=new URL(req.url,origin);let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
   if(url.pathname==='/auth/v1/signup'){
    const id=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);stats.signups++;send(200,session(id));return;
   }
   if(url.pathname==='/auth/v1/token'){
    stats.refreshes++;
    const id=refreshTokens.get(body.refresh_token);if(!id){send(400,{error:'invalid_grant',error_description:'Invalid Refresh Token'});return;}send(200,session(id));return;
   }
   const id=owner(req);
   if(url.pathname==='/functions/v1/game-accounts'&&options.accounts){
    const api=require('../../leaderboard-client.js'),name=api.cleanUsername(body.username),key=name.toLowerCase();
    if(!api.validUsername(name)||!api.validPassword(body.password)){send(400,{code:'invalid_input'});return;}
    let account=accounts.get(key);
    if(body.action==='register'){
     const nonce=crypto.randomUUID(),email=crypto.randomUUID()+'@players.yiguzuoqi.invalid',player=crypto.randomUUID();
     try{await db.query("select dazougu_private.account_service('reserve',$1,$2,$3)",[name,nonce,email]);}catch{send(409,{code:'username_taken'});return;}
     await db.query('insert into auth.users(id) values($1)',[player]);await db.query("select dazougu_private.account_service('finalize',$1,$2,null,$3)",[name,nonce,player]);
     account={id:player,email,password:body.password};accounts.set(key,account);
    }
    if(!account||account.password!==body.password){send(401,{code:'invalid_credentials'});return;}
    send(200,{session:session(account.id)});return;
   }
   if(url.pathname==='/auth/v1/logout'){res.writeHead(204);res.end();return;}
   if(url.pathname==='/rest/v1/rpc/dzg_account_profile'&&options.accounts){send(200,await require('./database.cjs').asUser(db,id,tx=>tx.query('select public.dzg_account_profile() as result')).then(r=>r.rows[0].result));return;}
   if(url.pathname==='/rest/v1/rpc/dzg_set_display_name'&&options.accounts){send(200,await require('./database.cjs').asUser(db,id,tx=>tx.query('select public.dzg_set_display_name($1) as result',[body.p_name])).then(r=>r.rows[0].result));return;}
   if(url.pathname==='/auth/v1/user'){send(id?200:401,id?user(id):{message:'Not authenticated'});return;}
   if(url.pathname==='/rest/v1/rpc/dzg_submit_score'){
    stats.submits++;const result=await rpc(db,id,'dzg_submit_score',[body.p_run_id,body.p_nickname,body.p_score,body.p_hits,body.p_perfects,body.p_chart_revision]);
    if(flags.dropNextAck){flags.dropNextAck=false;res.destroy();return;}send(200,result);return;
   }
   if(url.pathname==='/rest/v1/rpc/dzg_leaderboard'){stats.reads++;send(200,await rpc(db,id,'dzg_leaderboard'));return;}
   if(url.pathname==='/rest/v1/rpc/dzg_leaderboard_page'){stats.reads++;send(200,await rpc(db,id,'dzg_leaderboard_page',[body.p_page]));return;}
   if(url.pathname==='/rest/v1/rpc/dzg_save_wish'){send(200,await rpc(db,id,'dzg_save_wish',[body.p_wish]));return;}
   send(404,{message:'Not found'});
  }catch(error){send(error.code==='42501'?403:400,{code:error.code||'TEST',message:error.message});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 return{origin,db,flags,stats,async close(){await new Promise(resolve=>server.close(resolve));await db.close();}};
}
module.exports={startLocalAPI};
