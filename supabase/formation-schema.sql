-- ════════════════════════════════════════════════════════════════
-- CASATASIA — Schéma complet pour l'environnement de FORMATION (bac à sable)
-- Généré par scripts/build-formation-schema.mjs
-- Concaténation de 98 migrations (DDL idempotent).
-- À coller dans : Supabase (projet formation) → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0001_init.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- app-restaurant — Schéma initial complet
-- ============================================================
-- À exécuter sur un projet Supabase VIERGE (dédié, séparé de
-- monrestaurant). Copier-coller ce fichier dans :
--   Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Extension uuid (Supabase l'a d'office, mais on s'assure)
create extension if not exists "pgcrypto";

-- ─── 1. INGRÉDIENTS ─────────────────────────────────────────
create table ingredients (
  id                      uuid primary key default gen_random_uuid(),
  nom                     text not null,
  categorie               text not null,
  unite                   text not null,
  prix_achat_ht           decimal(10,4) not null default 0,
  fournisseur_principal   text,
  fournisseur_secondaire  text,
  stock_actuel            decimal(10,3) default 0,
  stock_minimum           decimal(10,3) default 0,
  stock_maximum           decimal(10,3) default 0,
  dlc_moyenne_jours       integer default 0,
  allergenes              text[] default '{}',
  actif                   boolean default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ─── 2. RECETTES ────────────────────────────────────────────
create table recettes (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text not null,
  categorie           text not null,
  tag_destination     text not null check (tag_destination in ('CUISINE','PIZZA','BAR')),
  description         text,
  temps_preparation   integer default 0,
  nb_portions         integer default 1,
  prix_vente_ht       decimal(10,2) default 0,
  tva                 decimal(5,2) default 10,
  actif               boolean default true,
  photo_url           text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── 3. INGRÉDIENTS PAR RECETTE ─────────────────────────────
create table recette_ingredients (
  id              uuid primary key default gen_random_uuid(),
  recette_id      uuid references recettes(id) on delete cascade,
  ingredient_id   uuid references ingredients(id),
  quantite        decimal(10,4) not null,
  unite           text not null
);

-- ─── 4. TABLES DU RESTAURANT ────────────────────────────────
create table tables_restaurant (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  capacite            integer default 2,
  zone                text default 'salle',
  statut              text default 'libre' check (statut in ('libre','occupee','reservee','a_encaisser')),
  commande_active_id  uuid,
  created_at          timestamptz default now()
);

-- ─── 5. COMMANDES ───────────────────────────────────────────
create table commandes (
  id                  uuid primary key default gen_random_uuid(),
  numero              text unique not null,
  source              text not null check (source in ('ONLINE','TABLE','COMPTOIR')),
  numero_table        text,
  statut              text not null default 'en_attente'
                      check (statut in ('en_attente','en_preparation','pret','servi','encaisse','annule')),
  montant_total_ht    decimal(10,2) default 0,
  montant_total_ttc   decimal(10,2) default 0,
  mode_paiement       text,
  client_nom          text,
  client_telephone    text,
  client_email        text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── 6. ARTICLES PAR COMMANDE ───────────────────────────────
create table commande_articles (
  id                  uuid primary key default gen_random_uuid(),
  commande_id         uuid references commandes(id) on delete cascade,
  recette_id          uuid references recettes(id),
  quantite            integer default 1,
  prix_unitaire_ht    decimal(10,2) default 0,
  tag_destination     text not null check (tag_destination in ('CUISINE','PIZZA','BAR')),
  commentaire         text,
  statut              text default 'en_attente'
                      check (statut in ('en_attente','en_preparation','pret','servi'))
);

-- FK différée tables_restaurant.commande_active_id → commandes.id
alter table tables_restaurant
  add constraint tables_restaurant_commande_active_fkey
  foreign key (commande_active_id) references commandes(id) on delete set null;

-- ─── 7. EMPLOYÉS ────────────────────────────────────────────
create table employes (
  id                  uuid primary key default gen_random_uuid(),
  prenom              text not null,
  nom                 text not null,
  poste               text not null,
  type_contrat        text default 'CDI',
  email               text unique,
  telephone           text,
  salaire_horaire     decimal(8,2) default 0,
  heures_contrat      integer default 35,
  actif               boolean default true,
  created_at          timestamptz default now()
);

-- ─── 8. PLANNING ────────────────────────────────────────────
create table planning (
  id              uuid primary key default gen_random_uuid(),
  employe_id      uuid references employes(id),
  date_travail    date not null,
  heure_debut     time not null,
  heure_fin       time not null,
  poste_jour      text,
  notes           text,
  created_at      timestamptz default now()
);

-- ─── 9. POINTAGE ────────────────────────────────────────────
create table pointage (
  id                    uuid primary key default gen_random_uuid(),
  employe_id            uuid references employes(id),
  date_pointage         date not null,
  heure_arrivee         time,
  heure_depart          time,
  heures_travaillees    decimal(5,2),
  notes                 text
);

-- ─── 10. CONGÉS ET ABSENCES ─────────────────────────────────
create table conges (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid references employes(id),
  date_debut    date not null,
  date_fin      date not null,
  type          text default 'conge' check (type in ('conge','absence','maladie','formation')),
  statut        text default 'demande' check (statut in ('demande','valide','refuse')),
  notes         text,
  created_at    timestamptz default now()
);

-- ─── 11. FOURNISSEURS ───────────────────────────────────────
create table fournisseurs (
  id                          uuid primary key default gen_random_uuid(),
  nom                         text not null,
  contact                     text,
  telephone                   text,
  email                       text,
  adresse                     text,
  conditions_tarifaires       text,
  delai_livraison_jours       integer default 1,
  minimum_commande            decimal(10,2) default 0,
  jours_livraison             text[],
  note_qualite                integer default 5,
  note_ponctualite            integer default 5,
  actif                       boolean default true,
  created_at                  timestamptz default now()
);

-- ─── 12. BONS DE COMMANDE FOURNISSEURS ──────────────────────
create table bons_commande (
  id                      uuid primary key default gen_random_uuid(),
  fournisseur_id          uuid references fournisseurs(id),
  statut                  text default 'brouillon' check (statut in ('brouillon','envoye','recu','annule')),
  date_commande           date default current_date,
  date_livraison_prevue   date,
  montant_total_ht        decimal(10,2) default 0,
  notes                   text,
  created_at              timestamptz default now()
);

-- ─── 13. LIGNES DES BONS DE COMMANDE ────────────────────────
create table bon_commande_lignes (
  id                      uuid primary key default gen_random_uuid(),
  bon_commande_id         uuid references bons_commande(id) on delete cascade,
  ingredient_id           uuid references ingredients(id),
  quantite_commandee      decimal(10,3),
  prix_unitaire_ht        decimal(10,4),
  quantite_recue          decimal(10,3) default 0
);

-- ─── 14. MOUVEMENTS DE STOCK ────────────────────────────────
create table mouvements_stock (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   uuid references ingredients(id),
  type            text not null check (type in ('entree','sortie','perte','inventaire')),
  quantite        decimal(10,3) not null,
  motif           text,
  commande_id     uuid,
  employe_id      uuid,
  created_at      timestamptz default now()
);

-- ─── 15. CHAMBRES ───────────────────────────────────────────
create table chambres (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  numero          text not null unique,
  capacite        integer default 2,
  prix_nuit_ht    decimal(10,2) default 0,
  description     text,
  equipements     text[] default '{}',
  photos          text[] default '{}',
  actif           boolean default true
);

-- ─── 16. RÉSERVATIONS CHAMBRES ──────────────────────────────
create table reservations_chambres (
  id                  uuid primary key default gen_random_uuid(),
  chambre_id          uuid references chambres(id),
  client_nom          text not null,
  client_email        text,
  client_telephone    text,
  date_arrivee        date not null,
  date_depart         date not null,
  nb_personnes        integer default 1,
  montant_total       decimal(10,2) default 0,
  acompte_verse       decimal(10,2) default 0,
  statut              text default 'demande' check (statut in ('demande','confirmee','annulee','terminee')),
  notes               text,
  created_at          timestamptz default now()
);

-- ─── 17. ÉVÉNEMENTS ─────────────────────────────────────────
create table evenements (
  id                  uuid primary key default gen_random_uuid(),
  titre               text not null,
  type                text,
  date_evenement      date,
  nb_personnes        integer default 0,
  montant_devis       decimal(10,2) default 0,
  acompte_verse       decimal(10,2) default 0,
  statut              text default 'demande',
  client_nom          text,
  client_email        text,
  client_telephone    text,
  notes               text,
  created_at          timestamptz default now()
);

-- ─── 18. RELEVÉS DE TEMPÉRATURES ────────────────────────────
create table releves_temperatures (
  id                          uuid primary key default gen_random_uuid(),
  equipement                  text not null,
  type_equipement             text check (type_equipement in ('frigo','congelateur','chambre_froide','bain_marie')),
  temperature                 decimal(5,2) not null,
  temperature_min_ok          decimal(5,2),
  temperature_max_ok          decimal(5,2),
  conforme                    boolean,
  employe_id                  uuid references employes(id),
  notes                       text,
  created_at                  timestamptz default now()
);

-- ─── 19. PROCÉDURES HYGIÈNE ─────────────────────────────────
create table procedures_hygiene (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  moment          text check (moment in ('ouverture','service','fermeture','hebdomadaire','mensuel')),
  poste_concerne  text,
  description     text,
  ordre           integer default 0,
  actif           boolean default true
);

-- ─── 20. CHECKLISTS HYGIÈNE ─────────────────────────────────
create table checklists_hygiene (
  id                  uuid primary key default gen_random_uuid(),
  procedure_id        uuid references procedures_hygiene(id),
  employe_id          uuid references employes(id),
  date_realisation    date default current_date,
  heure_realisation   time default current_time,
  valide              boolean default false,
  commentaire         text
);

-- ─── 21. ÉQUIPEMENTS ET MAINTENANCE ─────────────────────────
create table equipements (
  id                          uuid primary key default gen_random_uuid(),
  nom                         text not null,
  marque                      text,
  modele                      text,
  numero_serie                text,
  date_achat                  date,
  valeur_achat                decimal(10,2),
  garantie_fin                date,
  prestataire_maintenance     text,
  contact_prestataire         text,
  frequence_maintenance       text,
  prochaine_maintenance       date,
  actif                       boolean default true
);

-- ─── 22. INTERVENTIONS MAINTENANCE ──────────────────────────
create table interventions_maintenance (
  id                      uuid primary key default gen_random_uuid(),
  equipement_id           uuid references equipements(id),
  type                    text check (type in ('preventive','curative','controle_obligatoire')),
  date_intervention       date,
  description             text,
  prestataire             text,
  cout                    decimal(10,2) default 0,
  prochaine_intervention  date,
  documents_url           text[]
);

-- ─── 23. OBLIGATIONS LÉGALES ────────────────────────────────
create table obligations_legales (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  categorie       text,
  description     text,
  date_echeance   date,
  frequence       text,
  statut          text default 'a_faire' check (statut in ('a_faire','fait','en_cours')),
  prestataire     text,
  document_url    text,
  notes           text
);

-- ─── 24. DÉCHETS ────────────────────────────────────────────
create table suivi_dechets (
  id              uuid primary key default gen_random_uuid(),
  date_pesee      date default current_date,
  type_dechet     text check (type_dechet in ('biodechet','carton','verre','plastique','huile','autre')),
  poids_kg        decimal(8,3),
  cout_estime     decimal(8,2),
  employe_id      uuid references employes(id),
  notes           text
);

-- ─── 25. CLIENTS ────────────────────────────────────────────
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  prenom              text,
  nom                 text not null,
  email               text unique,
  telephone           text,
  adresse             text,
  date_naissance      date,
  allergies           text[] default '{}',
  preferences         text,
  points_fidelite     integer default 0,
  niveau_fidelite     text default 'standard',
  notes_internes      text,
  created_at          timestamptz default now()
);

-- ─── 26. PARAMÈTRES DE L'ÉTABLISSEMENT ──────────────────────
create table parametres (
  id              uuid primary key default gen_random_uuid(),
  cle             text unique not null,
  valeur          text,
  description     text,
  updated_at      timestamptz default now()
);

-- ─── 27. VENTES JOURNALIÈRES (résumé) ───────────────────────
create table ventes_journalieres (
  id                  uuid primary key default gen_random_uuid(),
  date_vente          date unique not null,
  ca_total_ht         decimal(10,2) default 0,
  ca_total_ttc        decimal(10,2) default 0,
  nb_commandes        integer default 0,
  ticket_moyen        decimal(10,2) default 0,
  food_cost_total     decimal(10,2) default 0,
  masse_salariale     decimal(10,2) default 0,
  created_at          timestamptz default now()
);

-- ============================================================
-- INDEX (perf des requêtes courantes)
-- ============================================================

-- Catalogue (filtres usuels)
create index idx_ingredients_categorie    on ingredients(categorie);
create index idx_ingredients_actif        on ingredients(actif);
create index idx_ingredients_stock        on ingredients(stock_actuel) where stock_actuel <= stock_minimum;
create index idx_recettes_destination     on recettes(tag_destination);
create index idx_recettes_categorie       on recettes(categorie);
create index idx_recettes_actif           on recettes(actif);
create index idx_recette_ingredients_rec  on recette_ingredients(recette_id);
create index idx_recette_ingredients_ing  on recette_ingredients(ingredient_id);

-- Tables / commandes (réalisme du chemin chaud)
create index idx_tables_statut            on tables_restaurant(statut);
create index idx_commandes_statut         on commandes(statut, created_at desc);
create index idx_commandes_source         on commandes(source);
create index idx_commandes_numero_table   on commandes(numero_table) where numero_table is not null;
create index idx_commande_articles_cmd    on commande_articles(commande_id);
create index idx_commande_articles_dest   on commande_articles(tag_destination, statut);

-- Équipe / planning
create index idx_employes_actif           on employes(actif);
create index idx_employes_poste           on employes(poste);
create index idx_planning_date            on planning(date_travail);
create index idx_planning_employe         on planning(employe_id, date_travail);
create index idx_pointage_date            on pointage(date_pointage);
create index idx_pointage_employe         on pointage(employe_id, date_pointage);
create index idx_conges_dates             on conges(date_debut, date_fin);
create index idx_conges_employe           on conges(employe_id);

-- Achats / stock
create index idx_fournisseurs_actif       on fournisseurs(actif);
create index idx_bons_commande_statut     on bons_commande(statut, date_commande desc);
create index idx_bons_commande_fourn      on bons_commande(fournisseur_id);
create index idx_bcl_bon                  on bon_commande_lignes(bon_commande_id);
create index idx_bcl_ingredient           on bon_commande_lignes(ingredient_id);
create index idx_mouvements_ingredient    on mouvements_stock(ingredient_id, created_at desc);
create index idx_mouvements_type          on mouvements_stock(type, created_at desc);

-- Hôtel / événements
create index idx_chambres_actif           on chambres(actif);
create index idx_resa_dates               on reservations_chambres(date_arrivee, date_depart);
create index idx_resa_chambre             on reservations_chambres(chambre_id);
create index idx_resa_statut              on reservations_chambres(statut);
create index idx_evenements_date          on evenements(date_evenement);
create index idx_evenements_statut        on evenements(statut);

-- HACCP / hygiène / maintenance
create index idx_releves_date             on releves_temperatures(created_at desc);
create index idx_releves_equipement       on releves_temperatures(equipement, created_at desc);
create index idx_releves_conforme         on releves_temperatures(conforme) where conforme = false;
create index idx_proc_hygiene_moment      on procedures_hygiene(moment, ordre);
create index idx_checklists_date          on checklists_hygiene(date_realisation);
create index idx_checklists_proc          on checklists_hygiene(procedure_id, date_realisation);
create index idx_equipements_actif        on equipements(actif);
create index idx_equipements_maintenance  on equipements(prochaine_maintenance) where actif = true;
create index idx_interventions_equip      on interventions_maintenance(equipement_id, date_intervention desc);
create index idx_obligations_echeance     on obligations_legales(date_echeance) where statut <> 'fait';
create index idx_dechets_date             on suivi_dechets(date_pesee);
create index idx_dechets_type             on suivi_dechets(type_dechet, date_pesee);

-- CRM / paramètres / KPI
create index idx_clients_email            on clients(email) where email is not null;
create index idx_clients_telephone        on clients(telephone) where telephone is not null;
create index idx_parametres_cle           on parametres(cle);
create index idx_ventes_date              on ventes_journalieres(date_vente desc);

-- ============================================================
-- TRIGGER : maintien automatique de updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger tg_ingredients_updated before update on ingredients
  for each row execute function set_updated_at();
create trigger tg_recettes_updated    before update on recettes
  for each row execute function set_updated_at();
create trigger tg_commandes_updated   before update on commandes
  for each row execute function set_updated_at();
create trigger tg_parametres_updated  before update on parametres
  for each row execute function set_updated_at();

-- ============================================================
-- REALTIME : activation sur les tables temps réel
-- ============================================================
do $$ begin alter publication supabase_realtime add table commandes;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table commande_articles;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table tables_restaurant;  exception when duplicate_object then null; end $$;

-- ============================================================
-- RLS : désactivée sur toutes les tables (l'app utilise la
-- service role via le serveur Next.js). À durcir plus tard si
-- besoin d'accès direct via la clé anon côté client.
-- ============================================================
alter table ingredients               disable row level security;
alter table recettes                  disable row level security;
alter table recette_ingredients       disable row level security;
alter table tables_restaurant         disable row level security;
alter table commandes                 disable row level security;
alter table commande_articles         disable row level security;
alter table employes                  disable row level security;
alter table planning                  disable row level security;
alter table pointage                  disable row level security;
alter table conges                    disable row level security;
alter table fournisseurs              disable row level security;
alter table bons_commande             disable row level security;
alter table bon_commande_lignes       disable row level security;
alter table mouvements_stock          disable row level security;
alter table chambres                  disable row level security;
alter table reservations_chambres     disable row level security;
alter table evenements                disable row level security;
alter table releves_temperatures      disable row level security;
alter table procedures_hygiene        disable row level security;
alter table checklists_hygiene        disable row level security;
alter table equipements               disable row level security;
alter table interventions_maintenance disable row level security;
alter table obligations_legales       disable row level security;
alter table suivi_dechets             disable row level security;
alter table clients                   disable row level security;
alter table parametres                disable row level security;
alter table ventes_journalieres       disable row level security;

-- ============================================================
-- VÉRIFICATION : liste des tables créées (à l'exécution)
-- ============================================================
select table_name
  from information_schema.tables
 where table_schema = 'public'
 order by table_name;

-- ─────────────────────────────────────────────────────────────
-- 0002_disable_rls.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0002 — Fix RLS : désactivation explicite + diagnostic
-- ============================================================
-- Pourquoi : Supabase ré-active la RLS par défaut sur les tables
-- créées via l'éditeur SQL dans les projets récents. Sans policy
-- d'écriture, les INSERT/UPDATE/DELETE depuis la clé anon échouent
-- avec l'erreur :
--   "new row violates row-level security policy for table ..."
--
-- L'app n'a pas encore d'auth (le module auth viendra plus tard) :
-- on désactive donc RLS sur toutes les tables. Quand on ajoutera
-- le login + les rôles, on remettra RLS avec des policies fines.
--
-- Idempotent : peut être ré-exécuté sans risque.
-- ============================================================

alter table ingredients               disable row level security;
alter table recettes                  disable row level security;
alter table recette_ingredients       disable row level security;
alter table tables_restaurant         disable row level security;
alter table commandes                 disable row level security;
alter table commande_articles         disable row level security;
alter table employes                  disable row level security;
alter table planning                  disable row level security;
alter table pointage                  disable row level security;
alter table conges                    disable row level security;
alter table fournisseurs              disable row level security;
alter table bons_commande             disable row level security;
alter table bon_commande_lignes       disable row level security;
alter table mouvements_stock          disable row level security;
alter table chambres                  disable row level security;
alter table reservations_chambres     disable row level security;
alter table evenements                disable row level security;
alter table releves_temperatures      disable row level security;
alter table procedures_hygiene        disable row level security;
alter table checklists_hygiene        disable row level security;
alter table equipements               disable row level security;
alter table interventions_maintenance disable row level security;
alter table obligations_legales       disable row level security;
alter table suivi_dechets             disable row level security;
alter table clients                   disable row level security;
alter table parametres                disable row level security;
alter table ventes_journalieres       disable row level security;

-- ─── Diagnostic : confirme l'état RLS de chaque table ───────
-- (s'affiche dans l'onglet "Results" du SQL Editor)
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls,
  case when c.relforcerowsecurity then '⚠ FORCED' else '' end as forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0003_ingredients_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0003 — Module 3 : Gestion des ingrédients
-- ============================================================
-- Ajoute :
--   1. Une table historique_prix_ingredients pour tracer chaque
--      changement de prix d'achat HT (création, modification manuelle,
--      réception livraison fournisseur plus tard).
--   2. Un trigger qui crée automatiquement une entrée d'historique
--      à chaque INSERT/UPDATE du prix_achat_ht.
--   3. Un seed de 10 ingrédients de test (gated 'if not exists',
--      donc safe à ré-exécuter).
--
-- Idempotent — peut être ré-exécuté.
-- ============================================================

-- ─── 1. Historique des prix ─────────────────────────────────
create table if not exists historique_prix_ingredients (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   uuid not null references ingredients(id) on delete cascade,
  prix_achat_ht   decimal(10,4) not null,
  source          text not null default 'manuel'
                  check (source in ('creation', 'manuel', 'livraison', 'bon_commande')),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_hist_prix_ingredient
  on historique_prix_ingredients(ingredient_id, created_at desc);

alter table historique_prix_ingredients disable row level security;

-- ─── 2. Trigger : logge les changements de prix ─────────────
create or replace function log_prix_ingredient()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.prix_achat_ht > 0 then
      insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, note)
      values (NEW.id, NEW.prix_achat_ht, 'creation', 'Création de la fiche');
    end if;
  elsif (TG_OP = 'UPDATE') then
    if OLD.prix_achat_ht is distinct from NEW.prix_achat_ht then
      insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, note)
      values (NEW.id, NEW.prix_achat_ht, 'manuel', 'Modification manuelle');
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists tg_log_prix_ingredient on ingredients;
create trigger tg_log_prix_ingredient
  after insert or update of prix_achat_ht on ingredients
  for each row execute function log_prix_ingredient();

-- ─── 3. Seed : 10 ingrédients réalistes ─────────────────────
-- Gated : ne se déclenche que si la table est vide.
do $$
begin
  if not exists (select 1 from ingredients limit 1) then
    insert into ingredients
      (nom, categorie, unite, prix_achat_ht, fournisseur_principal, fournisseur_secondaire,
       stock_actuel, stock_minimum, stock_maximum, dlc_moyenne_jours, allergenes)
    values
      ('Mozzarella di Bufala',  'Crémerie',       'kg',    12.5000, 'Crémerie Local',     'Grossiste Italie',  5.0,   2.0,  10.0,  14, ARRAY['lait']),
      ('Tomate San Marzano',    'Légumes',        'kg',     3.2000, 'Maraîcher du coin',  null,                8.0,   3.0,  15.0,  10, ARRAY[]::text[]),
      ('Farine T55 Bio',        'Épicerie sèche', 'kg',     1.8000, 'Boulangerie Coop',   null,               25.0,  10.0,  50.0, 180, ARRAY['gluten']),
      ('Magret de canard',      'Viandes',        'kg',    18.5000, 'Boucherie Bio',      'Marché de gros',    4.0,   2.0,   8.0,   5, ARRAY[]::text[]),
      ('Saumon frais',          'Poissons',       'kg',    22.0000, 'Marée fraîche',      null,                3.0,   2.0,   6.0,   3, ARRAY['poissons']),
      ('Œufs plein air L',      'Crémerie',       'pièce',  0.3500, 'Ferme du Plateau',   null,              120.0,  60.0, 240.0,  21, ARRAY['oeufs']),
      ('Huile olive vierge',    'Épicerie sèche', 'L',     11.2000, 'Domaine Provence',   null,                6.0,   3.0,  12.0, 365, ARRAY[]::text[]),
      ('Crème fraîche 30%',     'Crémerie',       'L',      4.5000, 'Crémerie Local',     null,                1.5,   2.0,   8.0,  10, ARRAY['lait']),
      ('Basilic frais',         'Aromates',       'botte',  1.2000, 'Maraîcher du coin',  null,                0.0,   4.0,  16.0,   3, ARRAY[]::text[]),
      ('Pignons de pin',        'Épicerie sèche', 'kg',    38.0000, 'Épicerie fine',      null,                1.0,   0.5,   2.0, 180, ARRAY['fruits_a_coques']);
  end if;
end $$;

-- ─── 4. Diagnostic : vérification ───────────────────────────
select
  'ingredients'                  as table_name,
  count(*)                       as nb_lignes
  from ingredients
union all
select
  'historique_prix_ingredients'  as table_name,
  count(*)                       as nb_lignes
  from historique_prix_ingredients;

-- ─────────────────────────────────────────────────────────────
-- 0004_disable_rls_historique.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0004 — Fix RLS sur historique_prix_ingredients
-- ============================================================
-- Supabase ré-active RLS par défaut sur les tables créées via le SQL
-- Editor — la commande `disable` de la 0003 est écrasée. On la repasse
-- ici (idempotent), avec diagnostic en sortie.
-- ============================================================

alter table historique_prix_ingredients disable row level security;

-- Diagnostic : confirme l'état RLS de toutes les tables du module
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('ingredients', 'historique_prix_ingredients')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0005_recettes_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0005 — Module 4 : Fiches Recettes & Food Cost
-- ============================================================
-- Aucun changement de schéma : recettes & recette_ingredients existent
-- déjà depuis 0001_init.sql. On se contente de :
--   1. Désactiver RLS au cas où Supabase l'ait ré-activée (ceinture-bretelle)
--   2. Seed 5 recettes réalistes liées aux 10 ingrédients seedés en 0003,
--      gated 'if not exists' pour rester idempotent.
--
-- Note : les allergènes recette ne sont PAS stockés en base — ils sont
-- auto-dérivés à la volée depuis ingredients.allergenes côté app.
-- Single source of truth = ingrédient.
-- ============================================================

-- ─── 1. Sécurité RLS ────────────────────────────────────────
alter table recettes              disable row level security;
alter table recette_ingredients   disable row level security;

-- ─── 2. Seed 5 recettes liées aux ingrédients seedés ───────
do $$
declare
  ing_mozza      uuid;
  ing_tomate     uuid;
  ing_farine     uuid;
  ing_magret     uuid;
  ing_saumon     uuid;
  ing_oeufs      uuid;
  ing_huile      uuid;
  ing_creme      uuid;
  ing_basilic    uuid;
  ing_pignons    uuid;
  rec_marg       uuid;
  rec_pesto_pizza uuid;
  rec_magret     uuid;
  rec_saumon     uuid;
  rec_oeufs      uuid;
begin
  -- Skip si la table contient déjà une recette
  if exists (select 1 from recettes limit 1) then return; end if;

  -- Récupère les ids ingrédients (par nom des seeds 0003)
  select id into ing_mozza   from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate  from ingredients where nom = 'Tomate San Marzano' limit 1;
  select id into ing_farine  from ingredients where nom = 'Farine T55 Bio' limit 1;
  select id into ing_magret  from ingredients where nom = 'Magret de canard' limit 1;
  select id into ing_saumon  from ingredients where nom = 'Saumon frais' limit 1;
  select id into ing_oeufs   from ingredients where nom = 'Œufs plein air L' limit 1;
  select id into ing_huile   from ingredients where nom = 'Huile olive vierge' limit 1;
  select id into ing_creme   from ingredients where nom = 'Crème fraîche 30%' limit 1;
  select id into ing_basilic from ingredients where nom = 'Basilic frais' limit 1;
  select id into ing_pignons from ingredients where nom = 'Pignons de pin' limit 1;

  -- Si les seeds 0003 ne sont pas là, on s'arrête — l'opérateur doit
  -- ré-exécuter 0003 d'abord.
  if ing_mozza is null or ing_farine is null then
    raise notice 'Seeds 0003 manquants — exécute d''abord 0003_ingredients_module.sql';
    return;
  end if;

  -- ─── Recette 1 — Pizza Margherita (PIZZA, 1 pizza, 11.50 €) ────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Pizza Margherita', 'Pizzas', 'PIZZA',
          'Tomate San Marzano, mozzarella di bufala, basilic frais, huile d''olive — la classique.',
          8, 1, 11.50, 10, true)
  returning id into rec_marg;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_marg, ing_farine,  0.2500, 'kg'),
    (rec_marg, ing_mozza,   0.1500, 'kg'),
    (rec_marg, ing_tomate,  0.1200, 'kg'),
    (rec_marg, ing_huile,   0.0150, 'L'),
    (rec_marg, ing_basilic, 0.5,    'botte');

  -- ─── Recette 2 — Pizza Pesto (PIZZA, 1 pizza, 13.00 €) ──────────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Pizza Pesto Pignons', 'Pizzas', 'PIZZA',
          'Pâte au pesto maison (basilic, pignons, huile d''olive), mozzarella, copeaux de parmesan.',
          10, 1, 13.00, 10, true)
  returning id into rec_pesto_pizza;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_pesto_pizza, ing_farine,  0.2500, 'kg'),
    (rec_pesto_pizza, ing_mozza,   0.1200, 'kg'),
    (rec_pesto_pizza, ing_basilic, 1.0,    'botte'),
    (rec_pesto_pizza, ing_pignons, 0.0300, 'kg'),
    (rec_pesto_pizza, ing_huile,   0.0500, 'L');

  -- ─── Recette 3 — Magret aux pignons (CUISINE, 1 portion, 22 €) ──
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Magret de canard, sauce crème aux pignons', 'Plats', 'CUISINE',
          'Magret rosé, sauce à la crème et pignons torréfiés, accompagnement de saison.',
          18, 1, 22.00, 10, true)
  returning id into rec_magret;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_magret, ing_magret,  0.2500, 'kg'),
    (rec_magret, ing_creme,   0.0500, 'L'),
    (rec_magret, ing_pignons, 0.0200, 'kg');

  -- ─── Recette 4 — Saumon à l'huile d'olive (CUISINE, 1 p., 18.50 €) ─
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Saumon mi-cuit à l''huile d''olive', 'Plats', 'CUISINE',
          'Pavé de saumon mi-cuit, huile d''olive vierge, basilic frais, fleur de sel.',
          12, 1, 18.50, 10, true)
  returning id into rec_saumon;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_saumon, ing_saumon,  0.1800, 'kg'),
    (rec_saumon, ing_huile,   0.0200, 'L'),
    (rec_saumon, ing_basilic, 0.25,   'botte');

  -- ─── Recette 5 — Œufs cocotte (CUISINE, 1 portion, 8.00 €) ──────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Œufs cocotte à la crème', 'Entrées', 'CUISINE',
          'Œufs plein air cuits à la crème, ciboulette, gratiné au four.',
          15, 1, 8.00, 10, true)
  returning id into rec_oeufs;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_oeufs, ing_oeufs, 2.0,    'pièce'),
    (rec_oeufs, ing_creme, 0.0400, 'L');
