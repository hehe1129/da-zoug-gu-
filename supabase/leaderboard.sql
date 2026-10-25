-- Run the complete file in your own Supabase project's SQL Editor.
-- No keys are required here. Re-running does not delete player data.
begin;
create schema if not exists dazougu_private;
revoke all on schema dazougu_private from public, anon, authenticated;

create table if not exists dazougu_private.player_bests (
  player_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 12 and nickname !~ '^[[:space:]]*$' and nickname !~ '[[:cntrl:]]'),
  best_score integer not null check (best_score between 0 and 17800 and best_score % 10 = 0),
  achieved_at timestamptz not null default clock_timestamp()
);
create index if not exists dzg_score_order on dazougu_private.player_bests (best_score desc, achieved_at, player_id);
create table if not exists dazougu_private.score_submissions (
  player_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  score integer not null check (score between 0 and 17800 and score % 10 = 0),
  hits integer not null check (hits between 0 and 445),
  perfects integer not null check (perfects between 0 and hits),
  chart_revision text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (player_id, run_id)
);
revoke all on all tables in schema dazougu_private from public, anon, authenticated;
alter table dazougu_private.player_bests enable row level security;
alter table dazougu_private.score_submissions enable row level security;
-- Defense in depth: the API has no direct table grants or private-schema access.
-- The only write RPC derives the owner from the verified JWT, never a parameter.
drop policy if exists dzg_own_best on dazougu_private.player_bests;
create policy dzg_own_best on dazougu_private.player_bests for all to authenticated
  using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);
drop policy if exists dzg_own_receipt on dazougu_private.score_submissions;
create policy dzg_own_receipt on dazougu_private.score_submissions for all to authenticated
  using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);

create or replace function dazougu_private.keep_best_monotonic()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.player_id <> old.player_id or new.best_score < old.best_score then
    raise exception 'Best scores cannot decrease or change owners' using errcode = '23514';
  end if;
  new.achieved_at := case when new.best_score > old.best_score then clock_timestamp() else old.achieved_at end;
  return new;
end;
$$;
revoke all on function dazougu_private.keep_best_monotonic() from public, anon, authenticated;
drop trigger if exists dzg_monotonic_best on dazougu_private.player_bests;
create trigger dzg_monotonic_best before update on dazougu_private.player_bests
for each row execute function dazougu_private.keep_best_monotonic();

create or replace function public.dzg_submit_score(
  p_run_id uuid, p_nickname text, p_score integer, p_hits integer,
  p_perfects integer, p_chart_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  clean_name text;
  previous_score integer;
  final_score integer;
  receipt dazougu_private.score_submissions%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Match the browser's 12-codepoint nickname limit. Strip invisible control
  -- characters and normalize whitespace; duplicate names are intentionally OK.
  clean_name := pg_catalog.regexp_replace(coalesce(p_nickname,''), U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]', '', 'g');
  clean_name := pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.translate(clean_name, pg_catalog.chr(160)||pg_catalog.chr(12288),'  '), '[[:space:]]+', ' ', 'g'));
  if pg_catalog.char_length(clean_name) not between 1 and 12 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'Nickname must contain 1 to 12 characters' using errcode = '22023';
  end if;
  if p_run_id is null or p_chart_revision is distinct from 'v25-attack-calibration-1'
    or p_score is null or p_hits is null or p_perfects is null
    or p_hits not between 0 and 445 or p_perfects not between 0 and p_hits
    or p_score not between 0 and 17800 or p_score % 10 <> 0
    or p_score < 10*p_hits + 10*p_perfects or p_score > 40*p_hits then
    raise exception 'Invalid score for this chart revision' using errcode = '22023';
  end if;
  -- Serialize this player's competing tabs/retries inside the transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into receipt from dazougu_private.score_submissions
    where player_id = owner_id and run_id = p_run_id;
  if found then
    if receipt.score <> p_score or receipt.hits <> p_hits or receipt.perfects <> p_perfects
      or receipt.chart_revision <> p_chart_revision then
      raise exception 'Run ID already used for different results' using errcode = '22023';
    end if;
    select best_score into final_score from dazougu_private.player_bests where player_id = owner_id;
    return pg_catalog.jsonb_build_object('best_score',final_score,'improved',false,'duplicate',true);
  end if;
  select best_score into previous_score from dazougu_private.player_bests where player_id = owner_id;
  insert into dazougu_private.player_bests (player_id,nickname,best_score)
    values (owner_id,clean_name,p_score)
    on conflict (player_id) do update set best_score=excluded.best_score,nickname=excluded.nickname
    where excluded.best_score > dazougu_private.player_bests.best_score;
  insert into dazougu_private.score_submissions (player_id,run_id,score,hits,perfects,chart_revision)
    values (owner_id,p_run_id,p_score,p_hits,p_perfects,p_chart_revision);
  select best_score into final_score from dazougu_private.player_bests where player_id = owner_id;
  return pg_catalog.jsonb_build_object('best_score',final_score,'improved',previous_score is null or final_score > previous_score,'duplicate',false);
end;
$$;
revoke all on function public.dzg_submit_score(uuid,text,integer,integer,integer,text) from public, anon;
grant execute on function public.dzg_submit_score(uuid,text,integer,integer,integer,text) to authenticated;

-- Only this projection is public: no auth IDs, JWTs, timestamps or run receipts.
create or replace function public.dzg_leaderboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  with ranked as (
    select row_number() over (order by best_score desc,achieved_at,player_id) as rank,
      nickname,best_score,player_id = (select auth.uid()) as is_current
    from dazougu_private.player_bests
  )
  select pg_catalog.jsonb_build_object(
    'entries',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank',rank,'nickname',nickname,'best_score',best_score,'is_current',coalesce(is_current,false)) order by rank)
      from ranked where rank <= 50),'[]'::jsonb),
    'current_player',(select pg_catalog.jsonb_build_object(
      'rank',rank,'nickname',nickname,'best_score',best_score,'is_current',true)
      from ranked where is_current limit 1)
  );
$$;
revoke all on function public.dzg_leaderboard() from public;
grant execute on function public.dzg_leaderboard() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
