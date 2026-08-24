-- ════════════════════════════════════════════════════════════════════
-- 0131 — Correspondance produit vendu ↔ matière achetée
-- ════════════════════════════════════════════════════════════════════
-- Le produit VENDU porte rarement le nom de la matière ACHETÉE :
--   « Panuozzi »               ← « PATON A PIZZA 250G C=40 »
--   « Café expresso »          ← « Kit complet café Lavazza blue (100…) »
--   « Café allongé »           ← la MÊME capsule
--   « Part de flan pâtissier » ← un flan entier de 2 kg, découpé en 10
--
-- Le rapprochement par nom échouait donc exactement là, et les coûts
-- étaient saisis à la main dans un script — non reproductible.
--
-- `libelle_achat`     : le libellé fournisseur à reconnaître sur la facture.
--                       Plusieurs produits peuvent partager le même (les deux
--                       cafés viennent de la même capsule).
-- `unites_par_achat`  : combien d'unités VENDUES tire-t-on d'une unité
--                       ACHETÉE. 1 la plupart du temps ; 10 pour le flan.
--
-- Coût unitaire = (prix du colis ÷ conditionnement C=N) ÷ unites_par_achat
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists libelle_achat text;
alter table recettes add column if not exists unites_par_achat decimal(10,3) not null default 1;

do $$ begin
  alter table recettes add constraint recettes_unites_par_achat_positif
    check (unites_par_achat > 0);
exception when duplicate_object then null;
end $$;

create index if not exists idx_recettes_libelle_achat
  on recettes(libelle_achat) where libelle_achat is not null;

do $$
declare nb int;
begin
  select count(*) into nb from recettes where libelle_achat is not null;
  raise notice '── correspondances d''achat renseignées : % ──', nb;
end $$;
