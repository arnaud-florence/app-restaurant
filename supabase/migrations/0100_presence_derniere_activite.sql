-- 0100 — Présence automatique : derniere_activite sur profils
--
-- Rafraîchie (throttlée ~3 min) à chaque page chargée par un employé connecté
-- (cf. src/lib/auth.ts getProfile). Alimente le bloc « Comptes connectés / en
-- ligne » de /admin/supervision SANS que l'employé ait à badger/pointer.
-- (Distinct de derniere_connexion qui reste l'horodatage du dernier login.)

alter table profils add column if not exists derniere_activite timestamptz;

-- Supabase réactive parfois la RLS après ALTER via SQL Editor — single-tenant.
alter table profils disable row level security;

do $$
begin
  raise notice '0100 OK — profils.derniere_activite présent';
end $$;
