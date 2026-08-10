-- ════════════════════════════════════════════════════════════════════
-- M6 — Stocks séparés par activité (stocks_etablissement)
-- ════════════════════════════════════════════════════════════════════
-- PRÉPARÉ, NON ACTIVÉ. Externalise la quantité de stock par établissement
-- (aujourd'hui valeur unique sur `ingredients`). Le référentiel ingrédient
-- reste PARTAGÉ ; seules les quantités physiques sont par établissement.
--
-- Backfill : le stock global actuel devient celui de l'établissement principal.
-- Le 2ᵉ établissement (fournil) démarre à 0 et se remplira à ses réceptions.
--
-- ⚠️ ACTIVATION : après exécution, le code applicatif (Module 7) devra lire/écrire
-- stocks_etablissement[ingredient, etablissement] au lieu de ingredients.stock_actuel.
-- Tant que ce n'est pas câblé, cette table coexiste sans rien casser.
--
-- À exécuter à l'activation (après 0088). Idempotent.
-- ════════════════════════════════════════════════════════════════════

create table if not exists stocks_etablissement (
  id                uuid primary key default gen_random_uuid(),
  ingredient_id     uuid not null references ingredients(id) on delete cascade,
  etablissement_id  uuid not null references etablissements(id) on delete cascade,
  stock_actuel      numeric not null default 0,
  stock_minimum     numeric not null default 0,
  stock_maximum     numeric not null default 0,
  updated_at        timestamptz not null default now(),
  unique (ingredient_id, etablissement_id)
);

create index if not exists idx_stocks_etab_ingredient on stocks_etablissement(ingredient_id);
create index if not exists idx_stocks_etab_etab        on stocks_etablissement(etablissement_id);

-- Backfill : stock global → établissement principal
insert into stocks_etablissement (ingredient_id, etablissement_id, stock_actuel, stock_minimum, stock_maximum)
select i.id,
       (select id from etablissements where is_principal = true limit 1),
       coalesce(i.stock_actuel, 0),
       coalesce(i.stock_minimum, 0),
       coalesce(i.stock_maximum, 0)
from ingredients i
where exists (select 1 from etablissements where is_principal = true)
on conflict (ingredient_id, etablissement_id) do nothing;

alter table stocks_etablissement disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb_lignes int; nb_ing int; rls text;
begin
  select count(*) into nb_lignes from stocks_etablissement;
  select count(*) into nb_ing from ingredients;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls
    from pg_class where relname = 'stocks_etablissement';
  raise notice 'M6 stocks_etablissement — % ligne(s) pour % ingrédient(s) | RLS=%',
    nb_lignes, nb_ing, rls;
end $$;
