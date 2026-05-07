-- ============================================================
-- 0022 — Module 14 : Finances & pilotage (/admin/finances)
-- ============================================================
-- Contenu :
--   1. charges_fixes    — loyer, énergie, assurance, etc.
--   2. notes_de_frais   — remboursements employés
--   3. Disable RLS
--
-- Solde de trésorerie initial = stocké dans `parametres`
--   cle = 'tresorerie_solde'        valeur = montant en €
--   cle = 'tresorerie_solde_date'   valeur = date ISO
--
-- TVA collectée = sum montant TTC paiements_caisse (taux 10% par défaut).
-- TVA déductible = sum (TTC - HT) factures_fournisseurs.
--
-- Idempotent.
-- ============================================================

-- ─── 1. charges_fixes ──────────────────────────────────────
create table if not exists charges_fixes (
  id                  uuid primary key default gen_random_uuid(),
  libelle             text not null,
  categorie           text not null check (categorie in (
    'loyer','energie','eau','telecom','internet','assurance','salaire',
    'comptable','banque','urssaf','impots','abonnement','autre'
  )),
  montant_ht          decimal(10,2) not null,
  montant_ttc         decimal(10,2) not null,
  frequence           text not null default 'mensuel' check (frequence in (
    'mensuel','bimestriel','trimestriel','semestriel','annuel'
  )),
  jour_prelevement    integer check (jour_prelevement between 1 and 31),
  prochaine_echeance  date,
  fournisseur_nom     text,
  iban                text,
  notes               text,
  actif               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_charges_actif      on charges_fixes(actif) where actif = true;
create index if not exists idx_charges_echeance   on charges_fixes(prochaine_echeance) where actif = true and prochaine_echeance is not null;
create index if not exists idx_charges_categorie  on charges_fixes(categorie, actif);

alter table charges_fixes disable row level security;

-- ─── 2. notes_de_frais ─────────────────────────────────────
create table if not exists notes_de_frais (
  id                  uuid primary key default gen_random_uuid(),
  employe_id          uuid not null references employes(id) on delete cascade,
  date_depense        date not null default current_date,
  libelle             text not null,
  motif               text,
  montant             decimal(10,2) not null,
  justificatif_url    text,
  statut              text not null default 'en_attente' check (statut in ('en_attente','remboursee','refusee')),
  remboursee_at       timestamptz,
  remboursee_par      uuid references employes(id) on delete set null,
  notes_admin         text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_ndf_employe on notes_de_frais(employe_id, statut, date_depense desc);
create index if not exists idx_ndf_statut  on notes_de_frais(statut, date_depense desc);

alter table notes_de_frais disable row level security;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select
  (select count(*) from charges_fixes)   as nb_charges,
  (select count(*) from notes_de_frais)  as nb_notes;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('charges_fixes','notes_de_frais')
 order by c.relname;
