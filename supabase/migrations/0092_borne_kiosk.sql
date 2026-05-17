-- ════════════════════════════════════════════════════════════════════════
--  MIGRATION 0092 — Borne kiosk + paiement Tap-to-Pay / comptoir
-- ════════════════════════════════════════════════════════════════════════
-- Ajoute :
--   1. Source 'BORNE' à commandes (en plus de TABLE, ONLINE, COMPTOIR)
--   2. Statut 'en_attente_paiement_comptoir' au flow commandes
--      (commande pas encore payée → invisible cuisine, visible /caisse uniquement)
--   3. Colonnes borne_* sur commandes : intent Stripe, méthode, expiration
--   4. Table borne_evenements : log des sessions, échecs NFC, inactivité
--   5. Table borne_sessions : suivi de l'activité de chaque borne (heartbeat)
--   6. Push rate-limit règles côté borne (3 échecs NFC, 5 min comptoir,
--      30 min inactive) — déclenchés par cron, pas trigger SQL.
--
-- Idempotent. RLS désactivée.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. Source 'BORNE' ─────────────────────────────────────────────────
alter table commandes drop constraint if exists commandes_source_check;
alter table commandes add constraint commandes_source_check
  check (source in ('ONLINE','TABLE','COMPTOIR','BORNE'));

-- ─── 2. Statut 'en_attente_paiement_comptoir' ──────────────────────────
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in (
    'en_attente','en_preparation','pret','servi','encaisse','annule',
    'pret_pour_retrait','retire_par_client',
    'en_livraison',
    'en_attente_paiement_comptoir'
  ));

-- ─── 3. Colonnes borne sur commandes ──────────────────────────────────
alter table commandes add column if not exists borne_id text;
alter table commandes add column if not exists borne_payment_intent_id text;
alter table commandes add column if not exists borne_payment_method text
  check (borne_payment_method is null or borne_payment_method in ('nfc','comptoir'));
alter table commandes add column if not exists borne_expire_at timestamptz;
alter table commandes add column if not exists borne_nfc_echecs int default 0;

create index if not exists idx_commandes_borne_attente_paiement
  on commandes(borne_expire_at)
  where statut = 'en_attente_paiement_comptoir';

-- ─── 4. Log événements borne ───────────────────────────────────────────
create table if not exists borne_evenements (
  id          uuid primary key default gen_random_uuid(),
  borne_id    text not null,
  commande_id uuid references commandes(id) on delete set null,
  type        text not null check (type in (
    'session_open','session_close',
    'panier_ajout','panier_retire','panier_vide',
    'choix_nfc','choix_comptoir',
    'nfc_init','nfc_succes','nfc_echec',
    'comptoir_attente','comptoir_paye','comptoir_expire',
    'heartbeat'
  )),
  details     jsonb,
  created_at  timestamptz default now()
);
create index if not exists idx_borne_evt_borne     on borne_evenements(borne_id, created_at desc);
create index if not exists idx_borne_evt_type      on borne_evenements(type, created_at desc);
create index if not exists idx_borne_evt_commande  on borne_evenements(commande_id) where commande_id is not null;
alter table borne_evenements disable row level security;

-- ─── 5. Heartbeat bornes (pour détection inactivité) ──────────────────
create table if not exists borne_sessions (
  borne_id        text primary key,
  derniere_action timestamptz not null default now(),
  derniere_cmd_at timestamptz,
  user_agent      text,
  notes           text
);
alter table borne_sessions disable row level security;

-- ─── 6. Diagnostic ─────────────────────────────────────────────────────
do $$
declare
  v_rls_evt    boolean;
  v_rls_sess   boolean;
begin
  select relrowsecurity into v_rls_evt
    from pg_class where relname = 'borne_evenements';
  select relrowsecurity into v_rls_sess
    from pg_class where relname = 'borne_sessions';
  raise notice 'Migration 0092 OK — RLS borne_evenements=%, borne_sessions=%', v_rls_evt, v_rls_sess;
end $$;
