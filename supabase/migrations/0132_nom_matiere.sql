-- ════════════════════════════════════════════════════════════════════
-- 0132 — Nom de la matière (ce qu'on compte), distinct du libellé facture
-- ════════════════════════════════════════════════════════════════════
-- `libelle_achat` (0131) sert à RECONNAÎTRE la ligne de facture : c'est le
-- texte du fournisseur, brut et bavard (« PATON A PIZZA 250G C=40 »,
-- « Kit complet café Lavazza blue (100 capsules gobelets sucres agitateurs) »).
--
-- Il ne convient pas pour COMPTER : dans le congélateur on compte des
-- « pâtons », dans la réserve des « dosettes de café ». D'où ce second
-- champ, purement d'affichage, utilisé par l'inventaire et la commande
-- conseillée. Repli : libelle_achat, puis le nom du produit.
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists nom_matiere text;

do $$
declare nb int;
begin
  select count(*) into nb from recettes where nom_matiere is not null;
  raise notice '── noms de matière renseignés : % ──', nb;
end $$;