end $$;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select 'recettes'             as table_name, count(*) as nb_lignes from recettes
union all
select 'recette_ingredients'  as table_name, count(*) as nb_lignes from recette_ingredients;

-- ─────────────────────────────────────────────────────────────
-- 0006_menu_engineering_seed.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0006 — Module 5 : Menu Engineering (seed historique de ventes)
-- ============================================================
-- Aucun changement de schéma — `commandes` & `commande_articles`
-- existent depuis 0001. On seed un historique factice de 30 jours
-- pour que la page /admin/recettes/engineering ne soit pas vide
-- avant que le Module 9 ne commence à créer de vraies commandes.
--
-- Mix calibré pour produire les 4 quadrants Kasavana :
--   • Star          → Magret (popularité + marge fortes)
--   • Plowhorse     → Margherita (très populaire, marge faible)
--   • Puzzle        → Saumon (peu vendu, marge forte)
--   • Dog           → Pesto Pignons + Œufs (peu vendus, marge faible)
--
-- Idempotent : se déclenche uniquement si commande_articles est vide.
-- Toutes les commandes seedées ont un numero préfixé `SEED-` pour
-- pouvoir être nettoyées si besoin.
-- ============================================================

-- ─── 1. Sécurité RLS ────────────────────────────────────────
alter table commandes         disable row level security;
alter table commande_articles disable row level security;

-- ─── 2. Seed gated ──────────────────────────────────────────
do $$
declare
  rec record;
  i int;
  cmd_id uuid;
  pop_count int;
  source_choice text;
  jour_offset numeric;
begin
  if exists (select 1 from commande_articles limit 1) then
    raise notice 'Seeds déjà présents — skip';
    return;
  end if;

  for rec in (select id, nom, prix_vente_ht, tag_destination from recettes order by nom)
  loop
    pop_count := case
      when rec.nom = 'Pizza Margherita'                          then 80
      when rec.nom = 'Pizza Pesto Pignons'                       then 12
      when rec.nom like 'Magret%'                                then 35
      when rec.nom like 'Saumon%'                                then 8
      when rec.nom like '%cocotte%' or rec.nom like '%Œufs%'     then 18
      else 5
    end;

    for i in 1..pop_count loop
      source_choice := case (random() * 3)::int
        when 0 then 'TABLE'
        when 1 then 'ONLINE'
        else        'COMPTOIR'
      end;
      -- Étalement uniforme sur les 30 derniers jours, avec une heure
      -- aléatoire pour rendre le timeline réaliste.
      jour_offset := random() * 30;

      insert into commandes (numero, source, statut, montant_total_ht, created_at)
      values (
        'SEED-' || substring(rec.id::text, 1, 8) || '-' || lpad(i::text, 4, '0'),
        source_choice,
        'encaisse',
        rec.prix_vente_ht,
        now() - (jour_offset || ' days')::interval
      )
      returning id into cmd_id;

      insert into commande_articles (commande_id, recette_id, quantite, prix_unitaire_ht, tag_destination, statut)
      values (cmd_id, rec.id, 1, rec.prix_vente_ht, rec.tag_destination, 'servi');
    end loop;
  end loop;
end $$;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from commandes         where statut = 'encaisse')            as commandes_encaissees,
  (select count(*) from commande_articles)                                       as articles_total,
  (select count(*) from commandes         where numero like 'SEED-%')            as commandes_seed,
  (select min(created_at)::date from commandes where numero like 'SEED-%')       as plus_ancienne_seed,
  (select max(created_at)::date from commandes where numero like 'SEED-%')       as plus_recente_seed;

-- Détail par recette
select
  r.nom                                                                          as recette,
  count(ca.id)                                                                   as ventes,
  round((count(ca.id)::numeric / nullif((select count(*) from commande_articles), 0)) * 100, 1) as mix_pct
  from recettes r
  left join commande_articles ca on ca.recette_id = r.id
 group by r.nom
 order by ventes desc nulls last;

-- ─────────────────────────────────────────────────────────────
-- 0007_boissons_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0007 — Module 6 : Carte des vins & boissons
-- ============================================================
-- Nouvelle table `boissons` distincte de `recettes` :
-- - Catalogue produit avec spécificités vin (appellation, millésime,
--   région, cépage, couleur)
-- - Prix d'achat séparés bouteille / fût (pour rendre les marges
--   calculables par format de vente)
-- - Prix de vente séparés verre / bouteille / pinte avec leur
--   contenance (cl)
-- - Stock séparé bouteilles / fûts (séparé du stock cuisine)
-- - TVA par défaut 20% (alcool) — surchargeable par boisson
--
-- Plus une table `accords_mets_boissons` (jointure recette × boisson)
-- pour les accords explicites du gérant. L'algorithme auto-suggère
-- des accords par règles couleur × type de plat dans /admin/boissons.
--
-- Idempotent.
-- ============================================================

