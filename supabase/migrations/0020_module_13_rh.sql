-- ============================================================
-- 0020 — Module 13 : Ressources humaines (/admin/rh)
-- ============================================================
-- Contenu :
--   1. ALTER employes ADD date_embauche, date_sortie,
--      solde_conges_jours, notes_internes
--   2. CREATE documents_employes (URL externe, pas d'upload)
--   3. CREATE formations_employes (HACCP, permis exploitation, SST)
--   4. Disable RLS sur les nouvelles tables + employes/planning/
--      pointage/conges (au cas où Supabase les ré-active)
--
-- Tables existantes réutilisées (Module 1 init) :
--   employes, planning, pointage, conges
--
-- Idempotent.
-- ============================================================

-- ─── 1. ALTER employes ──────────────────────────────────────
do $$ begin
  alter table employes add column if not exists date_embauche       date;
  alter table employes add column if not exists date_sortie         date;
  alter table employes add column if not exists solde_conges_jours  decimal(5,2) not null default 25;
  alter table employes add column if not exists notes_internes      text;
exception when duplicate_column then null; end $$;

create index if not exists idx_employes_embauche on employes(date_embauche desc) where date_sortie is null;

-- ─── 2. documents_employes ──────────────────────────────────
create table if not exists documents_employes (
  id              uuid primary key default gen_random_uuid(),
  employe_id      uuid not null references employes(id) on delete cascade,
  type            text not null check (type in ('contrat','cni','passeport','permis_travail','casier','visite_medicale','rib','attestation','autre')),
  nom             text not null,
  url             text not null,                                     -- URL externe (Drive, Dropbox, etc.)
  date_emission   date,
  date_expiration date,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_docs_employe on documents_employes(employe_id, type);
create index if not exists idx_docs_expir   on documents_employes(date_expiration) where date_expiration is not null;

alter table documents_employes disable row level security;

-- ─── 3. formations_employes ─────────────────────────────────
create table if not exists formations_employes (
  id              uuid primary key default gen_random_uuid(),
  employe_id      uuid not null references employes(id) on delete cascade,
  formation       text not null check (formation in ('haccp','permis_exploitation','sst','incendie','allergenes','hygiene','autre')),
  titre           text not null,
  organisme       text,
  date_obtention  date not null,
  date_expiration date,
  document_url    text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_formations_employe on formations_employes(employe_id, formation);
create index if not exists idx_formations_expir   on formations_employes(date_expiration) where date_expiration is not null;

alter table formations_employes disable row level security;

-- Disable RLS aussi sur les tables ALTERées + utilisées
alter table employes  disable row level security;
alter table planning  disable row level security;
alter table pointage  disable row level security;
alter table conges    disable row level security;

-- ─── 4. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from documents_employes)  as nb_docs,
  (select count(*) from formations_employes) as nb_formations,
  (select count(*) from employes where date_embauche is not null) as nb_emp_avec_embauche;

-- Vérif colonnes ajoutées
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'employes'
   and column_name in ('date_embauche','date_sortie','solde_conges_jours','notes_internes');

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('documents_employes','formations_employes','employes','planning','pointage','conges')
 order by c.relname;
