-- ============================================================
-- 0012 — Module 9A : Écrans de service (cuisine, bar, serveur)
-- ============================================================
-- Contenu :
--   1. Table sessions_caisse (ouverture/clôture journalière, fond,
--      écart, pour le rapport Z futur)
--   2. Table paiements_caisse (multi-paiements par commande, tips
--      par serveur, méthode, référence)
--   3. Colonnes serveur_id + session_caisse_id + pourboire_total
--      sur commandes
--   4. Activation Realtime sur commandes / commande_articles /
--      tables_restaurant (CLAUDE.md exige le temps réel sur ces 3)
--   5. Seed : 1 session ouverte aujourd'hui avec fond 200 €
--
-- RÈGLE D'OR (CLAUDE.md) : la commande ne disparaît qu'au statut
-- 'encaisse'. Les écrans cuisine/bar/serveur la voient à tous les
-- statuts intermédiaires.
--
-- Idempotent.
-- ============================================================

-- ─── 1. sessions_caisse ─────────────────────────────────────
create table if not exists sessions_caisse (
  id              uuid primary key default gen_random_uuid(),
  date_session    date not null default current_date,
  ouverte_at      timestamptz not null default now(),
  fermee_at       timestamptz,
  fond_initial    decimal(10,2) not null default 0,
  fond_final      decimal(10,2),
  ca_attendu      decimal(10,2),    -- = sum paiements 'especes' de la session
  ca_compte       decimal(10,2),    -- saisi à la clôture
  ecart           decimal(10,2),    -- ca_compte - ca_attendu
  notes           text,
  ouverte_par     uuid references employes(id) on delete set null,
  fermee_par      uuid references employes(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_sessions_date     on sessions_caisse(date_session desc);
create index if not exists idx_sessions_ouverte  on sessions_caisse(date_session) where fermee_at is null;

alter table sessions_caisse disable row level security;

-- ─── 2. paiements_caisse ────────────────────────────────────
create table if not exists paiements_caisse (
  id                uuid primary key default gen_random_uuid(),
  commande_id       uuid not null references commandes(id) on delete cascade,
  session_caisse_id uuid references sessions_caisse(id) on delete set null,
  methode           text not null
                    check (methode in ('especes','carte','ticket_resto','virement','autre')),
  montant           decimal(10,2) not null,
  pourboire         decimal(10,2) not null default 0,
  serveur_id        uuid references employes(id) on delete set null,
  reference         text,                          -- ex: n° transaction TPE
  encaisse_at       timestamptz not null default now()
);

create index if not exists idx_paiements_commande on paiements_caisse(commande_id);
create index if not exists idx_paiements_session  on paiements_caisse(session_caisse_id);
create index if not exists idx_paiements_serveur  on paiements_caisse(serveur_id, encaisse_at desc);
create index if not exists idx_paiements_methode  on paiements_caisse(methode, encaisse_at desc);

alter table paiements_caisse disable row level security;

-- ─── 3. Colonnes commandes : serveur_id + session_caisse_id + tips ──
alter table commandes
  add column if not exists serveur_id        uuid references employes(id) on delete set null,
  add column if not exists session_caisse_id uuid references sessions_caisse(id) on delete set null,
  add column if not exists pourboire_total   decimal(10,2) not null default 0;

create index if not exists idx_commandes_serveur on commandes(serveur_id, created_at desc);
create index if not exists idx_commandes_session on commandes(session_caisse_id);

-- ─── 4. Activation Realtime sur les 3 tables critiques ──────
do $$ begin alter publication supabase_realtime add table commandes;          exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table commande_articles;  exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table tables_restaurant;  exception when duplicate_object then null; when others then null; end $$;

-- ─── 5. Sécurité RLS sur les tables touchées (Supabase pattern) ──
alter table commandes          disable row level security;
alter table commande_articles  disable row level security;
alter table tables_restaurant  disable row level security;
alter table employes           disable row level security;
alter table recettes           disable row level security;

-- ─── 6. Seed : session ouverte du jour si rien n'est en cours ──
do $$
begin
  if not exists (select 1 from sessions_caisse where fermee_at is null and date_session = current_date) then
    insert into sessions_caisse (date_session, fond_initial, notes)
    values (current_date, 200.00, 'Session auto-ouverte au démarrage du Module 9A');
  end if;
end $$;

-- ─── 7. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from sessions_caisse where fermee_at is null) as sessions_ouvertes,
  (select count(*) from paiements_caisse)                         as nb_paiements,
  (select count(*) from commandes where serveur_id is not null)   as commandes_avec_serveur;

-- Vérif Realtime
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('commandes','commande_articles','tables_restaurant')
 order by tablename;

-- Vérif RLS sur les tables critiques
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('sessions_caisse','paiements_caisse','commandes','commande_articles','tables_restaurant')
 order by c.relname;