-- ─── 1. Table boissons ─────────────────────────────────────────
create table if not exists boissons (
  id                          uuid primary key default gen_random_uuid(),
  nom                         text not null,
  type                        text not null
                              check (type in ('vin','champagne','biere_pression','biere_bouteille','soft','eau','spiritueux','cafe_the','cocktail','autre')),

  -- Spécifique vin / champagne
  appellation                 text,
  millesime                   integer,
  region                      text,
  cepage                      text,
  couleur                     text check (couleur is null or couleur in ('rouge','blanc','rose','champagne','liquoreux','autre')),

  -- Fournisseurs
  fournisseur_principal       text,
  fournisseur_secondaire      text,

  -- Achat — bouteille
  prix_achat_ht_bouteille     decimal(10,4) not null default 0,
  contenance_bouteille_cl     integer       not null default 75,

  -- Achat — fût (boissons en pression)
  prix_achat_ht_fut           decimal(10,4) not null default 0,
  contenance_fut_cl           integer       not null default 0,

  -- Vente
  prix_vente_ht_verre         decimal(10,2) not null default 0,
  contenance_verre_cl         integer       not null default 12,
  prix_vente_ht_bouteille     decimal(10,2) not null default 0,
  prix_vente_ht_pinte         decimal(10,2) not null default 0,
  contenance_pinte_cl         integer       not null default 50,
  tva                         decimal(5,2)  not null default 20,

  -- Stock séparé du stock cuisine
  stock_actuel_bouteilles     decimal(10,2) not null default 0,
  stock_minimum_bouteilles    decimal(10,2) not null default 0,
  stock_actuel_futs           decimal(10,2) not null default 0,
  stock_minimum_futs          decimal(10,2) not null default 0,

  -- Métadonnées
  description                 text,
  photo_url                   text,
  actif                       boolean not null default true,
  ordre                       integer not null default 0,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Trigger updated_at (la fonction set_updated_at existe depuis 0001)
drop trigger if exists tg_boissons_updated on boissons;
create trigger tg_boissons_updated before update on boissons
  for each row execute function set_updated_at();

-- Indexes
create index if not exists idx_boissons_type    on boissons(type);
create index if not exists idx_boissons_actif   on boissons(actif);
create index if not exists idx_boissons_couleur on boissons(couleur) where couleur is not null;

alter table boissons disable row level security;

-- ─── 2. Accords mets / vins (jointure manuelle) ─────────────────
create table if not exists accords_mets_boissons (
  id              uuid primary key default gen_random_uuid(),
  recette_id      uuid not null references recettes(id) on delete cascade,
  boisson_id      uuid not null references boissons(id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),
  unique(recette_id, boisson_id)
);

create index if not exists idx_accords_recette on accords_mets_boissons(recette_id);
create index if not exists idx_accords_boisson on accords_mets_boissons(boisson_id);

alter table accords_mets_boissons disable row level security;

-- ─── 3. Seed 10 références (gated 'if not exists') ──────────────
do $$
begin
  if exists (select 1 from boissons limit 1) then
    raise notice 'Boissons déjà seedées — skip';
    return;
  end if;

  insert into boissons (
    nom, type, appellation, millesime, region, cepage, couleur,
    fournisseur_principal,
    prix_achat_ht_bouteille, contenance_bouteille_cl,
    prix_achat_ht_fut, contenance_fut_cl,
    prix_vente_ht_verre, contenance_verre_cl,
    prix_vente_ht_bouteille, prix_vente_ht_pinte, contenance_pinte_cl,
    tva,
    stock_actuel_bouteilles, stock_minimum_bouteilles,
    stock_actuel_futs, stock_minimum_futs,
    description, ordre
  ) values
    ('Cahors Malbec — Château Cèdre',     'vin',             'Cahors AOC',           2022, 'Sud-Ouest', 'Malbec',         'rouge',
     'Domaine Cèdre',
     6.5000, 75, 0, 0, 6.00, 12, 28.00, 0, 50, 20,
     24, 12, 0, 0,
     'Robe rouge profonde, tanins veloutés, notes de cassis et truffe noire. Idéal sur viandes rouges et magret.', 1),

    ('Gaillac Blanc — Domaine Plageoles', 'vin',             'Gaillac AOC',          2023, 'Sud-Ouest', 'Mauzac, Loin de l''œil', 'blanc',
     'Domaine Plageoles',
     5.0000, 75, 0, 0, 5.00, 12, 22.00, 0, 50, 20,
     18,  8, 0, 0,
     'Sec et vif, notes de poire et fleur d''aubépine. Parfait sur poissons et fromages frais.', 2),

    ('Côtes du Tarn Rosé',                 'vin',             'Côtes du Tarn IGP',    2024, 'Sud-Ouest', 'Syrah, Cabernet', 'rose',
     'Cave coopérative Tarn',
     4.5000, 75, 0, 0, 4.50, 12, 19.00, 0, 50, 20,
     12,  6, 0, 0,
     'Fruité et léger, idéal en terrasse l''été. Accompagne salades et grillades.', 3),

    ('Crémant de Limoux Brut',             'champagne',       'Limoux AOC',           2021, 'Languedoc',  'Mauzac, Chardonnay', 'champagne',
     'Domaine de Fourn',
     8.0000, 75, 0, 0, 7.00, 12, 35.00, 0, 50, 20,
     6,  3, 0, 0,
     'Méthode traditionnelle, bulles fines, notes de pomme et brioche. Apéro et desserts.', 4),

    ('Bière Pression — Lager Garonne',     'biere_pression',  null,                   null, null,         null,             null,
     'Brasserie Garonne',
     0.0000, 0, 80.0000, 3000, 0, 0, 0, 4.50, 50, 20,
     0, 0, 2, 1,
     'Lager artisanale brassée à Toulouse, fût 30L (60 pintes), légère et désaltérante.', 5),

    ('IPA Garonne — bouteille 33cl',       'biere_bouteille', null,                   null, null,         null,             null,
     'Brasserie Garonne',
     2.0000, 33, 0, 0, 0, 0, 6.00, 0, 50, 20,
     36, 12, 0, 0,
     'IPA 6,5°, houblons américains, amertume franche.', 6),

    ('Coca-Cola 33cl',                     'soft',            null,                   null, null,         null,             null,
     'Distrib local',
     0.8000, 33, 0, 0, 0, 0, 3.50, 0, 50, 10,
     48, 24, 0, 0,
     null, 7),

    ('Eau Vittel 75cl',                    'eau',             null,                   null, null,         null,             null,
     'Distrib local',
     1.0000, 75, 0, 0, 0, 0, 4.00, 0, 50, 5.5,
     24, 12, 0, 0,
     null, 8),

    ('Whisky Lagavulin 16 ans',            'spiritueux',      null,                   null, 'Écosse',     null,             null,
     'Caviste partenaire',
     65.0000, 70, 0, 0, 12.00, 4, 95.00, 0, 50, 20,
     3, 1, 0, 0,
     'Single malt Islay, tourbé et fumé. Servi en dose 4cl.', 9),

    ('Café — torréfaction Toulouse',       'cafe_the',        null,                   null, null,         null,             null,
     'Brûlerie Toulousaine',
     0.3000, 100, 0, 0, 2.50, 1, 0, 0, 50, 10,
     5, 2, 0, 0,
     'Torréfaction artisanale 100% arabica, dose ~10g par tasse. Stock en kg de grains.', 10);
end $$;

-- ─── 4. Diagnostic ──────────────────────────────────────────────
select
  (select count(*) from boissons)                       as nb_boissons,
  (select count(*) from accords_mets_boissons)          as nb_accords,
  (select count(*) from boissons where type = 'vin')    as nb_vins,
  (select count(*) from boissons where actif = true)    as nb_actives;

select type, count(*) as nb
  from boissons
 group by type
 order by nb desc;

-- ─────────────────────────────────────────────────────────────
-- 0008_disable_rls_boissons.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0008 — Fix RLS sur boissons + accords_mets_boissons
-- ============================================================
-- Supabase ré-active RLS par défaut sur les tables créées via
-- l'éditeur SQL — même pattern que 0002 et 0004. La 0007 contient
-- bien `disable row level security` mais Supabase l'écrase après.
-- Sans policy, le SELECT anon renvoie 0 lignes (sans erreur) et
-- l'INSERT échoue avec "row-level security policy".
--
-- Idempotent.
-- ============================================================

alter table boissons              disable row level security;
alter table accords_mets_boissons disable row level security;

-- Diagnostic
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('boissons', 'accords_mets_boissons')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0009_stock_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0009 — Module 7 : Gestion des stocks
-- ============================================================
-- Contenu :
--   1. Ajout de 3 colonnes utiles à `mouvements_stock`
--   2. Trigger DB qui déduit AUTOMATIQUEMENT le stock à chaque article
--      passé au statut 'servi' (selon la fiche recette)
--   3. Reset RLS de sécurité sur les tables impactées
--   4. Seed 10 mouvements factices pour démontrer l'historique
--
-- IMPORTANT : Le trigger ne tire que pour les futures transitions
-- vers 'servi'. Les 153 ventes seedées en 0006 (qui sont déjà
-- 'servi') n'ont pas déclenché de sortie de stock — ce qui est OK,
-- on ne veut pas créer de déséquilibre rétroactif sur des données
-- de démo.
--
-- Quand le Module 9 (écrans de service) commencera à créer de
-- vraies commandes, le trigger les capturera automatiquement.
--
-- Idempotent.
-- ============================================================

-- ─── 1. Ajout colonnes mouvements_stock ─────────────────────
alter table mouvements_stock
  add column if not exists date_peremption  date,
  add column if not exists prix_unitaire_ht decimal(10,4) not null default 0,
  add column if not exists fournisseur      text;

create index if not exists idx_mouvements_dlc on mouvements_stock(date_peremption)
  where type = 'entree' and date_peremption is not null;

-- ─── 2. RLS reset (Supabase ré-active sur tables touchées) ──
alter table mouvements_stock disable row level security;
alter table ingredients      disable row level security;
alter table commande_articles disable row level security;

-- ─── 3. Trigger : sortie automatique à chaque article servi ─
-- Pour chaque (recette_id, article_quantite) → consomme :
--   recette_ingredients.quantite × article_quantite / recette.nb_portions
-- de chaque ingrédient. Crée un mouvement type='sortie' et décrémente
-- ingredients.stock_actuel.
create or replace function deduire_stock_pour_article(
  p_article_id   uuid,
  p_recette_id   uuid,
  p_quantite     integer,
  p_commande_id  uuid
) returns void language plpgsql as $$
declare
  ri               record;
  qt_consommee     numeric;
  v_nb_portions    integer;
begin
  if p_recette_id is null or p_quantite is null or p_quantite <= 0 then
    return;
  end if;

  select coalesce(nb_portions, 1) into v_nb_portions
    from recettes where id = p_recette_id;
  if v_nb_portions is null or v_nb_portions <= 0 then
    v_nb_portions := 1;
  end if;

  for ri in (
    select ingredient_id, quantite, unite
      from recette_ingredients
     where recette_id = p_recette_id
  ) loop
    qt_consommee := ri.quantite * p_quantite::numeric / v_nb_portions::numeric;

    update ingredients
       set stock_actuel = stock_actuel - qt_consommee
     where id = ri.ingredient_id;

    insert into mouvements_stock
      (ingredient_id, type, quantite, motif, commande_id)
    values
      (ri.ingredient_id, 'sortie', qt_consommee,
       'Sortie auto recette (article ' || p_article_id || ')',
       p_commande_id);
  end loop;
end; $$;

create or replace function trg_deduire_stock_article()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and NEW.statut = 'servi' then
    perform deduire_stock_pour_article(NEW.id, NEW.recette_id, NEW.quantite, NEW.commande_id);
  elsif TG_OP = 'UPDATE'
        and (OLD.statut is distinct from NEW.statut)
        and NEW.statut = 'servi'
        and (OLD.statut is null or OLD.statut <> 'servi') then
    perform deduire_stock_pour_article(NEW.id, NEW.recette_id, NEW.quantite, NEW.commande_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists tg_deduire_stock_article on commande_articles;
create trigger tg_deduire_stock_article
  after insert or update of statut on commande_articles
  for each row execute function trg_deduire_stock_article();

-- ─── 4. Seed 10 mouvements factices (gated 'if not exists') ─
do $$
declare
  ing_mozza    uuid;
  ing_tomate   uuid;
  ing_farine   uuid;
  ing_magret   uuid;
  ing_saumon   uuid;
  ing_oeufs    uuid;
  ing_huile    uuid;
  ing_creme    uuid;
  ing_basilic  uuid;
  ing_pignons  uuid;
begin
  if exists (select 1 from mouvements_stock limit 1) then
    raise notice 'mouvements_stock déjà alimenté — skip seed';
    return;
  end if;

  select id into ing_mozza   from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate  from ingredients where nom = 'Tomate San Marzano' limit 1;
  select id into ing_farine  from ingredients where nom = 'Farine T55 Bio' limit 1;
  select id into ing_magret  from ingredients where nom = 'Magret de canard' limit 1;
  select id into ing_saumon  from ingredients where nom = 'Saumon frais' limit 1;
  select id into ing_oeufs   from ingredients where nom = 'Œufs plein air L' limit 1;
  select id into ing_huile   from ingredients where nom = 'Huile olive vierge' limit 1;
  select id into ing_creme   from ingredients where nom = 'Crème fraîche 30%' limit 1;
  select id into ing_basilic from ingredients where nom = 'Basilic frais' limit 1;
  select id into ing_pignons from ingredients where nom = 'Pignons de pin' limit 1;

  -- 5 entrées de livraison (avec DLC réalistes)
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, fournisseur, motif, date_peremption, created_at) values
    (ing_magret,   'entree',  5.000, 18.5000, 'Boucherie Bio',     'Livraison hebdo',         (current_date + 5),   now() - interval '6 days'),
    (ing_saumon,   'entree',  3.000, 22.0000, 'Marée fraîche',     'Livraison bi-hebdo',      (current_date + 2),   now() - interval '1 days'),  -- DLC dans 2j → ALERTE
    (ing_oeufs,    'entree',120.000,  0.3500, 'Ferme du Plateau',  'Livraison œufs',          (current_date + 21),  now() - interval '4 days'),
    (ing_farine,   'entree', 25.000,  1.8000, 'Boulangerie Coop',  'Réappro mensuel',         (current_date + 180), now() - interval '12 days'),
    (ing_huile,    'entree',  6.000, 11.2000, 'Domaine Provence',  'Livraison trimestrielle', (current_date + 365), now() - interval '20 days');

  -- 3 pertes / casses
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, motif, created_at) values
    (ing_basilic, 'perte', 2.000,  1.2000, 'DLC dépassée — bottes flétries',         now() - interval '3 days'),
    (ing_mozza,   'perte', 0.300,  8.5000, 'Cassée en livraison — emballage abîmé',   now() - interval '8 days'),
    (ing_tomate,  'perte', 0.500,  3.2000, 'Tomates trop mûres — pour sauce ?',       now() - interval '2 days');

  -- 2 sorties manuelles (cuisinier déduit 1 portion via tablette par exemple)
  insert into mouvements_stock (ingredient_id, type, quantite, prix_unitaire_ht, motif, created_at) values
    (ing_huile,    'sortie', 0.500, 11.2000, 'Friteuse — vidange manuelle',           now() - interval '1 days'),
    (ing_pignons,  'sortie', 0.050, 38.0000, 'Casse en service — bouton -1 portion',  now() - interval '5 days');
end $$;

-- ─── 5. Diagnostic ──────────────────────────────────────────
select
  type,
  count(*)                                  as nb,
  sum(quantite * prix_unitaire_ht)::numeric(10,2) as valeur_eur
  from mouvements_stock
 group by type
 order by type;

select
  (select count(*) from mouvements_stock where type = 'entree' and date_peremption is not null and date_peremption <= current_date + 3) as alertes_dlc;

-- ─────────────────────────────────────────────────────────────
-- 0010_fournisseurs_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0010 — Module 8 : Gestion des fournisseurs
-- ============================================================
-- Contenu :
--   1. Colonnes contrôle réception sur `bon_commande_lignes`
--   2. FK `fournisseur_id` sur `historique_prix_ingredients`
--      (lien fort vers la fiche fournisseur quand le prix vient
--      d'une livraison / bon de commande)
--   3. Nouvelle table `factures_fournisseurs` avec statut +
--      date d'échéance pour les alertes de paiement
--   4. Reset RLS de sécurité
--   5. Seed 6 fournisseurs alignés sur les noms déjà utilisés
--      en 0003, plus 2 entrées de prix supplémentaires pour
--      démontrer le comparateur, plus 3 bons de commande et
--      3 factures
--
-- Idempotent.
-- ============================================================

-- ─── 1. Contrôle réception sur bon_commande_lignes ──────────
alter table bon_commande_lignes
  add column if not exists temperature_reception decimal(5,2),
  add column if not exists dlc_observee          date,
  add column if not exists etat_emballage        text
    check (etat_emballage is null or etat_emballage in ('parfait','correct','abime','rejete')),
  add column if not exists note_qualite_ligne    integer
    check (note_qualite_ligne is null or note_qualite_ligne between 1 and 5),
  add column if not exists commentaire           text;

-- ─── 2. FK fournisseur sur historique_prix ──────────────────
alter table historique_prix_ingredients
  add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

-- Élargir la contrainte source pour inclure une livraison
do $$ begin
  alter table historique_prix_ingredients drop constraint if exists historique_prix_ingredients_source_check;
  alter table historique_prix_ingredients
    add constraint historique_prix_ingredients_source_check
    check (source in ('creation','manuel','livraison','bon_commande'));
exception when others then null; end $$;

-- ─── 3. Factures fournisseurs ───────────────────────────────
create table if not exists factures_fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references fournisseurs(id) on delete restrict,
  bon_commande_id uuid references bons_commande(id) on delete set null,
  numero          text not null,
  date_emission   date not null default current_date,
  date_echeance   date,
  montant_ht      decimal(10,2) not null default 0,
  montant_ttc     decimal(10,2) not null default 0,
  statut          text not null default 'a_payer'
                  check (statut in ('a_payer','paye','en_retard','litige','annule')),
  paye_le         timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_factures_fournisseur on factures_fournisseurs(fournisseur_id);
create index if not exists idx_factures_echeance    on factures_fournisseurs(date_echeance) where statut = 'a_payer';
create index if not exists idx_factures_statut      on factures_fournisseurs(statut, date_echeance);

alter table factures_fournisseurs disable row level security;

-- ─── 4. RLS reset (Supabase pattern récurrent) ──────────────
alter table fournisseurs           disable row level security;
alter table bons_commande          disable row level security;
alter table bon_commande_lignes    disable row level security;
alter table historique_prix_ingredients disable row level security;

-- ─── 5. Seed 6 fournisseurs ─────────────────────────────────
do $$
declare
  f_cremerie      uuid;
  f_maraicher     uuid;
  f_boulangerie   uuid;
  f_boucherie     uuid;
  f_maree         uuid;
  f_ferme         uuid;
  ing_mozza       uuid;
  ing_tomate      uuid;
  cmd_brouillon   uuid;
  cmd_envoye      uuid;
  cmd_recu        uuid;
begin
  if exists (select 1 from fournisseurs limit 1) then
    raise notice 'Fournisseurs déjà seedés — skip';
    return;
  end if;

  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Crémerie Local',     'Marie Dupont',    '05 61 23 45 67', 'commandes@cremerie-local.fr', '15 rue du Lavoir, 31200 Toulouse',  '30 jours fin de mois', 1,  50, ARRAY['mardi','jeudi','samedi'], 5, 4)
    returning id into f_cremerie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Maraîcher du coin',  'Pierre Lefebvre', '06 12 34 56 78', 'pierre@maraicher.fr',         'Lieu-dit La Plaine, 31000 Toulouse', '15 jours net',          1,  30, ARRAY['lundi','mercredi','vendredi'], 5, 5)
    returning id into f_maraicher;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Boulangerie Coop',   'Sylvie Martin',   '05 61 89 01 23', 'sylvie@coopboul.fr',          'Z.I. Sud, 31100 Toulouse',           '30 jours net',          2, 100, ARRAY['lundi','jeudi'], 4, 4)
    returning id into f_boulangerie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Boucherie Bio',      'Jean Dubois',     '05 62 14 25 36', 'jean@boucheriebio.fr',        '8 boulevard Carnot, 31000 Toulouse', '30 jours fin de mois', 1,  80, ARRAY['mardi','vendredi'], 5, 4)
    returning id into f_boucherie;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Marée fraîche',      'Claire Petit',    '06 78 90 12 34', 'claire@maree-fraiche.fr',     'Marché de gros, 31200 Toulouse',     '15 jours net',          1, 100, ARRAY['mercredi','samedi'], 5, 3)
    returning id into f_maree;
  insert into fournisseurs (nom, contact, telephone, email, adresse, conditions_tarifaires, delai_livraison_jours, minimum_commande, jours_livraison, note_qualite, note_ponctualite) values
    ('Ferme du Plateau',   'André Roux',      '06 23 45 67 89', 'andre@fermeduplateau.fr',     'Plateau de Lannemezan',              '30 jours net',          2,  50, ARRAY['lundi','jeudi'], 5, 5)
    returning id into f_ferme;

  -- ─── Quelques entrées historique_prix supplémentaires pour
  --    démontrer le comparateur entre fournisseurs sur même ingrédient
  select id into ing_mozza  from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate from ingredients where nom = 'Tomate San Marzano'   limit 1;
  if ing_mozza is not null then
    insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, fournisseur_id, note, created_at) values
      (ing_mozza,  13.2000, 'livraison', f_cremerie,  'Livraison hebdo', now() - interval '20 days'),
      (ing_mozza,  11.8000, 'manuel',    f_ferme,     'Devis comparatif Ferme du Plateau (option blanche)', now() - interval '10 days'),
      (ing_mozza,  12.5000, 'livraison', f_cremerie,  'Réappro mensuel', now() - interval '3 days');
  end if;
  if ing_tomate is not null then
    insert into historique_prix_ingredients (ingredient_id, prix_achat_ht, source, fournisseur_id, note, created_at) values
      (ing_tomate,  3.8000, 'livraison', f_maraicher, 'Marché vert',     now() - interval '15 days'),
      (ing_tomate,  3.0000, 'manuel',    f_maraicher, 'Promo de saison', now() - interval '5 days');
  end if;

  -- ─── 3 bons de commande ────────────────────────────────────
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_maraicher, 'brouillon', current_date,             current_date + 1, 0,    'Brouillon auto-généré depuis alertes stock')
    returning id into cmd_brouillon;
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_boucherie, 'envoye',    current_date - 1,         current_date + 1, 92.50, 'Commande hebdomadaire viandes')
    returning id into cmd_envoye;
  insert into bons_commande (fournisseur_id, statut, date_commande, date_livraison_prevue, montant_total_ht, notes) values
    (f_cremerie,  'recu',      current_date - 6,         current_date - 5, 187.30, 'Réception OK, contrôle température conforme')
    returning id into cmd_recu;

  -- Lignes de bon — quelques exemples
  insert into bon_commande_lignes (bon_commande_id, ingredient_id, quantite_commandee, prix_unitaire_ht, quantite_recue, etat_emballage, note_qualite_ligne) values
    (cmd_recu,    ing_mozza,  10.0, 12.5000, 10.0,   'parfait', 5);

  -- ─── 3 factures ─────────────────────────────────────────────
  insert into factures_fournisseurs (fournisseur_id, bon_commande_id, numero, date_emission, date_echeance, montant_ht, montant_ttc, statut) values
    (f_cremerie,    cmd_recu,    'FA-2024-CRM-001', current_date - 5, current_date + 25, 187.30, 197.46, 'a_payer'),
    (f_boulangerie, null,        'FA-2024-BLG-007', current_date - 35, current_date - 5,  240.00, 252.00, 'en_retard'),
    (f_maraicher,   null,        'FA-2024-MRC-014', current_date - 60, current_date - 30, 142.50, 150.34, 'paye');

  -- Marquer la facture payée (paye_le)
  update factures_fournisseurs
     set paye_le = now() - interval '30 days'
   where statut = 'paye' and fournisseur_id = f_maraicher;

end $$;

-- ─── 6. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from fournisseurs)              as nb_fournisseurs,
  (select count(*) from bons_commande)             as nb_bons_commande,
  (select count(*) from factures_fournisseurs)     as nb_factures,
  (select count(*) from factures_fournisseurs where statut = 'en_retard')  as factures_en_retard,
  (select count(*) from factures_fournisseurs where statut = 'a_payer'
     and date_echeance <= current_date + 7) as factures_a_payer_7j;

select nom, note_qualite, note_ponctualite from fournisseurs order by nom;

-- ─────────────────────────────────────────────────────────────
-- 0011_disable_rls_factures.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0011 — Fix RLS sur factures_fournisseurs
-- ============================================================
-- Pattern Supabase récurrent : RLS ré-activée sur les tables
-- nouvellement créées via SQL Editor, malgré notre `disable` en 0010.
-- Idempotent.
-- ============================================================

alter table factures_fournisseurs disable row level security;

-- Diagnostic
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'factures_fournisseurs';

-- ─────────────────────────────────────────────────────────────
-- 0012_service_module.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0012 — Module 9A : Écrans de service (cuisine, bar, serveur)
-- ============================================================
-- Contenu :
--   1. Table sessions_caisse (ouverture/clôture journalière, fond,
--      écart, pour le rapport Z futur)
--   2. Table paiements_caisse (multi-paiements par commande, tips
--      par serveur, méthode, référence)
--   3. Colonnes serveur_id + session_caisse_id + pourboire_total
--      sur commandes
--   4. Activation Realtime sur commandes / commande_articles /
--      tables_restaurant (CLAUDE.md exige le temps réel sur ces 3)
--   5. Seed : 1 session ouverte aujourd'hui avec fond 200 €
--
-- RÈGLE D'OR (CLAUDE.md) : la commande ne disparaît qu'au statut
-- 'encaisse'. Les écrans cuisine/bar/serveur la voient à tous les
-- statuts intermédiaires.
--
-- Idempotent.
-- ============================================================

