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
