-- ════════════════════════════════════════════════════════════════════
-- 0129 — Invendus du soir
-- ════════════════════════════════════════════════════════════════════
-- Le food cost calculé sur les factures ignore la casse : un croissant jeté
-- coûte exactement autant qu'un croissant vendu, mais n'apparaissait nulle
-- part. Sans cette mesure, impossible de connaître la marge RÉELLE ni de
-- régler les commandes fournisseur (« je jette 4 croissants par jour »
-- = commander un demi-carton de moins).
--
-- Saisie : comptage par produit à la fermeture (pas une pesée — en
-- achat-revente, on compte des pièces). Une ligne par produit et par jour,
-- upsert : repasser corrige, ne duplique pas.
--
-- `cout_unitaire_ht` est FIGÉ au moment de la saisie : le coût du jour où
-- le produit a été jeté, même si le tarif fournisseur change ensuite —
-- l'historique de casse reste valorisé au prix de l'époque.
-- ════════════════════════════════════════════════════════════════════

create table if not exists invendus (
  id               uuid primary key default gen_random_uuid(),
  date_invendu     date not null default current_date,
  recette_id       uuid not null references recettes(id) on delete cascade,
  quantite         decimal(10,2) not null default 0,
  cout_unitaire_ht decimal(10,4),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (date_invendu, recette_id)
);

create index if not exists idx_invendus_date on invendus(date_invendu desc);

alter table invendus disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int;
begin
  select count(*) into nb from invendus;
  raise notice '── invendus : % ligne(s) ──', nb;
  raise notice '── RLS : % ──',
    (select case when relrowsecurity then 'ACTIVE (anomalie)' else 'désactivée (ok)' end
       from pg_class where relname = 'invendus');
end $$;
