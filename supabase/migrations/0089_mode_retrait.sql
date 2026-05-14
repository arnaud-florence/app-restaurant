-- ============================================================
-- Migration 0089 : Mode retrait/livraison sur commandes ONLINE
-- ============================================================
-- Permet au client final de choisir au moment du panier entre :
--   - 'a_emporter' (retrait sur place au restaurant)
--   - 'livraison' (livraison à domicile par le livreur)
--
-- MVP simple (validé 2026-05-14) :
--   - Aucun frais de livraison (offerte)
--   - Aucune zone limitée (le livreur juge à la commande)
--   - Aucun SMS auto (notif interne employés uniquement)
--
-- Pour les commandes TABLE et COMPTOIR, mode_retrait reste à NULL ou
-- 'sur_place' (n'a pas vraiment de sens, conservé pour cohérence).
-- ============================================================

alter table commandes
  add column if not exists mode_retrait text
    check (mode_retrait in ('sur_place', 'a_emporter', 'livraison'))
    default 'a_emporter';

alter table commandes
  add column if not exists adresse_livraison text;

-- Backfill : les commandes ONLINE existantes deviennent 'a_emporter' par défaut
-- (cohérent avec le default ci-dessus, l'ancien fonctionnement = retrait magasin)
update commandes
  set mode_retrait = 'a_emporter'
  where source = 'ONLINE' and mode_retrait is null;

update commandes
  set mode_retrait = 'sur_place'
  where source = 'TABLE' and mode_retrait is null;

update commandes
  set mode_retrait = 'a_emporter'
  where source = 'COMPTOIR' and mode_retrait is null;

-- Index pour filtrage rapide sur /livreur et /emporter
create index if not exists idx_commandes_mode_retrait
  on commandes(mode_retrait, statut) where source = 'ONLINE';


-- ─── Diagnostic ─────────────────────────────────────────────
select
  'Migration 0089 OK' as status,
  count(*) filter (where mode_retrait = 'a_emporter') as nb_a_emporter,
  count(*) filter (where mode_retrait = 'livraison')  as nb_livraison,
  count(*) filter (where mode_retrait = 'sur_place')  as nb_sur_place
from commandes;
