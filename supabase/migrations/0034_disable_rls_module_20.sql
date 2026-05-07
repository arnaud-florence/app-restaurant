-- ============================================================
-- 0034 — Fix RLS Module 20 (16e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table campagnes      disable row level security;
alter table reclamations   disable row level security;
alter table retours_plats  disable row level security;
alter table clients        disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('clients','campagnes','reclamations','retours_plats');
