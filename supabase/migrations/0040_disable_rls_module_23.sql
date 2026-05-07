-- ============================================================
-- 0040 — Fix RLS Module 23 (19e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table journal_entrees disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'journal_entrees';
