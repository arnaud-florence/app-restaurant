-- ============================================================
-- Migration 0082 : Agents permanents (Vision "mes managers 24h/24")
-- ============================================================
-- Système d'agents IA qui tournent automatiquement en arrière-plan.
-- Chaque agent (veilleur, météo, stock, financier, RH, HACCP, commercial,
-- scanner, stratégique, sécurité) :
--   • Tourne selon son propre cron
--   • Enregistre chaque exécution dans agents_runs
--   • Émet des "findings" (alertes/suggestions) dans agent_findings
--   • Findings classés par urgence (rouge/jaune/vert)
--
-- Le dashboard /admin/pilotage affiche un résumé live des 10 agents
-- avec leurs derniers résultats — le gérant n'a qu'à valider ou agir.
-- ============================================================

-- ─── 1. AGENTS_RUNS : une ligne par exécution d'agent ────────
create table if not exists agents_runs (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              text not null,                          -- 'veilleur'|'meteo'|'stock'|'financier'|'rh'|'haccp'|'commercial'|'scanner'|'strategique'|'securite'
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_ms           integer,
  status                text not null default 'running'
                          check (status in ('running', 'success', 'error')),
  -- Résumé une phrase ("CA hier 1847€, marge 68%, aucune anomalie")
  summary               text,
  -- Compteurs de findings par urgence (dénormalisé pour le dashboard rapide)
  count_rouge           integer not null default 0,
  count_jaune           integer not null default 0,
  count_vert            integer not null default 0,
  -- Données structurées libres selon l'agent (KPIs, métriques, etc.)
  data                  jsonb not null default '{}'::jsonb,
  error_message         text
);

create index if not exists idx_agents_runs_agent_date
  on agents_runs(agent_id, started_at desc);
create index if not exists idx_agents_runs_status
  on agents_runs(status, started_at desc) where status != 'success';


-- ─── 2. AGENT_FINDINGS : alertes/suggestions émises par les agents ───
create table if not exists agent_findings (
  id                    uuid primary key default gen_random_uuid(),
  agent_id              text not null,
  run_id                uuid references agents_runs(id) on delete cascade,
  urgence               text not null
                          check (urgence in ('rouge', 'jaune', 'vert')),
  -- Catégorie pour grouper côté UI ('rupture_stock'|'food_cost_eleve'|'temperature_manquante'…)
  type                  text,
  -- Titre court ("Rupture mozzarella prévue jeudi")
  titre                 text not null,
  -- Message détaillé ("Conso moy 2.5kg/j, stock 4kg, prévision épuisement 2026-05-16")
  message               text,
  -- Action suggérée que le gérant peut faire en 1 clic
  action_label          text,                                   -- "Valider le bon de commande"
  action_url            text,                                   -- "/admin/fournisseurs/bons/<uuid>"
  -- Données structurées (id de la ressource concernée, valeurs comparées, etc.)
  data                  jsonb not null default '{}'::jsonb,
  -- Workflow : résolu (= gérant a agi ou ignoré) ou pas
  resolu                boolean not null default false,
  resolu_at             timestamptz,
  resolu_par            uuid references employes(id) on delete set null,
  -- Note de résolution (raison du "ignoré", lien vers ce qui a été fait…)
  resolu_note           text,
  created_at            timestamptz not null default now()
);

-- Index : dashboard liste les findings non résolus par urgence
create index if not exists idx_findings_non_resolus
  on agent_findings(urgence, created_at desc) where resolu = false;
create index if not exists idx_findings_agent_date
  on agent_findings(agent_id, created_at desc);
create index if not exists idx_findings_type
  on agent_findings(type, resolu) where resolu = false;


-- ─── 3. RLS désactivée (cohérent avec le reste du schéma single-tenant) ───
alter table agents_runs    disable row level security;
alter table agent_findings disable row level security;


-- ─── Diagnostic ───────────────────────────────────────────────
select
  'Migration 0082 OK' as status,
  (select count(*) from agents_runs)     as nb_runs,
  (select count(*) from agent_findings)  as nb_findings,
  (select count(*) from agent_findings where resolu = false) as nb_findings_actifs;