-- ─── 1. sessions_caisse ─────────────────────────────────────
create table if not exists sessions_caisse (
  id              uuid primary key default gen_random_uuid(),
  date_session    date not null default current_date,
  ouverte_at      timestamptz not null default now(),
  fermee_at       timestamptz,
  fond_initial    decimal(10,2) not null default 0,
  fond_final      decimal(10,2),
  ca_attendu      decimal(10,2),    -- = sum paiements 'especes' de la session
  ca_compte       decimal(10,2),    -- saisi à la clôture
  ecart           decimal(10,2),    -- ca_compte - ca_attendu
  notes           text,
  ouverte_par     uuid references employes(id) on delete set null,
  fermee_par      uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_sessions_date     on sessions_caisse(date_session desc);
create index if not exists idx_sessions_ouverte  on sessions_caisse(date_session) where fermee_at is null;

alter table sessions_caisse disable row level security;

-- ─── 2. paiements_caisse ────────────────────────────────────
create table if not exists paiements_caisse (
  id                uuid primary key default gen_random_uuid(),
  commande_id       uuid not null references commandes(id) on delete cascade,
  session_caisse_id uuid references sessions_caisse(id) on delete set null,
  methode           text not null
                    check (methode in ('especes','carte','ticket_resto','virement','autre')),
  montant           decimal(10,2) not null,
  pourboire         decimal(10,2) not null default 0,
  serveur_id        uuid references employes(id) on delete set null,
  reference         text,                          -- ex: n° transaction TPE
  encaisse_at       timestamptz not null default now()
);

create index if not exists idx_paiements_commande on paiements_caisse(commande_id);
create index if not exists idx_paiements_session  on paiements_caisse(session_caisse_id);
create index if not exists idx_paiements_serveur  on paiements_caisse(serveur_id, encaisse_at desc);
create index if not exists idx_paiements_methode  on paiements_caisse(methode, encaisse_at desc);

alter table paiements_caisse disable row level security;

-- ─── 3. Colonnes commandes : serveur_id + session_caisse_id + tips ──
alter table commandes
  add column if not exists serveur_id        uuid references employes(id) on delete set null,
  add column if not exists session_caisse_id uuid references sessions_caisse(id) on delete set null,
  add column if not exists pourboire_total   decimal(10,2) not null default 0;

create index if not exists idx_commandes_serveur on commandes(serveur_id, created_at desc);
create index if not exists idx_commandes_session on commandes(session_caisse_id);

-- ─── 4. Activation Realtime sur les 3 tables critiques ──────
do $$ begin alter publication supabase_realtime add table commandes;          exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table commande_articles;  exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table tables_restaurant;  exception when duplicate_object then null; when others then null; end $$;

-- ─── 5. Sécurité RLS sur les tables touchées (Supabase pattern) ──
alter table commandes          disable row level security;
alter table commande_articles  disable row level security;
alter table tables_restaurant  disable row level security;
alter table employes           disable row level security;
alter table recettes           disable row level security;

-- ─── 6. Seed : session ouverte du jour si rien n'est en cours ──
do $$
begin
  if not exists (select 1 from sessions_caisse where fermee_at is null and date_session = current_date) then
    insert into sessions_caisse (date_session, fond_initial, notes)
    values (current_date, 200.00, 'Session auto-ouverte au démarrage du Module 9A');
  end if;
end $$;

-- ─── 7. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from sessions_caisse where fermee_at is null) as sessions_ouvertes,
  (select count(*) from paiements_caisse)                         as nb_paiements,
  (select count(*) from commandes where serveur_id is not null)   as commandes_avec_serveur;

-- Vérif Realtime
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('commandes','commande_articles','tables_restaurant')
 order by tablename;

-- Vérif RLS sur les tables critiques
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('sessions_caisse','paiements_caisse','commandes','commande_articles','tables_restaurant')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0013_disable_rls_service.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0013 — Fix RLS sur sessions_caisse + paiements_caisse
-- ============================================================
-- 6e occurrence du pattern : Supabase ré-active RLS sur les tables
-- nouvellement créées via SQL Editor. Idempotent.
-- ============================================================

alter table sessions_caisse  disable row level security;
alter table paiements_caisse disable row level security;

-- Diagnostic
select
  c.relname as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('sessions_caisse', 'paiements_caisse')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0014_module_10_equipes.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0014 — Module 10 : Communication interne équipes (/equipes)
-- ============================================================
-- Contenu :
--   1. messages         — chat par canal (5 canaux fixes)
--   2. affichage_infos  — annonces tableau d'affichage
--   3. comptes_rendus   — comptes-rendus de réunions archivés
--   4. materiels        — inventaire matériel attribué aux employés
--   5. Realtime sur messages (badge live + ding nouveau message)
--   6. Disable RLS (Supabase la ré-active à la création SQL Editor)
--
-- Idempotent.
-- ============================================================

-- ─── 1. messages ────────────────────────────────────────────
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null check (canal in ('cuisine','bar','salle','admin','tous')),
  expediteur_id uuid references employes(id) on delete set null,
  contenu       text not null check (length(contenu) > 0 and length(contenu) <= 2000),
  lu_par        uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_canal_recent on messages(canal, created_at desc);
create index if not exists idx_messages_expediteur   on messages(expediteur_id, created_at desc);

alter table messages disable row level security;

