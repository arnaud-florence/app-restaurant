-- ════════════════════════════════════════════════════════════════════
-- 0126 — Coût d'achat direct (achat-revente) + traçabilité en saisie libre
-- ════════════════════════════════════════════════════════════════════
-- Deux réalités du Fournil que le modèle « restaurant » ignorait :
--
-- ─── 1. recettes.cout_achat_ht ───────────────────────────────────────
-- Le Fournil achète quasi tout SURGELÉ et revend sans transformation :
-- le coût d'un croissant, c'est son prix d'achat unitaire — pas une
-- composition farine + beurre + levure. Exiger une recette chiffrée pour
-- calculer une marge était donc à côté du modèle (~95 % de la carte).
--
-- `cout_achat_ht` porte ce prix d'achat par portion vendue. Dans le calcul
-- du food cost, il S'AJOUTE au coût de la composition :
--   · achat-revente pur  → composition vide,   coût = cout_achat_ht
--   · les ~5 % transformés → cout_achat_ht + matière première associée
--
-- Il est alimenté de deux façons : à la main dans la fiche produit, et
-- automatiquement par le scanner de factures (0125) quand une ligne de
-- facture se rapproche d'un produit par son nom.
--
-- ─── 2. lots_produits.produit_nom ────────────────────────────────────
-- La traçabilité imposait de choisir dans la liste des ingrédients. Or on
-- doit pouvoir tracer N'IMPORTE QUEL produit reçu (carton de surgelés,
-- article ponctuel…) sans devoir d'abord le créer comme ingrédient.
-- `produit_nom` est la saisie libre ; le lien ingrédient devient un plus
-- facultatif, pas un préalable.
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists cout_achat_ht decimal(10,4);

alter table lots_produits add column if not exists produit_nom text;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
begin
  raise notice '── recettes.cout_achat_ht : % ──',
    (select case when count(*) > 0 then 'présente' else 'ABSENTE' end
       from information_schema.columns
      where table_name = 'recettes' and column_name = 'cout_achat_ht');
  raise notice '── lots_produits.produit_nom : % ──',
    (select case when count(*) > 0 then 'présente' else 'ABSENTE' end
       from information_schema.columns
      where table_name = 'lots_produits' and column_name = 'produit_nom');
end $$;
