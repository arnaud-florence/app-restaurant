-- Étend la check constraint sur guides_formation.poste pour accepter les
-- nouveaux postes utilisés dans la matrice de permissions :
-- gerant, second, receptionniste, cuisinier, barman, extra (en plus
-- des valeurs historiques cuisine/pizzaiolo/bar/salle/serveur/manager/
-- plonge/autre/tous).

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
    'autre', 'tous'
  ));

do $$
begin
  raise notice 'guides_formation.poste check étendu (15 valeurs autorisées)';
end $$;
