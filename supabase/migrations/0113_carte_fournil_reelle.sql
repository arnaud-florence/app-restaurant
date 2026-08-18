-- ════════════════════════════════════════════════════════════════════
-- 0113 — Carte réelle du Fournil (les 13 affiches CasaTasia)
-- ════════════════════════════════════════════════════════════════════
-- Remplace la carte de démarrage indicative de la 0095 (« Pain », « Soda /
-- Eau », « Macaron »…) par les 60 produits réellement vendus, aux prix des
-- affiches, photo comprise.
--
-- Les photos sont découpées dans les affiches et servies par le déploiement
-- de l'app (public/produits/*.jpg). `image_url` doit être ABSOLUE : le site
-- vitrine est un projet distinct qui consomme /api/public/menu en CORS, une
-- URL relative y pointerait sur son propre domaine.
--
-- Prix : les affiches donnent du TTC, la base stocke du HT → HT = TTC/(1+tva).
-- TVA (vente à emporter, cf. src/lib/tva.ts) : 5,5 % pain / viennoiserie /
-- pâtisserie / gourmandise, 10 % snacking et boissons.
--
-- Idempotent : rejouable sans dommage. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. La carte, telle qu'elle est affichée ─────────────────────────
drop table if exists _carte;
create temp table _carte (nom text, categorie text, ttc numeric, tva numeric, slug text, description text);

