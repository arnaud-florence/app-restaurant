-- ═══════════════════════════════════════════════════════════════════════
-- CLEANUP : désactive TOUTES les anciennes recettes du Relais des Saveurs
-- puis réactive uniquement les 103 nouvelles (par nom exact du seed)
-- À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Désactive tout ce qui est lié à cet établissement
UPDATE recettes
SET actif = false
WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076';

-- 2) Réactive uniquement les 103 nouvelles recettes (par nom EXACT)
UPDATE recettes
SET actif = true
WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076'
  AND nom IN (
    -- Pizzas (13)
    'La Margherita', 'La Reine', 'La 4 Fromages', 'La Napolitaine', 'La Végétarienne',
    'La Provençale', 'La Forestière', 'La Chèvre Miel', 'La Saveurs', 'La Montagnarde',
    'La Truffe', 'La Surf & Turf', 'La Calzone',

    -- Snacking
    'Burger Classique', 'Burger Relais', 'Burger Végé',
    'Tacos 1 viande', 'Tacos 2 viandes', 'Tacos 3 viandes',
    'Panini Jambon Fromage', 'Panini Poulet', 'Sandwich Thon',
    'Salade César', 'Salade Chèvre Chaud', 'Salade du Marché',
    'Menu Simple', 'Menu Complet', 'Menu Enfant',

    -- Brasserie
    'Plat du Jour', 'Formule Midi',
    'Soupe du jour', 'Salade verte', 'Charcuterie maison',
    'Entrecôte sauce poivre + frites', 'Poulet rôti aux herbes + légumes',
    'Poisson du jour + légumes vapeur', 'Andouillette grillée moutarde + frites',
    'Plat végétarien du jour',
    'Crème brûlée maison', 'Fondant chocolat', 'Glaces et sorbets', 'Tarte du jour',

    -- Petit déjeuner
    'Café expresso', 'Café au lait', 'Jus d''orange frais',
    'Formule Petit Déj', 'Formule Complète',

    -- Vins de Provence (bouteilles + verres)
    'Côtes de Provence Rosé — bouteille', 'Côtes de Provence Rouge — bouteille',
    'Côtes de Provence Blanc — bouteille', 'Bandol Rosé — bouteille',
    'Bandol Rouge — bouteille', 'Coteaux Varois Rosé — bouteille',
    'Côtes de Provence Rosé — verre', 'Côtes de Provence Rouge — verre',
    'Côtes de Provence Blanc — verre', 'Bandol Rosé — verre',
    'Bandol Rouge — verre', 'Coteaux Varois Rosé — verre',

    -- Autres vins
    'Bordeaux Rouge — bouteille', 'Côtes du Rhône Rouge — bouteille',
    'Bourgogne Blanc Chardonnay — bouteille', 'Muscadet Blanc — bouteille',
    'Champagne Brut — bouteille',
    'Bordeaux Rouge — verre', 'Côtes du Rhône Rouge — verre',
    'Bourgogne Blanc — verre', 'Muscadet Blanc — verre', 'Champagne Brut — coupe',

    -- Bières pression
    'Demi 25cl', 'Pinte 50cl',

    -- Bières bouteille
    'Heineken 33cl', 'Kronenbourg 33cl', 'Corona 33cl',
    'Leffe Blonde 33cl', 'Leffe Brune 33cl', 'Desperados 33cl',
    'Bière sans alcool 33cl',

    -- Softs canettes
    'Coca-Cola 33cl', 'Coca-Cola Zero 33cl', 'Orangina 33cl',
    'Sprite 33cl', 'Ice Tea Pêche 33cl', 'Schweppes Agrumes 33cl',
    'Red Bull 25cl',

    -- Eaux et jus
    'Eau plate 50cl', 'Eau pétillante 50cl', 'Eau plate 1L', 'Eau pétillante 1L',
    'Jus d''orange', 'Jus de pomme', 'Jus d''ananas', 'Jus de tomate',

    -- Boissons chaudes
    'Café expresso (bar)', 'Café allongé', 'Café au lait (bar)',
    'Cappuccino', 'Chocolat chaud', 'Thé et infusions',

    -- Cocktails sans alcool
    'Virgin Mojito', 'Tropical Sunrise', 'Lemonade Maison',
    'Fruit Punch', 'Shirley Temple',

    -- Cocktails classiques
    'Mojito', 'Margarita', 'Aperol Spritz', 'Kir Royal',
    'Sangria — verre', 'Sangria — pichet',

    -- Cocktails signature
    'Relais Sunset', 'Provence Mule', 'Pink Provence',

    -- Apéritifs
    'Pastis 51', 'Ricard', 'Porto Rouge', 'Porto Blanc',
    'Martini Blanc', 'Martini Rouge', 'Whisky'
  );

-- 3) Vérification : combien sont actifs vs inactifs ?
SELECT
  CASE WHEN actif THEN 'ACTIF' ELSE 'INACTIF (anciennes)' END as statut,
  COUNT(*) as nb
FROM recettes
WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076'
GROUP BY actif
ORDER BY actif DESC;
