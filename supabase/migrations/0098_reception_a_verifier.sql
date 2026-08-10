-- 0098 — Workflow de vérification de réception (autonomie_reception)
--
-- Quand un employé SANS l'autonomie "réceptionner sans validation" enregistre
-- une réception, le stock est tout de même mis à jour (les marchandises sont
-- physiquement arrivées, le stock doit rester juste), mais le bon est marqué
-- `reception_a_verifier = true` pour que le gérant contrôle quantités/qualité
-- et valide a posteriori (bouton "Valider la réception").
--
-- Le gérant et les employés autonomes mettent directement à false.

alter table bons_commande add column if not exists reception_par uuid;
alter table bons_commande add column if not exists reception_at timestamptz;
alter table bons_commande add column if not exists reception_a_verifier boolean not null default false;

-- Supabase réactive la RLS après un ALTER via SQL Editor — on la redésactive (single-tenant).
alter table bons_commande disable row level security;

-- Diagnostic
do $$
declare
  n_cols int;
begin
  select count(*) into n_cols
  from information_schema.columns
  where table_name = 'bons_commande'
    and column_name in ('reception_par','reception_at','reception_a_verifier');
  raise notice '0098 OK — colonnes réception présentes : % / 3', n_cols;
end $$;
