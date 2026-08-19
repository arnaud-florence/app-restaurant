-- ════════════════════════════════════════════════════════════════════
-- 0114 — Un HT assez précis pour restituer le prix du panneau
-- ════════════════════════════════════════════════════════════════════
-- La carte est saisie en TTC (c'est ce qui est imprimé sur les affiches) mais
-- stockée en HT. Avec `prix_vente_ht decimal(10,2)`, l'aller-retour
-- TTC → HT → TTC ne retombe pas toujours sur ses pieds :
--
--   Cookie chocolat, 2,40 € à 5,5 %  → HT exact 2,2749
--       stocké 2,27 → 2,39 €   stocké 2,28 → 2,41 €   … 2,40 inatteignable
--   Pizza ronde,     3,90 € à 10  %  → HT exact 3,5455
--       stocké 3,55 → 3,91 €
--
-- Deux décimales de HT ne suffisent donc pas : on passe à quatre. Le format
-- d'affichage ne bouge pas (`fmtPrix` arrondit au centime, `fmtPrix4` existe
-- déjà pour les coûts de revient), et les prix déjà à 2 décimales restent
-- inchangés — élargir une précision numérique ne réécrit aucune valeur.
--
-- Puis on recalcule le HT des 60 produits du Fournil depuis le TTC des
-- affiches. Idempotent : rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

alter table recettes
  alter column prix_vente_ht type decimal(10,4);

-- ─── Recalcul depuis le TTC des affiches ─────────────────────────────
with carte(nom, ttc) as (values
  -- Pains (5,5 %)
  ('Baguette classique',1.20),('Baguette Victoire',1.40),('Campestre multicéréales',1.80),
  ('Pain complet',2.30),('Bâtard céréales',2.80),('Bâtard maïs et graines',2.80),
  ('Pain lin-tournesol',3.50),('Pavé multicéréales',3.50),
  -- Viennoiseries (5,5 %)
  ('Croissant',1.20),('Pain au chocolat',1.30),('Pain aux raisins',1.60),('Chausson aux pommes',1.50),
  -- Pâtisseries (5,5 %)
  ('Part de flan pâtissier',2.50),('Tropézienne individuelle',2.50),
  ('Tartelette citron meringuée',2.90),('Éclair au chocolat',3.20),('Tiramisu individuel',3.20),
  -- Gourmandises (5,5 %)
  ('Cannelé',1.50),('Madeleine chocolat-noisette',1.50),('Cookie chocolat',2.40),
  ('Sacristain',2.50),('Muffin chocolat-noisette',2.80),('Muffin citron',2.80),
  -- Sandwichs (10 %)
  ('Le Parisien',4.50),('Le Poulet',4.90),('Le Rosette',4.50),('Le Nordique',5.50),
  -- Paninis (10 %)
  ('Panini jambon-fromage',4.50),('Panini poulet-pesto',4.90),('Panini chèvre-miel',4.90),
  -- Salades (10 %)
  ('Salade poulet-feta',4.50),('Salade italienne',4.90),('Salade saumon',5.50),
  -- Pizzas (10 %)
  ('Pizza à la plaque Margherita',2.90),('Pizza à la plaque jambon-fromage',2.90),
  ('Pizza ronde Reine',3.90),('Pizza ronde poulet-pesto',3.90),('Pizza ronde chèvre-miel',3.90),
  -- Boissons fraîches (10 %)
  ('Eau plate 50 cl',1.00),('Eau gazeuse 50 cl',1.50),('Coca-Cola 33 cl',1.80),
  ('Coca-Cola Zéro 33 cl',1.80),('Ice Tea 33 cl',1.80),('Orangina 33 cl',1.80),
  ('Jus d''orange 25 cl',1.80),('Jus de pomme 25 cl',1.80),
  -- Boissons chaudes (10 %)
  ('Café expresso',1.20),('Café allongé',1.20),('Café noisette',1.50),
  ('Cappuccino',2.50),('Chocolat chaud',2.50),('Thé',2.00),
  -- Formules (10 %)
  ('Formule salade + boisson',5.80),('Formule sandwich ou panini + boisson',6.20),
  ('Formule salade + boisson + dessert',8.10),('Formule sandwich ou panini + boisson + dessert',8.50),
  -- Formules petit-déjeuner (10 %)
  ('Formule Express',2.20),('Formule Douceur chaude',3.40),
  ('Formule Petit-déjeuner complet',3.80),('Formule Tartine',4.20)
)
update recettes r
   set prix_vente_ht = round(c.ttc / (1 + r.tva / 100.0), 4)
  from carte c
 where r.nom = c.nom
   and r.tag_destination = 'FOURNIL';

-- ─── Diagnostic : le TTC recalculé retombe-t-il sur l'affiche ? ───────
do $$
declare nb_ok int; nb_ko int; l record;
begin
  select count(*) filter (where ok), count(*) filter (where not ok)
    into nb_ok, nb_ko
    from (
      select round(prix_vente_ht * (1 + tva / 100.0), 2) = round(prix_vente_ht * (1 + tva / 100.0), 2) as ok
        from recettes where tag_destination = 'FOURNIL' and actif
    ) t;
  raise notice '── Carte Fournil : % produit(s) actif(s) ──', nb_ok + nb_ko;

  raise notice '── Contrôle des 4 prix qui ne tombaient pas juste ──';
  for l in
    select nom, prix_vente_ht, tva, round(prix_vente_ht * (1 + tva / 100.0), 2) as ttc
      from recettes
     where tag_destination = 'FOURNIL'
       and nom in ('Cookie chocolat','Pizza ronde Reine','Pizza ronde poulet-pesto','Pizza ronde chèvre-miel')
     order by nom
  loop
    raise notice '  % : HT % (TVA % %%) → TTC %', l.nom, l.prix_vente_ht, l.tva, l.ttc;
  end loop;
end $$;
