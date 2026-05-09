-- Patch — Supabase a auto-réactivé la RLS sur les 4 nouvelles tables challenges.
-- Pattern récurrent (idem migrations 0040, 0044, 0048, 0050, 0057…).

alter table config_economique     disable row level security;
alter table point_mort_mensuel    disable row level security;
alter table challenges            disable row level security;
alter table challenges_resultats  disable row level security;

-- Seed config_economique si vide (le seed dans 0058 a probablement été bloqué par la RLS)
insert into config_economique (smic_horaire_brut, pct_redistribution_surplus, notes)
select 11.65, 30.00, 'Configuration initiale — SMIC 2026 + 30% redistribution'
where not exists (select 1 from config_economique);

do $$
declare a text; b text; c text; d text; n int;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into a from pg_class where relname='config_economique';
  select case when relrowsecurity then 'ON' else 'OFF' end into b from pg_class where relname='point_mort_mensuel';
  select case when relrowsecurity then 'ON' else 'OFF' end into c from pg_class where relname='challenges';
  select case when relrowsecurity then 'ON' else 'OFF' end into d from pg_class where relname='challenges_resultats';
  select count(*) into n from config_economique;
  raise notice 'RLS — config_economique=% point_mort=% challenges=% resultats=% | seed config: % ligne(s)', a, b, c, d, n;
end $$;
