-- ============================================================
-- 0039 — Module 23 : Journal de bord gérant (/admin/journal)
-- ============================================================
-- 1 nouvelle table : journal_entrees
-- Snapshots automatiques météo + CA au moment de la création.
-- ============================================================

create table if not exists journal_entrees (
  id              uuid primary key default gen_random_uuid(),
  date_entree     date not null default current_date,
  titre           text,
  contenu         text not null,
  humeur          text not null default 'normale' check (humeur in ('tres_bonne','bonne','normale','difficile','tres_difficile')),
  photos_urls     text[] not null default '{}',
  tags            text[] not null default '{}',
  faits_marquants text,
  ca_jour_snap    decimal(10,2),                              -- CA TTC du jour (figé à la création)
  nb_couverts_snap integer,
  meteo_snap      text,                                        -- ex: 'ensoleille', 'pluie_forte'
  redacteur_id    uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_journal_date     on journal_entrees(date_entree desc);
create index if not exists idx_journal_humeur   on journal_entrees(humeur, date_entree desc);
create index if not exists idx_journal_tags     on journal_entrees using gin(tags);

alter table journal_entrees disable row level security;

-- Diagnostic
select count(*) as nb_entrees from journal_entrees;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'journal_entrees';
