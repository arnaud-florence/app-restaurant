-- ============================================================
-- 0014 — Module 10 : Communication interne équipes (/equipes)
-- ============================================================
-- Contenu :
--   1. messages         — chat par canal (5 canaux fixes)
--   2. affichage_infos  — annonces tableau d'affichage
--   3. comptes_rendus   — comptes-rendus de réunions archivés
--   4. materiels        — inventaire matériel attribué aux employés
--   5. Realtime sur messages (badge live + ding nouveau message)
--   6. Disable RLS (Supabase la ré-active à la création SQL Editor)
--
-- Idempotent.
-- ============================================================

-- ─── 1. messages ────────────────────────────────────────────
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null check (canal in ('cuisine','bar','salle','admin','tous')),
  expediteur_id uuid references employes(id) on delete set null,
  contenu       text not null check (length(contenu) > 0 and length(contenu) <= 2000),
  lu_par        uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_canal_recent on messages(canal, created_at desc);
create index if not exists idx_messages_expediteur   on messages(expediteur_id, created_at desc);

alter table messages disable row level security;

-- ─── 2. affichage_infos ─────────────────────────────────────
create table if not exists affichage_infos (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  contenu         text not null,
  priorite        text not null default 'info' check (priorite in ('info','warn','urgent')),
  valable_du      date not null default current_date,
  valable_jusqu   date,
  ordre           integer not null default 0,
  cree_par        uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Index "complet" (pas de partial WHERE car current_date n'est pas IMMUTABLE
-- en Postgres → 42P17 sur partial index). Le filtre actif/inactif sera
-- appliqué au runtime dans la requête.
create index if not exists idx_affichage_actif on affichage_infos(valable_du desc, valable_jusqu, ordre);

alter table affichage_infos disable row level security;

-- ─── 3. comptes_rendus ──────────────────────────────────────
create table if not exists comptes_rendus (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,
  date_reunion  date not null default current_date,
  contenu       text not null,
  participants  uuid[] not null default '{}',
  redacteur_id  uuid references employes(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cr_date on comptes_rendus(date_reunion desc);

alter table comptes_rendus disable row level security;

-- ─── 4. materiels ───────────────────────────────────────────
create table if not exists materiels (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  type              text not null check (type in ('uniforme','ustensile','cle','badge','equipement','autre')),
  numero_serie      text,
  etat              text not null default 'bon' check (etat in ('neuf','bon','use','abime','perdu')),
  attribue_a        uuid references employes(id) on delete set null,
  date_attribution  date,
  notes             text,
  actif             boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists idx_materiels_attribue on materiels(attribue_a) where attribue_a is not null;
create index if not exists idx_materiels_libre    on materiels(actif) where attribue_a is null and actif = true;

alter table materiels disable row level security;

-- ─── 5. Realtime sur messages ───────────────────────────────
do $$ begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; when others then null; end $$;

-- ─── 6. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from messages)        as nb_messages,
  (select count(*) from affichage_infos) as nb_infos,
  (select count(*) from comptes_rendus)  as nb_cr,
  (select count(*) from materiels)       as nb_materiels;

-- Vérif Realtime
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('messages')
 order by tablename;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('messages','affichage_infos','comptes_rendus','materiels')
 order by c.relname;
