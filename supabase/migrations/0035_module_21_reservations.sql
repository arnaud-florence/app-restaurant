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
