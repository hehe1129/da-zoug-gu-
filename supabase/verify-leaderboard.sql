-- Read-only installation checks. Run AFTER leaderboard.sql in the SQL Editor.
-- Every row should show passed = true. This never prints keys or player IDs.
select 'RLS enabled on both private tables' as check_name,
  (select count(*)=2 from pg_tables where schemaname='dazougu_private'
    and tablename in ('player_bests','score_submissions') and rowsecurity) as passed
union all select 'API roles cannot create private objects',
  not has_schema_privilege('anon','dazougu_private','create')
  and not has_schema_privilege('authenticated','dazougu_private','create')
union all select 'No direct API table writes or reads',
  not exists (select 1 from unnest(array['anon','authenticated']) r,
    unnest(array['player_bests','score_submissions']) t,
    unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
    where has_table_privilege(r,'dazougu_private.'||t,p))
union all select 'Only authenticated players can submit',
  has_function_privilege('authenticated','public.dzg_submit_score(uuid,text,integer,integer,integer,text)','execute')
  and not has_function_privilege('anon','public.dzg_submit_score(uuid,text,integer,integer,integer,text)','execute')
union all select 'Public ranking RPC available',
  has_function_privilege('anon','public.dzg_leaderboard()','execute')
  and has_function_privilege('authenticated','public.dzg_leaderboard()','execute')
union all select 'RPCs use fixed empty search paths',
  (select count(*)=2 from pg_proc where oid in (
    'public.dzg_submit_score(uuid,text,integer,integer,integer,text)'::regprocedure,
    'public.dzg_leaderboard()'::regprocedure)
    and prosecdef and proconfig @> array['search_path=""'])
union all select 'Highest-score trigger active',
  exists (select 1 from pg_trigger where tgname='dzg_monotonic_best'
    and tgrelid='dazougu_private.player_bests'::regclass and tgenabled='O')
union all select 'Submission deduplication primary key exists',
  exists (select 1 from pg_constraint where conrelid='dazougu_private.score_submissions'::regclass and contype='p')
union all select 'Only authenticated players can save wishes',
  has_function_privilege('authenticated','public.dzg_save_wish(text)','execute')
  and not has_function_privilege('anon','public.dzg_save_wish(text)','execute')
union all select 'Wish length constrained in database',
  exists (select 1 from pg_constraint where conrelid='dazougu_private.player_bests'::regclass and conname='dzg_wish_length')
union all select 'New exposed APIs are invokers with fixed search paths',
  (select count(*)=2 from pg_proc where oid in ('public.dzg_save_wish(text)'::regprocedure,
    'public.dzg_leaderboard_page(integer)'::regprocedure) and not prosecdef and proconfig @> array['search_path=""']);
