-- ============================================================
-- 0019 — Fix RLS Module 12 (procedures_urgence + tables ALTERed)
-- ============================================================
-- 9e occurrence du pattern Supabase. Idempotent.
-- ============================================================

alter table procedures_urgence  disable row level security;
alter table recettes            disable row level security;
alter table commande_articles   disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('procedures_urgence','recettes','commande_articles')
 order by c.relname;
