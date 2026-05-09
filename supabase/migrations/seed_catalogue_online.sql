-- ============================================================
-- SEED catalogue ONLINE — à exécuter dans Supabase SQL Editor
-- ============================================================
-- 1. Active vendable_online=true sur TOUTES les recettes SNACKING/PIZZA/BAR existantes
-- 2. Crée des recettes starter si manquantes (snacking + pizza + boissons)
-- 3. Ajoute image_url placeholder Unsplash sur les recettes online sans photo
--
-- Idempotent : peut être ré-exécuté sans dommage.
-- ============================================================

-- ─── 1. Active vendable_online sur recettes existantes ─────────
update recettes
set vendable_online = true
where actif = true
  and tag_destination in ('SNACKING', 'PIZZA', 'BAR')
  and vendable_online = false;


-- ─── 2. Crée recettes starter manquantes (par nom unique) ──────

-- SNACKING
insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
select * from (values
  ('Croque-Monsieur',  'Snacking', 'SNACKING', 'Pain de mie, jambon, emmental fondu, béchamel maison.',         8, 1, 8.64,  10, false, true, 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=800&q=80', true),
  ('Salade César',     'Snacking', 'SNACKING', 'Romaine, poulet grillé, parmesan, croûtons, sauce César.',      8, 1, 10.91, 10, false, true, 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80', true),
  ('Wrap Poulet',      'Snacking', 'SNACKING', 'Tortilla, poulet, crudités, sauce yaourt.',                     8, 1, 9.55,  10, false, true, 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800&q=80', true),
  ('Frites maison',    'Snacking', 'SNACKING', 'Pommes de terre fraîches, double cuisson.',                     8, 1, 5.00,  10, false, true, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80', true),
  ('Tacos Mexicain',   'Snacking', 'SNACKING', 'Galette, viande hachée, fromage, sauce piquante.',              8, 1, 10.00, 10, false, true, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80', true)
) as v(nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
where not exists (select 1 from recettes r where r.nom = v.nom);

-- PIZZA
insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
select * from (values
  ('Pizza Margherita', 'Pizzas', 'PIZZA', 'Tomate, mozzarella, basilic frais.',                       12, 1, 10.00, 10, false, true, 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=800&q=80', true),
  ('Pizza Reine',      'Pizzas', 'PIZZA', 'Tomate, mozzarella, jambon, champignons.',                 12, 1, 11.82, 10, false, true, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80', true),
  ('Pizza 4 Fromages', 'Pizzas', 'PIZZA', 'Mozzarella, gorgonzola, chèvre, parmesan.',                12, 1, 13.18, 10, false, true, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80', true),
  ('Pizza Diavola',    'Pizzas', 'PIZZA', 'Tomate, mozzarella, chorizo, piments, olives.',            12, 1, 12.73, 10, false, true, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80', true),
  ('Calzone',          'Pizzas', 'PIZZA', 'Pizza fermée : jambon, champignons, mozzarella, ricotta.', 12, 1, 13.64, 10, false, true, 'https://images.unsplash.com/photo-1593504049359-74330189a345?w=800&q=80', true)
) as v(nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
where not exists (select 1 from recettes r where r.nom = v.nom);

-- BAR (boissons + alcool en TVA 20%)
insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
select * from (values
  ('Coca-Cola 33cl',     'Boissons',  'BAR', 'Bouteille verre fraîche.',                       2, 1, 3.18, 10, false, true, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&q=80', true),
  ('Eau plate 50cl',     'Boissons',  'BAR', 'Eau de source.',                                 2, 1, 2.73, 10, false, true, 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=800&q=80', true),
  ('Bière 1664 (25cl)',  'Boissons',  'BAR', 'Bière blonde pression.',                         2, 1, 3.75, 20, true,  true, 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=80', true),
  ('Verre de vin rouge', 'Vins',      'BAR', 'Sélection du chef, 12cl.',                       2, 1, 4.17, 20, true,  true, 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80', true),
  ('Mojito',             'Cocktails', 'BAR', 'Rhum, citron vert, menthe, sucre, eau gazeuse.', 5, 1, 7.08, 20, true,  true, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80', true),
  ('Café',               'Boissons',  'BAR', 'Expresso italien.',                              2, 1, 2.00, 10, false, true, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', true)
) as v(nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, contient_alcool, vendable_online, image_url, actif)
where not exists (select 1 from recettes r where r.nom = v.nom);


-- ─── 3. Ajoute image_url placeholder sur recettes online sans photo ──
update recettes set image_url = 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80'
where vendable_online = true and tag_destination = 'SNACKING' and (image_url is null or image_url = '');

update recettes set image_url = 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80'
where vendable_online = true and tag_destination = 'PIZZA' and (image_url is null or image_url = '');

update recettes set image_url = 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80'
where vendable_online = true and tag_destination = 'BAR' and (image_url is null or image_url = '');


-- ─── Diagnostic final ───
select
  'Catalogue ONLINE après seed' as section,
  tag_destination,
  count(*) as nb_recettes,
  sum(case when image_url is not null and image_url != '' then 1 else 0 end) as avec_photo
from recettes
where actif = true and vendable_online = true
group by tag_destination
order by tag_destination;
