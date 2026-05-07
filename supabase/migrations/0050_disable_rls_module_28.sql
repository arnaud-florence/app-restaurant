-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table profils    disable row level security;
alter table audit_logs disable row level security;
alter table connexions disable row level security;

do $$
declare rls_p text; rls_a text; rls_c text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='profils';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='audit_logs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_c from pg_class where relname='connexions';
  raise notice 'RLS post-patch — profils=% audit=% connexions=%', rls_p, rls_a, rls_c;
end $$;
