-- ════════════════════════════════════════════════════════════════════
-- 0134 — Unicité d'inventaire sur une cible unique (correctif de la 0133)
-- ════════════════════════════════════════════════════════════════════
-- La 0133 a remplacé la contrainte unique par DEUX index partiels
-- (un par type de cible). PostgREST ne sait pas s'en servir :
--   « there is no unique or exclusion constraint matching the
--     ON CONFLICT specification »
-- — tout upsert d'inventaire échouait.
--
-- Un ON CONFLICT ne peut viser qu'un index TOTAL. D'où `cible_id`, colonne
-- générée = coalesce(recette_id, ingredient_id) : une seule colonne à
-- contraindre, un seul index, un seul upsert quel que soit le type de ligne.
-- Le CHECK de la 0133 garantit qu'exactement l'une des deux est renseignée,
-- donc `cible_id` n'est jamais nulle.
-- ════════════════════════════════════════════════════════════════════

alter table inventaires
  add column if not exists cible_id uuid
  generated always as (coalesce(recette_id, ingredient_id)) stored;

drop index if exists uniq_inventaire_recette;
drop index if exists uniq_inventaire_ingredient;

create unique index if not exists uniq_inventaire_cible
  on inventaires(date_inventaire, cible_id);

do $$
declare nb int;
begin
  select count(*) into nb from pg_indexes
   where tablename = 'inventaires' and indexname = 'uniq_inventaire_cible';
  raise notice '── index unique sur (date, cible) : % ──',
    case when nb = 1 then 'en place' else 'ABSENT' end;
end $$;
