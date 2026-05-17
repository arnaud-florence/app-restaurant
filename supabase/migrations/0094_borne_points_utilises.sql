-- ════════════════════════════════════════════════════════════════════════
--  MIGRATION 0094 — Stockage points fidélité utilisés sur commande borne
-- ════════════════════════════════════════════════════════════════════════
-- Permet au client de la borne d'utiliser ses points fidélité AVANT le
-- paiement (NFC ou comptoir). La remise est calculée côté borne, stockée
-- ici pour audit, et appliquée au montant_total_ttc de la commande.
--
-- Les points sont consommés au moment de l'encaissement effectif
-- (marquerBornePayee NFC ou encaisserCommande comptoir) via la lib
-- src/lib/fidelite.ts → consommerPointsFidelite().
-- ════════════════════════════════════════════════════════════════════════

alter table commandes add column if not exists borne_points_utilises int default 0;
alter table commandes add column if not exists borne_remise_eur      decimal(10,2) default 0;

do $$ begin
  raise notice 'Migration 0094 OK — colonnes borne_points_utilises + borne_remise_eur';
end $$;
