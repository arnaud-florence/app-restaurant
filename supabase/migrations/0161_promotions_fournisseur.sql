-- 0161 — Les promotions d'un fournisseur, datées et conditionnelles
--
-- `catalogue_fournisseur.remise_pct` (0158) décrit une remise sur le PRIX
-- d'une référence — ce que le portail Gineys affiche. France Boissons fait
-- autre chose, et ça ne rentre pas dans une colonne de pourcentage :
--
--   « Sprite — 2 caisses achetées, 1 caisse offerte »
--   « Schweppes Agrumes — pour 2 caisses achetées, 8 € HT de remise »
--   « Picon Bière — pour 1 bouteille achetée, 1,30 € HT de remise »
--
-- Ce sont des offres CONDITIONNELLES : l'avantage dépend d'une quantité
-- achetée. Les écraser en « −x % » donnerait un prix unitaire faux pour qui
-- n'atteint pas le seuil.
--
-- ⚠️ ET ELLES ONT UNE FIN. C'est la différence majeure avec les badges du
-- portail Gineys, qui ne disent JAMAIS jusqu'à quand ils courent. Ici la
-- validité est imprimée : on la stocke, et l'écran peut dire « se termine
-- dans 3 jours » au lieu de laisser croire qu'une affaire de septembre est
-- encore là en décembre.
--
-- ⚠️ `releve_le` n'est pas `date_debut` : c'est la date à laquelle NOUS
-- avons regardé. Aucun de ces fournisseurs n'a d'API — une promotion
-- apparue depuis notre dernier passage n'est pas dans cette table, et rien
-- dans les données ne le signalerait. L'écran doit afficher l'âge du relevé.

create table if not exists promotions_fournisseur (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references fournisseurs(id) on delete cascade,

  libelle         text not null,          -- tel qu'il est écrit chez eux
  -- gratuite        : N achetés, M offerts
  -- remise_montant  : N achetés, X € HT de remise
  -- remise_pct      : N achetés, X % de remise
  type            text not null check (type in ('gratuite','remise_montant','remise_pct','prix_promo')),

  -- La CONDITION. NULL = inconditionnelle.
  seuil_quantite  numeric(10,2),
  seuil_unite     text,                   -- « Caisse(s) », « Bouteille(s) »…

  -- L'AVANTAGE, dans l'unité de son type.
  avantage        numeric(10,4),

  date_debut      date,
  date_fin        date,
  -- ⚠️ Quand NOUS avons relevé. Pas la validité de l'offre.
  releve_le       date not null default current_date,
  source          text,
  actif           boolean not null default true,
  created_at      timestamptz default now()
);

-- Relancer un relevé le même jour corrige au lieu d'empiler.
create unique index if not exists idx_promo_four_unique
  on promotions_fournisseur (fournisseur_id, libelle, releve_le);
create index if not exists idx_promo_four_fin
  on promotions_fournisseur (fournisseur_id, date_fin) where actif;

comment on table promotions_fournisseur is
  'Offres CONDITIONNELLES et DATÉES d''un fournisseur (2 achetés 1 offert, '
  'remise au-delà d''un seuil). Distinct de catalogue_fournisseur.remise_pct, '
  'qui est une remise sur le prix d''une référence.';
comment on column promotions_fournisseur.releve_le is
  'Quand NOUS avons regardé — pas la validité de l''offre. Aucun de ces '
  'fournisseurs n''a d''API : une promo parue depuis n''est pas ici, et rien '
  'dans les données ne le dirait.';
comment on column promotions_fournisseur.seuil_quantite is
  'Quantité à atteindre pour déclencher l''avantage. NULL = inconditionnelle. '
  'L''écraser en pourcentage donnerait un prix faux sous le seuil.';

alter table promotions_fournisseur disable row level security;
