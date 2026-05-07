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
