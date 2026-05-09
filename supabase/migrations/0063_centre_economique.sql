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
