-- Patch — Supabase a auto-réactivé la RLS sur notifications.

alter table notifications disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls
  from pg_class where relname = 'notifications';
  raise notice 'notifications RLS = %', rls;
end $$;
