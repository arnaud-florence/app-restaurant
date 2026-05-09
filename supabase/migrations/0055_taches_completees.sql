-- Module 27/28 — Persistance des tâches du jour cochées par employé.
--
-- Chaque ligne = une tâche (id stable depuis lib/taches-du-jour.ts) cochée
-- par un employé un jour donné. Permet :
--  - persistance multi-device (l'employé change de tablette → ses cochages restent)
--  - dashboard manager temps réel (% checklist faite par employé/poste/moment)

create table if not exists taches_completees (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  tache_id      text not null,
  poste         text not null,
  moment        text not null check (moment in ('matin', 'service', 'fin')),
  obligatoire   boolean not null default false,
  date          date not null default current_date,
  completed_at  timestamptz not null default now(),
  unique (employe_id, tache_id, date)
);

create index if not exists taches_completees_date_idx
  on taches_completees(date);

create index if not exists taches_completees_employe_date_idx
  on taches_completees(employe_id, date);

create index if not exists taches_completees_poste_date_moment_idx
  on taches_completees(poste, date, moment);

-- RLS off (l'app gère via server actions + middleware)
alter table taches_completees disable row level security;

do $$
begin
  raise notice 'taches_completees créée + index';
end $$;
