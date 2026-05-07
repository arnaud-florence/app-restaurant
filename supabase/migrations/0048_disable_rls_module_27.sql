-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table guides_formation       disable row level security;
alter table etapes_formation       disable row level security;
alter table quiz_questions         disable row level security;
alter table progressions_formation disable row level security;

do $$
declare rls_g text; rls_e text; rls_q text; rls_p text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_g from pg_class where relname='guides_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_e from pg_class where relname='etapes_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_q from pg_class where relname='quiz_questions';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='progressions_formation';
  raise notice 'RLS post-patch — g=% e=% q=% p=%', rls_g, rls_e, rls_q, rls_p;
end $$;
