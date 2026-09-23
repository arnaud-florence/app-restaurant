-- 0151 — Catalogue tarifaire par fournisseur : savoir qui est le moins cher
--
-- L'outil savait ce qu'on PAIE (ingredients.prix_achat_ht, alimenté par les
-- factures scannées) mais pas ce que les autres PROPOSENT. Un devis reçu par
-- mail ne laissait donc aucune trace exploitable : on le lisait une fois, on
-- le rangeait, et six mois plus tard personne ne savait si le jambon était
-- moins cher ailleurs.
--
-- ⚠️ UN TARIF N'EST PAS UN PRIX PAYÉ. Cette table ne touche JAMAIS
-- `ingredients.prix_achat_ht` : un devis est une proposition, une facture est
-- une preuve. Les confondre écrirait dans le food cost un prix que personne
-- n'a jamais réglé — exactement la faute que la 0125 évite déjà sur le
-- rapprochement des lignes de facture.
--
-- ⚠️ ON COMPARE À L'UNITÉ, JAMAIS AU COLIS. Un bidon de 5 L à 24,66 € et un
-- litre à 4,93 € sont le même prix ; affichés côte à côte en euros par colis,
-- le premier paraît cinq fois plus cher. `prix_ht` est donc TOUJOURS le prix
-- de l'unité de facturation (kg, litre, pièce), et le prix du colis se
-- recalcule — l'inverse ne marche pas sans la contenance.
--
-- ⚠️ LE FORMAT DOIT CONCORDER. Une poche de thon de 600 g à 4,36 € et une
-- poche d'un kilo à 7,98 € : le prix à la poche dit « Félix Potin est moins
-- cher », le prix au kilo dit l'inverse (7,27 € contre 7,98 €). C'est le même
-- piège que le « Pago orange 33 cl » de la 0145. La contenance est donc
-- dérivée de la désignation À LA LECTURE, et quand elle est ambiguë on
-- n'affiche AUCUN prix de référence plutôt qu'un faux : `contenance_valeur`
-- et `contenance_unite` sont là pour qu'un humain tranche à la main.
--
-- ⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT D'UN FOURNISSEUR À L'AUTRE.
-- `cle_comparaison` est posée par un humain : deux désignations qui se
-- ressemblent ne sont pas le même produit, et un faux rapprochement
-- désignerait un « moins cher » qui ne l'est pas. La suggestion se calcule,
-- la décision s'enregistre.

create table if not exists catalogue_fournisseur (
  id                 uuid primary key default gen_random_uuid(),
  fournisseur_id     uuid not null references fournisseurs(id) on delete cascade,

  -- '' = ce fournisseur ne donne pas de code article. Surtout pas NULL :
  -- l'index unique ci-dessous doit être TOTAL, parce qu'`on_conflict` de
  -- PostgREST ne sait pas viser un index PARTIEL — il répond « no unique or
  -- exclusion constraint matching » et tout l'upsert échoue. Piège déjà
  -- rencontré sur `inventaires` (0134).
  reference          text not null default '',  -- code article DU FOURNISSEUR
  designation        text not null,            -- son libellé, brut
  famille            text,                     -- sa famille à lui

  unite              text not null,            -- unité de FACTURATION : kg, L, piece…
  prix_ht            numeric(10,4) not null,   -- prix DE CETTE UNITÉ
  colis_quantite     numeric(10,3),            -- ce que contient un colis, dans l'unité
  colis_libelle      text,                     -- CO, PI, BA, SA, BT, SO…

  -- Contenance réelle d'une unité vendue à la pièce/barquette/boîte.
  -- NULL = non déterminée : l'écran le dit au lieu d'inventer un €/kg.
  contenance_valeur  numeric(10,4),
  contenance_unite   text check (contenance_unite in ('kg','L','piece')),

  cle_comparaison    text,                     -- posée à la main, jamais déduite
  ingredient_id      uuid references ingredients(id) on delete set null,

  date_tarif         date not null default current_date,
  source             text,                     -- « Devis EX212546 du 28/09/2026 »
  actif              boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Un tarif a une DATE : réimporter le même devis corrige, un nouveau devis
-- crée une nouvelle ligne et l'ancienne reste — c'est ce qui rend une hausse
-- lisible. Sans la date dans la clé, le second devis écraserait le premier.
create unique index if not exists idx_catalogue_four_ref
  on catalogue_fournisseur (fournisseur_id, reference, date_tarif);

create index if not exists idx_catalogue_four_cle  on catalogue_fournisseur (cle_comparaison) where cle_comparaison is not null;
create index if not exists idx_catalogue_four_ing  on catalogue_fournisseur (ingredient_id)    where ingredient_id is not null;
create index if not exists idx_catalogue_four_four on catalogue_fournisseur (fournisseur_id, actif);

comment on table catalogue_fournisseur is
  'Tarifs PROPOSÉS par un fournisseur (devis, catalogue). Jamais un prix payé : '
  'celui-là vient des factures et vit dans ingredients.prix_achat_ht.';
comment on column catalogue_fournisseur.prix_ht is
  'Prix de l''UNITÉ DE FACTURATION (kg, L, pièce) — jamais du colis. Comparer '
  'des colis de contenances différentes donne un classement faux.';
comment on column catalogue_fournisseur.cle_comparaison is
  'Ce qui relie la même marchandise chez deux fournisseurs. Posée par un humain : '
  'une ressemblance de libellé ne prouve pas qu''il s''agit du même produit.';

alter table catalogue_fournisseur disable row level security;

-- ─── Diagnostic ─────────────────────────────────────────────
do $$
declare n integer; rls boolean;
begin
  select count(*) into n from catalogue_fournisseur;
  select relrowsecurity into rls from pg_class where relname = 'catalogue_fournisseur';
  raise notice 'catalogue_fournisseur : % ligne(s), RLS = %', n, rls;
end $$;
