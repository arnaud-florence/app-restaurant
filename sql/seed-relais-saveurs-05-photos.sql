-- ═══════════════════════════════════════════════════════════════════════
-- SEED PHOTOS UNSPLASH pour les 120 recettes du Relais des Saveurs
-- Photos thématiques par catégorie. URLs Unsplash directes (CDN gratuit, stable).
-- ═══════════════════════════════════════════════════════════════════════

-- Helper : rappel du UPDATE
-- UPDATE recettes SET image_url = 'URL' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN (...);

-- ─── PIZZAS (13) ──────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Margherita';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Reine';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La 4 Fromages';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Napolitaine';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Végétarienne';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Provençale';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Forestière';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1571066811602-716837d681de?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Chèvre Miel';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1601924582970-9238bcb495d9?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Saveurs';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Montagnarde';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Truffe';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Surf & Turf';

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1620374643409-5b6e7eb04bb1?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'La Calzone';

-- ─── BURGERS (3) ──────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Burger Classique';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Burger Relais';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Burger Végé';

-- ─── TACOS (3) ────────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Tacos 1 viande', 'Tacos 2 viandes', 'Tacos 3 viandes');

-- ─── PANINIS / SANDWICH (3) ───────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Panini Jambon Fromage', 'Panini Poulet');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1539252554935-80c8cb0d6191?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Sandwich Thon';

-- ─── SALADES (3) ──────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Salade César';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551248429-40975aa4de74?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Salade Chèvre Chaud';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Salade du Marché';

-- ─── MENUS (3) ────────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Menu Simple', 'Menu Complet', 'Menu Enfant');

-- ─── BRASSERIE — ENTRÉES (3) ──────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Soupe du jour';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Salade verte';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1601313814040-5e4fb86e07c4?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Charcuterie maison';

-- ─── BRASSERIE — PLATS (5) ────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Entrecôte sauce poivre + frites';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Poulet rôti aux herbes + légumes';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Poisson du jour + légumes vapeur';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Andouillette grillée moutarde + frites';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Plat végétarien du jour';

-- ─── BRASSERIE — FORMULES (2) ─────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Plat du Jour', 'Formule Midi');

-- ─── DESSERTS (4) ─────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Crème brûlée maison';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Fondant chocolat';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Glaces et sorbets';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1488474333354-0a3e5c2e05d0?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Tarte du jour';

-- ─── PETIT DÉJEUNER (5) ───────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Café expresso';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Café au lait';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1542444459-db63c3e0900a?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Jus d''orange frais';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Formule Petit Déj', 'Formule Complète');

-- ─── VINS PROVENCE — bouteilles ───────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1568213816046-0ee1c42bd559?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Rosé — bouteille', 'Bandol Rosé — bouteille', 'Coteaux Varois Rosé — bouteille');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Rouge — bouteille', 'Bandol Rouge — bouteille', 'Bordeaux Rouge — bouteille', 'Côtes du Rhône Rouge — bouteille');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1474722883778-792e7990302f?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Blanc — bouteille', 'Bourgogne Blanc Chardonnay — bouteille', 'Muscadet Blanc — bouteille');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Champagne Brut — bouteille';

-- ─── VINS au verre (10) ───────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1568213816046-0ee1c42bd559?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Rosé — verre', 'Bandol Rosé — verre', 'Coteaux Varois Rosé — verre');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Rouge — verre', 'Bandol Rouge — verre', 'Bordeaux Rouge — verre', 'Côtes du Rhône Rouge — verre');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1474722883778-792e7990302f?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Côtes de Provence Blanc — verre', 'Bourgogne Blanc — verre', 'Muscadet Blanc — verre');

UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Champagne Brut — coupe';

-- ─── BIÈRES PRESSION (2) ──────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Demi 25cl', 'Pinte 50cl');

-- ─── BIÈRES BOUTEILLE (7) ─────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Heineken 33cl', 'Kronenbourg 33cl', 'Corona 33cl', 'Leffe Blonde 33cl', 'Leffe Brune 33cl', 'Desperados 33cl', 'Bière sans alcool 33cl');

-- ─── SOFTS CANETTES (7) ───────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Coca-Cola 33cl', 'Coca-Cola Zero 33cl');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Orangina 33cl', 'Sprite 33cl', 'Schweppes Agrumes 33cl');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Ice Tea Pêche 33cl';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Red Bull 25cl';

-- ─── EAUX (4) ─────────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Eau plate 50cl', 'Eau pétillante 50cl', 'Eau plate 1L', 'Eau pétillante 1L');

-- ─── JUS (4) ──────────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1542444459-db63c3e0900a?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Jus d''orange';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1576673442511-7e39b6545c87?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Jus de pomme';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Jus d''ananas';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Jus de tomate';

-- ─── BOISSONS CHAUDES (6) ─────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Café expresso (bar)', 'Café allongé');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Café au lait (bar)', 'Cappuccino');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1517578239113-b03992dcdd25?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Chocolat chaud';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1597318181409-9deb0ca8fb1d?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Thé et infusions';

-- ─── COCKTAILS SANS ALCOOL (5) ────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Virgin Mojito', 'Lemonade Maison');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1521578638076-5b51a8a61d04?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Tropical Sunrise', 'Fruit Punch', 'Shirley Temple');

-- ─── COCKTAILS CLASSIQUES (6) ─────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Mojito';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Margarita';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Aperol Spritz';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Kir Royal';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551751299-1b51cab2694c?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Sangria — verre', 'Sangria — pichet');

-- ─── COCKTAILS SIGNATURE (3) ──────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Relais Sunset';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1582106245687-cbb466a9f07f?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Provence Mule';
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1551751299-1b51cab2694c?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Pink Provence';

-- ─── APÉRITIFS (7) ────────────────────────────────────────────────
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Pastis 51', 'Ricard');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom IN ('Porto Rouge', 'Porto Blanc', 'Martini Blanc', 'Martini Rouge');
UPDATE recettes SET image_url = 'https://images.unsplash.com/photo-1582819509237-d6b4f76b5e69?w=800&q=80&auto=format&fit=crop' WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076' AND nom = 'Whisky';

-- ─── VÉRIFICATION ─────────────────────────────────────────────────
SELECT
  CASE WHEN image_url IS NOT NULL THEN 'AVEC PHOTO' ELSE 'SANS PHOTO' END as statut,
  COUNT(*) as nb
FROM recettes
WHERE etablissement_id = '0e764c87-1586-4654-ae28-006e42ac2076'
  AND actif = true
GROUP BY image_url IS NOT NULL;
