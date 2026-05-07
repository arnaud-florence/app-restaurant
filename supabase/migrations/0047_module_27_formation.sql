-- Module 27 — Formation des équipes
-- Tables : guides_formation + etapes_formation + quiz_questions + progressions_formation

create table if not exists guides_formation (
  id                  uuid primary key default gen_random_uuid(),
  titre               text not null,
  description         text,
  poste               text not null check (poste in (
                        'cuisine','pizzaiolo','bar','salle','serveur','manager','plonge','autre','tous'
                      )),
  ordre               integer not null default 0,
  actif               boolean not null default true,
  seuil_reussite_pct  integer not null default 80 check (seuil_reussite_pct between 0 and 100),
  duree_minutes       integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_guides_poste on guides_formation(poste, ordre) where actif = true;

create table if not exists etapes_formation (
  id           uuid primary key default gen_random_uuid(),
  guide_id     uuid not null references guides_formation(id) on delete cascade,
  ordre        integer not null,
  titre        text not null,
  contenu      text not null,
  image_url    text,
  video_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (guide_id, ordre)
);

create index if not exists idx_etapes_guide on etapes_formation(guide_id, ordre);

create table if not exists quiz_questions (
  id                uuid primary key default gen_random_uuid(),
  guide_id          uuid not null references guides_formation(id) on delete cascade,
  ordre             integer not null,
  question          text not null,
  choix             jsonb not null,                                       -- ["choix A", "choix B", ...]
  bonne_reponse_idx integer not null,                                     -- index dans choix[]
  explication       text,
  created_at        timestamptz not null default now(),
  unique (guide_id, ordre)
);

create index if not exists idx_quiz_guide on quiz_questions(guide_id, ordre);

create table if not exists progressions_formation (
  id                       uuid primary key default gen_random_uuid(),
  guide_id                 uuid not null references guides_formation(id) on delete cascade,
  employe_id               uuid not null references employes(id) on delete cascade,
  etapes_vues_ids          uuid[] not null default '{}',                   -- IDs d'étapes marquées vues
  dernier_score_pct        integer,                                        -- 0-100, null si pas encore tenté
  derniere_tentative_le    timestamptz,
  statut                   text not null default 'non_commence' check (statut in (
                             'non_commence','en_cours','quiz_a_passer','reussi','echoue'
                           )),
  termine_le               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (guide_id, employe_id)
);

create index if not exists idx_prog_employe on progressions_formation(employe_id, statut);
create index if not exists idx_prog_guide   on progressions_formation(guide_id, statut);

alter table guides_formation       disable row level security;
alter table etapes_formation       disable row level security;
alter table quiz_questions         disable row level security;
alter table progressions_formation disable row level security;

do $$
declare nb_g int; nb_e int; nb_q int; nb_p int;
        rls_g text; rls_e text; rls_q text; rls_p text;
begin
  select count(*) into nb_g from guides_formation;
  select count(*) into nb_e from etapes_formation;
  select count(*) into nb_q from quiz_questions;
  select count(*) into nb_p from progressions_formation;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_g from pg_class where relname='guides_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_e from pg_class where relname='etapes_formation';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_q from pg_class where relname='quiz_questions';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='progressions_formation';
  raise notice 'Module 27 — guides=% etapes=% quiz=% prog=% RLS g=% e=% q=% p=%',
    nb_g, nb_e, nb_q, nb_p, rls_g, rls_e, rls_q, rls_p;
end $$;
