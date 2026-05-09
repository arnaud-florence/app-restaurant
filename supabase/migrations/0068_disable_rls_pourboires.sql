-- Patch — Supabase a auto-réactivé la RLS sur les tables pourboires
-- (pattern récurrent — idem 0040, 0044, 0048, 0050, 0057, 0060, 0062, 0064, 0068…).

alter table pourboires_distribution        disable row level security;
alter table pourboires_distribution_lignes disable row level security;

do $$
declare a text; b text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into a from pg_class where relname='pourboires_distribution';
  select case when relrowsecurity then 'ON' else 'OFF' end into b from pg_class where relname='pourboires_distribution_lignes';
  raise notice 'pourboires RLS — distribution=% lignes=%', a, b;
end $$;
