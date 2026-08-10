-- ════════════════════════════════════════════════════════════════════
-- 0094 — Patch : désactiver la RLS sur commissions_tiers
-- ════════════════════════════════════════════════════════════════════
-- Supabase ré-active automatiquement la RLS sur les tables créées via le
-- SQL Editor (gotcha documenté). Avec RLS ON + aucune policy : les lectures
-- renvoient vide, les inserts sont bloqués (code 42501). Single-tenant → RLS OFF.
-- À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

alter table commissions_tiers disable row level security;

-- Diagnostic
do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON (PROBLÈME)' else 'OFF (OK)' end into rls
    from pg_class where relname = 'commissions_tiers';
  raise notice 'commissions_tiers — RLS = %', rls;
end $$;
