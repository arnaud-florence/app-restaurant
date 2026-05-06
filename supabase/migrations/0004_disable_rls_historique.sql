-- ============================================================
-- 0004 — Fix RLS sur historique_prix_ingredients
-- ============================================================
-- Supabase ré-active RLS par défaut sur les tables créées via le SQL
-- Editor — la commande `disable` de la 0003 est écrasée. On la repasse
-- ici (idempotent), avec diagnostic en sortie.
-- ============================================================

alter table historique_prix_ingredients disable row level security;

-- Diagnostic : confirme l'état RLS de toutes les tables du module
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('ingredients', 'historique_prix_ingredients')
 order by c.relname;
