-- ============================================================
-- 0015 — Fix RLS sur les 4 tables du Module 10
-- ============================================================
-- 7e occurrence du pattern : Supabase ré-active RLS sur les tables
-- créées via SQL Editor (SELECT marche en anon mais INSERT renvoie
-- 42501 "new row violates row-level security policy").
-- Idempotent.
-- ============================================================

alter table messages         disable row level security;
alter table affichage_infos  disable row level security;
alter table comptes_rendus   disable row level security;
alter table materiels        disable row level security;

-- Diagnostic
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('messages','affichage_infos','comptes_rendus','materiels')
 order by c.relname;
