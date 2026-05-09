-- Patch — RLS auto-réactivée sur charges_variables + seed bloqué
-- (pattern récurrent avec Supabase).

alter table charges_variables disable row level security;

-- Re-seed les 2 lignes auto par défaut (bloquées par RLS lors du 0063)
insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'food_cost', 'Coût matières (auto food cost)', 'auto', null,
       'Calculé automatiquement depuis food_cost_total des recettes vendues sur 30 jours'
where not exists (select 1 from charges_variables where type = 'food_cost');

insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'commissions_cb', 'Commissions bancaires (auto)', 'auto', null,
       'Calculé : 1,5% × part du CA réglée par carte sur 30 jours'
where not exists (select 1 from charges_variables where type = 'commissions_cb');

do $$
declare rls text; n int;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into rls
  from pg_class
  where relname = 'charges_variables';
  select count(*) into n from charges_variables;
  raise notice 'charges_variables RLS=% · % lignes seed', rls, n;
end $$;
