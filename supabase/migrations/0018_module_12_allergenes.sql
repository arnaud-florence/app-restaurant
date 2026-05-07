-- ============================================================
-- 0018 — Module 12 : Allergènes & traçabilité (/admin/allergenes)
-- ============================================================
-- Contenu :
--   1. ALTER recettes          ADD allergenes_complementaires text[]
--      (override manuel : "trace de gluten", contamination croisée)
--   2. ALTER commande_articles ADD allergenes_a_eviter text[]
--      (saisi par le serveur : alerte client allergique)
--   3. CREATE procedures_urgence (allergie/incendie/évacuation/malaise)
--   4. Disable RLS sur procedures_urgence
--
-- La liste finale d'allergènes par plat = union de
--   ingredients.allergenes via recette_ingredients
--   + recettes.allergenes_complementaires
--
-- Idempotent.
-- ============================================================

-- ─── 1. ALTER recettes ──────────────────────────────────────
do $$ begin
  alter table recettes add column if not exists allergenes_complementaires text[] not null default '{}';
exception when duplicate_column then null; end $$;

-- ─── 2. ALTER commande_articles ─────────────────────────────
do $$ begin
  alter table commande_articles add column if not exists allergenes_a_eviter text[] not null default '{}';
exception when duplicate_column then null; end $$;

-- Index pour requêter rapidement les commandes avec allergie
create index if not exists idx_commande_articles_allergie
  on commande_articles using gin (allergenes_a_eviter)
  where array_length(allergenes_a_eviter, 1) > 0;

-- ─── 3. procedures_urgence ──────────────────────────────────
create table if not exists procedures_urgence (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  type        text not null check (type in ('allergie','incendie','evacuation','malaise','intoxication','vol','autre')),
  etapes      text[] not null default '{}',     -- liste ordonnée d'étapes
  contacts    text,                              -- pompiers, médecin, samu...
  ordre       integer not null default 0,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_procedures_urgence_actif on procedures_urgence(type, ordre) where actif = true;

alter table procedures_urgence disable row level security;

-- Disable RLS aussi sur recettes + commande_articles (Supabase pourrait
-- ré-activer après ALTER)
alter table recettes          disable row level security;
alter table commande_articles disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select
  (select count(*) from procedures_urgence)        as nb_proc_urg,
  (select count(*) from recettes
    where array_length(allergenes_complementaires, 1) > 0) as nb_recettes_avec_overrides;

-- Vérif colonnes ajoutées
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'recettes'           and column_name = 'allergenes_complementaires')
     or (table_name = 'commande_articles'  and column_name = 'allergenes_a_eviter'));

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('procedures_urgence','recettes','commande_articles')
 order by c.relname;
