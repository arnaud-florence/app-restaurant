-- ════════════════════════════════════════════════════════════════════
-- 0142 — Référence fournisseur sur les lignes de facture et les produits
-- ════════════════════════════════════════════════════════════════════
-- Le rapprochement d'une ligne de facture avec un produit se fait
-- aujourd'hui PAR LE NOM, normalisé, avec un seuil de 4 caractères. C'est
-- fragile par construction, et la 0125 le disait déjà : « un faux
-- rapprochement écrirait un faux prix, pire qu'aucun ».
--
-- Or les factures Gineys portent une RÉFÉRENCE par ligne, et c'est la même
-- que celle du catalogue Arti'Pat — leur gamme boulangerie. Une référence ne
-- change pas quand le libellé change, ne souffre ni des accents ni des
-- abréviations, et ne confond pas deux produits proches.
--
-- Le scanner ne l'extrayait pas : elle était perdue à chaque scan.
--
-- Idempotent, rejouable.
-- ════════════════════════════════════════════════════════════════════

alter table facture_lignes add column if not exists reference text;

comment on column facture_lignes.reference is
  'Référence produit du fournisseur, telle qu''imprimée sur la facture. Clé de rapprochement exacte, à préférer au libellé.';

-- Côté produits : la référence qu'on achète, pour lier une fiche à sa ligne
-- de facture sans passer par le nom.
alter table recettes    add column if not exists reference_fournisseur text;
alter table ingredients add column if not exists reference_fournisseur text;

comment on column recettes.reference_fournisseur is
  'Référence chez le fournisseur. Complète `libelle_achat` (texte brut) par une clé exacte.';

create index if not exists idx_facture_lignes_ref on facture_lignes(reference) where reference is not null;
create index if not exists idx_recettes_ref_fourn on recettes(reference_fournisseur) where reference_fournisseur is not null;
create index if not exists idx_ingredients_ref_fourn on ingredients(reference_fournisseur) where reference_fournisseur is not null;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare avec int; total int;
begin
  select count(*) filter (where reference is not null), count(*) into avec, total from facture_lignes;
  raise notice '── 0142 ── % ligne(s) de facture sur % portent une référence', avec, total;
end $$;
