-- 0164 — Un produit vendu dit CHEZ QUI on l'achète.
--
-- `ingredients.fournisseur_principal` existe depuis le module 3. Les
-- PRODUITS VENDUS, eux, n'avaient aucun champ fournisseur — alors que le
-- modèle du Fournil est l'achat-revente : on commande des croissants et des
-- fûts, pas des matières.
--
-- Conséquence mesurée le 27/09/2026 : sur les 100 groupes du réassort,
-- 85 lignes ne pouvaient entrer dans AUCUN bon de commande faute de
-- destinataire — dont les 21 références du bar, alors que le panier
-- France Boissons du gérant en contenait 63.
--
-- ⚠️ C'est un uuid, pas du texte libre. `ingredients.fournisseur_principal`
-- est une chaîne, et elle porte aujourd'hui des notes de méthode
-- (« ESTIMATION 21/09/2026 — … ») qu'il a fallu démêler à la lecture. Une
-- clé étrangère ne peut pas porter une note.
--
-- ⚠️ `on delete set null` : supprimer un fournisseur ne doit pas emporter
-- le produit. On perd le lien, pas la fiche.

alter table recettes
  add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

comment on column recettes.fournisseur_id is
  'Chez qui ce produit s''achète. NULL = on ne sait pas — jamais deviné : '
  'un bon parti chez le mauvais interlocuteur se découvre à la livraison.';

create index if not exists idx_recettes_fournisseur on recettes(fournisseur_id)
  where fournisseur_id is not null;

alter table recettes disable row level security;

-- Diagnostic
do $$
declare n_tot int; n_lie int;
begin
  select count(*) into n_tot from recettes where actif;
  select count(*) into n_lie from recettes where actif and fournisseur_id is not null;
  raise notice 'recettes actives : % — avec fournisseur : %', n_tot, n_lie;
end $$;
