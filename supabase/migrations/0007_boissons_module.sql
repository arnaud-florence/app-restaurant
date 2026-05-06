-- ============================================================
-- 0007 — Module 6 : Carte des vins & boissons
-- ============================================================
-- Nouvelle table `boissons` distincte de `recettes` :
-- - Catalogue produit avec spécificités vin (appellation, millésime,
--   région, cépage, couleur)
-- - Prix d'achat séparés bouteille / fût (pour rendre les marges
--   calculables par format de vente)
-- - Prix de vente séparés verre / bouteille / pinte avec leur
--   contenance (cl)
-- - Stock séparé bouteilles / fûts (séparé du stock cuisine)
-- - TVA par défaut 20% (alcool) — surchargeable par boisson
--
-- Plus une table `accords_mets_boissons` (jointure recette × boisson)
-- pour les accords explicites du gérant. L'algorithme auto-suggère
-- des accords par règles couleur × type de plat dans /admin/boissons.
--
-- Idempotent.
-- ============================================================

-- ─── 1. Table boissons ─────────────────────────────────────────
create table if not exists boissons (
  id                          uuid primary key default gen_random_uuid(),
  nom                         text not null,
  type                        text not null
                              check (type in ('vin','champagne','biere_pression','biere_bouteille','soft','eau','spiritueux','cafe_the','cocktail','autre')),

  -- Spécifique vin / champagne
  appellation                 text,
  millesime                   integer,
  region                      text,
  cepage                      text,
  couleur                     text check (couleur is null or couleur in ('rouge','blanc','rose','champagne','liquoreux','autre')),

  -- Fournisseurs
  fournisseur_principal       text,
  fournisseur_secondaire      text,

  -- Achat — bouteille
  prix_achat_ht_bouteille     decimal(10,4) not null default 0,
  contenance_bouteille_cl     integer       not null default 75,

  -- Achat — fût (boissons en pression)
  prix_achat_ht_fut           decimal(10,4) not null default 0,
  contenance_fut_cl           integer       not null default 0,

  -- Vente
  prix_vente_ht_verre         decimal(10,2) not null default 0,
  contenance_verre_cl         integer       not null default 12,
  prix_vente_ht_bouteille     decimal(10,2) not null default 0,
  prix_vente_ht_pinte         decimal(10,2) not null default 0,
  contenance_pinte_cl         integer       not null default 50,
  tva                         decimal(5,2)  not null default 20,

  -- Stock séparé du stock cuisine
  stock_actuel_bouteilles     decimal(10,2) not null default 0,
  stock_minimum_bouteilles    decimal(10,2) not null default 0,
  stock_actuel_futs           decimal(10,2) not null default 0,
  stock_minimum_futs          decimal(10,2) not null default 0,

  -- Métadonnées
  description                 text,
  photo_url                   text,
  actif                       boolean not null default true,
  ordre                       integer not null default 0,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Trigger updated_at (la fonction set_updated_at existe depuis 0001)
drop trigger if exists tg_boissons_updated on boissons;
create trigger tg_boissons_updated before update on boissons
  for each row execute function set_updated_at();

-- Indexes
create index if not exists idx_boissons_type    on boissons(type);
create index if not exists idx_boissons_actif   on boissons(actif);
create index if not exists idx_boissons_couleur on boissons(couleur) where couleur is not null;

alter table boissons disable row level security;

-- ─── 2. Accords mets / vins (jointure manuelle) ─────────────────
create table if not exists accords_mets_boissons (
  id              uuid primary key default gen_random_uuid(),
  recette_id      uuid not null references recettes(id) on delete cascade,
  boisson_id      uuid not null references boissons(id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),
  unique(recette_id, boisson_id)
);

create index if not exists idx_accords_recette on accords_mets_boissons(recette_id);
create index if not exists idx_accords_boisson on accords_mets_boissons(boisson_id);

alter table accords_mets_boissons disable row level security;

-- ─── 3. Seed 10 références (gated 'if not exists') ──────────────
do $$
begin
  if exists (select 1 from boissons limit 1) then
    raise notice 'Boissons déjà seedées — skip';
    return;
  end if;

  insert into boissons (
    nom, type, appellation, millesime, region, cepage, couleur,
    fournisseur_principal,
    prix_achat_ht_bouteille, contenance_bouteille_cl,
    prix_achat_ht_fut, contenance_fut_cl,
    prix_vente_ht_verre, contenance_verre_cl,
    prix_vente_ht_bouteille, prix_vente_ht_pinte, contenance_pinte_cl,
    tva,
    stock_actuel_bouteilles, stock_minimum_bouteilles,
    stock_actuel_futs, stock_minimum_futs,
    description, ordre
  ) values
    ('Cahors Malbec — Château Cèdre',     'vin',             'Cahors AOC',           2022, 'Sud-Ouest', 'Malbec',         'rouge',
     'Domaine Cèdre',
     6.5000, 75, 0, 0, 6.00, 12, 28.00, 0, 50, 20,
     24, 12, 0, 0,
     'Robe rouge profonde, tanins veloutés, notes de cassis et truffe noire. Idéal sur viandes rouges et magret.', 1),

    ('Gaillac Blanc — Domaine Plageoles', 'vin',             'Gaillac AOC',          2023, 'Sud-Ouest', 'Mauzac, Loin de l''œil', 'blanc',
     'Domaine Plageoles',
     5.0000, 75, 0, 0, 5.00, 12, 22.00, 0, 50, 20,
     18,  8, 0, 0,
     'Sec et vif, notes de poire et fleur d''aubépine. Parfait sur poissons et fromages frais.', 2),

    ('Côtes du Tarn Rosé',                 'vin',             'Côtes du Tarn IGP',    2024, 'Sud-Ouest', 'Syrah, Cabernet', 'rose',
     'Cave coopérative Tarn',
     4.5000, 75, 0, 0, 4.50, 12, 19.00, 0, 50, 20,
     12,  6, 0, 0,
     'Fruité et léger, idéal en terrasse l''été. Accompagne salades et grillades.', 3),

    ('Crémant de Limoux Brut',             'champagne',       'Limoux AOC',           2021, 'Languedoc',  'Mauzac, Chardonnay', 'champagne',
     'Domaine de Fourn',
     8.0000, 75, 0, 0, 7.00, 12, 35.00, 0, 50, 20,
     6,  3, 0, 0,
     'Méthode traditionnelle, bulles fines, notes de pomme et brioche. Apéro et desserts.', 4),

    ('Bière Pression — Lager Garonne',     'biere_pression',  null,                   null, null,         null,             null,
     'Brasserie Garonne',
     0.0000, 0, 80.0000, 3000, 0, 0, 0, 4.50, 50, 20,
     0, 0, 2, 1,
     'Lager artisanale brassée à Toulouse, fût 30L (60 pintes), légère et désaltérante.', 5),

    ('IPA Garonne — bouteille 33cl',       'biere_bouteille', null,                   null, null,         null,             null,
     'Brasserie Garonne',
     2.0000, 33, 0, 0, 0, 0, 6.00, 0, 50, 20,
     36, 12, 0, 0,
     'IPA 6,5°, houblons américains, amertume franche.', 6),

    ('Coca-Cola 33cl',                     'soft',            null,                   null, null,         null,             null,
     'Distrib local',
     0.8000, 33, 0, 0, 0, 0, 3.50, 0, 50, 10,
     48, 24, 0, 0,
     null, 7),

    ('Eau Vittel 75cl',                    'eau',             null,                   null, null,         null,             null,
     'Distrib local',
     1.0000, 75, 0, 0, 0, 0, 4.00, 0, 50, 5.5,
     24, 12, 0, 0,
     null, 8),

    ('Whisky Lagavulin 16 ans',            'spiritueux',      null,                   null, 'Écosse',     null,             null,
     'Caviste partenaire',
     65.0000, 70, 0, 0, 12.00, 4, 95.00, 0, 50, 20,
     3, 1, 0, 0,
     'Single malt Islay, tourbé et fumé. Servi en dose 4cl.', 9),

    ('Café — torréfaction Toulouse',       'cafe_the',        null,                   null, null,         null,             null,
     'Brûlerie Toulousaine',
     0.3000, 100, 0, 0, 2.50, 1, 0, 0, 50, 10,
     5, 2, 0, 0,
     'Torréfaction artisanale 100% arabica, dose ~10g par tasse. Stock en kg de grains.', 10);
end $$;

-- ─── 4. Diagnostic ──────────────────────────────────────────────
select
  (select count(*) from boissons)                       as nb_boissons,
  (select count(*) from accords_mets_boissons)          as nb_accords,
  (select count(*) from boissons where type = 'vin')    as nb_vins,
  (select count(*) from boissons where actif = true)    as nb_actives;

select type, count(*) as nb
  from boissons
 group by type
 order by nb desc;
