-- Additive upgrade: existing scores, wishes, owners and timestamps are untouched.
begin;
create table dazougu_private.v35_player_bests_snapshot as select * from dazougu_private.player_bests;
create table dazougu_private.v35_score_submissions_snapshot as select * from dazougu_private.score_submissions;
alter table dazougu_private.v35_player_bests_snapshot enable row level security;
alter table dazougu_private.v35_score_submissions_snapshot enable row level security;
revoke all on dazougu_private.v35_player_bests_snapshot,dazougu_private.v35_score_submissions_snapshot from public,anon,authenticated;

create table dazougu_private.legacy_account_reservations(
 player_id uuid primary key, reserved_username text not null, snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
insert into dazougu_private.legacy_account_reservations(player_id,reserved_username,snapshot)
 select player_id,nickname,to_jsonb(b) from dazougu_private.player_bests b where nickname in ('曹多轩','童文静');
alter table dazougu_private.legacy_account_reservations enable row level security;
revoke all on dazougu_private.legacy_account_reservations from public,anon,authenticated;

-- Passwords are managed ONLY by Supabase Auth, never in these application tables.
create table dazougu_private.game_accounts(
 username_key text primary key check(username_key=lower(username_key)),
 username text not null check(char_length(username) between 2 and 12 and username ~ '^[A-Za-z0-9_一-鿿]+$'),
 display_name text not null check(char_length(display_name) between 1 and 12 and display_name !~ '[[:cntrl:]]'),
 auth_email text not null unique, player_id uuid unique references auth.users(id) on delete restrict,
 registration_nonce uuid not null unique, created_at timestamptz not null default clock_timestamp()
);
create table dazougu_private.account_rate_limits(
 bucket text primary key, attempts integer not null, expires_at timestamptz not null
);
alter table dazougu_private.game_accounts enable row level security;
alter table dazougu_private.account_rate_limits enable row level security;
revoke all on dazougu_private.game_accounts,dazougu_private.account_rate_limits from public,anon,authenticated;

create function dazougu_private.account_service(p_action text,p_username text,p_nonce uuid default null,p_email text default null,p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text:=lower(btrim(p_username)); a dazougu_private.game_accounts%rowtype;
begin
 if char_length(p_username) not between 2 and 12 or p_username !~ '^[A-Za-z0-9_一-鿿]+$' then raise exception 'invalid_username' using errcode='22023';end if;
 if p_action='lookup' then
  select * into a from dazougu_private.game_accounts where username_key=k and player_id is not null;
  if not found then return null;end if;
  return jsonb_build_object('player_id',a.player_id,'auth_email',a.auth_email,'username',a.username,'display_name',a.display_name);
 elsif p_action='reserve' then
  if p_nonce is null or p_email is null or p_email !~ '^[a-f0-9-]+@players[.]yiguzuoqi[.]invalid$' then raise exception 'invalid_registration' using errcode='22023';end if;
  if exists(select 1 from dazougu_private.legacy_account_reservations where lower(reserved_username)=k) then raise exception 'username_reserved' using errcode='23505';end if;
  -- A crashed, never-finalized registration can be retried after 15 minutes.
  delete from dazougu_private.game_accounts where username_key=k and player_id is null and created_at<clock_timestamp()-interval '15 minutes';
  insert into dazougu_private.game_accounts(username_key,username,display_name,auth_email,registration_nonce) values(k,p_username,p_username,p_email,p_nonce);
  return jsonb_build_object('reserved',true);
 elsif p_action='finalize' then
  if p_player_id is null or exists(select 1 from dazougu_private.legacy_account_reservations where player_id=p_player_id) then raise exception 'legacy_binding_requires_admin' using errcode='42501';end if;
  update dazougu_private.game_accounts set player_id=p_player_id where username_key=k and registration_nonce=p_nonce and player_id is null returning * into a;
  if not found then raise exception 'registration_not_owned' using errcode='42501';end if;
  return jsonb_build_object('username',a.username,'display_name',a.display_name);
 elsif p_action='cancel' then
  delete from dazougu_private.game_accounts where username_key=k and registration_nonce=p_nonce and player_id is null;
  return jsonb_build_object('cancelled',true);
 end if;
 raise exception 'invalid_action' using errcode='22023';
end;$$;
revoke all on function dazougu_private.account_service(text,text,uuid,text,uuid) from public,anon,authenticated;
grant usage on schema dazougu_private to service_role;
grant execute on function dazougu_private.account_service(text,text,uuid,text,uuid) to service_role;
create function public.dzg_account_service(p_action text,p_username text,p_nonce uuid default null,p_email text default null,p_player_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select dazougu_private.account_service(p_action,p_username,p_nonce,p_email,p_player_id);$$;
revoke all on function public.dzg_account_service(text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.dzg_account_service(text,text,uuid,text,uuid) to service_role;

create function dazougu_private.account_limit(p_bucket text,p_limit integer,p_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; until_at timestamptz;
begin
 if length(p_bucket)>100 or p_limit not between 1 and 1000 or p_seconds not between 1 and 86400 then raise exception 'invalid_limit';end if;
 delete from dazougu_private.account_rate_limits where expires_at<clock_timestamp()-interval '1 day';
 insert into dazougu_private.account_rate_limits(bucket,attempts,expires_at) values(p_bucket,1,clock_timestamp()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set attempts=case when account_rate_limits.expires_at<=clock_timestamp() then 1 else account_rate_limits.attempts+1 end,
 expires_at=case when account_rate_limits.expires_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>p_seconds) else account_rate_limits.expires_at end
 returning attempts,expires_at into n,until_at;
 return jsonb_build_object('allowed',n<=p_limit,'retry_after',greatest(1,ceil(extract(epoch from until_at-clock_timestamp()))::integer));
end;$$;
revoke all on function dazougu_private.account_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function dazougu_private.account_limit(text,integer,integer) to service_role;
create function public.dzg_account_limit(p_bucket text,p_limit integer,p_seconds integer)
returns jsonb language sql security invoker set search_path='' as $$select dazougu_private.account_limit(p_bucket,p_limit,p_seconds);$$;
revoke all on function public.dzg_account_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.dzg_account_limit(text,integer,integer) to service_role;

create function dazougu_private.account_profile()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('username',a.username,'display_name',a.display_name,'best_score',coalesce(b.best_score,0))
 from dazougu_private.game_accounts a left join dazougu_private.player_bests b on b.player_id=a.player_id where a.player_id=(select auth.uid());
$$;
revoke all on function dazougu_private.account_profile() from public,anon;
grant execute on function dazougu_private.account_profile() to authenticated;
create function public.dzg_account_profile() returns jsonb language sql stable security invoker set search_path='' as $$select dazougu_private.account_profile();$$;
revoke all on function public.dzg_account_profile() from public,anon;
grant execute on function public.dzg_account_profile() to authenticated;

create function dazougu_private.set_display_name(p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); clean text;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 clean:=btrim(regexp_replace(regexp_replace(coalesce(p_name,''),U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]','','g'),'[[:space:]]+',' ','g'));
 if char_length(clean) not between 1 and 12 or clean ~ '[[:cntrl:]]' then raise exception 'invalid_display_name' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 update dazougu_private.game_accounts set display_name=clean where player_id=owner_id;
 update dazougu_private.player_bests set nickname=clean where player_id=owner_id;
 return jsonb_build_object('display_name',clean);
end;$$;
revoke all on function dazougu_private.set_display_name(text) from public,anon;
grant execute on function dazougu_private.set_display_name(text) to authenticated;
create function public.dzg_set_display_name(p_name text) returns jsonb language sql security invoker set search_path='' as $$select dazougu_private.set_display_name(p_name);$$;
revoke all on function public.dzg_set_display_name(text) from public,anon;
grant execute on function public.dzg_set_display_name(text) to authenticated;

-- Existing score RPC and cached older clients stay compatible. Accounts use
-- their own canonical display name even if another device submits an old name.
create function dazougu_private.account_score_name() returns trigger language plpgsql security definer set search_path='' as $$
declare name text;
begin
 select display_name into name from dazougu_private.game_accounts where player_id=new.player_id;
 if found then new.nickname:=name;end if;return new;
end;$$;
revoke all on function dazougu_private.account_score_name() from public,anon,authenticated;
create trigger dzg_account_score_name before insert or update on dazougu_private.player_bests for each row execute function dazougu_private.account_score_name();
notify pgrst,'reload schema';
commit;
