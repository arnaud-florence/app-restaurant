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
