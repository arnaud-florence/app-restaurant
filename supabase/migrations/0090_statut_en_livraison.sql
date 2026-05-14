-- ============================================================
-- Migration 0090 : Statut dédié 'en_livraison' pour les commandes livraison
-- ============================================================
-- Suite à la migration 0089 (mode_retrait). Permet au livreur de marquer
-- une commande "Partie en livraison" → statut='en_livraison' avec horodate
-- de départ, puis "Livrée" → statut='retire_par_client' (ou 'encaisse'
-- si déjà payée en CB sur le site).
--
-- Ajout également email_retard_envoye_at pour ne pas spammer le client
-- en cas de retard prolongé.
-- ============================================================

-- 1. Étendre le check constraint statut pour autoriser 'en_livraison'
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in (
    'en_attente', 'en_preparation', 'pret', 'servi', 'encaisse', 'annule',
    'pret_pour_retrait', 'retire_par_client',  -- statuts ONLINE existants (phase 0)
    'en_livraison'                              -- NEW : statut intermédiaire livreur
  ));

-- 2. Horodatage du départ en livraison (pour calcul du temps de course)
alter table commandes
  add column if not exists livraison_depart_at timestamptz;

-- 3. Anti-spam email retard
alter table commandes
  add column if not exists email_retard_envoye_at timestamptz;

-- 4. Index pour requêtes "livraisons en retard" sur /admin/pilotage
create index if not exists idx_commandes_livraisons_actives
  on commandes(creneau_retrait)
  where source = 'ONLINE' and mode_retrait = 'livraison'
    and statut in ('pret', 'pret_pour_retrait', 'en_livraison');


-- ─── Diagnostic ─────────────────────────────────────────────
select
  'Migration 0090 OK' as status,
  count(*) filter (where mode_retrait = 'livraison')                                          as nb_livraisons_total,
  count(*) filter (where mode_retrait = 'livraison' and statut = 'en_livraison')              as nb_en_livraison,
  count(*) filter (where mode_retrait = 'livraison' and statut in ('retire_par_client','encaisse')) as nb_livrees
from commandes;
