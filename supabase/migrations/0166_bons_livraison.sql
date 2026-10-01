-- 0166 — Le bon de livraison, troisième type de document fournisseur
--
-- Le BL et la facture sont deux documents distincts, qui arrivent à des
-- moments distincts : le BL avec le camion, la facture par mail des jours
-- plus tard. Scanner le BL permet de VÉRIFIER CE QUI EST RÉELLEMENT ARRIVÉ,
-- au moment où on peut encore le contester — une fois le camion reparti, il
-- est trop tard pour constater un manquant.
--
-- Constaté le 01/10/2026 : le premier document scanné était un BL pris pour
-- une facture. Il est entré avec 0 € de HT, 408,76 € de TTC sans rapport avec
-- la commande, et une date de janvier — c'est-à-dire du bruit dans le P&L.
--
-- ⚠️⚠️ LE PIÈGE DE CE TYPE, ET C'EST POUR LUI QUE CETTE MIGRATION EXISTE :
-- LE DOUBLE COMPTAGE. Les entrées de stock se calculent sur `facture_lignes`
-- avec `signe = type_document === 'avoir' ? -1 : 1`. Un BL compterait donc
-- +1, puis la facture des mêmes marchandises +1 encore — le stock théorique
-- doublerait à chaque livraison, sans qu'aucune erreur ne le signale.
--
-- La règle retenue, appliquée dans `(ops)/inventaire` et `reassort-donnees` :
--   LES ENTRÉES VIENNENT DU BL QUAND IL EXISTE ; la facture qui lui est
--   rattachée (`facture_liee_id`) n'en ajoute aucune.
-- C'est le BL qui dit ce qui est ARRIVÉ ; la facture dit ce qu'on DOIT.
--
-- ⚠️ Un BL ne porte AUCUN montant. Ses totaux sont forcés à zéro par
-- `createFacture`, et c'est délibéré : quatre lecteurs d'argent — le P&L,
-- l'agent Financier, le pilotage et le snapshot de l'assistant — somment
-- `factures_fournisseurs` SANS filtrer sur `type_document`. C'est la même
-- ruse que les avoirs en négatif (0127) : on fait porter l'invariant par la
-- DONNÉE plutôt que par la mémoire de chaque lecteur. Un BL à 408 € aurait
-- gonflé les achats et la dette de 408 €, puis encore autant à la facture.

alter table factures_fournisseurs
  drop constraint if exists factures_type_document_check;

alter table factures_fournisseurs
  add constraint factures_type_document_check
  check (type_document in ('facture', 'avoir', 'bon_livraison'));

comment on column factures_fournisseurs.facture_liee_id is
  'Avoir → la facture d''origine. Facture → le bon de livraison correspondant. '
  'Dans ce second sens il porte une règle de STOCK : une facture rattachée à '
  'un BL n''ajoute aucune entrée, le BL l''a déjà fait.';

-- Retrouver les factures d'un BL, et inversement, sans balayer la table.
create index if not exists idx_factures_liee on factures_fournisseurs (facture_liee_id)
  where facture_liee_id is not null;

-- Diagnostic
do $$
declare n_bl int; n_f int; n_a int;
begin
  select count(*) into n_bl from factures_fournisseurs where type_document = 'bon_livraison';
  select count(*) into n_f  from factures_fournisseurs where type_document = 'facture';
  select count(*) into n_a  from factures_fournisseurs where type_document = 'avoir';
  raise notice '0166 — factures %, avoirs %, bons de livraison %', n_f, n_a, n_bl;
end $$;

alter table factures_fournisseurs disable row level security;
