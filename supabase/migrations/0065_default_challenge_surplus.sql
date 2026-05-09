-- Auto-seed du challenge « CA mensuel surplus point mort ».
-- Si aucun challenge restaurant actif sur la métrique ca_surplus_point_mort
-- n'existe, on en crée un en utilisant le % redistribution courant.

insert into challenges (
  titre, description,
  type, poste_concerne,
  metrique, cible_operateur, cible_valeur, cible_unite,
  recompense_type, recompense_montant,
  periode, leaderboard_public, actif
)
select
  'CA mensuel restaurant',
  'Atteindre le point mort + partage du surplus à l''équipe pondéré heures travaillées',
  'restaurant', null,
  'ca_surplus_point_mort', '>=', 0, '€',
  'pct_surplus', coalesce((select pct_redistribution_surplus from config_economique limit 1), 30),
  'mois', false, true
where not exists (
  select 1 from challenges
  where metrique = 'ca_surplus_point_mort' and type = 'restaurant' and actif = true
);

do $$
declare nb int;
begin
  select count(*) into nb from challenges
  where metrique = 'ca_surplus_point_mort' and type = 'restaurant' and actif = true;
  raise notice 'Challenges CA surplus actifs : %', nb;
end $$;
