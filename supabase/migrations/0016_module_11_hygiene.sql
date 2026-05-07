-- ============================================================
-- 0016 — Module 11 : Hygiène & sécurité alimentaire (/admin/hygiene)
-- ============================================================
-- Contenu :
--   1. plans_haccp                  — points critiques HACCP
--   2. lots_produits                — traçabilité par lot/DLC/fournisseur
--   3. non_conformites              — registre incidents
--   4. interventions_antiparasitaire — registre 3D
--   5. plan_nettoyage               — plan zone × fréquence × produit
--   6. ALTER releves_temperatures   ADD moment ('matin'|'soir'|'autre')
--   7. ALTER checklists_hygiene     ADD signature_text
--   8. Disable RLS sur les nouvelles tables
--
-- Note : on RÉUTILISE procedures_hygiene + checklists_hygiene
-- et releves_temperatures du Module 1 init.
--
-- Idempotent.
-- ============================================================

-- ─── 1. plans_haccp ─────────────────────────────────────────
create table if not exists plans_haccp (
  id                      uuid primary key default gen_random_uuid(),
  titre                   text not null,
  type_danger             text not null check (type_danger in ('biologique','chimique','physique','allergene')),
  description_danger      text not null,
  ccp_numero              integer,                              -- numéro de CCP si applicable
  mesure_preventive       text not null,
  surveillance_methode    text,
  surveillance_frequence  text,
  limite_critique         text,
  action_corrective       text not null,
  responsable_poste       text,
  actif                   boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_haccp_actif on plans_haccp(actif) where actif = true;
create index if not exists idx_haccp_ccp   on plans_haccp(ccp_numero) where ccp_numero is not null;

alter table plans_haccp disable row level security;

-- ─── 2. lots_produits ───────────────────────────────────────
create table if not exists lots_produits (
  id                  uuid primary key default gen_random_uuid(),
  ingredient_id       uuid references ingredients(id) on delete set null,
  lot_numero          text not null,
  dlc                 date,
  fournisseur_id      uuid references fournisseurs(id) on delete set null,
  fournisseur_nom     text,                                 -- snapshot au cas où le fournisseur change
  quantite            decimal(10,3) not null default 0,
  unite               text,
  bon_commande_id     uuid references bons_commande(id) on delete set null,
  date_reception      date not null default current_date,
  statut              text not null default 'en_stock'
                      check (statut in ('en_stock','consomme','jete','expire','rappele')),
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_lots_ingredient   on lots_produits(ingredient_id, date_reception desc);
create index if not exists idx_lots_dlc          on lots_produits(dlc) where dlc is not null and statut = 'en_stock';
create index if not exists idx_lots_fournisseur  on lots_produits(fournisseur_id);
create index if not exists idx_lots_statut       on lots_produits(statut, date_reception desc);
create index if not exists idx_lots_bon          on lots_produits(bon_commande_id) where bon_commande_id is not null;

alter table lots_produits disable row level security;

-- ─── 3. non_conformites ─────────────────────────────────────
create table if not exists non_conformites (
  id                  uuid primary key default gen_random_uuid(),
  date_constat        date not null default current_date,
  type                text not null check (type in ('temperature','hygiene','produit','equipement','procedure','autre')),
  gravite             text not null default 'mineure' check (gravite in ('mineure','majeure','critique')),
  description         text not null,
  action_corrective   text,
  responsable_id      uuid references employes(id) on delete set null,
  statut              text not null default 'ouverte' check (statut in ('ouverte','en_cours','resolue')),
  resolved_at         timestamptz,
  resolved_by         uuid references employes(id) on delete set null,
  releve_temperature_id uuid references releves_temperatures(id) on delete set null,  -- si découlée d'un relevé NOK
  created_at          timestamptz not null default now()
);

create index if not exists idx_nc_statut    on non_conformites(statut, date_constat desc);
create index if not exists idx_nc_gravite   on non_conformites(gravite, statut);
create index if not exists idx_nc_resp      on non_conformites(responsable_id, statut);

alter table non_conformites disable row level security;

-- ─── 4. interventions_antiparasitaire ───────────────────────
create table if not exists interventions_antiparasitaire (
  id                      uuid primary key default gen_random_uuid(),
  date_intervention       date not null,
  prestataire             text not null,
  type_traitement         text not null check (type_traitement in ('preventif','curatif','controle','urgence')),
  zones                   text[] not null default '{}',
  produits_utilises       text,
  observations            text,
  prochaine_intervention  date,
  document_url            text,
  cout                    decimal(10,2),
  created_at              timestamptz not null default now()
);

create index if not exists idx_3d_date       on interventions_antiparasitaire(date_intervention desc);
create index if not exists idx_3d_prochaine  on interventions_antiparasitaire(prochaine_intervention) where prochaine_intervention is not null;

alter table interventions_antiparasitaire disable row level security;

-- ─── 5. plan_nettoyage ──────────────────────────────────────
create table if not exists plan_nettoyage (
  id                  uuid primary key default gen_random_uuid(),
  zone                text not null,                     -- ex: "Cuisine — Plonge"
  equipement          text,                              -- ex: "Lave-vaisselle"
  frequence           text not null check (frequence in ('apres_service','quotidien','hebdo','mensuel','trimestriel','annuel')),
  produit_utilise     text,
  methode             text,
  responsable_poste   text,
  ordre               integer not null default 0,
  actif               boolean not null default true,
  derniere_execution  date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_nettoyage_zone     on plan_nettoyage(zone, ordre);
create index if not exists idx_nettoyage_freq     on plan_nettoyage(frequence) where actif = true;

alter table plan_nettoyage disable row level security;

-- ─── 6. ALTER releves_temperatures ──────────────────────────
do $$ begin
  alter table releves_temperatures add column if not exists moment text
    check (moment in ('matin','midi','soir','autre'));
exception when duplicate_column then null; end $$;

create index if not exists idx_releves_moment on releves_temperatures(created_at desc, moment);

-- ─── 7. ALTER checklists_hygiene ────────────────────────────
do $$ begin
  alter table checklists_hygiene add column if not exists signature_text text;
exception when duplicate_column then null; end $$;

-- Disable RLS sur les tables existantes touchées (au cas où Supabase
-- ré-active RLS suite aux ALTER ci-dessus)
alter table releves_temperatures disable row level security;
alter table checklists_hygiene   disable row level security;
alter table procedures_hygiene   disable row level security;

-- ─── 8. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from plans_haccp)                  as nb_haccp,
  (select count(*) from lots_produits)                as nb_lots,
  (select count(*) from non_conformites)              as nb_nc,
  (select count(*) from interventions_antiparasitaire) as nb_3d,
  (select count(*) from plan_nettoyage)               as nb_nettoyage,
  (select count(*) from procedures_hygiene)           as nb_proc,
  (select count(*) from releves_temperatures)         as nb_releves;

-- Vérif colonnes ajoutées
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'releves_temperatures' and column_name = 'moment')
     or (table_name = 'checklists_hygiene'   and column_name = 'signature_text'));

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (
     'plans_haccp','lots_produits','non_conformites',
     'interventions_antiparasitaire','plan_nettoyage',
     'releves_temperatures','checklists_hygiene','procedures_hygiene'
   )
 order by c.relname;
