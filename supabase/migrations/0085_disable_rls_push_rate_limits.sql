-- Patch : Supabase réactive RLS automatiquement après création de table via
-- SQL Editor, même si la migration 0084 contenait le ALTER ... DISABLE.
-- Gotcha connu (cf. CLAUDE.md §8).

alter table push_rate_limits disable row level security;

select
  'RLS désactivé sur push_rate_limits' as status,
  (select relrowsecurity from pg_class where relname = 'push_rate_limits') as rls_active;
