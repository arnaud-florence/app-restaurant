-- ============================================================
-- 0021 — Fix RLS Module 13 (10e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table documents_employes  disable row level security;
alter table formations_employes disable row level security;
alter table employes            disable row level security;
alter table planning            disable row level security;
alter table pointage            disable row level security;
alter table conges              disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('documents_employes','formations_employes','employes','planning','pointage','conges')
 order by c.relname;
