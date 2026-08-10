-- 0107 — Mouvements d'espèces de la caisse (sorties / entrées hors encaissement)
--
-- Permet d'enregistrer les retraits d'espèces du tiroir-caisse pendant le
-- service (paiement fournisseur en cash, monnaie d'appoint, dépôt banque…) et
-- les apports. Le rapport Z en tient compte :
--   caisse_attendue = fond_initial + espèces encaissées − sorties + entrées
--   écart           = ca_compte (saisi) − caisse_attendue
--
-- Idempotent. RLS désactivée (single-tenant — cf. CLAUDE.md §7).

create table if not exists mouvements_caisse (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions_caisse(id) on delete cascade,
  type        text not null check (type in ('sortie','entree')),
  montant     decimal(10,2) not null check (montant > 0),
  motif       text not null,
  created_by  uuid references employes(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mouvements_caisse_session on mouvements_caisse(session_id);

-- Supabase réactive la RLS à la création via SQL Editor — on la désactive (single-tenant).
alter table mouvements_caisse disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare
  n_rows  int;
  rls_on  boolean;
begin
  select count(*) into n_rows from mouvements_caisse;
  select relrowsecurity into rls_on from pg_class where relname = 'mouvements_caisse';
  raise notice 'mouvements_caisse : % ligne(s), RLS=% (doit être false)', n_rows, rls_on;
end $$;
