-- Patch : Supabase ré-active RLS automatiquement après création de table via
-- SQL Editor, même si la migration 0082 contenait le ALTER ... DISABLE.
-- (Gotcha connu, cf. CLAUDE.md §8.)

alter table agents_runs    disable row level security;
alter table agent_findings disable row level security;

select
  'RLS désactivé sur agents_runs + agent_findings' as status,
  (select relrowsecurity from pg_class where relname = 'agents_runs')    as rls_agents_runs,
  (select relrowsecurity from pg_class where relname = 'agent_findings') as rls_agent_findings;
