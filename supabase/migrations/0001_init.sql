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
