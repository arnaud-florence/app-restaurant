-- Module Ardoises comptoir bar
-- ───────────────────────────────────────────────────────────────────────
-- Permet à un client du COMPTOIR (debout au bar, sans table) d'ouvrir une
-- « ardoise » nommée : il enchaîne plusieurs tournées qui s'AJOUTENT à la même
-- commande, et il paie le total à la fin (un seul encaissement), comme une table.
--
-- On stocke juste le nom de l'ardoise sur la commande. La logique d'ajout réutilise
-- creerCommande() : une commande COMPTOIR non encaissée avec le même ardoise_nom
-- reçoit les nouveaux articles au lieu d'en créer une 2ᵉ.

alter table commandes add column if not exists ardoise_nom text;

-- Index partiel : retrouver vite l'ardoise ouverte par son nom (commandes non soldées).
create index if not exists idx_commandes_ardoise_ouverte
  on commandes (ardoise_nom)
  where ardoise_nom is not null and statut not in ('encaisse', 'annule');

-- RLS désactivée (single-tenant — cohérent avec le reste du schéma)
alter table commandes disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────────
do $$
declare
  col_ok boolean;
  rls_on boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_name = 'commandes' and column_name = 'ardoise_nom'
  ) into col_ok;
  select relrowsecurity from pg_class where relname = 'commandes' into rls_on;
  raise notice 'commandes.ardoise_nom présent : %', col_ok;
  raise notice 'commandes RLS active (doit être false) : %', rls_on;
end $$;
