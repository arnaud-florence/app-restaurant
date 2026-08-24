-- ════════════════════════════════════════════════════════════════════
-- 0135 — Libellé d'achat sur les matières premières
-- ════════════════════════════════════════════════════════════════════
-- `recettes.libelle_achat` (0131) permet de reconnaître une ligne de facture
-- pour un produit revendu. Les matières premières (jambon, mozzarella…) en
-- ont autant besoin : sur 138 lignes de facture scannées, 7 seulement
-- étaient rattachées à un ingrédient par le rapprochement automatique.
--
-- Sans ce lien, impossible de calculer les ENTRÉES de stock depuis les
-- factures — donc impossible de connaître le stock théorique ni la démarque.
-- ════════════════════════════════════════════════════════════════════

alter table ingredients add column if not exists libelle_achat text;

create index if not exists idx_ingredients_libelle_achat
  on ingredients(libelle_achat) where libelle_achat is not null;

do $$
declare nb int;
begin
  select count(*) into nb from ingredients where libelle_achat is not null;
  raise notice '── matières avec libellé d''achat : % ──', nb;
end $$;
