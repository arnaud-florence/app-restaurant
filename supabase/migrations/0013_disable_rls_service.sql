-- ============================================================
-- 0013 — Fix RLS sur sessions_caisse + paiements_caisse
-- ============================================================
-- 6e occurrence du pattern : Supabase ré-active RLS sur les tables
-- nouvellement créées via SQL Editor. Idempotent.
-- ============================================================

alter table sessions_caisse  disable row level security;
alter table paiements_caisse disable row level security;

-- Diagnostic
select
  c.relname as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('sessions_caisse', 'paiements_caisse')
 order by c.relname;
