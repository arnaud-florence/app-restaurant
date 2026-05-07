-- ============================================================
-- 0017 — Fix RLS sur les 5 nouvelles tables du Module 11
-- ============================================================
-- 8e occurrence du pattern Supabase. Idempotent.
-- ============================================================

alter table plans_haccp                   disable row level security;
alter table lots_produits                 disable row level security;
alter table non_conformites               disable row level security;
alter table interventions_antiparasitaire disable row level security;
alter table plan_nettoyage                disable row level security;

-- Diagnostic
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (
     'plans_haccp','lots_produits','non_conformites',
     'interventions_antiparasitaire','plan_nettoyage'
   )
 order by c.relname;
