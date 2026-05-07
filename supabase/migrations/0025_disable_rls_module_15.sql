-- ============================================================
-- 0025 — Fix RLS Module 15 (12e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table releves_energie disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_energie';
