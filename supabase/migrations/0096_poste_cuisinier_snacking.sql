-- Ajoute le poste 'cuisinier_snacking' aux postes valides côté formation.
-- Distinct de 'snack' (encaissement comptoir/borne) : ici c'est la PRÉPARATION
-- snacking (burgers, tacos, paninis) — accès recettes/stock/réception filtrés SNACKING.

alter table guides_formation drop constraint if exists guides_formation_poste_check;

alter table guides_formation
  add constraint guides_formation_poste_check
  check (poste in (
    'gerant', 'manager',
    'second', 'cuisinier', 'cuisine',
    'pizzaiolo',
    'serveur', 'salle',
    'barman', 'bar',
    'receptionniste',
    'plonge', 'extra',
    'autre', 'tous',
    'snack',
    'livreur',
    'cuisinier_snacking'
  ));

do $$
begin
  raise notice 'guides_formation.poste check étendu (18 valeurs) — cuisinier_snacking ajouté';
end $$;
