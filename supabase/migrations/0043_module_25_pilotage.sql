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
