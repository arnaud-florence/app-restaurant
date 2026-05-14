-- ============================================================
-- Migration 0087 : Enrichissement Module 27 Formation
-- ============================================================
-- Ajoute aux guides : niveau (1/2/3), points, simulation_config jsonb.
-- Nouvelles tables : certifications (poste/employé), badges_employes,
-- formation_questions_ia (Q/R Claude pour analyse + amélioration modules).
-- ============================================================

-- ─── 1. Enrichissement guides_formation ────────────────────
alter table guides_formation add column if not exists niveau integer not null default 1
  check (niveau in (1, 2, 3));
alter table guides_formation add column if not exists points integer not null default 10;
alter table guides_formation add column if not exists simulation_config jsonb;
-- simulation_config = {type: 'commande'|'encaissement'|'releve_temp'|...,  scenario: {...}, etapes_attendues: [...]}

create index if not exists idx_guides_poste_niveau on guides_formation(poste, niveau, ordre);


-- ─── 2. CERTIFICATIONS — 1 ligne / employé × poste ─────────
create table if not exists certifications (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  poste         text not null,                       -- 'cuisinier','pizzaiolo','serveur'…
  obtenue_le    timestamptz not null default now(),
  score_pct     numeric(5,2) not null,               -- score moyen niveau 3
  guide_certif_id uuid references guides_formation(id) on delete set null,
  expires_le    date,                                -- pour HACCP (renouv. annuel)
  unique (employe_id, poste)
);
create index if not exists idx_certif_employe on certifications(employe_id);
create index if not exists idx_certif_poste on certifications(poste);
alter table certifications disable row level security;


-- ─── 3. BADGES — distinction / motivation ──────────────────
create table if not exists badges_employes (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid not null references employes(id) on delete cascade,
  badge_code    text not null,                       -- 'couteau_suisse','premiere_certif','sprint_3j'…
  badge_titre   text not null,
  badge_emoji   text not null default '🏆',
  obtenu_le     timestamptz not null default now(),
  description   text,
  unique (employe_id, badge_code)
);
create index if not exists idx_badges_employe on badges_employes(employe_id, obtenu_le desc);
alter table badges_employes disable row level security;


-- ─── 4. QUESTIONS IA — Q/R Claude pour analyse + enrichissement modules ─
create table if not exists formation_questions_ia (
  id            uuid primary key default gen_random_uuid(),
  employe_id    uuid references employes(id) on delete set null,
  guide_id      uuid references guides_formation(id) on delete set null,
  etape_id      uuid references etapes_formation(id) on delete set null,
  question      text not null,
  reponse       text not null,                       -- réponse Claude
  poste         text,                                -- snapshot pour stats
  modele        text default 'claude-haiku-4-5',
  tokens_input  integer,
  tokens_output integer,
  utile         boolean,                             -- feedback utilisateur optionnel
  created_at    timestamptz not null default now()
);
create index if not exists idx_qia_guide_date on formation_questions_ia(guide_id, created_at desc);
create index if not exists idx_qia_employe_date on formation_questions_ia(employe_id, created_at desc);
alter table formation_questions_ia disable row level security;


-- ─── 5. Setup ouverture (pour l'alerte agent formateur "J-30") ───
create table if not exists formation_parametres (
  cle           text primary key,
  valeur        text,
  updated_at    timestamptz not null default now()
);
alter table formation_parametres disable row level security;

-- Valeur par défaut : date d'ouverture = 3 mois (modifiable côté admin)
insert into formation_parametres (cle, valeur)
values ('date_ouverture', (current_date + interval '90 days')::text)
on conflict (cle) do nothing;


select 'Migration 0087 OK' as status,
  (select count(*) from guides_formation where niveau is not null) as nb_guides,
  (select count(*) from certifications) as nb_certifs,
  (select count(*) from badges_employes) as nb_badges;
