-- ════════════════════════════════════════════════════════════════════
-- 0121 — Aligner la carte de l'outil sur celle de la caisse
-- ════════════════════════════════════════════════════════════════════
-- Relevé sur les 168 tickets du 17 au 19 août : 52 libellés distincts côté
-- SumUp, dont 22 introuvables dans l'outil — 318,90 € sur 916,00 €, soit 35 %
-- du chiffre d'affaires impossible à rattacher à un produit.
--
-- La caisse fait foi : c'est là que la vente a lieu. Mais on ne renomme pas
-- les recettes pour autant — « Tartelette citron » est le raccourci d'un écran
-- de caisse, « Tartelette citron meringuée » est ce qu'on imprime sur le site.
-- D'où `nom_caisse` : le libellé tel qu'il sort de SumUp, à côté du nom propre.
--
-- Trois gestes :
--   1. La correspondance pour les libellés qui ne diffèrent que par l'écriture.
--   2. Les composants de formule, que SumUp facture séparément. On les reflète
--      tels quels au lieu de recomposer la formule : « Croissant ou pain au
--      chocolat » ne dit pas lequel des deux est parti, et une déduction de
--      stock inventée vaut moins qu'une déduction absente.
--   3. Les produits réellement vendus mais absents de la carte.
--
-- ⚠️ Les prix ci-dessous sont ceux OBSERVÉS sur les tickets. Deux sont des
-- moyennes non rondes, donc probablement plusieurs tarifs sous un même nom :
-- « Sandwich ou panini » (4,475 € moyen) et « Jus d'orange 33cl » (1,892 €).
-- À confirmer dans /admin/recettes. Sans incidence sur le CA importé : chaque
-- ligne reprend le prix et la TVA du ticket, pas ceux de la fiche produit.
-- ════════════════════════════════════════════════════════════════════

alter table recettes
  add column if not exists nom_caisse text;

comment on column recettes.nom_caisse is
  'Libellé exact du produit dans la caisse agréée (SumUp). Sert au '
  'rapprochement des tickets importés — cf. 0121.';

create index if not exists idx_recettes_nom_caisse on recettes(nom_caisse);

-- ─── 1. Correspondances (même produit, écriture différente) ──────────
update recettes r set nom_caisse = v.caisse
  from (values
    ('Tartelette citron meringuée',      'Tartelette citron'),
    ('Tropézienne individuelle',         'Tropézienne'),
    ('Part de flan pâtissier',           'Flan pâtissier'),
    ('Le Rosette',                       'La rosette'),
    ('Madeleine chocolat-noisette',      'Madeleine choco/ noisette'),
    ('Muffin chocolat-noisette',         'Muffin choco / noisette'),
    ('Orangina 33 cl',                   'Orangina'),
    ('Pizza à la plaque Margherita',     'Pizza Margherita'),
    ('Pizza à la plaque jambon-fromage', 'Pizza jambon fromage')
  ) as v(app, caisse)
 where r.nom = v.app and r.tag_destination = 'FOURNIL';

-- ─── 2. La caisse fait foi : les jus sont en 33 cl, pas 25 ───────────
-- Les affiches annoncent 25 cl. SumUp vend du 33 cl depuis lundi ; c'est la
-- caisse qui a raison, et c'est l'affiche qu'il faudra réimprimer.
update recettes set nom = 'Jus d''orange 33 cl', nom_caisse = 'Jus d''orange 33cl'
 where nom = 'Jus d''orange 25 cl' and tag_destination = 'FOURNIL';
update recettes set nom = 'Jus de pomme 33 cl', nom_caisse = 'Jus de pommes 33cl'
 where nom = 'Jus de pomme 25 cl' and tag_destination = 'FOURNIL';

-- ─── 3. Produits vendus mais absents de la carte ─────────────────────
insert into recettes (nom, nom_caisse, categorie, tag_destination, prix_vente_ht, tva,
                      contient_alcool, vendable_online, actif, etablissement_id)
select v.nom, v.caisse, v.cat, 'FOURNIL',
       round(v.ttc / (1 + v.tva / 100.0), 4), v.tva,
       false, v.online, true,
       (select id from etablissements where slug = 'fournil')
from (values
  -- Boissons vendues au comptoir, jamais montées sur une affiche
  ('Fanta 33 cl',        'Fanta',        'Boisson fraîche', 1.80, 10, true),
  ('Coca-Cola Cherry 33 cl', 'Coca cherry', 'Boisson fraîche', 1.80, 10, true),
  ('Ciao 33 cl',         'Ciao 33cl',    'Boisson fraîche', 2.50, 10, true),
  ('Red Bull 25 cl',     'Rud bull',     'Boisson fraîche', 2.30, 10, true),
  ('Salade',             'Salade',       'Salade',          4.40, 10, true),
  -- Composants de formule : SumUp les facture à part, on les reflète tels
  -- quels. Hors vente en ligne : ce ne sont pas des produits qu'on commande,
  -- ce sont des morceaux de formule.
  ('Formule — sandwich ou panini',       'Sandwich ou panini',            'Formule', 4.40, 10, false),
  ('Formule — boisson',                  'Boisson',                       'Formule', 1.80, 10, false),
  ('Formule — dessert',                  'Dessert',                       'Formule', 1.80, 10, false),
  ('Formule — croissant ou pain au chocolat', 'Croissant ou pain au chocolat', 'Formule', 1.14, 5.5, false),
  ('Formule — expresso ou allongé',      'Expresso ou allongé',           'Formule', 1.06, 10, false)
) as v(nom, caisse, cat, ttc, tva, online)
where not exists (
  select 1 from recettes r
   where r.tag_destination = 'FOURNIL'
     and (r.nom = v.nom or r.nom_caisse = v.caisse)
);

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb_map int; nb_tot int;
begin
  select count(*) filter (where nom_caisse is not null), count(*)
    into nb_map, nb_tot
    from recettes where tag_destination = 'FOURNIL' and actif;
  raise notice '── Carte Fournil : % produit(s) actif(s), % avec un nom de caisse ──', nb_tot, nb_map;
end $$;
