-- ════════════════════════════════════════════════════════════════════
-- M1 — Multi-établissement : fondation
-- ════════════════════════════════════════════════════════════════════
-- Étend la table `etablissements` (déjà créée en 0074) avec un `type`,
-- et ajoute l'établissement « Fournil ». Additif, idempotent, non-cassant.
--
-- ⚠️ NE SCOPE RIEN ENCORE — le passage de la dimension etablissement_id sur
-- le cœur transactionnel est l'objet de M2 (à exécuter APRÈS validation du
-- cadre juridique 1-vs-2-entités avec l'expert-comptable).
--
-- À exécuter manuellement dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- 1) Colonne `type` (restaurant | fournil | autre)
alter table etablissements
  add column if not exists type text not null default 'restaurant';

do $$
begin
  alter table etablissements
    add constraint etablissements_type_chk check (type in ('restaurant','fournil','autre'));
exception when duplicate_object then null;
end $$;

-- 2) L'établissement principal existant = le restaurant
update etablissements set type = 'restaurant'
where is_principal = true and (type is null or type = '');

-- 3) Ajout du Fournil (renommable ensuite depuis l'admin)
insert into etablissements (nom, slug, type, is_principal, actif)
values ('Fournil', 'fournil', 'fournil', false, true)
on conflict (slug) do nothing;

-- 4) RLS : la table est déjà en RLS off (0075), on le ré-assure par sécurité
alter table etablissements disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare
  nb int;
  nb_resto int;
  nb_fournil int;
  rls text;
begin
  select count(*) into nb        from etablissements;
  select count(*) into nb_resto  from etablissements where type = 'restaurant';
  select count(*) into nb_fournil from etablissements where type = 'fournil';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls
    from pg_class where relname = 'etablissements';
  raise notice 'M1 fondation — etablissements total=% (restaurant=%, fournil=%) | RLS=%',
    nb, nb_resto, nb_fournil, rls;
end $$;
