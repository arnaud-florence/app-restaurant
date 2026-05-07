-- ============================================================
-- 0028 — Fix RLS Module 17 (13e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table accidents_travail        disable row level security;
alter table affichages_verifications disable row level security;
alter table obligations_legales      disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('accidents_travail','affichages_verifications','obligations_legales')
 order by c.relname;
