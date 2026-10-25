'use strict';
const {createDatabase,rpc,asUser}=require('./database.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{const {db}=await createDatabase();try{
 const ids=Array.from({length:63},()=>crypto.randomUUID());
 for(const [i,id] of ids.entries()){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into dazougu_private.player_bests(player_id,nickname,best_score) values($1,$2,$3)',[id,'鼓友'+i,1000+i*10]);}
 let ranks=[];for(let page=1;page<=4;page++){const board=await rpc(db,ids[0],'dzg_leaderboard_page',[page]);assert.equal(board.total,63);assert.equal(board.current_player.rank,63);ranks.push(...board.entries.map(r=>r.rank));}
 assert.deepEqual(ranks,Array.from({length:63},(_,i)=>i+1));console.log('PASS all 63 players appear once across pages; own rank remains visible');
 const before=(await db.query('select best_score,achieved_at from dazougu_private.player_bests where player_id=$1',[ids[0]])).rows[0];
 const wish='愿你平安喜乐万事顺意';await rpc(db,ids[0],'dzg_save_wish',[wish]);await rpc(db,ids[1],'dzg_save_wish',['另一位玩家的心愿']);
 const board=await rpc(db,ids[1],'dzg_leaderboard_page',[4]);assert.equal(board.entries.find(r=>r.rank===63).wish,wish);assert.ok(!Object.keys(board.entries[0]).some(k=>/id|token|time/.test(k)));
 assert.equal((await rpc(db,ids[0],'dzg_leaderboard_page',[1])).current_player.wish,wish);
 assert.deepEqual((await db.query('select best_score,achieved_at from dazougu_private.player_bests where player_id=$1',[ids[0]])).rows[0],before);console.log('PASS shared wishes persist without changing scores or tie order; no private fields leaked');
 await rpc(db,ids[0],'dzg_save_wish',['🌧'.repeat(50)]);await assert.rejects(rpc(db,ids[0],'dzg_save_wish',['🌧'.repeat(51)]));
 await assert.rejects(rpc(db,null,'dzg_save_wish',['bad']));const unplayed=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[unplayed]);await assert.rejects(rpc(db,unplayed,'dzg_save_wish',['bad']));
 await assert.rejects(asUser(db,ids[0],tx=>tx.query('update dazougu_private.player_bests set wish=$1 where player_id=$2',['tamper',ids[1]])));
 assert.equal((await rpc(db,ids[1],'dzg_leaderboard_page',[1])).current_player.wish,'另一位玩家的心愿');console.log('PASS database enforces 50 Unicode characters and rejects guests, unranked users and other-player writes');
 await rpc(db,ids[0],'dzg_save_wish',['  心愿\n  平安  ']);assert.equal((await rpc(db,ids[0],'dzg_leaderboard_page',[1])).current_player.wish,'心愿 平安');
 await rpc(db,ids[0],'dzg_save_wish',['']);assert.equal((await rpc(db,ids[0],'dzg_leaderboard_page',[1])).current_player.wish,'');
 assert.equal((await rpc(db,null,'dzg_leaderboard_page',[-10])).page,1);assert.equal((await rpc(db,null,'dzg_leaderboard_page',[2147483647])).page,4);console.log('PASS whitespace cleanup, clearing wishes and out-of-range pagination');
 }finally{await db.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
