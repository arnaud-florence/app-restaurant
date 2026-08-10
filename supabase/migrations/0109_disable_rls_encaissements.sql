-- 0109 — Patch RLS : Supabase ré-active RLS sur les tables créées via SQL Editor
-- (cf. CLAUDE.md). On la désactive en patch séparé, exécuté APRÈS 0108.
alter table encaissements_externes disable row level security;

do $$
declare r boolean;
begin
  select relrowsecurity into r from pg_class where relname = 'encaissements_externes';
  raise notice 'encaissements_externes RLS=% (doit être false)', r;
end $$;