insert into _carte (nom, categorie, ttc, tva, slug, description) values
  -- Pains & baguettes (5,5 %)
  ('Baguette classique',            'Pain', 1.20, 5.5, 'baguette-classique',       null),
  ('Baguette Victoire',             'Pain', 1.40, 5.5, 'baguette-victoire',        null),
  ('Campestre multicéréales',       'Pain', 1.80, 5.5, 'campestre-multicereales',  null),
  ('Pain complet',                  'Pain', 2.30, 5.5, 'pain-complet',             null),
  ('Bâtard céréales',               'Pain', 2.80, 5.5, 'batard-cereales',          null),
  ('Bâtard maïs et graines',        'Pain', 2.80, 5.5, 'batard-mais-graines',      null),
  ('Pain lin-tournesol',            'Pain', 3.50, 5.5, 'pain-lin-tournesol',       null),
  ('Pavé multicéréales',            'Pain', 3.50, 5.5, 'pave-multicereales',       null),
  -- Viennoiseries (5,5 %)
  ('Croissant',                     'Viennoiserie', 1.20, 5.5, 'croissant',            null),
  ('Pain au chocolat',              'Viennoiserie', 1.30, 5.5, 'pain-au-chocolat',     null),
  ('Pain aux raisins',              'Viennoiserie', 1.60, 5.5, 'pain-aux-raisins',     null),
  ('Chausson aux pommes',           'Viennoiserie', 1.50, 5.5, 'chausson-aux-pommes',  null),
  -- Pâtisseries & desserts (5,5 %)
  ('Part de flan pâtissier',        'Pâtisserie', 2.50, 5.5, 'flan-patissier',      null),
  ('Tropézienne individuelle',      'Pâtisserie', 2.50, 5.5, 'tropezienne',         null),
  ('Tartelette citron meringuée',   'Pâtisserie', 2.90, 5.5, 'tartelette-citron',   null),
  ('Éclair au chocolat',            'Pâtisserie', 3.20, 5.5, 'eclair-chocolat',     null),
  ('Tiramisu individuel',           'Pâtisserie', 3.20, 5.5, 'tiramisu',            null),
  -- Gourmandises (5,5 %)
  ('Cannelé',                       'Gourmandise', 1.50, 5.5, 'cannele',                   null),
  ('Madeleine chocolat-noisette',   'Gourmandise', 1.50, 5.5, 'madeleine-choco-noisette',  null),
  ('Cookie chocolat',               'Gourmandise', 2.40, 5.5, 'cookie-chocolat',           null),
  ('Sacristain',                    'Gourmandise', 2.50, 5.5, 'sacristain',                null),
  ('Muffin chocolat-noisette',      'Gourmandise', 2.80, 5.5, 'muffin-choco-noisette',     null),
  ('Muffin citron',                 'Gourmandise', 2.80, 5.5, 'muffin-citron',             null),
  -- Sandwichs froids (10 %)
  ('Le Parisien',                   'Sandwich', 4.50, 10, 'sandwich-parisien', 'Jambon • Emmental • Beurre'),
  ('Le Poulet',                     'Sandwich', 4.90, 10, 'sandwich-poulet',   'Poulet rôti • Mayonnaise • Salade'),
  ('Le Rosette',                    'Sandwich', 4.50, 10, 'sandwich-rosette',  'Rosette • Beurre'),
  ('Le Nordique',                   'Sandwich', 5.50, 10, 'sandwich-nordique', 'Saumon fumé • Fromage frais'),
  -- Paninis chauds (10 %)
  ('Panini jambon-fromage',         'Panini', 4.50, 10, 'panini-jambon-fromage', 'Jambon • Emmental'),
  ('Panini poulet-pesto',           'Panini', 4.90, 10, 'panini-poulet-pesto',   'Poulet rôti • Pesto • Mozzarella'),
  ('Panini chèvre-miel',            'Panini', 4.90, 10, 'panini-chevre-miel',    'Chèvre • Miel'),
  -- Salades composées (10 %)
  ('Salade poulet-feta',            'Salade', 4.50, 10, 'salade-poulet-feta', 'Salade • Poulet rôti • Feta • Tomates • Concombre • Oignon rouge'),
  ('Salade italienne',              'Salade', 4.90, 10, 'salade-italienne',   'Salade • Jambon cru • Mozzarella • Tomates • Olives noires'),
  ('Salade saumon',                 'Salade', 5.50, 10, 'salade-saumon',      'Salade • Saumon fumé • Tomates • Concombre • Oignon rouge'),
  -- Pizzas (10 %)
  ('Pizza à la plaque Margherita',      'Pizza', 2.90, 10, 'pizza-plaque-margherita',      'La part'),
  ('Pizza à la plaque jambon-fromage',  'Pizza', 2.90, 10, 'pizza-plaque-jambon-fromage',  'La part'),
  ('Pizza ronde Reine',                 'Pizza', 3.90, 10, 'pizza-ronde-reine',            'Format 15–18 cm'),
  ('Pizza ronde poulet-pesto',          'Pizza', 3.90, 10, 'pizza-ronde-poulet-pesto',     'Format 15–18 cm'),
  ('Pizza ronde chèvre-miel',           'Pizza', 3.90, 10, 'pizza-ronde-chevre-miel',      'Format 15–18 cm'),
  -- Boissons fraîches (10 %)
  ('Eau plate 50 cl',               'Boisson fraîche', 1.00, 10, 'eau-plate',      null),
  ('Eau gazeuse 50 cl',             'Boisson fraîche', 1.50, 10, 'eau-gazeuse',    null),
  ('Coca-Cola 33 cl',               'Boisson fraîche', 1.80, 10, 'coca-cola',      null),
  ('Coca-Cola Zéro 33 cl',          'Boisson fraîche', 1.80, 10, 'coca-cola-zero', null),
  ('Ice Tea 33 cl',                 'Boisson fraîche', 1.80, 10, 'ice-tea',        null),
  ('Orangina 33 cl',                'Boisson fraîche', 1.80, 10, 'orangina',       null),
  ('Jus d''orange 25 cl',           'Boisson fraîche', 1.80, 10, 'jus-orange',     null),
  ('Jus de pomme 25 cl',            'Boisson fraîche', 1.80, 10, 'jus-pomme',      null),
  -- Boissons chaudes (10 %)
  ('Café expresso',                 'Boisson chaude', 1.20, 10, 'cafe-expresso',  null),
  ('Café allongé',                  'Boisson chaude', 1.20, 10, 'cafe-allonge',   null),
  ('Café noisette',                 'Boisson chaude', 1.50, 10, 'cafe-noisette',  null),
  ('Cappuccino',                    'Boisson chaude', 2.50, 10, 'cappuccino',     null),
  ('Chocolat chaud',                'Boisson chaude', 2.50, 10, 'chocolat-chaud', null),
  ('Thé',                           'Boisson chaude', 2.00, 10, 'the',            null),
  -- Formules (10 %)
  ('Formule salade + boisson',                      'Formule', 5.80, 10, 'formule-salade-boisson',    'Une salade composée + une boisson'),
  ('Formule sandwich ou panini + boisson',          'Formule', 6.20, 10, 'formule-sandwich-boisson',  'Un sandwich ou panini + une boisson'),
  ('Formule salade + boisson + dessert',            'Formule', 8.10, 10, 'formule-salade-complete',   'Une salade composée + une boisson + un dessert'),
  ('Formule sandwich ou panini + boisson + dessert','Formule', 8.50, 10, 'formule-sandwich-complete', 'Un sandwich ou panini + une boisson + un dessert'),
  -- Formules petit-déjeuner (10 %)
  ('Formule Express',                   'Formule petit-déjeuner', 2.20, 10, 'formule-express',         'Expresso ou allongé + croissant ou pain au chocolat'),
  ('Formule Douceur chaude',            'Formule petit-déjeuner', 3.40, 10, 'formule-douceur-chaude',  'Cappuccino ou chocolat chaud + croissant ou pain au chocolat'),
  ('Formule Petit-déjeuner complet',    'Formule petit-déjeuner', 3.80, 10, 'formule-pdj-complet',     'Expresso ou allongé + croissant ou pain au chocolat + jus d''orange ou de pomme 25 cl'),
  ('Formule Tartine',                   'Formule petit-déjeuner', 4.20, 10, 'formule-tartine',         'Expresso ou allongé + demi-baguette + beurre + confiture + jus d''orange ou de pomme 25 cl');

