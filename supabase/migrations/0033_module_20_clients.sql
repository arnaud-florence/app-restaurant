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
