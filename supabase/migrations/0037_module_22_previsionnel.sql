-- ============================================================
-- 0037 — Module 22 : Météo & prévisionnel intelligent
-- ============================================================
-- 1 nouvelle table : releves_meteo
-- Stockage clé API OpenWeatherMap dans parametres (cle = 'openweathermap_api_key')
-- + ville (cle = 'meteo_ville', valeur ex: 'Paris,FR')
-- ============================================================

create table if not exists releves_meteo (
  id              uuid primary key default gen_random_uuid(),
  date_meteo      date not null,
  temperature_min decimal(4,1),
  temperature_max decimal(4,1),
  conditions      text not null check (conditions in ('ensoleille','peu_nuageux','nuageux','pluie_legere','pluie_forte','orage','neige','brouillard','autre')),
  precipitations_mm decimal(5,2) default 0,
  vent_kmh        decimal(5,1) default 0,
  humidite_pct    integer,
  source          text not null default 'manuel' check (source in ('manuel','openweathermap','autre')),
  est_prevision   boolean not null default false,                 -- true = forecast, false = relevé constaté
  notes           text,
  created_at      timestamptz not null default now()
);

-- Une seule ligne par jour × source × prévision/relevé pour éviter doublons
create unique index if not exists idx_meteo_unique on releves_meteo(date_meteo, source, est_prevision);
create index if not exists idx_meteo_date on releves_meteo(date_meteo desc);

alter table releves_meteo disable row level security;

-- Diagnostic
select
  (select count(*) from releves_meteo where est_prevision = false) as nb_releves,
  (select count(*) from releves_meteo where est_prevision = true)  as nb_previsions;

select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_meteo';