-- ─── 2. Reprise des produits équivalents de la 0095 ──────────────────
-- On renomme plutôt que supprimer/recréer : la ligne garde son id, donc les
-- commandes déjà passées continuent de pointer sur le bon produit.
do $$
declare e record;
begin
  for e in select * from (values
      ('Baguette',        'Baguette classique'),
      ('Café',            'Café expresso'),
      ('Flan pâtissier',  'Part de flan pâtissier'),
      ('Jus d''orange',   'Jus d''orange 25 cl')
    ) as t(ancien, nouveau)
  loop
    update recettes set nom = e.nouveau
     where nom = e.ancien and tag_destination = 'FOURNIL'
       and not exists (select 1 from recettes r2 where r2.nom = e.nouveau and r2.tag_destination = 'FOURNIL');
  end loop;
end $$;

-- ─── 3. Mise à jour des produits déjà présents ───────────────────────
update recettes r set
  categorie        = c.categorie,
  prix_vente_ht    = round(c.ttc / (1 + c.tva / 100.0), 2),
  tva              = c.tva,
  description      = c.description,
  image_url        = 'https://app-restaurant-livid.vercel.app/produits/' || c.slug || '.jpg',
  etablissement_id = (select id from etablissements where slug = 'fournil'),
  contient_alcool  = false,
  vendable_online  = true,
  actif            = true
from _carte c
where r.tag_destination = 'FOURNIL' and r.nom = c.nom;

-- ─── 4. Création des produits manquants ──────────────────────────────
insert into recettes
  (nom, categorie, tag_destination, description, prix_vente_ht, tva,
   contient_alcool, vendable_online, image_url, etablissement_id, actif)
select c.nom, c.categorie, 'FOURNIL', c.description,
       round(c.ttc / (1 + c.tva / 100.0), 2), c.tva,
       false, true,
       'https://app-restaurant-livid.vercel.app/produits/' || c.slug || '.jpg',
       (select id from etablissements where slug = 'fournil'), true
from _carte c
where not exists (
  select 1 from recettes r where r.tag_destination = 'FOURNIL' and r.nom = c.nom
);

-- ─── 5. Purge des articles de test qui ne sont pas sur les affiches ──
-- Suppression franche quand le produit n'a jamais été commandé ; sinon on se
-- contente de le désactiver, sans quoi la clé étrangère de commande_articles
-- bloquerait et on réécrirait l'historique des ventes.
do $$
declare r record; nb_suppr int := 0; nb_desact int := 0;
begin
  for r in select id, nom from recettes
            where tag_destination = 'FOURNIL' and nom not in (select nom from _carte)
  loop
    begin
      delete from recettes where id = r.id;
      nb_suppr := nb_suppr + 1;
      raise notice '  supprimé   : %', r.nom;
    exception when foreign_key_violation then
      update recettes set actif = false, vendable_online = false where id = r.id;
      nb_desact := nb_desact + 1;
      raise notice '  désactivé  : % (déjà présent sur une commande)', r.nom;
    end;
  end loop;
  raise notice '→ % supprimé(s), % désactivé(s)', nb_suppr, nb_desact;
end $$;

alter table recettes disable row level security;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb int; nb_off int; nb_sans_photo int;
begin
  select count(*) into nb from recettes where tag_destination = 'FOURNIL' and actif;
  select count(*) into nb_off from recettes where tag_destination = 'FOURNIL' and not actif;
  select count(*) into nb_sans_photo from recettes
   where tag_destination = 'FOURNIL' and actif and (image_url is null or image_url = '');
  raise notice '── Carte Fournil : % produit(s) actif(s), % désactivé(s) ──', nb, nb_off;
  raise notice '   produits actifs sans photo : %', nb_sans_photo;
  for r in
    select categorie, count(*) c, min(round(prix_vente_ht * (1 + tva/100.0), 2)) mini,
           max(round(prix_vente_ht * (1 + tva/100.0), 2)) maxi
      from recettes where tag_destination = 'FOURNIL' and actif
     group by categorie order by categorie
  loop
    raise notice '   %  : % produit(s)  de % € à % € TTC', rpad(r.categorie, 24), r.c, r.mini, r.maxi;
  end loop;
end $$;

drop table _carte;
