-- ============================================================
-- 0029 — Module 18 : Gestion des déchets (/admin/dechets)
-- ============================================================
-- Réutilise suivi_dechets (Module 1 init) pour les pesées internes.
-- Ajoute :
--   1. collectes_dechets   — enlèvements par prestataire avec BSD
--   2. Disable RLS
--
-- BSD = Bordereau de Suivi des Déchets (obligatoire pour biodéchets
-- > 5 kg/semaine, conservation 5 ans).
-- ============================================================

create table if not exists collectes_dechets (
  id              uuid primary key default gen_random_uuid(),
  type_dechet     text not null check (type_dechet in ('biodechet','carton','verre','plastique','huile','metal','dasri','autre')),
  date_collecte   date not null default current_date,
  prestataire     text not null,
  poids_total_kg  decimal(10,2),
  num_bsd         text,                              -- numéro Bordereau de Suivi des Déchets
  cout_collecte   decimal(10,2),
  document_url    text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_collectes_date     on collectes_dechets(date_collecte desc);
create index if not exists idx_collectes_type     on collectes_dechets(type_dechet, date_collecte desc);
create index if not exists idx_collectes_bsd      on collectes_dechets(num_bsd) where num_bsd is not null;

alter table collectes_dechets disable row level security;
alter table suivi_dechets     disable row level security;  -- au cas où

-- Diagnostic
select
  (select count(*) from collectes_dechets) as nb_collectes,
  (select count(*) from suivi_dechets)     as nb_pesees;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('collectes_dechets','suivi_dechets')
 order by c.relname;
