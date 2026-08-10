-- 0108 — Encaissements externes : connecteur « caisse agréée » (lecture seule).
--
-- Modèle hybride NF525 : notre app PREND la commande (etablissement_id) ; la
-- caisse agréée ENCAISSE (source de vérité fiscale) et nous pousse ses tickets
-- via POST /api/integrations/caisse/encaissements (auth Bearer CRON_SECRET).
-- Cette table est le MIROIR local des encaissements de la caisse — on ne crée
-- jamais d'encaissement fiscal ici, on le reçoit.
--
-- Idempotent + RLS désactivée (single-tenant, cf. CLAUDE.md).

create table if not exists encaissements_externes (
  id                    uuid primary key default gen_random_uuid(),
  source_caisse         text not null,                       -- ex: 'tiller', 'addition', 'lightspeed'
  ticket_externe        text not null,                       -- identifiant ticket côté caisse
  etablissement_id      uuid references etablissements(id) on delete set null,
  commande_id           uuid references commandes(id) on delete set null,  -- rapprochement éventuel
  montant_ttc           numeric not null default 0,
  montant_ht            numeric,
  tva_total             numeric,
  ventilation_tva       jsonb not null default '{}'::jsonb,
  mode_paiement         text,
  encaisse_at           timestamptz,
  statut_rapprochement  text not null default 'non_rapproche',  -- rapproche | sans_commande | non_rapproche
  raw                   jsonb,                               -- payload brut (audit)
  created_at            timestamptz not null default now()
);

-- Idempotence de la synchro : un ticket d'une caisse n'est inséré qu'une fois.
do $$ begin
  alter table encaissements_externes
    add constraint encaissements_externes_uniq unique (source_caisse, ticket_externe);
exception when duplicate_object then null; end $$;

create index if not exists idx_enc_ext_etab on encaissements_externes(etablissement_id);
create index if not exists idx_enc_ext_at   on encaissements_externes(encaisse_at);
create index if not exists idx_enc_ext_cmd  on encaissements_externes(commande_id);

alter table encaissements_externes disable row level security;

-- Diagnostic
do $$
declare n int; r boolean;
begin
  select count(*) into n from encaissements_externes;
  select relrowsecurity into r from pg_class where relname = 'encaissements_externes';
  raise notice 'encaissements_externes: % ligne(s), RLS=%', n, r;
end $$;
