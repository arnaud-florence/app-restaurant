-- ============================================================
-- 0024 — Module 15 : Gestion énergie (/admin/energie)
-- ============================================================
-- Contenu :
--   1. releves_energie  — relevés mensuels élec/gaz/eau/autre
--   2. Disable RLS
--
-- Une ligne = un relevé pour une période donnée (typiquement 1 mois).
-- Champs montant_ht/ttc à saisir d'après la facture du fournisseur.
--
-- Calculs côté app :
--   - Comparaison N vs N-1 (même mois)
--   - Alerte rouge si conso > N-1 × 1.20
--   - Coût énergie / plat = sum montant_ttc du mois / nb plats servis
--
-- Idempotent.
-- ============================================================

create table if not exists releves_energie (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('electricite','gaz','eau','autre')),
  date_releve       date not null default current_date,
  periode_debut     date not null,
  periode_fin       date not null check (periode_fin >= periode_debut),
  consommation      decimal(10,3) not null,
  unite             text not null default 'kWh' check (unite in ('kWh','m3','litre','autre')),
  prix_unitaire_ht  decimal(10,4),
  montant_ht        decimal(10,2) not null,
  montant_ttc       decimal(10,2) not null,
  fournisseur       text,
  num_facture       text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_energie_type_periode on releves_energie(type, periode_debut desc);
create index if not exists idx_energie_periode      on releves_energie(periode_debut desc);

alter table releves_energie disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
select count(*) as nb_releves from releves_energie;

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname = 'releves_energie';
