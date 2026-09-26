-- 0158 — Le catalogue du PORTAIL fournisseur, et ce qu'on y paie vraiment
--
-- Gineys expose son catalogue complet sur `commande.gineys.com` : 92 articles
-- « Mes articles » (ceux qu'on achète), 266 promotions, 2 892 références au
-- total. Jusqu'ici l'outil ne connaissait de Gineys que les 82 lignes tirées
-- de nos factures scannées — soit ce qu'on a déjà acheté, jamais ce qu'il
-- propose. On ne pouvait donc pas répondre à « est-ce qu'il a ça ? ».
--
-- ⚠️ CES PRIX SONT NOS PRIX NÉGOCIÉS, ET C'EST VÉRIFIÉ, PAS SUPPOSÉ.
-- Les 92 « Mes articles » ont été confrontés un par un aux prix réellement
-- facturés : 47 des 64 rapprochements concordent AU CENTIME, le reste est un
-- mouvement de tarif depuis août. Le portail est donc une source plus FRAÎCHE
-- que nos factures — mais il reste un tarif affiché, pas une preuve de
-- paiement, d'où `nature = 'portail'` plutôt que `'facture'`.
--
-- ⚠️ « NON REMISÉ » NE SE DÉDUIT PAS D'UNE ABSENCE. Pour les 2 800 articles
-- qu'on n'achète pas, on ignore si le prix affiché porte notre remise ou le
-- tarif public. Les marquer « non remisés » serait une affirmation qu'on ne
-- peut pas tenir — même faute que le tableau d'allergènes vide lu « aucun
-- allergène » (0138) et que `statutFoodCost(0)` affiché en vert (0150).
-- D'où TROIS états sur `tarif_negocie` : true (confirmé), false (confirmé
-- non), NULL (personne n'a vérifié). C'est NULL qui déclenche la demande de
-- remise au fournisseur.
--
-- ⚠️ `prix_ht` DEVIENT NULLABLE. 25 articles s'affichent « N.C. » — prix sur
-- demande. Y écrire 0 les ferait remonter en tête du comparateur comme les
-- moins chers du catalogue ; les exclure les rendrait invisibles alors que ce
-- sont EXACTEMENT ceux pour lesquels il faut écrire au fournisseur. NULL dit
-- « on ne sait pas », et tout lecteur doit désormais le traiter.

alter table catalogue_fournisseur alter column prix_ht drop not null;

alter table catalogue_fournisseur
  drop constraint if exists catalogue_fournisseur_nature_check;
alter table catalogue_fournisseur
  add constraint catalogue_fournisseur_nature_check
  check (nature in ('devis', 'facture', 'portail'));

-- Remise affichée par le portail sur cet article, en pourcentage (« -33.0 % »).
-- C'est une PROMOTION datée, pas une remise contractuelle : elle se périme,
-- d'où la lecture obligatoire de `date_tarif` à côté.
alter table catalogue_fournisseur
  add column if not exists remise_pct numeric(5,2);

-- true = prix négocié CONFIRMÉ · false = tarif public CONFIRMÉ · NULL = inconnu.
alter table catalogue_fournisseur
  add column if not exists tarif_negocie boolean;

-- Suit-on cet article ? (« Mes articles » du portail = ce qu'on achète déjà.)
alter table catalogue_fournisseur
  add column if not exists achete boolean not null default false;

create index if not exists idx_catalogue_four_negocie
  on catalogue_fournisseur (fournisseur_id, tarif_negocie);
create index if not exists idx_catalogue_four_achete
  on catalogue_fournisseur (achete) where achete;

comment on column catalogue_fournisseur.remise_pct is
  'Remise affichée par le portail, en %. PROMOTION datée — se lit avec date_tarif.';
comment on column catalogue_fournisseur.tarif_negocie is
  'true = négocié confirmé, false = tarif public confirmé, NULL = PERSONNE N''A '
  'VÉRIFIÉ. NULL n''est pas false : c''est lui qui déclenche la demande de remise.';
comment on column catalogue_fournisseur.achete is
  'Article que nous achetons déjà chez ce fournisseur (« Mes articles » du portail).';
comment on column catalogue_fournisseur.prix_ht is
  'Prix de l''unité de facturation. NULL = « prix sur demande » (N.C. au '
  'portail) : surtout pas 0, qui remonterait en tête du comparateur.';

alter table catalogue_fournisseur disable row level security;

do $$
declare n integer;
begin
  select count(*) into n from catalogue_fournisseur;
  raise notice '0158 — catalogue_fournisseur : % ligne(s) avant import portail', n;
end $$;
