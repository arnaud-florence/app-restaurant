-- Module 28 — Sécurité & accès
-- Tables : profils (lié à auth.users) + audit_logs + connexions

create table if not exists profils (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  prenom          text,
  nom             text,
  role            text not null default 'employe' check (role in ('manager','employe')),
  totp_secret     text,                                                       -- chiffré côté app, base32
  totp_enabled    boolean not null default false,
  backup_codes    text[] not null default '{}',                               -- codes 8 car. générés à l'activation
  derniere_connexion timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_profils_role on profils(role);

create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  profil_id       uuid references profils(id) on delete set null,
  email           text,                                                       -- snapshot au cas où le profil est supprimé
  action          text not null,                                              -- 'login', 'logout', 'delete', 'update_param', 'encaissement', etc.
  ressource_type  text,                                                       -- 'employe','recette','commande','parametres', etc.
  ressource_id    text,                                                       -- id (uuid string ou autre) si applicable
  details         jsonb,                                                      -- contexte additionnel
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_created on audit_logs(created_at desc);
create index if not exists idx_audit_profil  on audit_logs(profil_id, created_at desc);
create index if not exists idx_audit_action  on audit_logs(action, created_at desc);

create table if not exists connexions (
  id           uuid primary key default gen_random_uuid(),
  profil_id    uuid references profils(id) on delete cascade,
  email        text,
  succes       boolean not null,
  ip           text,
  user_agent   text,
  inhabituelle boolean not null default false,                                -- true si IP nouvelle pour cet utilisateur
  created_at   timestamptz not null default now()
);

create index if not exists idx_connexions_profil on connexions(profil_id, created_at desc);
create index if not exists idx_connexions_inhabit on connexions(inhabituelle) where inhabituelle = true;

alter table profils      disable row level security;
alter table audit_logs   disable row level security;
alter table connexions   disable row level security;

do $$
declare nb_p int; nb_a int; nb_c int; rls_p text; rls_a text; rls_c text;
begin
  select count(*) into nb_p from profils;
  select count(*) into nb_a from audit_logs;
  select count(*) into nb_c from connexions;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_p from pg_class where relname='profils';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_a from pg_class where relname='audit_logs';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_c from pg_class where relname='connexions';
  raise notice 'Module 28 — profils=% audit=% connexions=% RLS p=% a=% c=%',
    nb_p, nb_a, nb_c, rls_p, rls_a, rls_c;
end $$;
