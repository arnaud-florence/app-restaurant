-- ═══════════════════════════════════════════════════════════════════════
-- SEED LE RELAIS DES SAVEURS — RECETTES V2 (schéma réel)
-- etablissement_id : 0e764c87-1586-4654-ae28-006e42ac2076
-- Colonnes correctes : tag_destination, prix_vente_ht, tva, allergenes_complementaires
-- TVA : 10% pour restauration / 20% pour alcools
-- prix_vente_ht = ROUND(prix_ttc / (1 + tva/100), 2)
-- ═══════════════════════════════════════════════════════════════════════

-- ⚠️ Optionnel : décommente pour effacer les anciennes recettes de cet établissement
-- DELETE FROM recettes WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076';

INSERT INTO recettes
  (etablissement_id, nom, categorie, tag_destination, description, prix_vente_ht, tva,
   contient_alcool, vendable_online, allergenes_complementaires, actif)
VALUES

-- ─── PIZZAS (13) — TVA 10%, vendables en ligne ─────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Margherita',     'Les Classiques',    'PIZZA',    'Tomate, mozzarella, basilic frais',                                              ROUND(11/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Reine',          'Les Classiques',    'PIZZA',    'Tomate, mozzarella, jambon, champignons',                                        ROUND(13/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La 4 Fromages',     'Les Classiques',    'PIZZA',    'Crème, mozzarella, gorgonzola, chèvre, parmesan',                                ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Napolitaine',    'Les Classiques',    'PIZZA',    'Tomate, mozzarella, anchois, câpres, olives',                                    ROUND(13/1.10, 2), 10, false, true, ARRAY['gluten','lait','poisson'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Végétarienne',   'Les Classiques',    'PIZZA',    'Tomate, mozzarella, poivrons, courgettes, aubergines, olives',                   ROUND(13/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Provençale',     'Signatures',        'PIZZA',    'Tomate, mozzarella, tapenade, tomates confites, herbes de Provence',             ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Forestière',     'Signatures',        'PIZZA',    'Crème, mozzarella, champignons, lardons, ail, persil',                           ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Chèvre Miel',    'Signatures',        'PIZZA',    'Crème, mozzarella, chèvre, miel, noix, roquette',                                ROUND(15/1.10, 2), 10, false, true, ARRAY['gluten','lait','fruits_coque'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Saveurs',        'Signatures',        'PIZZA',    'Tomate, mozzarella, jambon cru, roquette, parmesan, tomates cerises',            ROUND(15/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Montagnarde',    'Signatures',        'PIZZA',    'Crème, mozzarella, reblochon, pommes de terre, lardons, oignons',                ROUND(16/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Truffe',         'Les Gourmandes',    'PIZZA',    'Crème, mozzarella, champignons, jambon cru, huile de truffe',                    ROUND(17/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Surf & Turf',    'Les Gourmandes',    'PIZZA',    'Tomate, mozzarella, crevettes, chorizo, poivrons',                               ROUND(16/1.10, 2), 10, false, true, ARRAY['gluten','lait','crustaces'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'La Calzone',        'Les Gourmandes',    'PIZZA',    'Tomate, mozzarella, jambon, champignons, œuf',                                   ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait','oeuf'], true),

-- ─── SNACKING — TVA 10%, vendable en ligne ──────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Burger Classique',  'Les Burgers',       'SNACKING', 'Steak haché, cheddar, salade, tomate, oignons, sauce maison',                  ROUND(12/1.10, 2), 10, false, true, ARRAY['gluten','lait','oeuf'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Burger Relais',     'Les Burgers',       'SNACKING', 'Steak haché, bacon, cheddar, oignons caramélisés, sauce BBQ',                  ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Burger Végé',       'Les Burgers',       'SNACKING', 'Steak végétal, cheddar, avocat, salade, tomate',                               ROUND(13/1.10, 2), 10, false, true, ARRAY['gluten','lait','soja'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Tacos 1 viande',    'Les Tacos',         'SNACKING', 'Viande au choix, frites, fromage fondu, sauce',                                 ROUND(9/1.10, 2),  10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Tacos 2 viandes',   'Les Tacos',         'SNACKING', '2 viandes au choix, frites, fromage fondu, sauce',                              ROUND(11/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Tacos 3 viandes',   'Les Tacos',         'SNACKING', '3 viandes au choix, frites, fromage fondu, sauce',                              ROUND(13/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Panini Jambon Fromage', 'Sandwichs',     'SNACKING', 'Jambon, emmental, tomate, beurre',                                              ROUND(7/1.10, 2),  10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Panini Poulet',     'Sandwichs',         'SNACKING', 'Poulet, mozzarella, pesto, tomates confites',                                   ROUND(8/1.10, 2),  10, false, true, ARRAY['gluten','lait','fruits_coque'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Sandwich Thon',     'Sandwichs',         'SNACKING', 'Thon, œuf, tomate, salade, mayonnaise',                                         ROUND(7/1.10, 2),  10, false, true, ARRAY['gluten','oeuf','poisson'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Salade César',      'Salades',           'SNACKING', 'Poulet grillé, parmesan, croûtons, sauce césar',                                ROUND(11/1.10, 2), 10, false, true, ARRAY['gluten','lait','oeuf','poisson'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Salade Chèvre Chaud', 'Salades',         'SNACKING', 'Chèvre rôti, lardons, noix, miel, mesclun',                                     ROUND(12/1.10, 2), 10, false, true, ARRAY['lait','fruits_coque'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Salade du Marché',  'Salades',           'SNACKING', 'Crudités de saison, œuf, thon, vinaigrette maison',                             ROUND(10/1.10, 2), 10, false, true, ARRAY['oeuf','poisson','moutarde'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Menu Simple',       'Les Menus',         'SNACKING', 'Burger ou Tacos + boisson',                                                     ROUND(14/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Menu Complet',      'Les Menus',         'SNACKING', 'Burger ou Tacos + frites + boisson',                                            ROUND(16/1.10, 2), 10, false, true, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Menu Enfant',       'Les Menus',         'SNACKING', 'Mini burger ou nuggets + frites + boisson + dessert',                            ROUND(9/1.10, 2),  10, false, true, ARRAY['gluten','lait','oeuf'], true),

-- ─── BRASSERIE — TVA 10%, NON vendable en ligne (sur place) ────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Plat du Jour',      'Brasserie midi',    'CUISINE',  'Entrée + Plat + Dessert. Au tableau noir.',                                     ROUND(14.90/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Formule Midi',      'Brasserie midi',    'CUISINE',  'Plat + Dessert ou Entrée + Plat',                                                ROUND(12.90/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Soupe du jour',     'Entrées',           'CUISINE',  'Selon saison',                                                                  ROUND(5/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Salade verte',      'Entrées',           'CUISINE',  'Mesclun, vinaigrette maison',                                                    ROUND(4/1.10, 2),  10, false, false, ARRAY['moutarde'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Charcuterie maison', 'Entrées',          'CUISINE',  'Assortiment du Var',                                                             ROUND(8/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Entrecôte sauce poivre + frites', 'Plats', 'CUISINE', 'Pièce du boucher, sauce au poivre, frites maison',                              ROUND(18/1.10, 2), 10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Poulet rôti aux herbes + légumes', 'Plats', 'CUISINE', 'Poulet fermier, légumes de saison',                                            ROUND(15/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Poisson du jour + légumes vapeur', 'Plats', 'CUISINE', 'Selon arrivage',                                                               ROUND(16/1.10, 2), 10, false, false, ARRAY['poisson'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Andouillette grillée moutarde + frites', 'Plats', 'CUISINE', 'Sauce moutarde, frites maison',                                          ROUND(15/1.10, 2), 10, false, false, ARRAY['moutarde'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Plat végétarien du jour', 'Plats',       'CUISINE',  'Selon inspiration du chef',                                                      ROUND(13/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Crème brûlée maison', 'Desserts',        'CUISINE',  'Vanille de Madagascar',                                                          ROUND(6/1.10, 2),  10, false, false, ARRAY['lait','oeuf'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Fondant chocolat',  'Desserts',          'CUISINE',  'Cœur coulant chocolat noir',                                                     ROUND(6/1.10, 2),  10, false, false, ARRAY['lait','oeuf','gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Glaces et sorbets', 'Desserts',          'CUISINE',  'Boules au choix, parfums du jour',                                               ROUND(5/1.10, 2),  10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Tarte du jour',     'Desserts',          'CUISINE',  'Faite maison, change selon saison',                                              ROUND(6/1.10, 2),  10, false, false, ARRAY['lait','oeuf','gluten'], true),

-- ─── PETIT DÉJEUNER — TVA 10% ──────────────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Café expresso',     'Petit déjeuner',    'CUISINE',  'Sélection italienne',                                                            ROUND(1.50/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Café au lait',      'Petit déjeuner',    'CUISINE',  '',                                                                               ROUND(2/1.10, 2),  10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Jus d''orange frais', 'Petit déjeuner',  'CUISINE',  'Pressé minute',                                                                  ROUND(3/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Formule Petit Déj', 'Petit déjeuner',    'CUISINE',  'Café + croissant + jus',                                                         ROUND(6/1.10, 2),  10, false, false, ARRAY['gluten','lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Formule Complète',  'Petit déjeuner',    'CUISINE',  'Café + pain + beurre + confiture + jus + viennoiserie',                          ROUND(9/1.10, 2),  10, false, false, ARRAY['gluten','lait'], true),

-- ─── VINS PROVENCE — TVA 20%, bouteilles vendables en ligne ────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Rosé — bouteille',  'Vins de Provence', 'BAR', 'Rosé du Var, fruité et léger. 75 cl',  ROUND(15/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Rouge — bouteille', 'Vins de Provence', 'BAR', 'Rouge structuré varois. 75 cl',         ROUND(16/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Blanc — bouteille', 'Vins de Provence', 'BAR', 'Blanc minéral et frais. 75 cl',         ROUND(15/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bandol Rosé — bouteille',             'Vins de Provence', 'BAR', 'Le grand cru de Provence. 75 cl',       ROUND(22/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bandol Rouge — bouteille',            'Vins de Provence', 'BAR', 'Mourvèdre puissant. 75 cl',             ROUND(25/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Coteaux Varois Rosé — bouteille',     'Vins de Provence', 'BAR', 'Frais et facile. 75 cl',                ROUND(14/1.20, 2), 20, true, true, ARRAY['sulfites'], true),

-- Vins au verre — TVA 20%, sur place
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Rosé — verre',  'Vins au verre', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Rouge — verre', 'Vins au verre', 'BAR', '', ROUND(4.50/1.20, 2), 20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes de Provence Blanc — verre', 'Vins au verre', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bandol Rosé — verre',             'Vins au verre', 'BAR', '', ROUND(6/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bandol Rouge — verre',            'Vins au verre', 'BAR', '', ROUND(7/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Coteaux Varois Rosé — verre',     'Vins au verre', 'BAR', '', ROUND(3.50/1.20, 2), 20, true, false, ARRAY['sulfites'], true),

-- ─── AUTRES VINS — bouteilles vendables en ligne ───────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bordeaux Rouge — bouteille',          'Autres vins', 'BAR', 'Assemblage de garde. 75 cl',           ROUND(18/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes du Rhône Rouge — bouteille',    'Autres vins', 'BAR', 'Rond et épicé. 75 cl',                  ROUND(16/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bourgogne Blanc Chardonnay — bouteille', 'Autres vins', 'BAR', 'Élégant et minéral. 75 cl',          ROUND(22/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Muscadet Blanc — bouteille',          'Autres vins', 'BAR', 'Sec et iodé. 75 cl',                    ROUND(15/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Champagne Brut — bouteille',          'Autres vins', 'BAR', 'Pour les grandes occasions. 75 cl',     ROUND(35/1.20, 2), 20, true, true, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bordeaux Rouge — verre',              'Autres vins au verre', 'BAR', '', ROUND(5/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Côtes du Rhône Rouge — verre',        'Autres vins au verre', 'BAR', '', ROUND(4.50/1.20, 2), 20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bourgogne Blanc — verre',             'Autres vins au verre', 'BAR', '', ROUND(6/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Muscadet Blanc — verre',              'Autres vins au verre', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Champagne Brut — coupe',              'Autres vins au verre', 'BAR', '', ROUND(9/1.20, 2),    20, true, false, ARRAY['sulfites'], true),

-- ─── BIÈRES PRESSION — TVA 20%, sur place ──────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Demi 25cl',         'Bières pression',  'BAR', '', ROUND(3/1.20, 2),    20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Pinte 50cl',        'Bières pression',  'BAR', '', ROUND(5.50/1.20, 2), 20, true, false, ARRAY['gluten'], true),

-- ─── BIÈRES BOUTEILLE — TVA 20%, sur place ─────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Heineken 33cl',     'Bières bouteille', 'BAR', '', ROUND(3.50/1.20, 2), 20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Kronenbourg 33cl',  'Bières bouteille', 'BAR', '', ROUND(3/1.20, 2),    20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Corona 33cl',       'Bières bouteille', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Leffe Blonde 33cl', 'Bières bouteille', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Leffe Brune 33cl',  'Bières bouteille', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Desperados 33cl',   'Bières bouteille', 'BAR', 'Aromatisée tequila', ROUND(4.50/1.20, 2), 20, true, false, ARRAY['gluten'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Bière sans alcool 33cl', 'Bières bouteille', 'BAR', '', ROUND(3/1.10, 2), 10, false, false, ARRAY['gluten'], true),

-- ─── SOFTS CANETTES — TVA 10%, vendables en ligne ──────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Coca-Cola 33cl',         'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Coca-Cola Zero 33cl',    'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Orangina 33cl',          'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Sprite 33cl',            'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Ice Tea Pêche 33cl',     'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Schweppes Agrumes 33cl', 'Softs', 'BAR', 'Canette', ROUND(3/1.10, 2), 10, false, true, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Red Bull 25cl',          'Softs', 'BAR', 'Canette', ROUND(4/1.10, 2), 10, false, true, ARRAY[]::text[], true),

-- Eaux et jus
('0e764c87-1586-4654-ae28-006e42ac2076', 'Eau plate 50cl',      'Eaux', 'BAR', '',           ROUND(2/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Eau pétillante 50cl', 'Eaux', 'BAR', '',           ROUND(2/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Eau plate 1L',        'Eaux', 'BAR', '',           ROUND(3.50/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Eau pétillante 1L',   'Eaux', 'BAR', '',           ROUND(3.50/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Jus d''orange',       'Jus',  'BAR', 'En carafe',  ROUND(3/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Jus de pomme',        'Jus',  'BAR', '',           ROUND(3/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Jus d''ananas',       'Jus',  'BAR', '',           ROUND(3/1.10, 2),  10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Jus de tomate',       'Jus',  'BAR', '',           ROUND(3/1.10, 2),  10, false, false, ARRAY[]::text[], true),

-- ─── BOISSONS CHAUDES — TVA 10% ────────────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Café expresso (bar)', 'Boissons chaudes', 'BAR', '',                     ROUND(1.50/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Café allongé',        'Boissons chaudes', 'BAR', '',                     ROUND(2/1.10, 2),    10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Café au lait (bar)',  'Boissons chaudes', 'BAR', '',                     ROUND(2.50/1.10, 2), 10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Cappuccino',          'Boissons chaudes', 'BAR', 'Mousse de lait crémeuse', ROUND(3/1.10, 2),    10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Chocolat chaud',      'Boissons chaudes', 'BAR', '',                     ROUND(3/1.10, 2),    10, false, false, ARRAY['lait'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Thé et infusions',    'Boissons chaudes', 'BAR', 'Au choix',              ROUND(2.50/1.10, 2), 10, false, false, ARRAY[]::text[], true),

-- ─── COCKTAILS SANS ALCOOL — TVA 10% ───────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Virgin Mojito',     'Cocktails sans alcool', 'BAR', 'Citron vert, menthe, sucre, eau gazeuse', ROUND(5/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Tropical Sunrise',  'Cocktails sans alcool', 'BAR', 'Jus d''orange, jus d''ananas, grenadine',  ROUND(5/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Lemonade Maison',   'Cocktails sans alcool', 'BAR', 'Citron pressé, sucre, eau gazeuse, menthe', ROUND(5/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Fruit Punch',       'Cocktails sans alcool', 'BAR', 'Mélange de jus exotiques, grenadine',     ROUND(5/1.10, 2), 10, false, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Shirley Temple',    'Cocktails sans alcool', 'BAR', 'Ginger ale, grenadine, orange',           ROUND(5/1.10, 2), 10, false, false, ARRAY[]::text[], true),

-- ─── COCKTAILS CLASSIQUES — TVA 20% ────────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Mojito',            'Cocktails classiques', 'BAR', 'Rhum blanc, citron vert, menthe, sucre, eau gazeuse', ROUND(8/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Margarita',         'Cocktails classiques', 'BAR', 'Tequila, triple sec, citron vert',                     ROUND(8/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Aperol Spritz',     'Cocktails classiques', 'BAR', 'Aperol, Prosecco, eau gazeuse, orange',                ROUND(8/1.20, 2), 20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Kir Royal',         'Cocktails classiques', 'BAR', 'Crème de cassis, Champagne',                            ROUND(9/1.20, 2), 20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Sangria — verre',   'Cocktails classiques', 'BAR', 'Vin rouge, fruits, orange, cannelle',                   ROUND(7/1.20, 2), 20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Sangria — pichet',  'Cocktails classiques', 'BAR', 'Pichet 50cl à partager',                                ROUND(22/1.20, 2), 20, true, false, ARRAY['sulfites'], true),

-- ─── COCKTAILS SIGNATURE — TVA 20% ─────────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Relais Sunset',     'Signatures du Relais', 'BAR', 'Rhum, jus de mangue, grenadine, citron vert',          ROUND(9/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Provence Mule',     'Signatures du Relais', 'BAR', 'Vodka, gingembre, citron, eau gazeuse, romarin',        ROUND(9/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Pink Provence',     'Signatures du Relais', 'BAR', 'Gin, rosé de Provence, pamplemousse, tonic',            ROUND(9/1.20, 2), 20, true, false, ARRAY['sulfites'], true),

-- ─── APÉRITIFS — TVA 20% ───────────────────────────────────────────
('0e764c87-1586-4654-ae28-006e42ac2076', 'Pastis 51',         'Apéritifs', 'BAR', '', ROUND(3.50/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Ricard',            'Apéritifs', 'BAR', '', ROUND(3.50/1.20, 2), 20, true, false, ARRAY[]::text[], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Porto Rouge',       'Apéritifs', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Porto Blanc',       'Apéritifs', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Martini Blanc',     'Apéritifs', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Martini Rouge',     'Apéritifs', 'BAR', '', ROUND(4/1.20, 2),    20, true, false, ARRAY['sulfites'], true),
('0e764c87-1586-4654-ae28-006e42ac2076', 'Whisky',            'Apéritifs', 'BAR', '', ROUND(5/1.20, 2),    20, true, false, ARRAY[]::text[], true)
;
