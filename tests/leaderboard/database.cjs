'use strict';
const {PGlite}=require(process.env.DAZOUGU_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',REV='v25-attack-calibration-1';
async function createDatabase(){
  const db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  const sql=fs.readFileSync(path.join(__dirname,'../../supabase/leaderboard.sql'),'utf8');await db.exec(sql);return{db,sql};
}
async function asUser(db,id,fn){return db.transaction(async tx=>{await tx.exec('set local role '+(id?'authenticated':'anon'));await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);return fn(tx);});}
async function rpc(db,id,name,args){return asUser(db,id,tx=>name==='dzg_leaderboard'?tx.query('select public.dzg_leaderboard() as result'):tx.query('select public.dzg_submit_score($1::uuid,$2::text,$3::integer,$4::integer,$5::integer,$6::text) as result',args)).then(r=>r.rows[0].result);}
async function test(){
 const {db,sql}=await createDatabase();const results=[];
 const pass=s=>{results.push(s);console.log('PASS',s);};
 try{
  await db.query('insert into auth.users(id) values ($1),($2)',[A,B]);
  const submit=(id,score,hits,perfects=0,name='鼓友',run=crypto.randomUUID(),revision=REV)=>rpc(db,id,'dzg_submit_score',[run,name,score,hits,perfects,revision]);
  let r=await submit(A,900,40,10);assert.equal(r.best_score,900);assert.equal(r.improved,true);
  r=await submit(A,400,20,5);assert.equal(r.best_score,900);assert.equal(r.improved,false);
  r=await submit(A,1200,50,20);assert.equal(r.best_score,1200);pass('only personal high scores increase');
  await db.exec(sql);assert.equal((await rpc(db,A,'dzg_leaderboard')).current_player.best_score,1200);pass('migration can be rerun without losing scores');
  const install=await db.query(fs.readFileSync(path.join(__dirname,'../../supabase/verify-leaderboard.sql'),'utf8'));assert.ok(install.rows.every(r=>r.passed),JSON.stringify(install.rows));pass('all eight read-only installation checks pass');
  const run=crypto.randomUUID();await submit(A,1300,50,20,'鼓友',run);const count=(await db.query('select count(*)::int n from dazougu_private.score_submissions where player_id=$1',[A])).rows[0].n;
  r=await submit(A,1300,50,20,'鼓友',run);assert.equal(r.duplicate,true);assert.equal((await db.query('select count(*)::int n from dazougu_private.score_submissions where player_id=$1',[A])).rows[0].n,count);
  await assert.rejects(submit(A,1400,50,20,'鼓友',run));pass('run ID retries are idempotent and reject mutated payloads');
  await submit(B,1500,60,10);let board=await rpc(db,A,'dzg_leaderboard');assert.equal(board.entries.length,2);assert.equal(board.entries[0].best_score,1500);assert.equal(board.entries.filter(e=>e.is_current).length,1);assert.equal(board.entries[0].nickname,board.entries[1].nickname);pass('duplicate nicknames belong to distinct authenticated players');
  for(const args of [[null,100,5], [A,-10,1], [A,17810,445], [A,110,1], [A,15,1], [A,100,446], [A,100,10,11], [A,100,10,0,'   '], [A,100,10,0,'\u00a0\u3000\u200b'], [A,100,10,0,'一二三四五六七八九十一二三'], [A,100,10,0,'鼓友',crypto.randomUUID(),'unknown-chart']])await assert.rejects(submit(...args));
  pass('unauthenticated writes, invalid bounds, blank names, long names and unknown charts rejected');
  for(const id of [null,A,B]){
   await assert.rejects(asUser(db,id,tx=>tx.exec('select * from dazougu_private.player_bests')));
   await assert.rejects(asUser(db,id,tx=>tx.query('update dazougu_private.player_bests set best_score=9000 where player_id=$1',[A])));
  }
  board=await rpc(db,null,'dzg_leaderboard');assert.equal(board.entries.filter(e=>e.is_current).length,0);assert.equal(board.current_player,null);
  for(const row of board.entries)assert.deepEqual(Object.keys(row).sort(),['best_score','is_current','nickname','rank']);pass('API roles have no raw table access; public ranking exposes only required fields');
  await assert.rejects(db.query('update dazougu_private.player_bests set best_score=10 where player_id=$1',[A]));pass('database trigger forbids score decreases even outside the RPC');
  // Temporarily grant raw access to test RLS itself; these grants are NOT in the migration.
  await db.exec('grant usage on schema dazougu_private to authenticated;grant select,insert,update,delete on dazougu_private.player_bests to authenticated;');
  const changed=await asUser(db,B,tx=>tx.query('update dazougu_private.player_bests set best_score=9000 where player_id=$1 returning player_id',[A]));assert.equal(changed.rows.length,0);
  await assert.rejects(asUser(db,B,tx=>tx.query('insert into dazougu_private.player_bests(player_id,nickname,best_score) values($1,$2,0)',[A,'冒名'])));
  assert.equal((await asUser(db,B,tx=>tx.exec('select * from dazougu_private.player_bests')))[0].rows.length,1);
  await db.exec('revoke all on schema dazougu_private from authenticated;revoke all on all tables in schema dazougu_private from authenticated;');pass('RLS independently prevents reading/writing another player, even with temporary table grants');
  for(let i=0;i<60;i++){const id=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into dazougu_private.player_bests(player_id,nickname,best_score,achieved_at) values($1,$2,$3,$4)',[id,'鼓友',5000+i*10,new Date(1700000000000+i*1000)]);}
  board=await rpc(db,A,'dzg_leaderboard');assert.equal(board.entries.length,50);assert.ok(board.entries.every((e,i)=>e.rank===i+1&&(!i||e.best_score<=board.entries[i-1].best_score)));assert.ok(board.current_player.rank>50);assert.equal(board.current_player.best_score,1300);pass('top 50 sorted server-side with a separate current player below the cutoff');
  return results;
 }finally{await db.close();}
}
module.exports={createDatabase,asUser,rpc};if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1;});
