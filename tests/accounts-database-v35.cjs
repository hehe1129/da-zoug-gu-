'use strict';
const {createDatabase,rpc,asUser}=require('./leaderboard/database.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function addAccount(db,username,id=crypto.randomUUID()){
 const nonce=crypto.randomUUID(),email=crypto.randomUUID()+'@players.yiguzuoqi.invalid';
 await service(db,'reserve',username,nonce,email);await db.query('insert into auth.users(id) values($1)',[id]);await service(db,'finalize',username,nonce,null,id);return id;
}
async function service(db,action,name,nonce=null,email=null,id=null){return db.transaction(async tx=>{await tx.exec('set local role service_role');const r=await tx.query('select public.dzg_account_service($1,$2,$3,$4,$5) as data',[action,name,nonce,email,id]);return r.rows[0].data;});}
async function setup(){const {db}=await createDatabase();await db.exec('create role service_role nologin;');const a=crypto.randomUUID(),b=crypto.randomUUID();for(const [id,name,score] of [[a,'曹多轩',16650],[b,'童文静',16350]]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into dazougu_private.player_bests(player_id,nickname,best_score,wish) values($1,$2,$3,$4)',[id,name,score,'原有心愿']);}
 const before=(await db.query('select * from dazougu_private.player_bests order by player_id')).rows;
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261027164643_game_accounts_v35.sql'),'utf8'));return{db,before,a,b};}
(async()=>{const {db,before,a,b}=await setup();try{
 assert.deepEqual((await db.query('select * from dazougu_private.player_bests order by player_id')).rows,before);assert.equal((await db.query('select count(*) as n from dazougu_private.legacy_account_reservations')).rows[0].n,2);console.log('PASS existing protected scores, owners, timestamps and wishes stay byte-for-byte unchanged');
 for(const name of ['曹多轩','童文静'])await assert.rejects(service(db,'reserve',name,crypto.randomUUID(),crypto.randomUUID()+'@players.yiguzuoqi.invalid'),/username_reserved/);
 const id=await addAccount(db,'鼓友A');await assert.rejects(addAccount(db,'鼓友a'),/duplicate key/);console.log('PASS login usernames are case-insensitively unique and protected names reserved');
 await assert.rejects(asUser(db,id,tx=>tx.query('select public.dzg_account_service($1,$2)', ['lookup','鼓友A'])),/permission denied/);
 await assert.rejects(asUser(db,null,tx=>tx.query('select public.dzg_account_profile()')),/permission denied/);console.log('PASS public clients cannot reserve/lookup credentials or read private account tables');
 const me=(await asUser(db,id,tx=>tx.query('select public.dzg_account_profile() as p'))).rows[0].p;assert.equal(me.username,'鼓友A');assert.equal(me.display_name,'鼓友A');assert.equal(me.best_score,0);
 await rpc(db,id,'dzg_submit_score',[crypto.randomUUID(),'忽略旧设备名称',900,40,10,'v25-attack-calibration-1']);
 await asUser(db,id,tx=>tx.query('select public.dzg_set_display_name($1)',['同名鼓友']));
 const other=await addAccount(db,'另一个鼓友');await asUser(db,other,tx=>tx.query('select public.dzg_set_display_name($1)',['同名鼓友']));
 await rpc(db,other,'dzg_submit_score',[crypto.randomUUID(),'旧名称',600,30,0,'v25-attack-calibration-1']);
 await rpc(db,id,'dzg_submit_score',[crypto.randomUUID(),'过期昵称',600,30,0,'v25-attack-calibration-1']);
 const best=(await db.query('select * from dazougu_private.player_bests where player_id=$1',[id])).rows[0];assert.equal(best.best_score,900);assert.equal(best.nickname,'同名鼓友');
 assert.equal((await db.query("select count(*) as n from dazougu_private.player_bests where nickname='同名鼓友'")).rows[0].n,2);console.log('PASS display names can duplicate/change without changing login or lowering best score');
 const original=(await db.query('select * from dazougu_private.player_bests where player_id in ($1,$2) order by player_id',[a,b])).rows;assert.deepEqual(original,before);console.log('PASS new accounts cannot claim protected legacy scores by choosing their display name');
 for(let i=0;i<4;i++){const n=await db.query("select dazougu_private.account_limit('test',3,600) as r");assert.equal(n.rows[0].r.allowed,i<3);}console.log('PASS database-backed credential attempt limits are bounded');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={setup,service,addAccount};
