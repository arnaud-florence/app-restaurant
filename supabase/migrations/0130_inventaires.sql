-- ════════════════════════════════════════════════════════════════════
-- 0130 — Inventaires hebdomadaires (stock compté, achat-revente)
-- ════════════════════════════════════════════════════════════════════
-- Le Fournil compte son stock chaque semaine : congélateurs, réserve,
-- frigo boissons. Une ligne par produit et par date d'inventaire.
--
-- Même philosophie que les invendus (0129) :
--   · upsert par (date, produit) — repasser corrige, ne duplique pas ;
--   · cout_unitaire_ht FIGÉ à la saisie → le stock est VALORISÉ au tarif
--     du jour du comptage (l'inventaire comptable de fin de mois est là) ;
--   · quantité 0 = ligne supprimée, pas un zéro stocké.
--
-- Ce que deux inventaires successifs débloquent (calculé à la lecture,
-- jamais stocké) : consommation réelle = stock N-1 + achats − stock N,
-- à comparer aux ventes de la période → l'écart, c'est la démarque
-- (casse non comptée, erreurs, coulage).
-- ════════════════════════════════════════════════════════════════════

create table if not exists inventaires (
  id               uuid primary key default gen_random_uuid(),
  date_inventaire  date not null default current_date,
  recette_id       uuid not null references recettes(id) on delete cascade,
  quantite         decimal(10,2) not null default 0,
  cout_unitaire_ht decimal(10,4),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (date_inventaire, recette_id)
);

create index if not exists idx_inventaires_date on inventaires(date_inventaire desc);

alter table inventaires disable row level security;

do $$
declare nb int;
begin
  select count(*) into nb from inventaires;
  raise notice '── inventaires : % ligne(s) ──', nb;
end $$;
