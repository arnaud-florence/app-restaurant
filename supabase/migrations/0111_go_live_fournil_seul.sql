-- ════════════════════════════════════════════════════════════════════
-- 0111 — GO LIVE : bascule effective en mode « Fournil seul »
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ CETTE MIGRATION A UN EFFET IMMÉDIAT ET PUBLIC.
--
-- Contrairement à 0110 (inerte), celle-ci désactive réellement les points
-- de vente du restaurant. `/api/public/menu` filtre déjà sur
-- `etablissements.actif` → les produits restaurant disparaissent du site
-- CASATASIA dès l'exécution.
--
-- ➜ À N'EXÉCUTER QUE le jour de la mise en ligne du site « Fournil d'abord »,
--   une fois le code du site ET de l'outil déployé. Pas avant : sinon le site
--   affiche une carte vide sous une navigation qui parle encore de chambres
--   et de réservations.
--
-- Équivalent sans SQL : /admin/etablissements → groupe « Restaurant » →
-- bouton « Tout fermer ». Même effet, réversible d'un clic.
--
-- POUR RÉOUVRIR (fin octobre 2026) : ne pas rejouer de SQL. Aller dans
-- /admin/etablissements → groupe « Restaurant » → « Ouvrir le restaurant ».
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) Modules restaurant → éteints ─────────────────────────────────
update activites_modules
set actif = false, updated_at = now()
where activite = 'restaurant';

-- ─── 2) Modules fournil ouverts au public → allumés ──────────────────
-- (fdj / tabac restent éteints : non communiqués pour l'instant.)
update activites_modules
set actif = true, updated_at = now()
where cle in ('fournil', 'fournil_commande_en_ligne', 'fournil_livraison', 'relais_colis');

-- ─── 3) Points de vente alignés sur les modules ──────────────────────
-- C'est ce qui retire les produits restaurant de la carte publique.
update etablissements set actif = false
  where slug in ('bar', 'snack-emporter', 'fdj', 'tabac');

update etablissements set actif = false
  where is_principal = true;          -- « Restauration » (PdV principal)

update etablissements set actif = true
  where slug in ('fournil', 'relais-colis');

-- ─── 4) Ouverture de la vente en ligne des produits Fournil ──────────
-- La migration 0095 les a créés avec `vendable_online = false` : ils
-- s'affichaient sur la carte mais n'étaient pas commandables. C'est LE
-- verrou qui empêchait la commande en ligne de fonctionner.
--
-- Volontairement ici et pas dans 0095 : tant que le site public montrait le
-- restaurant, rendre le pain commandable n'avait pas de sens.
update recettes r
set vendable_online = true
where r.tag_destination = 'FOURNIL'
  and r.actif = true
  and r.vendable_online is distinct from true;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb_recettes_visibles int; nb_online int; nb_sans_allergene int;
begin
  raise notice '── APRÈS BASCULE ──';
  for r in select nom, actif from etablissements order by ordre loop
    raise notice '  PdV % : %', r.nom, case when r.actif then 'ACTIF' else 'fermé' end;
  end loop;

  for r in select cle, actif from activites_modules order by ordre loop
    raise notice '  module % : %', r.cle, case when r.actif then 'ALLUMÉ' else 'éteint' end;
  end loop;

  -- Ce que le site public verra désormais sur /menu
  select count(*) into nb_recettes_visibles
  from recettes r
  where r.actif = true
    and (r.etablissement_id is null
         or r.etablissement_id in (select id from etablissements where actif = true));

  raise notice '→ % recette(s) visible(s) sur la carte publique', nb_recettes_visibles;
  if nb_recettes_visibles = 0 then
    raise warning '⚠️ AUCUNE recette visible — vérifier que la carte Fournil (0095) est bien rattachée au PdV fournil AVANT de communiquer.';
  end if;

  select count(*) into nb_online
  from recettes where tag_destination = 'FOURNIL' and actif and vendable_online;
  raise notice '→ % produit(s) Fournil commandable(s) en ligne', nb_online;
  if nb_online = 0 then
    raise warning '⚠️ AUCUN produit commandable en ligne — la page « Commander » sera vide.';
  end if;

  -- Contrôle réglementaire : la vente au public impose l'information
  -- allergènes. Un produit sans ingrédient rattaché ne peut rien déclarer.
  select count(*) into nb_sans_allergene
  from recettes r
  where r.tag_destination = 'FOURNIL' and r.actif
    and not exists (select 1 from recette_ingredients ri where ri.recette_id = r.id);

  if nb_sans_allergene > 0 then
    raise warning '⚠️ % produit(s) Fournil sans ingrédient rattaché → aucune information allergène ne peut être affichée. Obligation légale à traiter avant la communication publique.', nb_sans_allergene;
  else
    raise notice '→ tous les produits Fournil ont des ingrédients (allergènes calculables)';
  end if;
end $$;
