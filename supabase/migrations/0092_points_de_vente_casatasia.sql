-- ════════════════════════════════════════════════════════════════════
-- 0092 — Points de vente de CASATASIA (1 entité, plusieurs PdV)
-- ════════════════════════════════════════════════════════════════════
-- CASATASIA = UNE entité. La table `etablissements` sert de registre des
-- POINTS DE VENTE (le nom CASATASIA reste global, sur les tickets/en-têtes).
--
-- 4 PdV dans le CA principal : Restauration, Bar, Fournil, Snack / Emporter.
-- 3 PdV HORS CA principal (encaissements pour compte de tiers, suivis en
-- commissions) : FDJ, Tabac, Relais colis.
--
-- Additif/idempotent. À exécuter dans Supabase → SQL Editor (après 0090).
-- ════════════════════════════════════════════════════════════════════

-- 1) Le PdV principal = Restauration (l'ancienne ligne principale)
update etablissements
set nom = 'Restauration', type = 'restaurant', categorie = 'restauration',
    inclus_ca_principal = true, couleur = 'emerald', ordre = 0, mode_fiscal = 'rattache'
where is_principal = true;

-- 2) Fournil (existe déjà) — on cale ses flags
update etablissements
set categorie = 'boulangerie', inclus_ca_principal = true, couleur = 'amber',
    ordre = 3, mode_fiscal = 'rattache'
where slug = 'fournil';

-- 3) Nouveaux points de vente
insert into etablissements
  (nom, slug, type, categorie, inclus_ca_principal, couleur, ordre, mode_fiscal, is_principal, actif)
values
  ('Bar',              'bar',           'restaurant', 'restauration',  true,  'violet', 1, 'rattache', false, true),
  ('Snack / Emporter', 'snack-emporter','restaurant', 'restauration',  true,  'blue',   2, 'rattache', false, true),
  ('FDJ',              'fdj',           'autre',      'service_tiers', false, 'red',    4, 'rattache', false, true),
  ('Tabac',            'tabac',         'autre',      'tabac_presse',  false, 'orange', 5, 'rattache', false, true),
  ('Relais colis',     'relais-colis',  'autre',      'service_tiers', false, 'zinc',   6, 'rattache', false, true)
on conflict (slug) do nothing;

alter table etablissements disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb_ca int; nb_hors int;
begin
  raise notice '── Points de vente CASATASIA ──';
  for r in select nom, categorie, inclus_ca_principal, ordre from etablissements order by ordre loop
    raise notice '  [%] %  | cat=% | CA_principal=%', r.ordre, r.nom, r.categorie, r.inclus_ca_principal;
  end loop;
  select count(*) into nb_ca   from etablissements where inclus_ca_principal = true;
  select count(*) into nb_hors from etablissements where inclus_ca_principal = false;
  raise notice '→ % PdV dans le CA principal, % hors CA (commissions)', nb_ca, nb_hors;
end $$;
