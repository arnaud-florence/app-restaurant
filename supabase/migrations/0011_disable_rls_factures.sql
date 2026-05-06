-- ============================================================
-- 0011 — Fix RLS sur factures_fournisseurs
-- ============================================================
-- Pattern Supabase récurrent : RLS ré-activée sur les tables
-- nouvellement créées via SQL Editor, malgré notre `disable` en 0010.
-- Idempotent.
-- ============================================================

alter table factures_fournisseurs disable row level security;

-- Diagnostic
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'factures_fournisseurs';
