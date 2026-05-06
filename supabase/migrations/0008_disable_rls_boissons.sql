-- ============================================================
-- 0008 — Fix RLS sur boissons + accords_mets_boissons
-- ============================================================
-- Supabase ré-active RLS par défaut sur les tables créées via
-- l'éditeur SQL — même pattern que 0002 et 0004. La 0007 contient
-- bien `disable row level security` mais Supabase l'écrase après.
-- Sans policy, le SELECT anon renvoie 0 lignes (sans erreur) et
-- l'INSERT échoue avec "row-level security policy".
--
-- Idempotent.
-- ============================================================

alter table boissons              disable row level security;
alter table accords_mets_boissons disable row level security;

-- Diagnostic
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('boissons', 'accords_mets_boissons')
 order by c.relname;
