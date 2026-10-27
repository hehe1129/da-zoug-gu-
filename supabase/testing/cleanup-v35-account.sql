-- REVIEW TEMPLATE ONLY. Substitute one exact UUID + exact username returned by
-- the approved temporary test. Never run a prefix-wide delete. Run as admin
-- after signing out its sessions, and inspect DELETE counts (must each be 1).
begin;
do $$
begin
 if not exists(
  select 1 from dazougu_private.game_accounts a join auth.users u on u.id=a.player_id
  where a.player_id='EXACT_TEST_UUID'::uuid and a.username='EXACT_TEST_USERNAME'
   and a.username ~ '^验35[a-f0-9]{8}$' and u.raw_app_meta_data->>'game'='dazougu'
   and a.auth_email=u.email and u.email like '%@players.yiguzuoqi.invalid'
   and not exists(select 1 from dazougu_private.v35_player_bests_snapshot s where s.player_id=a.player_id)
   and not exists(select 1 from dazougu_private.legacy_account_reservations r where r.player_id=a.player_id)
 ) then raise exception 'Not the exact self-created test account; cleanup refused';end if;
end;$$;
delete from dazougu_private.game_accounts where player_id='EXACT_TEST_UUID'::uuid and username='EXACT_TEST_USERNAME';
-- The existing foreign-key cascades remove ONLY this test user's score/receipts.
delete from auth.users where id='EXACT_TEST_UUID'::uuid and raw_app_meta_data->>'game'='dazougu';
commit;
