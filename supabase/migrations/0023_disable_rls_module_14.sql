-- ============================================================
-- 0023 — Fix RLS Module 14 (11e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table charges_fixes   disable row level security;
alter table notes_de_frais  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('charges_fixes','notes_de_frais')
 order by c.relname;
