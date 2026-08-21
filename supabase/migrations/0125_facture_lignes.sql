-- ════════════════════════════════════════════════════════════════════
-- 0125 — Lignes de facture fournisseur : la brique manquante des marges
-- ════════════════════════════════════════════════════════════════════
-- `factures_fournisseurs` (0010) ne stocke que des totaux. Le scanner
-- Claude Vision extrait pourtant le détail ligne à ligne… qui était JETÉ au
-- moment de créer la facture. Sans lignes, impossible de relier un prix
-- d'achat à un ingrédient, donc impossible de calculer le coût matière réel
-- d'un produit : les marges reposaient sur des prix saisis à la main une
-- fois pour toutes.
--
-- Cette table conserve chaque ligne et son rattachement (facultatif) à un
-- ingrédient. Le rattachement alimente :
--   · ingredients.prix_achat_ht        (dernier prix connu)
--   · historique_prix_ingredients      (source 'livraison', pour les courbes
--     et l'alerte hausse > 15 % de l'agent Scanner)
--
-- `ingredient_id` est nullable : une ligne « Transport » ou « Consigne
-- palettes » n'a pas d'ingrédient, et un rapprochement raté ne doit jamais
-- bloquer l'enregistrement de la facture.
-- ════════════════════════════════════════════════════════════════════

create table if not exists facture_lignes (
  id                uuid primary key default gen_random_uuid(),
  facture_id        uuid not null references factures_fournisseurs(id) on delete cascade,
  description       text not null,
  quantite          decimal(10,3),
  unite             text,
  prix_unitaire_ht  decimal(10,4),
  total_ht          decimal(10,2),
  -- set null : supprimer un ingrédient ne doit pas effacer la ligne comptable
  ingredient_id     uuid references ingredients(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_facture_lignes_facture    on facture_lignes(facture_id);
create index if not exists idx_facture_lignes_ingredient on facture_lignes(ingredient_id)
  where ingredient_id is not null;

alter table facture_lignes disable row level security;

-- Nombre de pages scannées, pour tracer les factures multi-pages
alter table factures_fournisseurs add column if not exists nb_pages int not null default 1;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int;
begin
  select count(*) into nb from facture_lignes;
  raise notice '── facture_lignes créée : % ligne(s) ──', nb;
  raise notice '── RLS : % ──',
    (select case when relrowsecurity then 'ACTIVE (anomalie)' else 'désactivée (ok)' end
       from pg_class where relname = 'facture_lignes');
end $$;
