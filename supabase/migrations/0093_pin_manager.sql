-- ════════════════════════════════════════════════════════════════════════
--  MIGRATION 0093 — PIN manager (sécurité actions borne et autres ops)
-- ════════════════════════════════════════════════════════════════════════
-- Ajoute un PIN à 4-6 chiffres par employé manager pour protéger les
-- actions sensibles côté ops :
--   - Encaisser une commande BORNE COMPTOIR sans passer en caisse
--   - Annuler une commande borne
--   - Annulation manuelle de commande, remboursement, etc.
--
-- Stockage : SHA-256(pin + salt) par employé.
-- Lock : après 3 essais ratés dans les 60 dernières secondes → 60s de lock.
--
-- Idempotent. RLS désactivée (single-tenant).
-- ════════════════════════════════════════════════════════════════════════

alter table employes add column if not exists pin_hash       text;
alter table employes add column if not exists pin_salt       text;
alter table employes add column if not exists pin_essais     int default 0;
alter table employes add column if not exists pin_lock_until timestamptz;
alter table employes add column if not exists pin_last_try   timestamptz;

create index if not exists idx_employes_pin_lock on employes(pin_lock_until)
  where pin_lock_until is not null;

-- Diagnostic
do $$ begin
  raise notice 'Migration 0093 OK — colonnes PIN ajoutées sur employes';
end $$;
