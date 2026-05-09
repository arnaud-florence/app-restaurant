-- TVA multi-taux conformité France :
--   20% : alcools (vin, bière, spiritueux, cocktail) — peu importe sur place/emporter
--   10% : plats/softs sur place
--    5,5% : plats/softs à emporter

-- 1. commandes : mode de consommation + ventilation TVA persistée
alter table commandes
  add column if not exists consommation         text default 'sur_place'
    check (consommation in ('sur_place', 'emporter')),
  add column if not exists tva_total            decimal(10,2) default 0,
  add column if not exists ventilation_tva      jsonb default '{}'::jsonb;
  -- ventilation_tva = { "5.5": 12.00, "10": 35.50, "20": 8.40 }

-- 2. commande_articles : taux + montant TVA par ligne
alter table commande_articles
  add column if not exists tva_taux             decimal(5,2) default 10,
  add column if not exists tva_eur              decimal(10,2) default 0,
  add column if not exists prix_unitaire_ttc    decimal(10,2) default 0;

-- 3. recettes : flag contient_alcool (cocktails maison, plats avec alcool)
alter table recettes
  add column if not exists contient_alcool      boolean not null default false;

-- 4. boissons : flag dérivé du type
alter table boissons
  add column if not exists contient_alcool      boolean not null default false;

update boissons set contient_alcool = true
where  type in ('vin','champagne','biere_pression','biere_bouteille','spiritueux','cocktail')
  and  contient_alcool = false;

-- 5. Index pour les rapports TVA mensuels
create index if not exists idx_commandes_consommation on commandes(consommation, created_at desc);

do $$ begin raise notice 'TVA multi-taux : colonnes ajoutées + boissons alcoolisées flaggées'; end $$;
