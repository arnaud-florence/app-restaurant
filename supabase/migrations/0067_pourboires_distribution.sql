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
