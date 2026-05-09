-- ============================================================
-- Migration 0074 — Phase 0 : Préparation outil 1 pour le ONLINE
-- ============================================================
-- Objectif : préparer l'outil 1 (app-restaurant) à recevoir les commandes
-- depuis l'outil 2 (site-restaurant à venir). Multi-établissements pensé
-- dès maintenant (champ etablissement_id partout, 1 seul resto par défaut).
--
-- Inclus :
--  1. Table etablissements (multi-resto futur)
--  2. Extensions recettes (vendable_online, image_url)
--  3. Extensions commandes (creneau_retrait + statuts ONLINE)
--  4. Extensions clients (email_verifie, auth_user_id pour magic link)
--  5. Tables : plats_du_jour, promotions, codes_promo, cartes_cadeaux,
--     mouvements_cartes_cadeaux, capacite_cuisine_par_creneau, avis_publics
-- ============================================================

-- ─── 1. ÉTABLISSEMENTS (multi-resto futur) ────────────────────
create table if not exists etablissements (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null,
  slug             text unique not null,
  adresse          text,
  telephone        text,
  email            text,
  siret            text,
  tva_intra        text,
  horaires_json    jsonb,
  actif            boolean default true,
  is_principal     boolean default false,
  created_at       timestamptz default now()
);

-- 1 seul établissement par défaut pour le MVP — l'UI multi-resto viendra plus tard
insert into etablissements (nom, slug, is_principal)
values ('Établissement principal', 'principal', true)
on conflict (slug) do nothing;

create index if not exists idx_etablissements_actif on etablissements(actif) where actif = true;


-- ─── 2. RECETTES — vendable en ligne + photo ──────────────────
alter table recettes add column if not exists vendable_online  boolean default false;
alter table recettes add column if not exists image_url        text;
alter table recettes add column if not exists etablissement_id uuid references etablissements(id);

create index if not exists idx_recettes_online on recettes(vendable_online) where vendable_online = true;

update recettes
set etablissement_id = (select id from etablissements where is_principal = true limit 1)
where etablissement_id is null;


-- ─── 3. COMMANDES — créneau retrait + statuts ONLINE ──────────
alter table commandes add column if not exists creneau_retrait  timestamptz;
alter table commandes add column if not exists etablissement_id uuid references etablissements(id);

create index if not exists idx_commandes_creneau_retrait on commandes(creneau_retrait)
  where creneau_retrait is not null;

-- Étend les statuts pour gérer le flow ONLINE (pret_pour_retrait + retire_par_client)
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in (
    'en_attente','en_preparation','pret','servi','encaisse','annule',
    'pret_pour_retrait','retire_par_client'
  ));

update commandes
set etablissement_id = (select id from etablissements where is_principal = true limit 1)
where etablissement_id is null;


-- ─── 4. CLIENTS — auth Supabase pour magic link + email vérifié ─
alter table clients add column if not exists email_verifie    boolean default false;
alter table clients add column if not exists auth_user_id     uuid;
alter table clients add column if not exists etablissement_id uuid references etablissements(id);

create unique index if not exists idx_clients_auth_user_unique on clients(auth_user_id)
  where auth_user_id is not null;

update clients
set etablissement_id = (select id from etablissements where is_principal = true limit 1)
where etablissement_id is null;


-- ─── 5. PLATS DU JOUR (sélectionnés par le manager) ───────────
create table if not exists plats_du_jour (
  id                    uuid primary key default gen_random_uuid(),
  etablissement_id      uuid references etablissements(id),
  recette_id            uuid not null references recettes(id) on delete cascade,
  date_debut            date not null default current_date,
  date_fin              date,
  prix_special          decimal(10,2),
  description_speciale  text,
  ordre                 integer default 0,
  actif                 boolean default true,
  created_at            timestamptz default now()
);

create index if not exists idx_plats_du_jour_actif on plats_du_jour(actif, date_debut, date_fin);


-- ─── 6. PROMOTIONS (bannières site) ───────────────────────────
create table if not exists promotions (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id uuid references etablissements(id),
  titre            text not null,
  description      text,
  image_url        text,
  date_debut       timestamptz not null default now(),
  date_fin         timestamptz,
  cta_label        text,
  cta_url          text,
  visible_site     boolean default true,
  actif            boolean default true,
  created_at       timestamptz default now()
);

create index if not exists idx_promotions_actif on promotions(actif, date_debut, date_fin);


