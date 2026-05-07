-- Patch RLS au cas où Supabase l'aurait ré-activée après l'ALTER TABLE.
alter table profils disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls from pg_class where relname='profils';
  raise notice 'RLS post-patch profils=%', rls;
end $$;
