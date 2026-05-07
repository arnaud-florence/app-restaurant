-- ============================================================
-- 0030 — Fix RLS Module 18 (14e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table collectes_dechets disable row level security;
alter table suivi_dechets     disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('collectes_dechets','suivi_dechets');
