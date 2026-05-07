-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table menu_du_jour     disable row level security;
alter table affichage_promos disable row level security;
alter table appels_serveur   disable row level security;

do $$
declare rls_m text; rls_p text; rls_a text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_m from pg_class where relname='menu_du_jour';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='affichage_promos';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='appels_serveur';
  raise notice 'RLS post-patch — menu=% promos=% appels=%', rls_m, rls_p, rls_a;
end $$;
