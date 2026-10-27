// Only this server runtime reads SUPABASE_SERVICE_ROLE_KEY. Never ship it to JS.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const url=Deno.env.get('SUPABASE_URL')!,adminKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,adminKey,options);
const origins=new Set(['https://hehe1129.github.io','http://127.0.0.1:4177','http://localhost:4177','http://127.0.0.1:4173']);
async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info'};
 if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return reply(403,{code:'origin_denied'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{code:'method_not_allowed'});
 try{
  if(Number(req.headers.get('content-length')||0)>2048)return reply(413,{code:'too_large'});
  const raw=await req.text();if(raw.length>2048)return reply(413,{code:'too_large'});
  let input;try{input=JSON.parse(raw);}catch{return reply(400,{code:'invalid_input'});}
  const username=String(input.username??'').normalize('NFKC').trim(),password=input.password,action=input.action;
  if(!/^[A-Za-z0-9_\u4e00-\u9fff]{2,12}$/.test(username)||typeof password!=='string'||!/^\d{6}$/.test(password)||!['login','register'].includes(action))return reply(400,{code:'invalid_input'});
  const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();
  for(const [bucket,limit,seconds] of [
   [action+':ip:'+await digest(ip),action==='register'?30:80,action==='register'?3600:600],
   [action+':name:'+await digest(username.toLowerCase()),action==='register'?5:10,600]
  ] as [string,number,number][]){
   const result=await admin.rpc('dzg_account_limit',{p_bucket:bucket,p_limit:limit,p_seconds:seconds});
   if(result.error)return reply(503,{code:'temporarily_unavailable'});
   if(!result.data?.allowed){headers['Retry-After']=String(result.data?.retry_after||60);return reply(429,{code:'too_many_attempts'});}
  }
  let account;
  if(action==='register'){
   const nonce=crypto.randomUUID(),email=crypto.randomUUID()+'@players.yiguzuoqi.invalid';
   const reserved=await admin.rpc('dzg_account_service',{p_action:'reserve',p_username:username,p_nonce:nonce,p_email:email});
   if(reserved.error)return reply(reserved.error.code==='23505'?409:503,{code:reserved.error.code==='23505'?'username_taken':'temporarily_unavailable'});
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{game:'dazougu',account_type:'username'}});
   if(created.error||!created.data.user){await admin.rpc('dzg_account_service',{p_action:'cancel',p_username:username,p_nonce:nonce});return reply(503,{code:'registration_failed'});}
   const finalized=await admin.rpc('dzg_account_service',{p_action:'finalize',p_username:username,p_nonce:nonce,p_player_id:created.data.user.id});
   // Keep an unfinished Auth user private if finalization fails. Never delete
   // players or scores as part of automatic cleanup / a failed network call.
   if(finalized.error)return reply(503,{code:'registration_pending'});
   account={auth_email:email,player_id:created.data.user.id};
  }else{
   const found=await admin.rpc('dzg_account_service',{p_action:'lookup',p_username:username});
   if(found.error)return reply(503,{code:'temporarily_unavailable'});
   account=found.data;if(!account){await new Promise(r=>setTimeout(r,150));return reply(401,{code:'invalid_credentials'});}
  }
  const auth=createClient(url,publicKey,options),signed=await auth.auth.signInWithPassword({email:account.auth_email,password});
  if(signed.error||!signed.data.session)return reply(401,{code:'invalid_credentials'});
  return reply(200,{session:signed.data.session});
 }catch{return reply(503,{code:'temporarily_unavailable'});}
});
