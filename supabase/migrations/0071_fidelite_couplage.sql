-- Module fidélité — couplage encaissement / client
-- Ajoute client_id sur commandes (référence forte) + table d'historique
-- des mouvements de points pour traçabilité + paramètres par défaut.

-- ─── 1. Référence client sur commande ─────────────────────────
alter table commandes add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists idx_commandes_client on commandes(client_id) where client_id is not null;

-- ─── 2. Mouvements de points (historique) ─────────────────────
create table if not exists mouvements_points (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  type            text not null check (type in ('gain','utilisation','ajustement','expiration')),
  points          integer not null,           -- positif pour gain, négatif pour util/expir
  motif           text,
  commande_id     uuid references commandes(id) on delete set null,
  employe_id      uuid references employes(id) on delete set null,
  created_at      timestamptz default now()
);

create index if not exists idx_mouv_points_client on mouvements_points(client_id, created_at desc);
create index if not exists idx_mouv_points_commande on mouvements_points(commande_id) where commande_id is not null;

-- ─── 3. Paramètres par défaut ─────────────────────────────────
-- Insertion idempotente : on n'écrase pas si l'admin a déjà personnalisé.
insert into parametres (cle, valeur) values
  ('fidelite.points_par_euro', '1'),
  ('fidelite.auto_credit_encaissement', 'true'),
  ('fidelite.points_inscription', '10')
on conflict (cle) do nothing;
