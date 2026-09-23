-- 0152 — D'où vient un tarif : un devis, ou une facture ?
--
-- La 0151 partait d'un devis. Mais nos fournisseurs historiques — Gineys,
-- Promocash, Lavazza — n'en ont jamais envoyé : ce qu'on sait d'eux vient
-- des FACTURES scannées, c'est-à-dire de prix réellement payés.
--
-- ⚠️ Les deux ne pèsent pas pareil, et les confondre serait le défaut de
-- cet écran. Un devis est une PROPOSITION — il peut ne jamais se réaliser,
-- il est parfois consenti pour emporter un client. Une facture est une
-- PREUVE. Comparer les deux est exactement ce qu'on veut faire, mais le
-- lecteur doit savoir laquelle il regarde : arbitrer un fournisseur sur un
-- tarif d'appel qu'on ne reverra jamais se paie pendant des mois.
--
-- ⚠️ `recette_id` : en achat-revente, une ligne de facture nourrit le plus
-- souvent un PRODUIT VENDU (un croissant, une baguette) et non une matière.
-- Sans cette colonne, les 64 lignes Gineys de ce type auraient été
-- indistinguables d'orphelines — même faute que `facture_lignes` avant la
-- 0145.

alter table catalogue_fournisseur
  add column if not exists nature text not null default 'devis'
    check (nature in ('devis', 'facture'));

alter table catalogue_fournisseur
  add column if not exists recette_id uuid references recettes(id) on delete set null;

create index if not exists idx_catalogue_four_rec on catalogue_fournisseur (recette_id) where recette_id is not null;

comment on column catalogue_fournisseur.nature is
  'devis = un prix PROPOSÉ (peut ne jamais se réaliser). facture = un prix '
  'PAYÉ. Toujours affiché : arbitrer sur un tarif d''appel se paie longtemps.';
comment on column catalogue_fournisseur.recette_id is
  'Le produit vendu que cette ligne alimente — le cas courant en achat-revente.';

alter table catalogue_fournisseur disable row level security;

do $$
declare d integer; f integer;
begin
  select count(*) into d from catalogue_fournisseur where nature = 'devis';
  select count(*) into f from catalogue_fournisseur where nature = 'facture';
  raise notice 'catalogue_fournisseur : % devis, % facture', d, f;
end $$;
