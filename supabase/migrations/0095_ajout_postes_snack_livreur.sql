-- Ajoute les postes 'snack' et 'livreur' aux postes valides côté formation.
-- Module 27 — extension du CHECK constraint sur guides_formation.poste.
--
-- Contexte : la 1ʳᵉ équipe CASATASIA inclut des postes polyvalents
-- (snack au comptoir + borne, livreur via /livreur). Sans cette migration,
-- impossible de seeder les manuels 09-snack.md et 10-livreur.md.

alter table guides_formation drop constraint if exists guides_formation_poste_check;

alter table guides_formation
  add constraint guides_formation_poste_check
  check (poste in (
    -- Valeurs historiques préservées (migration 0053)
    'gerant', 'manager',
    'second', 'cuisinier', 'cuisine',
    'pizzaiolo',
    'serveur', 'salle',
    'barman', 'bar',
    'receptionniste',
    'plonge', 'extra',
    'autre', 'tous',
    -- NOUVEAUX postes Phase B onboarding équipe
    'snack',
    'livreur'
  ));

-- Diagnostic
do $$
declare
  nb_existing int;
begin
  select count(*) into nb_existing from guides_formation;
  raise notice 'guides_formation.poste check étendu (17 valeurs) — % guides existants conservés', nb_existing;
end $$;