-- ─── 2. affichage_infos ─────────────────────────────────────
create table if not exists affichage_infos (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  contenu         text not null,
  priorite        text not null default 'info' check (priorite in ('info','warn','urgent')),
  valable_du      date not null default current_date,
  valable_jusqu   date,
  ordre           integer not null default 0,
  cree_par        uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Index "complet" (pas de partial WHERE car current_date n'est pas IMMUTABLE
-- en Postgres → 42P17 sur partial index). Le filtre actif/inactif sera
-- appliqué au runtime dans la requête.
create index if not exists idx_affichage_actif on affichage_infos(valable_du desc, valable_jusqu, ordre);

alter table affichage_infos disable row level security;

-- ─── 3. comptes_rendus ──────────────────────────────────────
create table if not exists comptes_rendus (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,
  date_reunion  date not null default current_date,
  contenu       text not null,
  participants  uuid[] not null default '{}',
  redacteur_id  uuid references employes(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cr_date on comptes_rendus(date_reunion desc);

alter table comptes_rendus disable row level security;

-- ─── 4. materiels ───────────────────────────────────────────
create table if not exists materiels (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  type              text not null check (type in ('uniforme','ustensile','cle','badge','equipement','autre')),
  numero_serie      text,
  etat              text not null default 'bon' check (etat in ('neuf','bon','use','abime','perdu')),
  attribue_a        uuid references employes(id) on delete set null,
  date_attribution  date,
  notes             text,
  actif             boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists idx_materiels_attribue on materiels(attribue_a) where attribue_a is not null;
create index if not exists idx_materiels_libre    on materiels(actif) where attribue_a is null and actif = true;

alter table materiels disable row level security;

-- ─── 5. Realtime sur messages ───────────────────────────────
do $$ begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; when others then null; end $$;

-- ─── 6. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from messages)        as nb_messages,
  (select count(*) from affichage_infos) as nb_infos,
  (select count(*) from comptes_rendus)  as nb_cr,
  (select count(*) from materiels)       as nb_materiels;

-- Vérif Realtime
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('messages')
 order by tablename;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('messages','affichage_infos','comptes_rendus','materiels')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0015_disable_rls_module_10.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0015 — Fix RLS sur les 4 tables du Module 10
-- ============================================================
-- 7e occurrence du pattern : Supabase ré-active RLS sur les tables
-- créées via SQL Editor (SELECT marche en anon mais INSERT renvoie
-- 42501 "new row violates row-level security policy").
-- Idempotent.
-- ============================================================

alter table messages         disable row level security;
alter table affichage_infos  disable row level security;
alter table comptes_rendus   disable row level security;
alter table materiels        disable row level security;

-- Diagnostic
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('messages','affichage_infos','comptes_rendus','materiels')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0016_module_11_hygiene.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0017_disable_rls_module_11.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0017 — Fix RLS sur les 5 nouvelles tables du Module 11
-- ============================================================
-- 8e occurrence du pattern Supabase. Idempotent.
-- ============================================================

alter table plans_haccp                   disable row level security;
alter table lots_produits                 disable row level security;
alter table non_conformites               disable row level security;
alter table interventions_antiparasitaire disable row level security;
alter table plan_nettoyage                disable row level security;

-- Diagnostic
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (
     'plans_haccp','lots_produits','non_conformites',
     'interventions_antiparasitaire','plan_nettoyage'
   )
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0018_module_12_allergenes.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0018 — Module 12 : Allergènes & traçabilité (/admin/allergenes)
-- ============================================================
-- Contenu :
--   1. ALTER recettes          ADD allergenes_complementaires text[]
--      (override manuel : "trace de gluten", contamination croisée)
--   2. ALTER commande_articles ADD allergenes_a_eviter text[]
--      (saisi par le serveur : alerte client allergique)
--   3. CREATE procedures_urgence (allergie/incendie/évacuation/malaise)
--   4. Disable RLS sur procedures_urgence
--
-- La liste finale d'allergènes par plat = union de
--   ingredients.allergenes via recette_ingredients
--   + recettes.allergenes_complementaires
--
-- Idempotent.
-- ============================================================

-- ─── 1. ALTER recettes ──────────────────────────────────────
do $$ begin
  alter table recettes add column if not exists allergenes_complementaires text[] not null default '{}';
exception when duplicate_column then null; end $$;

-- ─── 2. ALTER commande_articles ─────────────────────────────
do $$ begin
  alter table commande_articles add column if not exists allergenes_a_eviter text[] not null default '{}';
exception when duplicate_column then null; end $$;

-- Index pour requêter rapidement les commandes avec allergie
create index if not exists idx_commande_articles_allergie
  on commande_articles using gin (allergenes_a_eviter)
  where array_length(allergenes_a_eviter, 1) > 0;

-- ─── 3. procedures_urgence ──────────────────────────────────
create table if not exists procedures_urgence (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  type        text not null check (type in ('allergie','incendie','evacuation','malaise','intoxication','vol','autre')),
  etapes      text[] not null default '{}',     -- liste ordonnée d'étapes
  contacts    text,                              -- pompiers, médecin, samu...
  ordre       integer not null default 0,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_procedures_urgence_actif on procedures_urgence(type, ordre) where actif = true;

alter table procedures_urgence disable row level security;

-- Disable RLS aussi sur recettes + commande_articles (Supabase pourrait
-- ré-activer après ALTER)
alter table recettes          disable row level security;
alter table commande_articles disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select
  (select count(*) from procedures_urgence)        as nb_proc_urg,
  (select count(*) from recettes
    where array_length(allergenes_complementaires, 1) > 0) as nb_recettes_avec_overrides;

-- Vérif colonnes ajoutées
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'recettes'           and column_name = 'allergenes_complementaires')
     or (table_name = 'commande_articles'  and column_name = 'allergenes_a_eviter'));

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('procedures_urgence','recettes','commande_articles')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0019_disable_rls_module_12.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0019 — Fix RLS Module 12 (procedures_urgence + tables ALTERed)
-- ============================================================
-- 9e occurrence du pattern Supabase. Idempotent.
-- ============================================================

alter table procedures_urgence  disable row level security;
alter table recettes            disable row level security;
alter table commande_articles   disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('procedures_urgence','recettes','commande_articles')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0020_module_13_rh.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0021_disable_rls_module_13.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0021 — Fix RLS Module 13 (10e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table documents_employes  disable row level security;
alter table formations_employes disable row level security;
alter table employes            disable row level security;
alter table planning            disable row level security;
alter table pointage            disable row level security;
alter table conges              disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('documents_employes','formations_employes','employes','planning','pointage','conges')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0022_module_14_finances.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0022 — Module 14 : Finances & pilotage (/admin/finances)
-- ============================================================
-- Contenu :
--   1. charges_fixes    — loyer, énergie, assurance, etc.
--   2. notes_de_frais   — remboursements employés
--   3. Disable RLS
--
-- Solde de trésorerie initial = stocké dans `parametres`
--   cle = 'tresorerie_solde'        valeur = montant en €
--   cle = 'tresorerie_solde_date'   valeur = date ISO
--
-- TVA collectée = sum montant TTC paiements_caisse (taux 10% par défaut).
-- TVA déductible = sum (TTC - HT) factures_fournisseurs.
--
-- Idempotent.
-- ============================================================

-- ─── 1. charges_fixes ──────────────────────────────────────
create table if not exists charges_fixes (
  id                  uuid primary key default gen_random_uuid(),
  libelle             text not null,
  categorie           text not null check (categorie in (
    'loyer','energie','eau','telecom','internet','assurance','salaire',
    'comptable','banque','urssaf','impots','abonnement','autre'
  )),
  montant_ht          decimal(10,2) not null,
  montant_ttc         decimal(10,2) not null,
  frequence           text not null default 'mensuel' check (frequence in (
    'mensuel','bimestriel','trimestriel','semestriel','annuel'
  )),
  jour_prelevement    integer check (jour_prelevement between 1 and 31),
  prochaine_echeance  date,
  fournisseur_nom     text,
  iban                text,
  notes               text,
  actif               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_charges_actif      on charges_fixes(actif) where actif = true;
create index if not exists idx_charges_echeance   on charges_fixes(prochaine_echeance) where actif = true and prochaine_echeance is not null;
create index if not exists idx_charges_categorie  on charges_fixes(categorie, actif);

alter table charges_fixes disable row level security;

-- ─── 2. notes_de_frais ─────────────────────────────────────
create table if not exists notes_de_frais (
  id                  uuid primary key default gen_random_uuid(),
  employe_id          uuid not null references employes(id) on delete cascade,
  date_depense        date not null default current_date,
  libelle             text not null,
  motif               text,
  montant             decimal(10,2) not null,
  justificatif_url    text,
  statut              text not null default 'en_attente' check (statut in ('en_attente','remboursee','refusee')),
  remboursee_at       timestamptz,
  remboursee_par      uuid references employes(id) on delete set null,
  notes_admin         text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_ndf_employe on notes_de_frais(employe_id, statut, date_depense desc);
create index if not exists idx_ndf_statut  on notes_de_frais(statut, date_depense desc);

alter table notes_de_frais disable row level security;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from charges_fixes)   as nb_charges,
  (select count(*) from notes_de_frais)  as nb_notes;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('charges_fixes','notes_de_frais')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0023_disable_rls_module_14.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0023 — Fix RLS Module 14 (11e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table charges_fixes   disable row level security;
alter table notes_de_frais  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('charges_fixes','notes_de_frais')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0024_module_15_energie.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0024 — Module 15 : Gestion énergie (/admin/energie)
-- ============================================================
-- Contenu :
--   1. releves_energie  — relevés mensuels élec/gaz/eau/autre
--   2. Disable RLS
--
-- Une ligne = un relevé pour une période donnée (typiquement 1 mois).
-- Champs montant_ht/ttc à saisir d'après la facture du fournisseur.
--
-- Calculs côté app :
--   - Comparaison N vs N-1 (même mois)
--   - Alerte rouge si conso > N-1 × 1.20
--   - Coût énergie / plat = sum montant_ttc du mois / nb plats servis
--
-- Idempotent.
-- ============================================================

create table if not exists releves_energie (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('electricite','gaz','eau','autre')),
  date_releve       date not null default current_date,
  periode_debut     date not null,
  periode_fin       date not null check (periode_fin >= periode_debut),
  consommation      decimal(10,3) not null,
  unite             text not null default 'kWh' check (unite in ('kWh','m3','litre','autre')),
  prix_unitaire_ht  decimal(10,4),
  montant_ht        decimal(10,2) not null,
  montant_ttc       decimal(10,2) not null,
  fournisseur       text,
  num_facture       text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_energie_type_periode on releves_energie(type, periode_debut desc);
create index if not exists idx_energie_periode      on releves_energie(periode_debut desc);

alter table releves_energie disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select count(*) as nb_releves from releves_energie;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_energie';

-- ─────────────────────────────────────────────────────────────
-- 0025_disable_rls_module_15.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0025 — Fix RLS Module 15 (12e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table releves_energie disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_energie';

-- ─────────────────────────────────────────────────────────────
-- 0026_module_16_maintenance.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0026 — Module 16 : Maintenance & équipements (/admin/maintenance)
-- ============================================================
-- Réutilise les tables Module 1 :
--   equipements                 (id, nom, marque, modele, ...)
--   interventions_maintenance   (id, equipement_id, type, date, ...)
--
-- Ajoute :
--   ALTER equipements ADD categorie + type_controle_obligatoire
--   + prochain_controle_obligatoire (alerte 1 mois avant)
-- ============================================================

do $$ begin
  alter table equipements add column if not exists categorie text
    check (categorie in ('cuisine','froid','chaud','laverie','climatisation','securite','divers'));
  alter table equipements add column if not exists type_controle_obligatoire text
    check (type_controle_obligatoire in ('electricite','gaz','extincteur','hotte','desenfumage','climatisation','autre'));
  alter table equipements add column if not exists prochain_controle_obligatoire date;
  alter table equipements add column if not exists derniere_controle_obligatoire date;
  alter table equipements add column if not exists organisme_certifie text;  -- prestataire agréé pour les contrôles
exception when duplicate_column then null; end $$;

create index if not exists idx_equip_categorie on equipements(categorie) where actif = true;
create index if not exists idx_equip_controle  on equipements(prochain_controle_obligatoire)
  where actif = true and prochain_controle_obligatoire is not null;
create index if not exists idx_equip_maintenance on equipements(prochaine_maintenance)
  where actif = true and prochaine_maintenance is not null;

-- Disable RLS (Supabase pourrait ré-activer après ALTER)
alter table equipements                 disable row level security;
alter table interventions_maintenance   disable row level security;

-- Diagnostic
select
  (select count(*) from equipements)               as nb_equip,
  (select count(*) from interventions_maintenance) as nb_inter,
  (select count(*) from equipements where prochain_controle_obligatoire is not null) as nb_controles_planifies;

-- Vérif colonnes
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'equipements'
   and column_name in ('categorie','type_controle_obligatoire','prochain_controle_obligatoire','derniere_controle_obligatoire','organisme_certifie');

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('equipements','interventions_maintenance')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0027_module_17_legal.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0027 — Module 17 : Obligations légales (/admin/legal)
-- ============================================================
-- Réutilise obligations_legales (Module 1 init) pour licence IV,
-- permis exploitation, assurances, bail commercial.
--
-- Ajoute :
--   1. accidents_travail              (registre obligatoire)
--   2. affichages_verifications       (checklist affichages réglementaires)
--   3. Disable RLS
-- ============================================================

-- ─── 1. accidents_travail ───────────────────────────────────
create table if not exists accidents_travail (
  id                  uuid primary key default gen_random_uuid(),
  employe_id          uuid references employes(id) on delete set null,
  date_accident       date not null default current_date,
  heure_accident      time,
  lieu                text,
  description         text not null,
  gravite             text not null default 'legere' check (gravite in ('legere','grave','mortel')),
  jours_arret         integer default 0,
  declaration_cpam    boolean not null default false,
  declaration_cpam_date date,
  declaration_cpam_url text,
  temoin              text,
  suites              text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_accidents_date on accidents_travail(date_accident desc);
create index if not exists idx_accidents_emp  on accidents_travail(employe_id);

alter table accidents_travail disable row level security;

-- ─── 2. affichages_verifications ────────────────────────────
create table if not exists affichages_verifications (
  id                uuid primary key default gen_random_uuid(),
  titre             text not null,
  description       text,
  reference_legale  text,                                  -- ex: "Code du travail Art. R4227-37"
  obligatoire       boolean not null default true,
  present           boolean not null default false,
  date_verification date,
  photo_url         text,
  ordre             integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_affichages_present on affichages_verifications(present, ordre);

alter table affichages_verifications disable row level security;

-- ─── 3. Seed des 14 affichages obligatoires en restauration ──
-- (idempotent : on n'insère que si la liste est vide)
do $$
declare
  v_count int;
begin
  select count(*) into v_count from affichages_verifications;
  if v_count = 0 then
    insert into affichages_verifications (titre, description, reference_legale, ordre, obligatoire) values
      ('Consignes de sécurité incendie',           'Conduite à tenir en cas d''incendie, point de rassemblement', 'Art. R4227-37 Code du travail', 1, true),
      ('Plan d''évacuation',                       'Plan affiché à chaque niveau, indiquant issues et extincteurs', 'Art. R4227-37', 2, true),
      ('Numéros d''urgence',                        'Pompiers 18 / SAMU 15 / Police 17 / EU 112', 'Art. R4227-37', 3, true),
      ('Interdiction de fumer',                    'Pictogramme + amende encourue 68€', 'Décret 2006-1386', 4, true),
      ('Affichage des prix TTC',                   'Carte/menu visible de l''extérieur, prix toutes taxes comprises', 'Arrêté du 27/03/87', 5, true),
      ('Carte des allergènes',                     'Liste des 14 allergènes par plat, sur demande client', 'Règl. UE 1169/2011', 6, true),
      ('Origine des viandes',                      'Pays d''origine bovine, porcine, ovine, volaille', 'Décret 2002-1465 + 2017-374', 7, true),
      ('Affichage horaires d''ouverture',          'Visible de l''extérieur', 'Code de commerce', 8, true),
      ('Licence IV (si débit boissons)',           'Affichée à proximité du bar', 'Code des débits de boissons', 9, true),
      ('Information consommateurs CGV',            'Conditions générales de vente disponibles à la demande', 'Code consommation L. 211-1', 10, true),
      ('Information RGPD WiFi',                    'Affichage si WiFi clients : finalités, durée conservation', 'RGPD Art. 13', 11, true),
      ('Pourboire : libre',                        'Mention "service compris" si applicable', 'Décret 2015-148', 12, true),
      ('Convention collective',                    'Référence affichée + accessible aux salariés', 'Art. R2262-1 Code travail', 13, true),
      ('Inspection du travail',                    'Coordonnées du service local', 'Art. D8113-1', 14, true)
    ;
  end if;
end $$;

-- Disable RLS aussi sur obligations_legales (au cas où)
alter table obligations_legales disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select
  (select count(*) from accidents_travail)         as nb_accidents,
  (select count(*) from affichages_verifications)  as nb_affichages,
  (select count(*) from obligations_legales)       as nb_obligations;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('accidents_travail','affichages_verifications','obligations_legales')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0028_disable_rls_module_17.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0028 — Fix RLS Module 17 (13e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table accidents_travail        disable row level security;
alter table affichages_verifications disable row level security;
alter table obligations_legales      disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('accidents_travail','affichages_verifications','obligations_legales')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0029_module_18_dechets.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0029 — Module 18 : Gestion des déchets (/admin/dechets)
-- ============================================================
-- Réutilise suivi_dechets (Module 1 init) pour les pesées internes.
-- Ajoute :
--   1. collectes_dechets   — enlèvements par prestataire avec BSD
--   2. Disable RLS
--
-- BSD = Bordereau de Suivi des Déchets (obligatoire pour biodéchets
-- > 5 kg/semaine, conservation 5 ans).
-- ============================================================

create table if not exists collectes_dechets (
  id              uuid primary key default gen_random_uuid(),
  type_dechet     text not null check (type_dechet in ('biodechet','carton','verre','plastique','huile','metal','dasri','autre')),
  date_collecte   date not null default current_date,
  prestataire     text not null,
  poids_total_kg  decimal(10,2),
  num_bsd         text,                              -- numéro Bordereau de Suivi des Déchets
  cout_collecte   decimal(10,2),
  document_url    text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_collectes_date     on collectes_dechets(date_collecte desc);
create index if not exists idx_collectes_type     on collectes_dechets(type_dechet, date_collecte desc);
create index if not exists idx_collectes_bsd      on collectes_dechets(num_bsd) where num_bsd is not null;

alter table collectes_dechets disable row level security;
alter table suivi_dechets     disable row level security;  -- au cas où

-- Diagnostic
select
  (select count(*) from collectes_dechets) as nb_collectes,
  (select count(*) from suivi_dechets)     as nb_pesees;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('collectes_dechets','suivi_dechets')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0030_disable_rls_module_18.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0030 — Fix RLS Module 18 (14e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table collectes_dechets disable row level security;
alter table suivi_dechets     disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('collectes_dechets','suivi_dechets');

-- ─────────────────────────────────────────────────────────────
-- 0031_module_19_groupes.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0032_disable_rls_module_19.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0032 — Fix RLS Module 19 (15e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table groupes            disable row level security;
alter table groupes_menus      disable row level security;
alter table groupes_paiements  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('groupes','groupes_menus','groupes_paiements');

-- ─────────────────────────────────────────────────────────────
-- 0033_module_20_clients.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0033 — Module 20 : CRM & fidélité (/admin/clients)
-- ============================================================
-- Réutilise clients (Module 1 init).
-- Ajoute :
--   1. ALTER clients ADD code_parrainage + parraine_par_id +
--      opt_in_marketing + total_depense + nb_visites
--   2. campagnes      — email / SMS marketing
--   3. reclamations   — workflow gestion incidents
--   4. retours_plats  — avec lien recette + impact food cost
--   5. Disable RLS
-- ============================================================

-- ─── 1. ALTER clients ─────────────────────────────────────
do $$ begin
  alter table clients add column if not exists code_parrainage   text unique;
  alter table clients add column if not exists parraine_par_id   uuid references clients(id) on delete set null;
  alter table clients add column if not exists opt_in_marketing  boolean not null default false;
  alter table clients add column if not exists total_depense     decimal(10,2) not null default 0;
  alter table clients add column if not exists nb_visites        integer not null default 0;
  alter table clients add column if not exists derniere_visite   date;
exception when duplicate_column then null; end $$;

create index if not exists idx_clients_optin    on clients(opt_in_marketing) where opt_in_marketing = true;
create index if not exists idx_clients_visites  on clients(nb_visites desc, total_depense desc);
create index if not exists idx_clients_parrain  on clients(parraine_par_id) where parraine_par_id is not null;

-- ─── 2. campagnes ─────────────────────────────────────────
create table if not exists campagnes (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  type            text not null check (type in ('email','sms')),
  segment         text not null check (segment in ('tous','vip','dormants','anniversaires','nouveaux','allergiques','custom')),
  segment_filtre  jsonb,                                          -- ex: { allergie: 'gluten', niveau: 'or' }
  sujet           text,                                            -- pour email
  contenu         text not null,
  nb_destinataires integer default 0,
  date_envoi      timestamptz,
  statut          text not null default 'brouillon' check (statut in ('brouillon','envoyee','annulee')),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_campagnes_statut on campagnes(statut, date_envoi desc);

alter table campagnes disable row level security;

-- ─── 3. reclamations ──────────────────────────────────────
create table if not exists reclamations (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(id) on delete set null,
  client_nom_libre    text,                                       -- si client externe non fiché
  date_reclamation    date not null default current_date,
  type                text not null check (type in ('service','plat','attente','hygiene','prix','autre')),
  gravite             text not null default 'mineure' check (gravite in ('mineure','majeure','critique')),
  description         text not null,
  statut              text not null default 'ouverte' check (statut in ('ouverte','en_cours','resolue')),
  action_corrective   text,
  geste_commercial    text,                                        -- "remise 20%", "plat offert", etc.
  resolved_at         timestamptz,
  responsable_id      uuid references employes(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_reclam_statut on reclamations(statut, date_reclamation desc);
create index if not exists idx_reclam_client on reclamations(client_id, date_reclamation desc) where client_id is not null;

alter table reclamations disable row level security;

-- ─── 4. retours_plats ─────────────────────────────────────
create table if not exists retours_plats (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(id) on delete set null,
  date_retour         date not null default current_date,
  recette_id          uuid references recettes(id) on delete set null,
  recette_nom_libre   text,                                       -- si recette supprimée
  motif               text not null check (motif in ('cuisson','temperature','gout','presentation','allergie','autre')),
  description         text,
  cout_food_cost      decimal(10,2) default 0,                   -- coût matière du plat retourné
  geste_commercial    text,
  refait              boolean not null default false,
  notes               text,
  responsable_id      uuid references employes(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_retours_date    on retours_plats(date_retour desc);
create index if not exists idx_retours_recette on retours_plats(recette_id, date_retour desc) where recette_id is not null;

alter table retours_plats disable row level security;

-- Disable RLS aussi sur clients
alter table clients disable row level security;

-- ─── Diagnostic ───────────────────────────────────────────
select
  (select count(*) from campagnes)        as nb_campagnes,
  (select count(*) from reclamations)     as nb_reclam,
  (select count(*) from retours_plats)    as nb_retours,
  (select count(*) from clients where opt_in_marketing = true) as nb_optin;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('clients','campagnes','reclamations','retours_plats')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0034_disable_rls_module_20.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0034 — Fix RLS Module 20 (16e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table campagnes      disable row level security;
alter table reclamations   disable row level security;
alter table retours_plats  disable row level security;
alter table clients        disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('clients','campagnes','reclamations','retours_plats');

-- ─────────────────────────────────────────────────────────────
-- 0035_module_21_reservations.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0035 — Module 21 : Réservations & événementiel (/admin/reservations)
-- ============================================================
-- Réutilise tables existantes (Module 1 init) :
--   chambres, reservations_chambres, evenements
--
-- Ajoute :
--   1. ALTER evenements ADD type/lieu/horaires/privatisation/materiel
--   2. CREATE reservations_tables (terrasse + intérieur, plage horaire)
--   3. Disable RLS
-- ============================================================

-- ─── 1. ALTER evenements ───────────────────────────────────
do $$ begin
  alter table evenements add column if not exists type_evenement      text check (type_evenement in ('mariage','anniversaire','seminaire','cocktail','banquet','enterrement_vie','privatisation','autre'));
  alter table evenements add column if not exists lieu                 text;
  alter table evenements add column if not exists heure_debut          time;
  alter table evenements add column if not exists heure_fin            time;
  alter table evenements add column if not exists privatisation        boolean not null default false;
  alter table evenements add column if not exists materiel_demande     text;
  alter table evenements add column if not exists besoins_techniques   text;
  alter table evenements add column if not exists prix_par_personne_ht decimal(10,2);
  alter table evenements add column if not exists taux_tva             decimal(5,2) not null default 10;
exception when duplicate_column then null; end $$;

create index if not exists idx_evenements_type      on evenements(type_evenement) where statut <> 'annulee';
create index if not exists idx_evenements_a_venir   on evenements(date_evenement) where statut in ('demande','confirmee');

-- ─── 2. reservations_tables ────────────────────────────────
create table if not exists reservations_tables (
  id              uuid primary key default gen_random_uuid(),
  table_id        uuid references tables_restaurant(id) on delete set null,
  zone            text,                                  -- 'terrasse', 'salle', 'salon privatisé'
  date_resa       date not null,
  heure_arrivee   time not null,
  heure_depart    time,
  nb_personnes    integer not null check (nb_personnes > 0),
  client_nom      text not null,
  client_telephone text,
  client_email    text,
  client_id       uuid references clients(id) on delete set null,
  notes           text,
  statut          text not null default 'confirmee' check (statut in ('demande','confirmee','arrivee','terminee','no_show','annulee')),
  rappel_envoye   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_resa_tables_date     on reservations_tables(date_resa, heure_arrivee);
create index if not exists idx_resa_tables_table    on reservations_tables(table_id, date_resa);
create index if not exists idx_resa_tables_statut   on reservations_tables(statut, date_resa);

alter table reservations_tables disable row level security;

-- Disable RLS aussi sur les tables existantes touchées
alter table evenements             disable row level security;
alter table chambres               disable row level security;
alter table reservations_chambres  disable row level security;

-- ─── Diagnostic ────────────────────────────────────────────
select
  (select count(*) from chambres)              as nb_chambres,
  (select count(*) from reservations_chambres) as nb_resa_chambres,
  (select count(*) from reservations_tables)   as nb_resa_tables,
  (select count(*) from evenements)            as nb_evenements;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('chambres','reservations_chambres','reservations_tables','evenements')
 order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0036_disable_rls_module_21.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0036 — Fix RLS Module 21 (17e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table reservations_tables    disable row level security;
alter table evenements             disable row level security;
alter table chambres               disable row level security;
alter table reservations_chambres  disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('chambres','reservations_chambres','reservations_tables','evenements');

-- ─────────────────────────────────────────────────────────────
-- 0037_module_22_previsionnel.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0037 — Module 22 : Météo & prévisionnel intelligent
-- ============================================================
-- 1 nouvelle table : releves_meteo
-- Stockage clé API OpenWeatherMap dans parametres (cle = 'openweathermap_api_key')
-- + ville (cle = 'meteo_ville', valeur ex: 'Paris,FR')
-- ============================================================

create table if not exists releves_meteo (
  id              uuid primary key default gen_random_uuid(),
  date_meteo      date not null,
  temperature_min decimal(4,1),
  temperature_max decimal(4,1),
  conditions      text not null check (conditions in ('ensoleille','peu_nuageux','nuageux','pluie_legere','pluie_forte','orage','neige','brouillard','autre')),
  precipitations_mm decimal(5,2) default 0,
  vent_kmh        decimal(5,1) default 0,
  humidite_pct    integer,
  source          text not null default 'manuel' check (source in ('manuel','openweathermap','autre')),
  est_prevision   boolean not null default false,                 -- true = forecast, false = relevé constaté
  notes           text,
  created_at      timestamptz not null default now()
);

-- Une seule ligne par jour × source × prévision/relevé pour éviter doublons
create unique index if not exists idx_meteo_unique on releves_meteo(date_meteo, source, est_prevision);
create index if not exists idx_meteo_date on releves_meteo(date_meteo desc);

alter table releves_meteo disable row level security;

-- Diagnostic
select
  (select count(*) from releves_meteo where est_prevision = false) as nb_releves,
  (select count(*) from releves_meteo where est_prevision = true)  as nb_previsions;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_meteo';

-- ─────────────────────────────────────────────────────────────
-- 0038_disable_rls_module_22.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0038 — Fix RLS Module 22 (18e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table releves_meteo disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_meteo';

-- ─────────────────────────────────────────────────────────────
-- 0039_module_23_journal.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0039 — Module 23 : Journal de bord gérant (/admin/journal)
-- ============================================================
-- 1 nouvelle table : journal_entrees
-- Snapshots automatiques météo + CA au moment de la création.
-- ============================================================

create table if not exists journal_entrees (
  id              uuid primary key default gen_random_uuid(),
  date_entree     date not null default current_date,
  titre           text,
  contenu         text not null,
  humeur          text not null default 'normale' check (humeur in ('tres_bonne','bonne','normale','difficile','tres_difficile')),
  photos_urls     text[] not null default '{}',
  tags            text[] not null default '{}',
  faits_marquants text,
  ca_jour_snap    decimal(10,2),                              -- CA TTC du jour (figé à la création)
  nb_couverts_snap integer,
  meteo_snap      text,                                        -- ex: 'ensoleille', 'pluie_forte'
  redacteur_id    uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_journal_date     on journal_entrees(date_entree desc);
create index if not exists idx_journal_humeur   on journal_entrees(humeur, date_entree desc);
create index if not exists idx_journal_tags     on journal_entrees using gin(tags);

alter table journal_entrees disable row level security;

-- Diagnostic
select count(*) as nb_entrees from journal_entrees;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'journal_entrees';

-- ─────────────────────────────────────────────────────────────
-- 0040_disable_rls_module_23.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- 0040 — Fix RLS Module 23 (19e occurrence du pattern Supabase)
-- Idempotent.
-- ============================================================

alter table journal_entrees disable row level security;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'journal_entrees';

-- ─────────────────────────────────────────────────────────────
-- 0041_module_24_assistant.sql
-- ─────────────────────────────────────────────────────────────
-- Module 24 — Assistant IA gérant
-- Tables : conversations + messages
-- Le contexte (snapshot KPIs au démarrage de la conversation) est figé en jsonb sur la conversation.

create table if not exists assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null default 'Nouvelle conversation',
  contexte_snap   jsonb,                              -- KPIs gelés au début (CA, masse sal, food cost, alertes...)
  modele          text not null default 'claude-haiku-4-5',
  archivee        boolean not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists assistant_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references assistant_conversations(id) on delete cascade,
  role               text not null check (role in ('user','assistant','system')),
  contenu            text not null,
  tokens_in          integer,                          -- input tokens (uncached)
  tokens_out         integer,                          -- output tokens
  cache_read_tokens  integer,                          -- tokens lus depuis le cache (~0.1×)
  cache_write_tokens integer,                          -- tokens écrits dans le cache (~1.25×)
  stop_reason        text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_assistant_msg_conv on assistant_messages(conversation_id, created_at);
create index if not exists idx_assistant_conv_last on assistant_conversations(last_message_at desc) where archivee = false;

alter table assistant_conversations disable row level security;
alter table assistant_messages disable row level security;

-- diagnostic
do $$
declare nb_conv int; nb_msg int; rls_conv text; rls_msg text;
begin
  select count(*) into nb_conv from assistant_conversations;
  select count(*) into nb_msg  from assistant_messages;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_conv
    from pg_class where relname='assistant_conversations';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_msg
    from pg_class where relname='assistant_messages';
  raise notice 'Module 24 — conv=% msg=% RLS conv=% msg=%', nb_conv, nb_msg, rls_conv, rls_msg;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0042_disable_rls_module_24.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table assistant_conversations disable row level security;
alter table assistant_messages       disable row level security;

do $$
declare rls_conv text; rls_msg text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_conv
    from pg_class where relname='assistant_conversations';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_msg
    from pg_class where relname='assistant_messages';
  raise notice 'RLS post-patch — conv=% msg=%', rls_conv, rls_msg;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0043_module_25_pilotage.sql
-- ─────────────────────────────────────────────────────────────
-- Module 25 — Pilotage stratégique
-- Tables : objectifs (mensuels + annuels) + actions_strategiques (plan d'action mensuel)

create table if not exists objectifs (
  id          uuid primary key default gen_random_uuid(),
  periode     text not null check (periode in ('mensuel','annuel')),
  mois        text,                                                       -- yyyy-MM si periode='mensuel'
  annee       integer not null,                                           -- yyyy
  kpi         text not null check (kpi in (
                'ca','marge_brute','food_cost_pct','ratio_masse_sal',
                'ticket_moyen','taux_remplissage','nc_ouvertes',
                'energie_par_couvert','factures_a_payer','score_satisfaction'
              )),
  valeur_cible decimal(12,2) not null,
  unite       text not null default 'eur',                                -- eur, pct, nombre, kwh
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (periode, mois, annee, kpi)
);

create index if not exists idx_objectifs_periode on objectifs(periode, annee, mois);

create table if not exists actions_strategiques (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,
  description   text,
  kpi_lie       text,                                                     -- même enum que objectifs.kpi (nullable)
  statut        text not null default 'a_faire' check (statut in ('a_faire','en_cours','fait','annule')),
  priorite      text not null default 'normale' check (priorite in ('haute','normale','basse')),
  echeance      date,
  responsable_id uuid references employes(id) on delete set null,
  fait_le       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_actions_statut on actions_strategiques(statut, echeance);

alter table objectifs           disable row level security;
alter table actions_strategiques disable row level security;

do $$
declare nb_obj int; nb_act int; rls_obj text; rls_act text;
begin
  select count(*) into nb_obj from objectifs;
  select count(*) into nb_act from actions_strategiques;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_obj from pg_class where relname='objectifs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_act from pg_class where relname='actions_strategiques';
  raise notice 'Module 25 — obj=% act=% RLS obj=% act=%', nb_obj, nb_act, rls_obj, rls_act;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0044_disable_rls_module_25.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table objectifs           disable row level security;
alter table actions_strategiques disable row level security;

do $$
declare rls_obj text; rls_act text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_obj from pg_class where relname='objectifs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_act from pg_class where relname='actions_strategiques';
  raise notice 'RLS post-patch — obj=% act=%', rls_obj, rls_act;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0045_module_26_affichage.sql
-- ─────────────────────────────────────────────────────────────
-- Module 26 — Affichage dynamique salle
-- Tables : menu_du_jour, affichage_promos, appels_serveur

create table if not exists menu_du_jour (
  id          uuid primary key default gen_random_uuid(),
  jour        date not null default current_date,
  section     text not null check (section in ('entree','plat','dessert','boisson','autre')),
  titre       text not null,
  description text,
  prix        decimal(8,2),
  ordre       integer not null default 0,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_menu_jour     on menu_du_jour(jour, section, ordre);
create index if not exists idx_menu_jour_actif on menu_du_jour(jour) where actif = true;

create table if not exists affichage_promos (
  id             uuid primary key default gen_random_uuid(),
  titre          text not null,
  description    text,
  image_url      text,
  periode_debut  date,
  periode_fin    date,
  actif          boolean not null default true,
  ordre          integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_promos_actif on affichage_promos(actif, ordre);

create table if not exists appels_serveur (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid references tables_restaurant(id) on delete set null,
  table_numero text,                                                       -- snapshot au cas où la table change/supprime
  motif        text not null check (motif in ('eau','addition','aide','autre')),
  message      text,
  statut       text not null default 'en_attente' check (statut in ('en_attente','pris_en_charge','annule')),
  pris_par_id  uuid references employes(id) on delete set null,
  pris_le      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_appels_statut on appels_serveur(statut, created_at);
create index if not exists idx_appels_table  on appels_serveur(table_id, created_at);

alter table menu_du_jour       disable row level security;
alter table affichage_promos   disable row level security;
alter table appels_serveur     disable row level security;

do $$
declare nb_m int; nb_p int; nb_a int; rls_m text; rls_p text; rls_a text;
begin
  select count(*) into nb_m from menu_du_jour;
  select count(*) into nb_p from affichage_promos;
  select count(*) into nb_a from appels_serveur;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_m from pg_class where relname='menu_du_jour';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='affichage_promos';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='appels_serveur';
  raise notice 'Module 26 — menu=% promos=% appels=% RLS m=% p=% a=%', nb_m, nb_p, nb_a, rls_m, rls_p, rls_a;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0046_disable_rls_module_26.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table menu_du_jour     disable row level security;
alter table affichage_promos disable row level security;
alter table appels_serveur   disable row level security;

do $$
declare rls_m text; rls_p text; rls_a text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_m from pg_class where relname='menu_du_jour';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='affichage_promos';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='appels_serveur';
  raise notice 'RLS post-patch — menu=% promos=% appels=%', rls_m, rls_p, rls_a;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0047_module_27_formation.sql
-- ─────────────────────────────────────────────────────────────
-- Module 27 — Formation des équipes
-- Tables : guides_formation + etapes_formation + quiz_questions + progressions_formation

create table if not exists guides_formation (
  id                  uuid primary key default gen_random_uuid(),
  titre               text not null,
  description         text,
  poste               text not null check (poste in (
                        'cuisine','pizzaiolo','bar','salle','serveur','manager','plonge','autre','tous'
                      )),
  ordre               integer not null default 0,
  actif               boolean not null default true,
  seuil_reussite_pct  integer not null default 80 check (seuil_reussite_pct between 0 and 100),
  duree_minutes       integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_guides_poste on guides_formation(poste, ordre) where actif = true;

create table if not exists etapes_formation (
  id           uuid primary key default gen_random_uuid(),
  guide_id     uuid not null references guides_formation(id) on delete cascade,
  ordre        integer not null,
  titre        text not null,
  contenu      text not null,
  image_url    text,
  video_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (guide_id, ordre)
);

create index if not exists idx_etapes_guide on etapes_formation(guide_id, ordre);

create table if not exists quiz_questions (
  id                uuid primary key default gen_random_uuid(),
  guide_id          uuid not null references guides_formation(id) on delete cascade,
  ordre             integer not null,
  question          text not null,
  choix             jsonb not null,                                       -- ["choix A", "choix B", ...]
  bonne_reponse_idx integer not null,                                     -- index dans choix[]
  explication       text,
  created_at        timestamptz not null default now(),
  unique (guide_id, ordre)
);

create index if not exists idx_quiz_guide on quiz_questions(guide_id, ordre);

create table if not exists progressions_formation (
  id                       uuid primary key default gen_random_uuid(),
  guide_id                 uuid not null references guides_formation(id) on delete cascade,
  employe_id               uuid not null references employes(id) on delete cascade,
  etapes_vues_ids          uuid[] not null default '{}',                   -- IDs d'étapes marquées vues
  dernier_score_pct        integer,                                        -- 0-100, null si pas encore tenté
  derniere_tentative_le    timestamptz,
  statut                   text not null default 'non_commence' check (statut in (
                             'non_commence','en_cours','quiz_a_passer','reussi','echoue'
                           )),
  termine_le               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (guide_id, employe_id)
);

create index if not exists idx_prog_employe on progressions_formation(employe_id, statut);
create index if not exists idx_prog_guide   on progressions_formation(guide_id, statut);

alter table guides_formation       disable row level security;
alter table etapes_formation       disable row level security;
alter table quiz_questions         disable row level security;
alter table progressions_formation disable row level security;

do $$
declare nb_g int; nb_e int; nb_q int; nb_p int;
        rls_g text; rls_e text; rls_q text; rls_p text;
begin
  select count(*) into nb_g from guides_formation;
  select count(*) into nb_e from etapes_formation;
  select count(*) into nb_q from quiz_questions;
  select count(*) into nb_p from progressions_formation;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_g from pg_class where relname='guides_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_e from pg_class where relname='etapes_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_q from pg_class where relname='quiz_questions';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='progressions_formation';
  raise notice 'Module 27 — guides=% etapes=% quiz=% prog=% RLS g=% e=% q=% p=%',
    nb_g, nb_e, nb_q, nb_p, rls_g, rls_e, rls_q, rls_p;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0048_disable_rls_module_27.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table guides_formation       disable row level security;
alter table etapes_formation       disable row level security;
alter table quiz_questions         disable row level security;
alter table progressions_formation disable row level security;

do $$
declare rls_g text; rls_e text; rls_q text; rls_p text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_g from pg_class where relname='guides_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_e from pg_class where relname='etapes_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_q from pg_class where relname='quiz_questions';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='progressions_formation';
  raise notice 'RLS post-patch — g=% e=% q=% p=%', rls_g, rls_e, rls_q, rls_p;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0049_module_28_securite.sql
-- ─────────────────────────────────────────────────────────────
-- Module 28 — Sécurité & accès
-- Tables : profils (lié à auth.users) + audit_logs + connexions

create table if not exists profils (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  prenom          text,
  nom             text,
  role            text not null default 'employe' check (role in ('manager','employe')),
  totp_secret     text,                                                       -- chiffré côté app, base32
  totp_enabled    boolean not null default false,
  backup_codes    text[] not null default '{}',                               -- codes 8 car. générés à l'activation
  derniere_connexion timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_profils_role on profils(role);

create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  profil_id       uuid references profils(id) on delete set null,
  email           text,                                                       -- snapshot au cas où le profil est supprimé
  action          text not null,                                              -- 'login', 'logout', 'delete', 'update_param', 'encaissement', etc.
  ressource_type  text,                                                       -- 'employe','recette','commande','parametres', etc.
  ressource_id    text,                                                       -- id (uuid string ou autre) si applicable
  details         jsonb,                                                      -- contexte additionnel
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_created on audit_logs(created_at desc);
create index if not exists idx_audit_profil  on audit_logs(profil_id, created_at desc);
create index if not exists idx_audit_action  on audit_logs(action, created_at desc);

create table if not exists connexions (
  id           uuid primary key default gen_random_uuid(),
  profil_id    uuid references profils(id) on delete cascade,
  email        text,
  succes       boolean not null,
  ip           text,
  user_agent   text,
  inhabituelle boolean not null default false,                                -- true si IP nouvelle pour cet utilisateur
  created_at   timestamptz not null default now()
);

create index if not exists idx_connexions_profil on connexions(profil_id, created_at desc);
create index if not exists idx_connexions_inhabit on connexions(inhabituelle) where inhabituelle = true;

alter table profils      disable row level security;
alter table audit_logs   disable row level security;
alter table connexions   disable row level security;

do $$
declare nb_p int; nb_a int; nb_c int; rls_p text; rls_a text; rls_c text;
begin
  select count(*) into nb_p from profils;
  select count(*) into nb_a from audit_logs;
  select count(*) into nb_c from connexions;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='profils';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='audit_logs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_c from pg_class where relname='connexions';
  raise notice 'Module 28 — profils=% audit=% connexions=% RLS p=% a=% c=%',
    nb_p, nb_a, nb_c, rls_p, rls_a, rls_c;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0050_disable_rls_module_28.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table profils    disable row level security;
alter table audit_logs disable row level security;
alter table connexions disable row level security;

do $$
declare rls_p text; rls_a text; rls_c text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='profils';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='audit_logs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_c from pg_class where relname='connexions';
  raise notice 'RLS post-patch — profils=% audit=% connexions=%', rls_p, rls_a, rls_c;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0051_module_28_permissions.sql
-- ─────────────────────────────────────────────────────────────
-- Module 28 v2 — Permissions par rôle
-- Étend profils pour porter le lien vers employes + overrides personnalisés.
-- employes.poste reste un text libre (pas de check) — la matrice de permissions
-- gère les valeurs reconnues côté lib.

alter table profils
  add column if not exists employe_id         uuid references employes(id) on delete set null,
  add column if not exists poste              text,                                              -- denormalized depuis employes.poste, mis à jour au lien
  add column if not exists custom_permissions jsonb;                                              -- { allowed?: string[], denied?: string[] }

create index if not exists idx_profils_employe on profils(employe_id) where employe_id is not null;
create index if not exists idx_profils_poste   on profils(poste)      where poste      is not null;

-- Bootstrap : pour les profils existants role='manager' qui n'ont pas de poste,
-- on initialise poste='manager' (donne accès complet via la matrice).
update profils set poste = 'manager' where role = 'manager' and poste is null;

do $$
declare nb_p int; nb_link int; nb_pos int;
begin
  select count(*) into nb_p    from profils;
  select count(*) into nb_link from profils where employe_id is not null;
  select count(*) into nb_pos  from profils where poste is not null;
  raise notice 'Module 28 v2 — profils=% lien_employe=% poste=%', nb_p, nb_link, nb_pos;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0052_disable_rls_module_28_v2.sql
-- ─────────────────────────────────────────────────────────────
-- Patch RLS au cas où Supabase l'aurait ré-activée après l'ALTER TABLE.
alter table profils disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls from pg_class where relname='profils';
  raise notice 'RLS post-patch profils=%', rls;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0053_extend_poste_guides.sql
-- ─────────────────────────────────────────────────────────────
-- Étend la check constraint sur guides_formation.poste pour accepter les
-- nouveaux postes utilisés dans la matrice de permissions :
-- gerant, second, receptionniste, cuisinier, barman, extra (en plus
-- des valeurs historiques cuisine/pizzaiolo/bar/salle/serveur/manager/
-- plonge/autre/tous).

alter table guides_formation drop constraint if exists guides_formation_poste_check;

alter table guides_formation
  add constraint guides_formation_poste_check
  check (poste in (
    'gerant', 'manager',
    'second', 'cuisinier', 'cuisine',
    'pizzaiolo',
    'serveur', 'salle',
    'barman', 'bar',
    'receptionniste',
    'plonge', 'extra',
    'autre', 'tous'
  ));

do $$
begin
  raise notice 'guides_formation.poste check étendu (15 valeurs autorisées)';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0054_onboarding_employe.sql
-- ─────────────────────────────────────────────────────────────
-- Module 27/28 — Onboarding 1er login.
-- Ajoute un timestamp onboarding_completed_at pour bloquer l'accès aux modules ops
-- tant que l'employé n'a pas validé son manuel + quiz.

alter table profils
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill : tout employé qui a déjà passé son quiz avec succès est considéré
-- comme onboardé (utile pour ne pas bloquer les comptes existants comme florence).
update profils p
set    onboarding_completed_at = sub.terminer_le
from (
  select pf.employe_id, max(pf.termine_le) as terminer_le
  from   progressions_formation pf
  where  pf.statut = 'reussi'
  group by pf.employe_id
) sub
where  p.employe_id = sub.employe_id
  and  p.onboarding_completed_at is null;

-- Manager : pas d'onboarding nécessaire (ils ont créé l'app).
update profils
set    onboarding_completed_at = coalesce(onboarding_completed_at, now())
where  role = 'manager'
  and  onboarding_completed_at is null;

do $$
declare nb int;
begin
  select count(*) into nb from profils where onboarding_completed_at is null;
  raise notice 'Profils non onboardés : %', nb;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0055_taches_completees.sql
-- ─────────────────────────────────────────────────────────────
-- Module 27/28 — Persistance des tâches du jour cochées par employé.
--
-- Chaque ligne = une tâche (id stable depuis lib/taches-du-jour.ts) cochée
-- par un employé un jour donné. Permet :
--  - persistance multi-device (l'employé change de tablette → ses cochages restent)
--  - dashboard manager temps réel (% checklist faite par employé/poste/moment)

create table if not exists taches_completees (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  tache_id      text not null,
  poste         text not null,
  moment        text not null check (moment in ('matin', 'service', 'fin')),
  obligatoire   boolean not null default false,
  date          date not null default current_date,
  completed_at  timestamptz not null default now(),
  unique (employe_id, tache_id, date)
);

create index if not exists taches_completees_date_idx
  on taches_completees(date);

create index if not exists taches_completees_employe_date_idx
  on taches_completees(employe_id, date);

create index if not exists taches_completees_poste_date_moment_idx
  on taches_completees(poste, date, moment);

-- RLS off (l'app gère via server actions + middleware)
alter table taches_completees disable row level security;

do $$
begin
  raise notice 'taches_completees créée + index';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0056_push_subscriptions.sql
-- ─────────────────────────────────────────────────────────────
-- Module 28+ — Push notifications PWA.
-- Stocke les abonnements Web Push de chaque employé connecté pour pouvoir
-- envoyer des notifs server-side (article prêt → serveur, NC critique → manager).

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid not null references employes(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,            -- clé publique du navigateur (auth)
  auth         text not null,            -- secret partagé
  user_agent   text,
  created_at   timestamptz not null default now(),
  unique (endpoint)                      -- un endpoint = une souscription unique
);

create index if not exists push_subscriptions_employe_idx
  on push_subscriptions(employe_id);

alter table push_subscriptions disable row level security;

do $$ begin raise notice 'push_subscriptions créée'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0057_disable_rls_push.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : Supabase a réactivé la RLS sur push_subscriptions après le CREATE TABLE.
-- On la désactive explicitement (pattern récurrent — voir migrations 0040, 0042, 0044…).

alter table push_subscriptions disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into   rls
  from   pg_class
  where  relname = 'push_subscriptions';
  raise notice 'push_subscriptions RLS = %', rls;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0058_economie_point_mort.sql
-- ─────────────────────────────────────────────────────────────
-- Module Challenges — fondations économiques.
--
-- 1. config_economique : singleton SMIC horaire + % redistribution surplus
-- 2. point_mort_mensuel : charges fixes + taux variable par mois → seuil CA auto-calculé

create table if not exists config_economique (
  id                              uuid primary key default gen_random_uuid(),
  smic_horaire_brut               decimal(6,2)  not null default 11.65,   -- EUR/h, à actualiser annuellement
  pct_redistribution_surplus      decimal(5,2)  not null default 30.00,   -- 30% du surplus partagé équipe
  notes                           text,
  updated_at                      timestamptz   not null default now()
);

-- Singleton row (créé via seed)
insert into config_economique (smic_horaire_brut, pct_redistribution_surplus, notes)
select 11.65, 30.00, 'Configuration initiale — SMIC 2026 + 30% redistribution'
where not exists (select 1 from config_economique);

create table if not exists point_mort_mensuel (
  id                              uuid primary key default gen_random_uuid(),
  mois                            date not null unique,                   -- 1er du mois (ex: '2026-05-01')
  charges_fixes_eur               decimal(10,2) not null,                 -- loyer + salaires + abonnements
  taux_charges_variables_pct      decimal(5,2)  not null default 30.00,   -- food cost + commissions
  ca_seuil_calcule                decimal(10,2) generated always as
    (charges_fixes_eur / (1 - taux_charges_variables_pct / 100.0)) stored,
  notes                           text,
  created_at                      timestamptz   not null default now(),
  updated_at                      timestamptz   not null default now()
);

create index if not exists idx_point_mort_mois on point_mort_mensuel(mois desc);

alter table config_economique     disable row level security;
alter table point_mort_mensuel    disable row level security;

do $$ begin raise notice 'config_economique + point_mort_mensuel créées'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0059_challenges.sql
-- ─────────────────────────────────────────────────────────────
-- Module Challenges — table principale + résultats.

create table if not exists challenges (
  id                              uuid primary key default gen_random_uuid(),
  titre                           text not null,
  description                     text,
  type                            text not null check (type in ('individuel', 'equipe', 'restaurant')),
  poste_concerne                  text,                                                -- null = tous
  metrique                        text not null check (metrique in (
    'ca_personnel_serveur',           -- CA généré par moi (serveur)
    'tables_servies_personnelles',
    'pourboires_personnels',
    'plats_prepares_equipe_cuisine',
    'plats_prepares_equipe_pizza',
    'boissons_servies_equipe',
    'reservations_recues',
    'no_shows_pct',
    'taches_obligatoires_pct',        -- % tâches oblig cochées sur la période
    'nc_critiques_count',
    'food_cost_pct',
    'ca_restaurant',
    'ca_surplus_point_mort'           -- (CA - point_mort), spécial restaurant
  )),
  cible_operateur                 text not null check (cible_operateur in ('>=', '<=', '=')),
  cible_valeur                    decimal(12,2) not null,
  cible_unite                     text not null,                                       -- '€', '%', 'tables', etc.
  recompense_type                 text not null check (recompense_type in ('fixe', 'pct_surplus')),
  recompense_montant              decimal(8,2) not null default 0,                     -- € si fixe, % si pct_surplus
  periode                         text not null check (periode in ('jour', 'semaine', 'mois')),
  date_debut                      date not null default current_date,
  date_fin                        date,
  leaderboard_public              boolean not null default false,
  actif                           boolean not null default true,
  created_at                      timestamptz not null default now()
);

create index if not exists idx_challenges_actif       on challenges(actif, type);
create index if not exists idx_challenges_poste       on challenges(poste_concerne, actif);

create table if not exists challenges_resultats (
  id                              uuid primary key default gen_random_uuid(),
  challenge_id                    uuid not null references challenges(id) on delete cascade,
  employe_id                      uuid references employes(id) on delete cascade,     -- null pour 'restaurant'
  periode_debut                   date not null,
  periode_fin                     date not null,
  valeur_atteinte                 decimal(12,2),
  cible_atteinte                  boolean default false,
  prime_calculee_eur              decimal(8,2) default 0,
  prime_versee                    boolean default false,
  versee_le                       date,
  notes                           text,
  created_at                      timestamptz default now(),
  updated_at                      timestamptz default now(),
  unique (challenge_id, employe_id, periode_debut)
);

create index if not exists idx_resultats_challenge on challenges_resultats(challenge_id, periode_debut desc);
create index if not exists idx_resultats_employe   on challenges_resultats(employe_id, periode_debut desc);

alter table challenges            disable row level security;
alter table challenges_resultats  disable row level security;

do $$ begin raise notice 'challenges + challenges_resultats créées'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0060_disable_rls_challenges.sql
-- ─────────────────────────────────────────────────────────────
-- Patch — Supabase a auto-réactivé la RLS sur les 4 nouvelles tables challenges.
-- Pattern récurrent (idem migrations 0040, 0044, 0048, 0050, 0057…).

alter table config_economique     disable row level security;
alter table point_mort_mensuel    disable row level security;
alter table challenges            disable row level security;
alter table challenges_resultats  disable row level security;

-- Seed config_economique si vide (le seed dans 0058 a probablement été bloqué par la RLS)
insert into config_economique (smic_horaire_brut, pct_redistribution_surplus, notes)
select 11.65, 30.00, 'Configuration initiale — SMIC 2026 + 30% redistribution'
where not exists (select 1 from config_economique);

do $$
declare a text; b text; c text; d text; n int;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into a from pg_class where relname='config_economique';
  select case when relrowsecurity then 'ON' else 'OFF' end into b from pg_class where relname='point_mort_mensuel';
  select case when relrowsecurity then 'ON' else 'OFF' end into c from pg_class where relname='challenges';
  select case when relrowsecurity then 'ON' else 'OFF' end into d from pg_class where relname='challenges_resultats';
  select count(*) into n from config_economique;
  raise notice 'RLS — config_economique=% point_mort=% challenges=% resultats=% | seed config: % ligne(s)', a, b, c, d, n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0061_charges_recurrentes.sql
-- ─────────────────────────────────────────────────────────────
-- Module Économie — catalogue de charges fixes mensuelles récurrentes.
-- Saisies UNE FOIS par le manager, totalisées auto pour pré-remplir le point mort.

create table if not exists charges_fixes_recurrentes (
  id                              uuid primary key default gen_random_uuid(),
  categorie                       text not null check (categorie in (
    'loyer',
    'salaires',                                                  -- masse salariale brute
    'charges_sociales',                                          -- URSSAF, prévoyance, mutuelle
    'energie',                                                   -- électricité, gaz
    'eau',
    'internet',
    'telephone',
    'assurance',                                                 -- multirisque, RC pro
    'comptable',
    'abonnement_software',                                       -- SaaS, app de cette nature
    'maintenance',                                               -- contrats entretien
    'marketing',                                                 -- pub récurrente, SEO, etc.
    'leasing',                                                   -- véhicule, machine
    'banque',                                                    -- frais tenue de compte
    'autre'
  )),
  libelle                         text not null,                 -- ex: "Loyer du local"
  montant_mensuel_eur             decimal(10,2) not null,
  fournisseur                     text,                          -- nom libre
  notes                           text,
  actif                           boolean not null default true,
  date_debut                      date default current_date,
  date_fin                        date,                          -- null = en cours
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists idx_charges_recurrentes_actif    on charges_fixes_recurrentes(actif, categorie);
create index if not exists idx_charges_recurrentes_date_fin on charges_fixes_recurrentes(date_fin) where date_fin is not null;

alter table charges_fixes_recurrentes disable row level security;

do $$ begin raise notice 'charges_fixes_recurrentes créée'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0062_disable_rls_charges_recurrentes.sql
-- ─────────────────────────────────────────────────────────────
-- Patch — Supabase a auto-réactivé la RLS sur charges_fixes_recurrentes
-- (pattern récurrent — idem 0040, 0044, 0048, 0050, 0057, 0060…).

alter table charges_fixes_recurrentes disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into rls
  from pg_class
  where relname = 'charges_fixes_recurrentes';
  raise notice 'charges_fixes_recurrentes RLS = %', rls;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0063_centre_economique.sql
-- ─────────────────────────────────────────────────────────────
-- Centre économique : table des charges variables + extension contrats employés.

-- 1. Charges variables (% du CA ou montant fixe mensuel)
create table if not exists charges_variables (
  id                              uuid primary key default gen_random_uuid(),
  type                            text not null check (type in (
    'food_cost',                                                 -- coût matières (calculé auto)
    'commissions_cb',                                            -- commissions bancaires (calculé auto)
    'jetable_emballage',                                         -- packaging, gobelets
    'taxes_locales',                                             -- CFE, CET, taxe ordures
    'mensualisations_taxes',                                     -- impôt sur les sociétés mensualisé
    'transport',                                                 -- livraisons, pétrole véhicule
    'autre'
  )),
  libelle                         text not null,
  mode                            text not null check (mode in ('auto', 'manuel_pct', 'manuel_fixe')),
  valeur_pct                      decimal(5,2),                  -- si mode = manuel_pct (% du CA)
  valeur_fixe_eur                 decimal(10,2),                 -- si mode = manuel_fixe (€ /mois)
  notes                           text,
  actif                           boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists idx_charges_variables_actif on charges_variables(actif, type);

alter table charges_variables disable row level security;

-- Seed 2 lignes auto par défaut (food_cost + commissions_cb) si vide.
insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'food_cost', 'Coût matières (auto food cost)', 'auto', null,
       'Calculé automatiquement depuis food_cost_total des recettes vendues sur 30 jours'
where not exists (select 1 from charges_variables where type = 'food_cost');

insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'commissions_cb', 'Commissions bancaires (auto)', 'auto', null,
       'Calculé : 1,5% × part du CA réglée par carte sur 30 jours'
where not exists (select 1 from charges_variables where type = 'commissions_cb');

-- 2. Extension employes pour coût employeur précis
alter table employes add column if not exists coef_charges_patronales  decimal(4,3) default 1.45;
alter table employes add column if not exists avantages_mensuel_eur    decimal(8,2) default 0;
alter table employes add column if not exists heures_supp_prevues_mois decimal(6,2) default 0;
alter table employes add column if not exists date_debut_contrat       date;
alter table employes add column if not exists date_fin_contrat         date;

do $$ begin raise notice 'Centre économique : charges_variables + extension employes OK'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0064_disable_rls_charges_variables.sql
-- ─────────────────────────────────────────────────────────────
-- Patch — RLS auto-réactivée sur charges_variables + seed bloqué
-- (pattern récurrent avec Supabase).

alter table charges_variables disable row level security;

-- Re-seed les 2 lignes auto par défaut (bloquées par RLS lors du 0063)
insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'food_cost', 'Coût matières (auto food cost)', 'auto', null,
       'Calculé automatiquement depuis food_cost_total des recettes vendues sur 30 jours'
where not exists (select 1 from charges_variables where type = 'food_cost');

insert into charges_variables (type, libelle, mode, valeur_pct, notes)
select 'commissions_cb', 'Commissions bancaires (auto)', 'auto', null,
       'Calculé : 1,5% × part du CA réglée par carte sur 30 jours'
where not exists (select 1 from charges_variables where type = 'commissions_cb');

do $$
declare rls text; n int;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into rls
  from pg_class
  where relname = 'charges_variables';
  select count(*) into n from charges_variables;
  raise notice 'charges_variables RLS=% · % lignes seed', rls, n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0065_default_challenge_surplus.sql
-- ─────────────────────────────────────────────────────────────
-- Auto-seed du challenge « CA mensuel surplus point mort ».
-- Si aucun challenge restaurant actif sur la métrique ca_surplus_point_mort
-- n'existe, on en crée un en utilisant le % redistribution courant.

insert into challenges (
  titre, description,
  type, poste_concerne,
  metrique, cible_operateur, cible_valeur, cible_unite,
  recompense_type, recompense_montant,
  periode, leaderboard_public, actif
)
select
  'CA mensuel restaurant',
  'Atteindre le point mort + partage du surplus à l''équipe pondéré heures travaillées',
  'restaurant', null,
  'ca_surplus_point_mort', '>=', 0, '€',
  'pct_surplus', coalesce((select pct_redistribution_surplus from config_economique limit 1), 30),
  'mois', false, true
where not exists (
  select 1 from challenges
  where metrique = 'ca_surplus_point_mort' and type = 'restaurant' and actif = true
);

do $$
declare nb int;
begin
  select count(*) into nb from challenges
  where metrique = 'ca_surplus_point_mort' and type = 'restaurant' and actif = true;
  raise notice 'Challenges CA surplus actifs : %', nb;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0066_tva_multi_taux.sql
-- ─────────────────────────────────────────────────────────────
-- TVA multi-taux conformité France :
--   20% : alcools (vin, bière, spiritueux, cocktail) — peu importe sur place/emporter
--   10% : plats/softs sur place
--    5,5% : plats/softs à emporter

-- 1. commandes : mode de consommation + ventilation TVA persistée
alter table commandes
  add column if not exists consommation         text default 'sur_place'
    check (consommation in ('sur_place', 'emporter')),
  add column if not exists tva_total            decimal(10,2) default 0,
  add column if not exists ventilation_tva      jsonb default '{}'::jsonb;
  -- ventilation_tva = { "5.5": 12.00, "10": 35.50, "20": 8.40 }

-- 2. commande_articles : taux + montant TVA par ligne
alter table commande_articles
  add column if not exists tva_taux             decimal(5,2) default 10,
  add column if not exists tva_eur              decimal(10,2) default 0,
  add column if not exists prix_unitaire_ttc    decimal(10,2) default 0;

-- 3. recettes : flag contient_alcool (cocktails maison, plats avec alcool)
alter table recettes
  add column if not exists contient_alcool      boolean not null default false;

-- 4. boissons : flag dérivé du type
alter table boissons
  add column if not exists contient_alcool      boolean not null default false;

update boissons set contient_alcool = true
where  type in ('vin','champagne','biere_pression','biere_bouteille','spiritueux','cocktail')
  and  contient_alcool = false;

-- 5. Index pour les rapports TVA mensuels
create index if not exists idx_commandes_consommation on commandes(consommation, created_at desc);

do $$ begin raise notice 'TVA multi-taux : colonnes ajoutées + boissons alcoolisées flaggées'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0067_pourboires_distribution.sql
-- ─────────────────────────────────────────────────────────────
-- Module Pourboires — répartition mensuelle entre les employés.
-- Calculée selon : heures travaillées / parts égales / manuel.

create table if not exists pourboires_distribution (
  id                     uuid primary key default gen_random_uuid(),
  mois                   date not null unique,                              -- 1er du mois
  pool_total_eur         decimal(10,2) not null,                            -- somme pourboires du mois
  methode                text not null check (methode in ('heures','parts_egales','manuel')),
  cloture_at             timestamptz,                                       -- null = brouillon
  cloture_par            uuid references employes(id) on delete set null,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists pourboires_distribution_lignes (
  id                     uuid primary key default gen_random_uuid(),
  distribution_id        uuid not null references pourboires_distribution(id) on delete cascade,
  employe_id             uuid references employes(id) on delete cascade,
  heures_mois            decimal(6,2) default 0,
  part_pct               decimal(5,2) default 0,                            -- % du pool
  montant_eur            decimal(10,2) default 0,
  verse                  boolean not null default false,
  notes                  text,
  unique (distribution_id, employe_id)
);

create index if not exists idx_distribution_mois on pourboires_distribution(mois desc);
create index if not exists idx_lignes_distribution on pourboires_distribution_lignes(distribution_id);
create index if not exists idx_lignes_employe on pourboires_distribution_lignes(employe_id, distribution_id);

alter table pourboires_distribution        disable row level security;
alter table pourboires_distribution_lignes disable row level security;

do $$ begin raise notice 'pourboires_distribution + lignes créées'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0068_disable_rls_pourboires.sql
-- ─────────────────────────────────────────────────────────────
-- Patch — Supabase a auto-réactivé la RLS sur les tables pourboires
-- (pattern récurrent — idem 0040, 0044, 0048, 0050, 0057, 0060, 0062, 0064, 0068…).

alter table pourboires_distribution        disable row level security;
alter table pourboires_distribution_lignes disable row level security;

do $$
declare a text; b text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into a from pg_class where relname='pourboires_distribution';
  select case when relrowsecurity then 'ON' else 'OFF' end into b from pg_class where relname='pourboires_distribution_lignes';
  raise notice 'pourboires RLS — distribution=% lignes=%', a, b;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0069_notifications.sql
-- ─────────────────────────────────────────────────────────────
-- Centre de notifications internes (alertes manager/employé).
-- Utilisé pour : NC critique, demande/validation congé, pourboires versés, etc.

create table if not exists notifications (
  id                       uuid primary key default gen_random_uuid(),
  destinataire_employe_id  uuid references employes(id) on delete cascade,    -- null = destinée au(x) manager(s)
  type                     text not null check (type in (
    'nc_critique',
    'conge_demande',
    'conge_validee',
    'conge_refusee',
    'pourboires_distribues',
    'challenge_atteint',
    'formation_expire',
    'message_general'
  )),
  titre                    text not null,
  message                  text not null,
  url_action               text,                                              -- ex /admin/hygiene
  lu                       boolean not null default false,
  email_envoye             boolean not null default false,                    -- pour future intégration Resend
  created_at               timestamptz not null default now()
);

create index if not exists idx_notifs_destinataire on notifications(destinataire_employe_id, lu, created_at desc);
create index if not exists idx_notifs_manager on notifications(created_at desc) where destinataire_employe_id is null;
create index if not exists idx_notifs_type on notifications(type, created_at desc);

alter table notifications disable row level security;

do $$ begin raise notice 'notifications créée'; end $$;

-- ─────────────────────────────────────────────────────────────
-- 0070_disable_rls_notifications.sql
-- ─────────────────────────────────────────────────────────────
-- Patch — Supabase a auto-réactivé la RLS sur notifications.

alter table notifications disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls
  from pg_class where relname = 'notifications';
  raise notice 'notifications RLS = %', rls;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0071_fidelite_couplage.sql
-- ─────────────────────────────────────────────────────────────
-- Module fidélité — couplage encaissement / client
-- Ajoute client_id sur commandes (référence forte) + table d'historique
-- des mouvements de points pour traçabilité + paramètres par défaut.

-- ─── 1. Référence client sur commande ─────────────────────────
alter table commandes add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists idx_commandes_client on commandes(client_id) where client_id is not null;

-- ─── 2. Mouvements de points (historique) ─────────────────────
create table if not exists mouvements_points (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  type            text not null check (type in ('gain','utilisation','ajustement','expiration')),
  points          integer not null,           -- positif pour gain, négatif pour util/expir
  motif           text,
  commande_id     uuid references commandes(id) on delete set null,
  employe_id      uuid references employes(id) on delete set null,
  created_at      timestamptz default now()
);

create index if not exists idx_mouv_points_client on mouvements_points(client_id, created_at desc);
create index if not exists idx_mouv_points_commande on mouvements_points(commande_id) where commande_id is not null;

-- ─── 3. Paramètres par défaut ─────────────────────────────────
-- Insertion idempotente : on n'écrase pas si l'admin a déjà personnalisé.
insert into parametres (cle, valeur) values
  ('fidelite.points_par_euro', '1'),
  ('fidelite.auto_credit_encaissement', 'true'),
  ('fidelite.points_inscription', '10')
on conflict (cle) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 0072_disable_rls_mouvements_points.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : Supabase auto-réactive RLS sur les nouvelles tables.
-- On désactive pour rester cohérent avec le reste du schéma applicatif.

alter table mouvements_points disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 0073_fidelite_utilisation_points.sql
-- ─────────────────────────────────────────────────────────────
-- Module fidélité — utilisation des points comme moyen de paiement
-- Étend la check méthode et insère le paramètre de conversion points→€

-- ─── 1. Étend les méthodes de paiement autorisées ────────────
alter table paiements_caisse
  drop constraint if exists paiements_caisse_methode_check;
alter table paiements_caisse
  add constraint paiements_caisse_methode_check
  check (methode in ('especes','carte','ticket_resto','virement','autre','fidelite'));

-- ─── 2. Paramètre de conversion ──────────────────────────────
-- 100 pts = 1 € de remise par défaut. Modifiable par l'admin via UI.
insert into parametres (cle, valeur) values
  ('fidelite.points_par_euro_remise', '100')
on conflict (cle) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 0074_phase0_preparation_online.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0075_disable_rls_phase0.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0075 — Désactive RLS sur les tables Phase 0
-- ============================================================
-- Pattern habituel app-restaurant : RLS désactivée car le filtrage
-- métier est géré côté applicatif (auth + permissions). RLS sera
-- réactivée plus tard SUR LES TABLES EXPOSÉES À L'OUTIL 2 PUBLIC
-- (clients, commandes, mouvements_points, avis_publics, cartes_cadeaux)
-- avec policies « auth.uid() owns row ».
-- ============================================================

alter table etablissements                disable row level security;
alter table plats_du_jour                 disable row level security;
alter table promotions                    disable row level security;
alter table codes_promo                   disable row level security;
alter table cartes_cadeaux                disable row level security;
alter table mouvements_cartes_cadeaux     disable row level security;
alter table capacite_cuisine_par_creneau  disable row level security;
alter table avis_publics                  disable row level security;

-- Diagnostic
select
  c.relname as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'etablissements','plats_du_jour','promotions','codes_promo',
    'cartes_cadeaux','mouvements_cartes_cadeaux','capacite_cuisine_par_creneau','avis_publics'
  )
order by c.relname;

-- ─────────────────────────────────────────────────────────────
-- 0076_zone_snacking.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0076 — Zone SNACKING distincte de CUISINE
-- ============================================================
-- Le restaurant a plusieurs cuisines physiquement séparées avec
-- staffs différents :
--   - CUISINE   : restauration sur place (carte complète, plats du chef)
--   - SNACKING  : snacking emporter / livraison ONLINE (burgers, salades, sandwichs)
--   - PIZZA     : four à pizza (séparé)
--   - BAR       : boissons + cocktails (séparé)
--
-- Online (outil 2 futur) ne vendra QUE : SNACKING + PIZZA + BAR
-- (pas de restauration sur place en ligne — réservation table à la place)
--
-- Inclus :
--  1. Étend tag_destination sur recettes (SNACKING ajouté)
--  2. Étend tag_destination sur commande_articles
--  3. Ajoute tag_destination sur capacite_cuisine_par_creneau pour
--     paramétrer une capacité différente par zone (SNACKING ≠ PIZZA)
-- ============================================================

-- ─── 1. Étend les tags de destination sur recettes ────────────
-- Cherche et drop la contrainte existante (peut être nommée différemment)
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'recettes'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tag_destination%';
  if c_name is not null then
    execute format('alter table recettes drop constraint %I', c_name);
  end if;
end$$;

alter table recettes add constraint recettes_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));


-- ─── 2. Idem sur commande_articles ────────────────────────────
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'commande_articles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tag_destination%';
  if c_name is not null then
    execute format('alter table commande_articles drop constraint %I', c_name);
  end if;
end$$;

alter table commande_articles add constraint commande_articles_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));


-- ─── 3. Capacité cuisine par zone ─────────────────────────────
-- Permet de définir une capacité distincte pour SNACKING vs PIZZA vs BAR.
-- Default = SNACKING (la zone la plus concernée par les commandes ONLINE).
alter table capacite_cuisine_par_creneau
  add column if not exists tag_destination text default 'SNACKING';

alter table capacite_cuisine_par_creneau
  drop constraint if exists capacite_tag_destination_check;
alter table capacite_cuisine_par_creneau
  add constraint capacite_tag_destination_check
  check (tag_destination in ('CUISINE','SNACKING','PIZZA','BAR'));

-- Si des créneaux existent déjà sans tag, on les met sur SNACKING
update capacite_cuisine_par_creneau
set tag_destination = 'SNACKING'
where tag_destination is null;

create index if not exists idx_capacite_tag on capacite_cuisine_par_creneau(tag_destination, jour_semaine, actif);


-- ─── Diagnostic ───────────────────────────────────────────────
select
  'Migration 0076 OK' as status,
  (select count(*) from recettes where tag_destination = 'CUISINE')  as nb_cuisine,
  (select count(*) from recettes where tag_destination = 'SNACKING') as nb_snacking,
  (select count(*) from recettes where tag_destination = 'PIZZA')    as nb_pizza,
  (select count(*) from recettes where tag_destination = 'BAR')      as nb_bar,
  (select count(*) from capacite_cuisine_par_creneau)                as nb_creneaux_capacite;

-- ─────────────────────────────────────────────────────────────
-- 0077_realtime_publications.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0077 — Activation Realtime Supabase sur tables clés
-- ============================================================
-- Idempotent : skip silencieusement si une table est déjà dans la publication.
-- ============================================================

do $$
declare
  t text;
  tables_a_publier text[] := array[
    'recettes',
    'parametres',
    'plats_du_jour',
    'promotions',
    'evenements',
    'ingredients',
    'commandes',
    'commande_articles'
  ];
begin
  foreach t in array tables_a_publier loop
    -- Skip si déjà membre de la publication
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
      raise notice '✓ % ajoutée au realtime', t;
    else
      raise notice '⏭ % déjà dans le realtime, skip', t;
    end if;
  end loop;
end$$;

-- Diagnostic final
select pubname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in (
    'recettes','parametres','plats_du_jour','promotions',
    'evenements','ingredients','commandes','commande_articles'
  )
order by tablename;

-- ─────────────────────────────────────────────────────────────
-- 0078_marketing_posts.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0078 — Table posts_marketing pour le calendrier éditorial
-- ============================================================
-- Stocke les posts générés par IA pour Instagram / Facebook / Google My Business.
-- Le manager valide / édite / programme la publication.
-- Pour MVP : pas de publication API directe (limitations Meta/Instagram),
-- le manager copie-colle dans la plateforme cible.
-- ============================================================

create table if not exists posts_marketing (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid references etablissements(id),

  -- Contenu
  type              text not null check (type in ('post','story','reel','annonce_gmb')),
  canal             text not null check (canal in ('instagram','facebook','google_my_business','linkedin','tiktok','autre')),
  titre             text,
  contenu           text not null,                       -- légende / texte du post
  hashtags          text[],
  image_url         text,
  call_to_action    text,                                 -- ex: 'Réservez maintenant', 'Commander en ligne'
  cta_url           text,

  -- Référence métier (optionnel — lie à un plat / événement / promo)
  recette_id        uuid references recettes(id),
  evenement_id      uuid references evenements(id),
  promotion_id      uuid references promotions(id),

  -- Workflow
  statut            text default 'brouillon' check (statut in ('brouillon','prevu','publie','rejete','archive')),
  date_programmee   timestamptz,                          -- quand publier
  date_publication  timestamptz,                          -- quand effectivement publié (manuel par manager)

  -- IA
  genere_par_ia     boolean default false,
  prompt_ia         text,                                 -- prompt utilisé pour traçabilité

  -- Stats simples (renseignées manuellement par manager)
  nb_likes          integer default 0,
  nb_commentaires   integer default 0,
  nb_partages       integer default 0,
  url_publication   text,                                 -- URL du post une fois publié

  cree_par_id       uuid references employes(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_posts_marketing_statut on posts_marketing(statut, date_programmee);
create index if not exists idx_posts_marketing_canal  on posts_marketing(canal, statut);
create index if not exists idx_posts_marketing_dates  on posts_marketing(date_programmee desc) where date_programmee is not null;

alter table posts_marketing disable row level security;

-- Diagnostic
select 'Migration 0078 OK' as status, count(*) as nb_posts from posts_marketing;

-- ─────────────────────────────────────────────────────────────
-- 0079_chambres_video_360.sql
-- ─────────────────────────────────────────────────────────────
-- Ajout d'un champ vidéo 360° sur les chambres pour la visite virtuelle.
-- L'admin colle un lien YouTube / Vimeo / Matterport — le site outil 2 l'affiche en iframe.

alter table chambres add column if not exists video_360_url text;

-- ─────────────────────────────────────────────────────────────
-- 0080_valeurs_saisies_taches.sql
-- ─────────────────────────────────────────────────────────────
-- Module : valeurs saisies sur tâches obligatoires (températures, fond caisse,
-- kilométrage, comptage boissons, etc.). Une ligne = une saisie validée par
-- un employé pour une tâche donnée à une date donnée.
--
-- Lié à la matrice statique `TACHES` dans src/lib/taches-du-jour.ts via tache_id.
-- Permet au gérant de consulter en /admin/hygiene les valeurs réelles relevées.

create table if not exists valeurs_saisies_taches (
  id            uuid primary key default gen_random_uuid(),
  tache_id      text not null,                              -- ex: 'c-m-temp-frigo-principal'
  employe_id    uuid not null references employes(id) on delete cascade,
  date          date not null default current_date,
  poste         text,                                       -- 'cuisinier', 'snacking', 'pizzaiolo'…
  moment        text,                                       -- 'matin' | 'service' | 'fin'

  -- Valeur saisie (un seul des 2 champs sera renseigné selon type)
  type_saisie   text not null check (type_saisie in ('temperature','montant','nombre','texte')),
  valeur_num    numeric(10, 2),                             -- pour temperature / montant / nombre
  valeur_texte  text,                                       -- pour texte libre
  unite         text,                                       -- '°C', '€', 'km', 'L', 'kg'…
  commentaire   text,                                       -- remarque optionnelle de l'employé

  cree_le       timestamptz not null default now()
);

create index if not exists idx_valeurs_saisies_employe_date  on valeurs_saisies_taches(employe_id, date desc);
create index if not exists idx_valeurs_saisies_date          on valeurs_saisies_taches(date desc);
create index if not exists idx_valeurs_saisies_tache         on valeurs_saisies_taches(tache_id, date desc);

-- RLS désactivée pour cohérence avec le reste du schéma (cf. 0002_disable_rls.sql).
-- Sécurité applicative dans les server actions.
alter table valeurs_saisies_taches disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 0081_creneaux_par_tag.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0082_agents_permanents.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0083_disable_rls_agents.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : Supabase ré-active RLS automatiquement après création de table via
-- SQL Editor, même si la migration 0082 contenait le ALTER ... DISABLE.
-- (Gotcha connu, cf. CLAUDE.md §8.)

alter table agents_runs    disable row level security;
alter table agent_findings disable row level security;

select
  'RLS désactivé sur agents_runs + agent_findings' as status,
  (select relrowsecurity from pg_class where relname = 'agents_runs')    as rls_agents_runs,
  (select relrowsecurity from pg_class where relname = 'agent_findings') as rls_agent_findings;

-- ─────────────────────────────────────────────────────────────
-- 0084_push_rate_limits.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0084 : Push rate limits (3 notifs / heure / employé)
-- ============================================================
-- Évite le spam : un employé reçoit MAX 3 push par heure.
-- Quand un agent essaie d'envoyer une 4ème dans la même heure, c'est silencieux.
-- Sauf cas extrême (urgence rouge) où le code peut bypasser via force=true.
-- ============================================================

create table if not exists push_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid not null references employes(id) on delete cascade,
  hour_bucket  timestamptz not null,    -- début de l'heure UTC tronquée
  count        integer not null default 1,
  created_at   timestamptz not null default now(),
  unique (employe_id, hour_bucket)
);

create index if not exists idx_push_rate_employe_hour
  on push_rate_limits(employe_id, hour_bucket desc);

-- Nettoyage auto via pg_cron : supprime les buckets de plus de 7 jours
-- (table ne grossit pas indéfiniment)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- unschedule si déjà présent (idempotent)
    perform cron.unschedule('push_rate_limits_cleanup') where exists (
      select 1 from cron.job where jobname = 'push_rate_limits_cleanup'
    );
    perform cron.schedule(
      'push_rate_limits_cleanup',
      '0 4 * * *',                       -- 04h UTC tous les jours
      $sql$delete from push_rate_limits where hour_bucket < now() - interval '7 days'$sql$
    );
  end if;
end$$;

alter table push_rate_limits disable row level security;

select 'Migration 0084 OK' as status,
  (select count(*) from push_rate_limits) as nb_buckets;

-- ─────────────────────────────────────────────────────────────
-- 0085_disable_rls_push_rate_limits.sql
-- ─────────────────────────────────────────────────────────────
-- Patch : Supabase réactive RLS automatiquement après création de table via
-- SQL Editor, même si la migration 0084 contenait le ALTER ... DISABLE.
-- Gotcha connu (cf. CLAUDE.md §8).

alter table push_rate_limits disable row level security;

select
  'RLS désactivé sur push_rate_limits' as status,
  (select relrowsecurity from pg_class where relname = 'push_rate_limits') as rls_active;

-- ─────────────────────────────────────────────────────────────
-- 0086_exec_sql_bootstrap.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0086 : Bootstrap exec_sql() — fonction d'exécution SQL arbitraire
-- ============================================================
-- Permet à l'app (via SERVICE_ROLE_KEY) d'exécuter du SQL arbitraire via RPC.
-- Indispensable pour que l'AI puisse appliquer les futures migrations/setup
-- sans passer par le SQL Editor manuel.
--
-- 🔒 Sécurité : EXECUTE uniquement granté à service_role (clé serveur, non
-- exposée client). anon/public N'ONT PAS le droit d'appeler cette fonction.
-- L'endpoint API /api/admin/exec-sql vérifie en plus le CRON_SECRET.
--
-- Une fois cette migration appliquée, plus AUCUNE migration manuelle nécessaire
-- pour cette session ni les suivantes — l'AI les pousse via /api/admin/exec-sql.
-- ============================================================

create or replace function public.exec_sql(query text)
returns json
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rows_affected bigint;
begin
  execute query;
  get diagnostics rows_affected = row_count;
  return json_build_object(
    'ok', true,
    'rows_affected', rows_affected
  );
exception when others then
  return json_build_object(
    'ok', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
end;
$$;

-- Verrouille les droits : seul service_role peut appeler
revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;

select 'Migration 0086 OK — bootstrap exec_sql en place. Plus de copier-coller manuel.' as status;

-- ─────────────────────────────────────────────────────────────
-- 0087_formation_enrichissement.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0087 : Enrichissement Module 27 Formation
-- ============================================================
-- Ajoute aux guides : niveau (1/2/3), points, simulation_config jsonb.
-- Nouvelles tables : certifications (poste/employé), badges_employes,
-- formation_questions_ia (Q/R Claude pour analyse + amélioration modules).
-- ============================================================

-- ─── 1. Enrichissement guides_formation ────────────────────
alter table guides_formation add column if not exists niveau integer not null default 1
  check (niveau in (1, 2, 3));
alter table guides_formation add column if not exists points integer not null default 10;
alter table guides_formation add column if not exists simulation_config jsonb;
-- simulation_config = {type: 'commande'|'encaissement'|'releve_temp'|...,  scenario: {...}, etapes_attendues: [...]}

create index if not exists idx_guides_poste_niveau on guides_formation(poste, niveau, ordre);


-- ─── 2. CERTIFICATIONS — 1 ligne / employé × poste ─────────
create table if not exists certifications (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  poste         text not null,                       -- 'cuisinier','pizzaiolo','serveur'…
  obtenue_le    timestamptz not null default now(),
  score_pct     numeric(5,2) not null,               -- score moyen niveau 3
  guide_certif_id uuid references guides_formation(id) on delete set null,
  expires_le    date,                                -- pour HACCP (renouv. annuel)
  unique (employe_id, poste)
);
create index if not exists idx_certif_employe on certifications(employe_id);
create index if not exists idx_certif_poste on certifications(poste);
alter table certifications disable row level security;


-- ─── 3. BADGES — distinction / motivation ──────────────────
create table if not exists badges_employes (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  badge_code    text not null,                       -- 'couteau_suisse','premiere_certif','sprint_3j'…
  badge_titre   text not null,
  badge_emoji   text not null default '🏆',
  obtenu_le     timestamptz not null default now(),
  description   text,
  unique (employe_id, badge_code)
);
create index if not exists idx_badges_employe on badges_employes(employe_id, obtenu_le desc);
alter table badges_employes disable row level security;


-- ─── 4. QUESTIONS IA — Q/R Claude pour analyse + enrichissement modules ─
create table if not exists formation_questions_ia (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid references employes(id) on delete set null,
  guide_id      uuid references guides_formation(id) on delete set null,
  etape_id      uuid references etapes_formation(id) on delete set null,
  question      text not null,
  reponse       text not null,                       -- réponse Claude
  poste         text,                                -- snapshot pour stats
  modele        text default 'claude-haiku-4-5',
  tokens_input  integer,
  tokens_output integer,
  utile         boolean,                             -- feedback utilisateur optionnel
  created_at    timestamptz not null default now()
);
create index if not exists idx_qia_guide_date on formation_questions_ia(guide_id, created_at desc);
create index if not exists idx_qia_employe_date on formation_questions_ia(employe_id, created_at desc);
alter table formation_questions_ia disable row level security;


-- ─── 5. Setup ouverture (pour l'alerte agent formateur "J-30") ───
create table if not exists formation_parametres (
  cle           text primary key,
  valeur        text,
  updated_at    timestamptz not null default now()
);
alter table formation_parametres disable row level security;

-- Valeur par défaut : date d'ouverture = 3 mois (modifiable côté admin)
insert into formation_parametres (cle, valeur)
values ('date_ouverture', (current_date + interval '90 days')::text)
on conflict (cle) do nothing;


select 'Migration 0087 OK' as status,
  (select count(*) from guides_formation where niveau is not null) as nb_guides,
  (select count(*) from certifications) as nb_certifs,
  (select count(*) from badges_employes) as nb_badges;

-- ─────────────────────────────────────────────────────────────
-- 0088_ingredients_photos.sql
-- ─────────────────────────────────────────────────────────────
-- Phase 4 visuels : ajout d'une colonne photo_url sur la table ingredients.
-- Permet d'attacher une URL d'image à chaque ingrédient (manuel ou Unsplash).
-- Le rendu côté client utilise un fallback Unsplash thématique par catégorie
-- si la colonne est vide, mais on garde la colonne pour permettre l'upload
-- d'une vraie photo par le manager.

alter table ingredients
  add column if not exists photo_url text;

-- Diagnostic : vérifier que la colonne existe
do $$
declare
  has_col boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_name = 'ingredients' and column_name = 'photo_url'
  ) into has_col;
  raise notice 'ingredients.photo_url present : %', has_col;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 0089_mode_retrait.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0089 : Mode retrait/livraison sur commandes ONLINE
-- ============================================================
-- Permet au client final de choisir au moment du panier entre :
--   - 'a_emporter' (retrait sur place au restaurant)
--   - 'livraison' (livraison à domicile par le livreur)
--
-- MVP simple (validé 2026-05-14) :
--   - Aucun frais de livraison (offerte)
--   - Aucune zone limitée (le livreur juge à la commande)
--   - Aucun SMS auto (notif interne employés uniquement)
--
-- Pour les commandes TABLE et COMPTOIR, mode_retrait reste à NULL ou
-- 'sur_place' (n'a pas vraiment de sens, conservé pour cohérence).
-- ============================================================

alter table commandes
  add column if not exists mode_retrait text
    check (mode_retrait in ('sur_place', 'a_emporter', 'livraison'))
    default 'a_emporter';

alter table commandes
  add column if not exists adresse_livraison text;

-- Backfill : les commandes ONLINE existantes deviennent 'a_emporter' par défaut
-- (cohérent avec le default ci-dessus, l'ancien fonctionnement = retrait magasin)
update commandes
  set mode_retrait = 'a_emporter'
  where source = 'ONLINE' and mode_retrait is null;

update commandes
  set mode_retrait = 'sur_place'
  where source = 'TABLE' and mode_retrait is null;

update commandes
  set mode_retrait = 'a_emporter'
  where source = 'COMPTOIR' and mode_retrait is null;

-- Index pour filtrage rapide sur /livreur et /emporter
create index if not exists idx_commandes_mode_retrait
  on commandes(mode_retrait, statut) where source = 'ONLINE';


-- ─── Diagnostic ─────────────────────────────────────────────
select
  'Migration 0089 OK' as status,
  count(*) filter (where mode_retrait = 'a_emporter') as nb_a_emporter,
  count(*) filter (where mode_retrait = 'livraison')  as nb_livraison,
  count(*) filter (where mode_retrait = 'sur_place')  as nb_sur_place
from commandes;

-- ─────────────────────────────────────────────────────────────
-- 0090_statut_en_livraison.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0090 : Statut dédié 'en_livraison' pour les commandes livraison
-- ============================================================
-- Suite à la migration 0089 (mode_retrait). Permet au livreur de marquer
-- une commande "Partie en livraison" → statut='en_livraison' avec horodate
-- de départ, puis "Livrée" → statut='retire_par_client' (ou 'encaisse'
-- si déjà payée en CB sur le site).
--
-- Ajout également email_retard_envoye_at pour ne pas spammer le client
-- en cas de retard prolongé.
-- ============================================================

-- 1. Étendre le check constraint statut pour autoriser 'en_livraison'
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in (
    'en_attente', 'en_preparation', 'pret', 'servi', 'encaisse', 'annule',
    'pret_pour_retrait', 'retire_par_client',  -- statuts ONLINE existants (phase 0)
    'en_livraison'                              -- NEW : statut intermédiaire livreur
  ));

-- 2. Horodatage du départ en livraison (pour calcul du temps de course)
alter table commandes
  add column if not exists livraison_depart_at timestamptz;

-- 3. Anti-spam email retard
alter table commandes
  add column if not exists email_retard_envoye_at timestamptz;

-- 4. Index pour requêtes "livraisons en retard" sur /admin/pilotage
create index if not exists idx_commandes_livraisons_actives
  on commandes(creneau_retrait)
  where source = 'ONLINE' and mode_retrait = 'livraison'
    and statut in ('pret', 'pret_pour_retrait', 'en_livraison');


-- ─── Diagnostic ─────────────────────────────────────────────
select
  'Migration 0090 OK' as status,
  count(*) filter (where mode_retrait = 'livraison')                                          as nb_livraisons_total,
  count(*) filter (where mode_retrait = 'livraison' and statut = 'en_livraison')              as nb_en_livraison,
  count(*) filter (where mode_retrait = 'livraison' and statut in ('retire_par_client','encaisse')) as nb_livrees
from commandes;

-- ─────────────────────────────────────────────────────────────
-- 0091_recettes_favori.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration 0091 : Flag favori sur recettes pour quick-access dans /serveur
-- ============================================================
-- Permet au gérant de marquer ses plats best-sellers / favoris via
-- /admin/recettes. Ces favoris apparaissent en haut du catalogue de prise
-- de commande sur /serveur, /emporter, /bar pour un accès en 1 clic
-- pendant le rush (style "produits stars" des kiosques McDo/KFC).
-- ============================================================

alter table recettes
  add column if not exists favori boolean not null default false;

create index if not exists idx_recettes_favori
  on recettes(favori, tag_destination) where favori = true and actif = true;

-- Diagnostic
select 'Migration 0091 OK' as status,
  count(*) filter (where favori = true) as nb_favoris,
  count(*) as nb_total
from recettes where actif = true;

-- ─────────────────────────────────────────────────────────────
-- 0092_borne_kiosk.sql
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 0093_pin_manager.sql
-- ─────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  MIGRATION 0093 — PIN manager (sécurité actions borne et autres ops)
-- ════════════════════════════════════════════════════════════════════════
-- Ajoute un PIN à 4-6 chiffres par employé manager pour protéger les
-- actions sensibles côté ops :
--   - Encaisser une commande BORNE COMPTOIR sans passer en caisse
--   - Annuler une commande borne
--   - Annulation manuelle de commande, remboursement, etc.
--
-- Stockage : SHA-256(pin + salt) par employé.
-- Lock : après 3 essais ratés dans les 60 dernières secondes → 60s de lock.
--
-- Idempotent. RLS désactivée (single-tenant).
-- ════════════════════════════════════════════════════════════════════════

alter table employes add column if not exists pin_hash       text;
alter table employes add column if not exists pin_salt       text;
alter table employes add column if not exists pin_essais     int default 0;
alter table employes add column if not exists pin_lock_until timestamptz;
alter table employes add column if not exists pin_last_try   timestamptz;

create index if not exists idx_employes_pin_lock on employes(pin_lock_until)
  where pin_lock_until is not null;

-- Diagnostic
do $$ begin
  raise notice 'Migration 0093 OK — colonnes PIN ajoutées sur employes';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0094_borne_points_utilises.sql
-- ─────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  MIGRATION 0094 — Stockage points fidélité utilisés sur commande borne
-- ════════════════════════════════════════════════════════════════════════
-- Permet au client de la borne d'utiliser ses points fidélité AVANT le
-- paiement (NFC ou comptoir). La remise est calculée côté borne, stockée
-- ici pour audit, et appliquée au montant_total_ttc de la commande.
--
-- Les points sont consommés au moment de l'encaissement effectif
-- (marquerBornePayee NFC ou encaisserCommande comptoir) via la lib
-- src/lib/fidelite.ts → consommerPointsFidelite().
-- ════════════════════════════════════════════════════════════════════════

alter table commandes add column if not exists borne_points_utilises int default 0;
alter table commandes add column if not exists borne_remise_eur      decimal(10,2) default 0;

do $$ begin
  raise notice 'Migration 0094 OK — colonnes borne_points_utilises + borne_remise_eur';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0095_ajout_postes_snack_livreur.sql
-- ─────────────────────────────────────────────────────────────
-- Ajoute les postes 'snack' et 'livreur' aux postes valides côté formation.
-- Module 27 — extension du CHECK constraint sur guides_formation.poste.
--
-- Contexte : la 1ʳᵉ équipe CASATASIA inclut des postes polyvalents
-- (snack au comptoir + borne, livreur via /livreur). Sans cette migration,
-- impossible de seeder les manuels 09-snack.md et 10-livreur.md.

alter table guides_formation drop constraint if exists guides_formation_poste_check;

alter table guides_formation
  add constraint guides_formation_poste_check
  check (poste in (
    -- Valeurs historiques préservées (migration 0053)
    'gerant', 'manager',
    'second', 'cuisinier', 'cuisine',
    'pizzaiolo',
    'serveur', 'salle',
    'barman', 'bar',
    'receptionniste',
    'plonge', 'extra',
    'autre', 'tous',
    -- NOUVEAUX postes Phase B onboarding équipe
    'snack',
    'livreur'
  ));

-- Diagnostic
do $$
declare
  nb_existing int;
begin
  select count(*) into nb_existing from guides_formation;
  raise notice 'guides_formation.poste check étendu (17 valeurs) — % guides existants conservés', nb_existing;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0096_poste_cuisinier_snacking.sql
-- ─────────────────────────────────────────────────────────────
-- Ajoute le poste 'cuisinier_snacking' aux postes valides côté formation.
-- Distinct de 'snack' (encaissement comptoir/borne) : ici c'est la PRÉPARATION
-- snacking (burgers, tacos, paninis) — accès recettes/stock/réception filtrés SNACKING.

alter table guides_formation drop constraint if exists guides_formation_poste_check;

alter table guides_formation
  add constraint guides_formation_poste_check
  check (poste in (
    'gerant', 'manager',
    'second', 'cuisinier', 'cuisine',
    'pizzaiolo',
    'serveur', 'salle',
    'barman', 'bar',
    'receptionniste',
    'plonge', 'extra',
    'autre', 'tous',
    'snack',
    'livreur',
    'cuisinier_snacking'
  ));

do $$
begin
  raise notice 'guides_formation.poste check étendu (18 valeurs) — cuisinier_snacking ajouté';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0097_autonomie_employes.sql
-- ─────────────────────────────────────────────────────────────
-- Autonomie configurable par employé (pilotée par le gérant dans /admin/rh)
-- + workflow de validation des bons de commande soumis par un employé.
-- Par défaut TOUT est false : le gérant active au cas par cas.

-- ─── 1. Flags d'autonomie sur la fiche employé ──────────────────────
alter table employes add column if not exists autonomie_reception     boolean not null default false; -- réceptionner les livraisons sans validation
alter table employes add column if not exists autonomie_commande      boolean not null default false; -- envoyer un bon de commande sans validation gérant
alter table employes add column if not exists autonomie_modif_recettes boolean not null default false; -- modifier les quantités de recettes
alter table employes add column if not exists autonomie_voir_prix     boolean not null default false; -- voir les prix d'achat des ingrédients

-- ─── 2. Workflow validation des bons de commande ────────────────────
-- Nouveau statut 'a_valider' : un bon soumis par un employé sans autonomie_commande
-- attend la validation du gérant avant de pouvoir être envoyé au fournisseur.
alter table bons_commande add column if not exists propose_par uuid references employes(id); -- employé qui a soumis (null = créé par le gérant)
alter table bons_commande add column if not exists soumis_at   timestamptz;                    -- date de soumission pour validation

alter table bons_commande drop constraint if exists bons_commande_statut_check;
alter table bons_commande
  add constraint bons_commande_statut_check
  check (statut in ('brouillon', 'a_valider', 'envoye', 'recu', 'annule'));

-- ─── RLS off (single-tenant) ────────────────────────────────────────
alter table employes disable row level security;
alter table bons_commande disable row level security;

do $$
begin
  raise notice 'Autonomie : 4 flags employes + statut bons_commande a_valider + propose_par/soumis_at';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 0098_reception_a_verifier.sql
-- ─────────────────────────────────────────────────────────────
-- 0098 — Workflow de vérification de réception (autonomie_reception)
--
-- Quand un employé SANS l'autonomie "réceptionner sans validation" enregistre
-- une réception, le stock est tout de même mis à jour (les marchandises sont
-- physiquement arrivées, le stock doit rester juste), mais le bon est marqué
-- `reception_a_verifier = true` pour que le gérant contrôle quantités/qualité
-- et valide a posteriori (bouton "Valider la réception").
--
-- Le gérant et les employés autonomes mettent directement à false.

alter table bons_commande add column if not exists reception_par uuid;
alter table bons_commande add column if not exists reception_at timestamptz;
alter table bons_commande add column if not exists reception_a_verifier boolean not null default false;

-- Supabase réactive la RLS après un ALTER via SQL Editor — on la redésactive (single-tenant).
alter table bons_commande disable row level security;

-- Diagnostic
do $$
declare
  n_cols int;
begin
  select count(*) into n_cols
  from information_schema.columns
  where table_name = 'bons_commande'
    and column_name in ('reception_par','reception_at','reception_a_verifier');
  raise notice '0098 OK — colonnes réception présentes : % / 3', n_cols;
end $$;
