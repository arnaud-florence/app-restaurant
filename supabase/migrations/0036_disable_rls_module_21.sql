-- ============================================================
-- 0036 — Fix RLS Module 21 (17e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table reservations_tables    disable row level security;
alter table evenements             disable row level security;
alter table chambres               disable row level security;
alter table reservations_chambres  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('chambres','reservations_chambres','reservations_tables','evenements');
