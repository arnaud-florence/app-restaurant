-- Autonomie configurable par employé (pilotée par le gérant dans /admin/rh)
-- + workflow de validation des bons de commande soumis par un employé.
-- Par défaut TOUT est false : le gérant active au cas par cas.

-- ─── 1. Flags d'autonomie sur la fiche employé ──────────────────────
alter table employes add column if not exists autonomie_reception     boolean not null default false; -- réceptionner les livraisons sans validation
alter table employes add column if not exists autonomie_commande      boolean not null default false; -- envoyer un bon de commande sans validation gérant
alter table employes add column if not exists autonomie_modif_recettes boolean not null default false; -- modifier les quantités de recettes
alter table employes add column if not exists autonomie_voir_prix     boolean not null default false; -- voir les prix d'achat des ingrédients

-- ─── 2. Workflow validation des bons de commande ────────────────────
-- Nouveau statut 'a_valider' : un bon soumis par un employé sans autonomie_commande
-- attend la validation du gérant avant de pouvoir être envoyé au fournisseur.
alter table bons_commande add column if not exists propose_par uuid references employes(id); -- employé qui a soumis (null = créé par le gérant)
alter table bons_commande add column if not exists soumis_at   timestamptz;                    -- date de soumission pour validation

alter table bons_commande drop constraint if exists bons_commande_statut_check;
alter table bons_commande
  add constraint bons_commande_statut_check
  check (statut in ('brouillon', 'a_valider', 'envoye', 'recu', 'annule'));

-- ─── RLS off (single-tenant) ────────────────────────────────────────
alter table employes disable row level security;
alter table bons_commande disable row level security;

do $$
begin
  raise notice 'Autonomie : 4 flags employes + statut bons_commande a_valider + propose_par/soumis_at';
end $$;
