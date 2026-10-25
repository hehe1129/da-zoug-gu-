-- Optional: the Dashboard's "automatic RLS" checkbox creates an internal
-- event-trigger function. Players do not need EXECUTE permission on it.
-- Keep the event trigger and its owner permissions; only revoke API-role calls.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='rls_auto_enable' and p.pronargs=0
    and p.prorettype='pg_catalog.event_trigger'::regtype) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
