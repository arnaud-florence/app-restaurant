-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table objectifs           disable row level security;
alter table actions_strategiques disable row level security;

do $$
declare rls_obj text; rls_act text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_obj from pg_class where relname='objectifs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_act from pg_class where relname='actions_strategiques';
  raise notice 'RLS post-patch — obj=% act=%', rls_obj, rls_act;
end $$;
