-- 0105 — Patch : redésactiver la RLS sur `propositions`.
-- Le SQL Editor Supabase réactive la RLS automatiquement après création d'une
-- table (gotcha connu du projet, observé 6+ fois). On la redésactive dans une
-- exécution séparée (sans CREATE TABLE → ça tient).
alter table public.propositions disable row level security;

-- Diagnostic : doit renvoyer false.
select relrowsecurity as rls_active from pg_class where relname = 'propositions';
