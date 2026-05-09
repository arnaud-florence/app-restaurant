-- ============================================================
-- Migration 0076 — Zone SNACKING distincte de CUISINE
-- ============================================================
-- Le restaurant a plusieurs cuisines physiquement séparées avec
-- staffs différents :
--   - CUISINE   : restauration sur place (carte complète, plats du chef)
--   - SNACKING  : snacking emporter / livraison ONLINE (burgers, salades, sandwichs)
--   - PIZZA     : four à pizza (séparé)
--   - BAR       : boissons + cocktails (séparé)
--
-- Online (outil 2 futur) ne vendra QUE : SNACKING + PIZZA + BAR
-- (pas de restauration sur place en ligne — réservation table à la place)
--
-- Inclus :
--  1. Étend tag_destination sur recettes (SNACKING ajouté)
--  2. Étend tag_destination sur commande_articles
--  3. Ajoute tag_destination sur capacite_cuisine_par_creneau pour
--     paramétrer une capacité différente par zone (SNACKING ≠ PIZZA)
-- ============================================================

-- ─── 1. Étend les tags de destination sur recettes ────────────
-- Cherche et drop la contrainte existante (peut être nommée différemment)
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'recettes'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tag_destination%';
  if c_name is not null then
    execute format('alter table recettes drop constraint %I', c_name);
  end if;
end$$;

alter table recettes add constraint recettes_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));


-- ─── 2. Idem sur commande_articles ────────────────────────────
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'commande_articles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tag_destination%';
  if c_name is not null then
    execute format('alter table commande_articles drop constraint %I', c_name);
  end if;
end$$;

alter table commande_articles add constraint commande_articles_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));


-- ─── 3. Capacité cuisine par zone ─────────────────────────────
-- Permet de définir une capacité distincte pour SNACKING vs PIZZA vs BAR.
-- Default = SNACKING (la zone la plus concernée par les commandes ONLINE).
alter table capacite_cuisine_par_creneau
  add column if not exists tag_destination text default 'SNACKING';

alter table capacite_cuisine_par_creneau
  drop constraint if exists capacite_tag_destination_check;
alter table capacite_cuisine_par_creneau
  add constraint capacite_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));

-- Si des créneaux existent déjà sans tag, on les met sur SNACKING
update capacite_cuisine_par_creneau
set tag_destination = 'SNACKING'
where tag_destination is null;

create index if not exists idx_capacite_tag on capacite_cuisine_par_creneau(tag_destination, jour_semaine, actif);


-- ─── Diagnostic ───────────────────────────────────────────────
select
  'Migration 0076 OK' as status,
  (select count(*) from recettes where tag_destination = 'CUISINE')  as nb_cuisine,
  (select count(*) from recettes where tag_destination = 'SNACKING') as nb_snacking,
  (select count(*) from recettes where tag_destination = 'PIZZA')    as nb_pizza,
  (select count(*) from recettes where tag_destination = 'BAR')      as nb_bar,
  (select count(*) from capacite_cuisine_par_creneau)                as nb_creneaux_capacite;
