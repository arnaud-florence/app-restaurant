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