-- ─── 7. CODES PROMO ───────────────────────────────────────────
create table if not exists codes_promo (
  id                       uuid primary key default gen_random_uuid(),
  etablissement_id         uuid references etablissements(id),
  code                     text unique not null,
  type                     text not null check (type in ('pourcentage','euros')),
  valeur                   decimal(10,2) not null,
  montant_min              decimal(10,2) default 0,
  date_debut               timestamptz default now(),
  date_fin                 timestamptz,
  usage_max                integer,
  usage_actuel             integer default 0,
  reserve_fidelite_niveau  text,
  description              text,
  actif                    boolean default true,
  created_at               timestamptz default now()
);

create index if not exists idx_codes_promo_code on codes_promo(code) where actif = true;


-- ─── 8. CARTES CADEAUX ────────────────────────────────────────
create table if not exists cartes_cadeaux (
  id                    uuid primary key default gen_random_uuid(),
  etablissement_id      uuid references etablissements(id),
  code                  text unique not null,
  montant_initial       decimal(10,2) not null,
  montant_restant       decimal(10,2) not null,
  acheteur_nom          text,
  acheteur_email        text,
  acheteur_client_id    uuid references clients(id),
  beneficiaire_nom      text,
  beneficiaire_email    text,
  message_personnel     text,
  date_emission         timestamptz default now(),
  date_validite_fin     timestamptz,
  statut                text default 'active' check (statut in ('active','utilisee','expiree','annulee')),
  paiement_stripe_id    text,
  created_at            timestamptz default now()
);

create index if not exists idx_cartes_cadeaux_code     on cartes_cadeaux(code) where statut = 'active';
create index if not exists idx_cartes_cadeaux_acheteur on cartes_cadeaux(acheteur_client_id);

create table if not exists mouvements_cartes_cadeaux (
  id              uuid primary key default gen_random_uuid(),
  carte_cadeau_id uuid not null references cartes_cadeaux(id) on delete cascade,
  type            text not null check (type in ('achat','utilisation','remboursement','expiration')),
  montant         decimal(10,2) not null,
  commande_id     uuid references commandes(id),
  motif           text,
  created_at      timestamptz default now()
);

create index if not exists idx_mouv_cartes_cadeau on mouvements_cartes_cadeaux(carte_cadeau_id, created_at desc);


-- ─── 9. CAPACITÉ CUISINE (limite commandes ONLINE par créneau) ─
create table if not exists capacite_cuisine_par_creneau (
  id                  uuid primary key default gen_random_uuid(),
  etablissement_id    uuid references etablissements(id),
  jour_semaine        integer check (jour_semaine between 0 and 6),
  heure_debut         time not null,
  heure_fin           time not null,
  duree_creneau_min   integer default 15,
  max_commandes       integer not null default 5,
  actif               boolean default true,
  created_at          timestamptz default now()
);

create index if not exists idx_capacite_jour on capacite_cuisine_par_creneau(jour_semaine, actif);


-- ─── 10. AVIS PUBLICS (collecte post-commande, modération) ────
create table if not exists avis_publics (
  id                    uuid primary key default gen_random_uuid(),
  etablissement_id      uuid references etablissements(id),
  commande_id           uuid references commandes(id),
  client_id             uuid references clients(id),
  source                text default 'site' check (source in ('site','google','tripadvisor','thefork','autre')),
  source_id_externe     text,
  note                  integer not null check (note between 1 and 5),
  titre                 text,
  contenu               text,
  reponse               text,
  reponse_date          timestamptz,
  brouillon_reponse_ia  text,
  statut                text default 'en_attente' check (statut in ('en_attente','publie','rejete','signale')),
  langue                text default 'fr',
  created_at            timestamptz default now()
);

create index if not exists idx_avis_statut   on avis_publics(statut, created_at desc);
create index if not exists idx_avis_source   on avis_publics(source);
create index if not exists idx_avis_commande on avis_publics(commande_id) where commande_id is not null;


-- ─── 11. Diagnostic final ─────────────────────────────────────
select
  'Migration 0074 OK' as status,
  (select count(*) from etablissements)                  as nb_etablissements,
  (select count(*) from recettes where vendable_online)  as nb_recettes_online,
  (select count(*) from plats_du_jour)                   as nb_plats_du_jour,
  (select count(*) from promotions)                      as nb_promotions,
  (select count(*) from codes_promo)                     as nb_codes_promo,
  (select count(*) from cartes_cadeaux)                  as nb_cartes_cadeaux,
  (select count(*) from capacite_cuisine_par_creneau)    as nb_capacites,
  (select count(*) from avis_publics)                    as nb_avis;
