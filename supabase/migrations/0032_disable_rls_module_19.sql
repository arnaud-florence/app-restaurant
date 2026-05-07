-- ============================================================
-- 0032 — Fix RLS Module 19 (15e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table groupes            disable row level security;
alter table groupes_menus      disable row level security;
alter table groupes_paiements  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('groupes','groupes_menus','groupes_paiements');
