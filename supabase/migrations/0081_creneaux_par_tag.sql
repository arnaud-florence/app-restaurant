-- ============================================================
-- Migration 0081 : créneaux séparés par zone (SNACKING / PIZZA / BAR)
-- ============================================================
-- Une commande COMPTOIR ou ONLINE peut contenir des articles destinés à
-- plusieurs zones (ex : 1 sandwich SNACKING + 1 pizza PIZZA). Chaque zone
-- a son propre planning de capacité (cf. capacite_cuisine_par_creneau.tag_destination).
-- Or jusqu'ici on stockait un seul creneau_retrait global, ce qui rendait
-- impossible la consultation/saturation distincte des plannings.
--
-- Ce JSONB permet de stocker un horaire par zone :
--   { "SNACKING": "2026-05-13T14:30:00.000Z", "PIZZA": "2026-05-13T14:45:00.000Z" }
--
-- Le champ creneau_retrait existant reste = max() des valeurs du JSONB,
-- pour rétrocompat (tri agenda, filtres existants).
-- ============================================================

alter table commandes
  add column if not exists creneaux_par_tag jsonb not null default '{}'::jsonb;

-- Index GIN pour requêter `creneaux_par_tag ? 'SNACKING'` etc.
create index if not exists idx_commandes_creneaux_par_tag
  on commandes using gin (creneaux_par_tag);

-- RLS reste off (single-tenant + middleware Module 28)
alter table commandes disable row level security;


-- ─── Diagnostic ───────────────────────────────────────────────
select
  'Migration 0081 OK' as status,
  (select count(*) from commandes where creneaux_par_tag != '{}'::jsonb) as nb_commandes_multi_creneaux,
  (select count(*) from commandes where creneau_retrait is not null)      as nb_commandes_avec_creneau;
