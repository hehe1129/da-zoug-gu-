-- Additive V32 upgrade. Preserves scores and the old API for cached clients.
begin;
alter table dazougu_private.player_bests add column if not exists wish text not null default '';
alter table dazougu_private.player_bests drop constraint if exists dzg_wish_length;
alter table dazougu_private.player_bests add constraint dzg_wish_length
  check (char_length(wish) <= 50 and wish !~ '[[:cntrl:]]');

-- Direct table access stays revoked. This private write derives its owner from
-- auth.uid(), with no target-player parameter and no way to touch a score.
create or replace function dazougu_private.save_wish(p_wish text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); clean_wish text; saved text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_wish is null or pg_catalog.char_length(p_wish)>200 then
    raise exception 'Wish must contain at most 50 characters' using errcode='22023';
  end if;
  clean_wish := pg_catalog.regexp_replace(p_wish, U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]', '', 'g');
  clean_wish := pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.translate(clean_wish,pg_catalog.chr(160)||pg_catalog.chr(12288),'  '),'[[:space:]]+',' ','g'));
  if pg_catalog.char_length(clean_wish)>50 or clean_wish ~ '[[:cntrl:]]' then
    raise exception 'Wish must contain at most 50 characters' using errcode='22023';
  end if;
  update dazougu_private.player_bests set wish=clean_wish where player_id=owner_id returning wish into saved;
  if not found then raise exception 'Play a round first' using errcode='42501'; end if;
  return pg_catalog.jsonb_build_object('wish',saved);
end;
$$;
revoke all on function dazougu_private.save_wish(text) from public,anon;
-- An invoker wrapper limits the exposed schema to a small, explicit API.
grant usage on schema dazougu_private to authenticated;
grant execute on function dazougu_private.save_wish(text) to authenticated;
create or replace function public.dzg_save_wish(p_wish text)
returns jsonb language sql security invoker set search_path = '' as $$
  select dazougu_private.save_wish(p_wish);
$$;
revoke all on function public.dzg_save_wish(text) from public,anon;
grant execute on function public.dzg_save_wish(text) to authenticated;

create or replace function dazougu_private.leaderboard_page(p_page integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ranked as materialized (
    select row_number() over(order by best_score desc,achieved_at,player_id) as rank,
      nickname,best_score,wish,coalesce(player_id=(select auth.uid()),false) as is_current
    from dazougu_private.player_bests
  ), stats as (select count(*) as total from ranked), paging as (
    select total,greatest(1,least(coalesce(p_page,1)::bigint,greatest(1,(total+19)/20))) as page from stats
  )
  select pg_catalog.jsonb_build_object(
    'page',page,'page_size',20,'total',total,
    'entries',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank',rank,'nickname',nickname,'best_score',best_score,'wish',wish,'is_current',is_current) order by rank)
      from ranked where rank>(page-1)*20 and rank<=page*20),'[]'::jsonb),
    'current_player',(select pg_catalog.jsonb_build_object(
      'rank',rank,'nickname',nickname,'best_score',best_score,'wish',wish,'is_current',true)
      from ranked where is_current limit 1)
  ) from paging;
$$;
revoke all on function dazougu_private.leaderboard_page(integer) from public;
grant usage on schema dazougu_private to anon;
grant execute on function dazougu_private.leaderboard_page(integer) to anon,authenticated;
-- No table SELECT/UPDATE grants; public reads expose only rank/name/score/wish.
create or replace function public.dzg_leaderboard_page(p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select dazougu_private.leaderboard_page(p_page);
$$;
revoke all on function public.dzg_leaderboard_page(integer) from public;
grant execute on function public.dzg_leaderboard_page(integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
