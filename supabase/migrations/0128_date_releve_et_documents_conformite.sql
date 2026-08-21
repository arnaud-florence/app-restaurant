-- ════════════════════════════════════════════════════════════════════
-- 0128 — Date métier des relevés température + coffre à documents
-- ════════════════════════════════════════════════════════════════════
--
-- ─── 1. releves_temperatures.date_releve ─────────────────────────────
-- La table n'avait que `created_at` : l'horodatage d'INSERTION. Saisir
-- après coup le relevé d'hier soir le datait d'aujourd'hui — le registre
-- HACCP imprimable, l'agent HACCP (« il manque le relevé du matin ») et
-- les compteurs comptaient alors le mauvais jour.
-- `date_releve` est la date MÉTIER, saisissable dans le formulaire ;
-- `created_at` reste l'horodatage technique. Backfill depuis created_at.
--
-- ─── 2. documents_conformite ─────────────────────────────────────────
-- Coffre des justificatifs de conformité : permis d'exploitation,
-- attestations de formation HACCP, rapports de contrôle, assurances…
-- Fichiers stockés dans le bucket Storage `conformite`, une ligne par
-- document ici. `categorie` est un TEXTE LIBRE (même philosophie que la
-- traçabilité 0126 : on référence ce qu'on veut, pas ce qu'une liste
-- impose). `date_expiration` alimente de futures alertes d'échéance.
-- ════════════════════════════════════════════════════════════════════

alter table releves_temperatures
  add column if not exists date_releve date not null default current_date;

update releves_temperatures
   set date_releve = created_at::date
 where date_releve = current_date
   and created_at::date <> current_date;

create index if not exists idx_releves_date on releves_temperatures(date_releve desc);

create table if not exists documents_conformite (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  categorie       text,
  fichier_url     text not null,
  fichier_nom     text,
  taille_octets   bigint,
  date_document   date,
  date_expiration date,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_docs_conformite_expiration
  on documents_conformite(date_expiration) where date_expiration is not null;

alter table documents_conformite disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int;
begin
  select count(*) into nb from releves_temperatures where date_releve is null;
  raise notice '── relevés sans date_releve : % (attendu 0) ──', nb;
  select count(*) into nb from documents_conformite;
  raise notice '── documents_conformite : % ligne(s) ──', nb;
end $$;
