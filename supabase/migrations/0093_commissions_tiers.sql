-- ════════════════════════════════════════════════════════════════════
-- 0093 — Commissions des services tiers (FDJ / Tabac / Relais colis)
-- ════════════════════════════════════════════════════════════════════
-- Enregistre la COMMISSION (= notre revenu) par période, pour les points de
-- vente « hors CA principal » (inclus_ca_principal = false). Le brut transité
-- est purement informatif (il ne nous appartient pas — pour compte de tiers).
--
-- Module opérationnel : saisie manuelle depuis /admin/commissions.
-- Additif/idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

create table if not exists commissions_tiers (
  id                     uuid primary key default gen_random_uuid(),
  etablissement_id       uuid not null references etablissements(id) on delete cascade,
  periode_debut          date not null,
  periode_fin            date not null,
  montant_commission     numeric not null default 0,   -- NOTRE revenu (hors TVA selon régime)
  montant_brut_transite  numeric,                       -- info : mises/ventes brutes (pour compte de tiers)
  nb_operations          integer,
  notes                  text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_commissions_tiers_etab    on commissions_tiers(etablissement_id);
create index if not exists idx_commissions_tiers_periode on commissions_tiers(periode_debut desc);

alter table commissions_tiers disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int; rls text; nb_services int;
begin
  select count(*) into nb from commissions_tiers;
  select count(*) into nb_services from etablissements where inclus_ca_principal = false and actif = true;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls
    from pg_class where relname = 'commissions_tiers';
  raise notice 'commissions_tiers — % ligne(s) | % service(s) tiers actif(s) | RLS=%', nb, nb_services, rls;
end $$;
