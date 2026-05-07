-- ============================================================
-- 0031 — Module 19 : Gestion des groupes (/admin/groupes)
-- ============================================================
-- 3 nouvelles tables :
--   1. groupes              — fiche groupe + tour-opérateur
--   2. groupes_menus        — plats inclus dans le forfait du groupe
--   3. groupes_paiements    — arrhes / acomptes / soldes
-- ============================================================

-- ─── 1. groupes ────────────────────────────────────────────
create table if not exists groupes (
  id                          uuid primary key default gen_random_uuid(),
  nom                         text not null,
  type                        text not null default 'tourisme' check (type in ('tourisme','entreprise','famille','scolaire','associatif','autre')),
  tour_operateur              text,
  contact_nom                 text,
  contact_telephone           text,
  contact_email               text,
  date_visite                 date not null,
  heure_arrivee               time,
  heure_depart                time,
  nb_personnes                integer not null check (nb_personnes > 0),
  prix_par_personne_ht        decimal(10,2) not null default 0,
  taux_tva                    decimal(5,2) not null default 10,
  facturation_via_to          boolean not null default false,
  statut                      text not null default 'demande' check (statut in ('demande','confirme','realise','annule')),
  notes                       text,
  zone_assignee               text,                                  -- ex: "Salle privative"
  responsable_employe_id      uuid references employes(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_groupes_date    on groupes(date_visite);
create index if not exists idx_groupes_statut  on groupes(statut, date_visite);
create index if not exists idx_groupes_to      on groupes(tour_operateur) where tour_operateur is not null;

alter table groupes disable row level security;

-- ─── 2. groupes_menus ──────────────────────────────────────
create table if not exists groupes_menus (
  id                      uuid primary key default gen_random_uuid(),
  groupe_id               uuid not null references groupes(id) on delete cascade,
  recette_id              uuid references recettes(id) on delete set null,
  recette_nom_libre       text,                                      -- si recette supprimée, on garde le nom
  categorie               text,                                      -- 'entree','plat','dessert','boisson','autre'
  quantite_par_personne   decimal(5,2) not null default 1,
  prix_negocie_ht         decimal(10,2),                             -- si null = inclus dans forfait
  ordre                   integer not null default 0,
  notes                   text,
  created_at              timestamptz not null default now()
);

create index if not exists idx_groupes_menus_groupe on groupes_menus(groupe_id, ordre);

alter table groupes_menus disable row level security;

-- ─── 3. groupes_paiements ──────────────────────────────────
create table if not exists groupes_paiements (
  id              uuid primary key default gen_random_uuid(),
  groupe_id       uuid not null references groupes(id) on delete cascade,
  type            text not null check (type in ('arrhes','acompte','solde','remboursement')),
  date_paiement   date not null default current_date,
  montant         decimal(10,2) not null,
  methode         text not null check (methode in ('especes','carte','virement','cheque','autre')),
  reference       text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_grp_paiements_groupe on groupes_paiements(groupe_id, date_paiement);

alter table groupes_paiements disable row level security;

-- Diagnostic
select
  (select count(*) from groupes)             as nb_groupes,
  (select count(*) from groupes_menus)       as nb_menus,
  (select count(*) from groupes_paiements)   as nb_paiements;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('groupes','groupes_menus','groupes_paiements')
 order by c.relname;
