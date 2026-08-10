-- ════════════════════════════════════════════════════════════════════
-- 0095 — Carte de démarrage du Fournil
-- ════════════════════════════════════════════════════════════════════
-- Ajoute une destination 'FOURNIL' (routage propre, sans polluer la cuisine
-- du resto) + une carte boulangère de démarrage (~25 produits) taggée sur le
-- point de vente Fournil. Prix HT calculés depuis un TTC indicatif → à peaufiner
-- à l'ouverture. Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- 1) Étendre les destinations autorisées (recettes + commande_articles)
alter table recettes drop constraint if exists recettes_tag_destination_check;
alter table recettes add constraint recettes_tag_destination_check
  check (tag_destination in ('CUISINE','PIZZA','BAR','SNACKING','FOURNIL'));

alter table commande_articles drop constraint if exists commande_articles_tag_destination_check;
alter table commande_articles add constraint commande_articles_tag_destination_check
  check (tag_destination in ('CUISINE','PIZZA','BAR','SNACKING','FOURNIL'));

-- 2) Insérer la carte de démarrage (HT = round(TTC / (1 + tva/100), 2))
insert into recettes (nom, categorie, tag_destination, prix_vente_ht, tva, etablissement_id, actif, vendable_online)
select v.nom, v.cat, 'FOURNIL',
       round(v.ttc / (1 + v.tva / 100.0), 2), v.tva,
       (select id from etablissements where slug = 'fournil'),
       true, false
from (values
  -- Pains (5,5 %)
  ('Baguette',                 'Pain',          1.20, 5.5),
  ('Baguette tradition',       'Pain',          1.40, 5.5),
  ('Pain',                     'Pain',          2.50, 5.5),
  ('Pain de campagne',         'Pain',          3.00, 5.5),
  ('Pain aux céréales',        'Pain',          3.20, 5.5),
  -- Viennoiseries (5,5 %)
  ('Croissant',                'Viennoiserie',  1.30, 5.5),
  ('Pain au chocolat',         'Viennoiserie',  1.40, 5.5),
  ('Pain aux raisins',         'Viennoiserie',  1.50, 5.5),
  ('Chausson aux pommes',      'Viennoiserie',  1.60, 5.5),
  ('Brioche',                  'Viennoiserie',  2.50, 5.5),
  -- Pâtisseries (5,5 %)
  ('Éclair au chocolat',       'Pâtisserie',    3.00, 5.5),
  ('Tarte aux pommes (part)',  'Pâtisserie',    3.50, 5.5),
  ('Flan pâtissier',           'Pâtisserie',    3.00, 5.5),
  ('Mille-feuille',            'Pâtisserie',    3.50, 5.5),
  ('Macaron',                  'Pâtisserie',    1.50, 5.5),
  -- Snacking (10 %)
  ('Sandwich jambon-beurre',   'Snacking',      4.50, 10),
  ('Sandwich poulet crudités', 'Snacking',      5.50, 10),
  ('Quiche lorraine (part)',   'Snacking',      4.00, 10),
  ('Pizza fournil (part)',     'Snacking',      4.50, 10),
  ('Croque-monsieur',          'Snacking',      4.50, 10),
  -- Boissons / café (10 %)
  ('Café',                     'Boisson',       1.50, 10),
  ('Café crème',               'Boisson',       2.00, 10),
  ('Thé',                      'Boisson',       2.00, 10),
  ('Jus d''orange',            'Boisson',       3.00, 10),
  ('Soda / Eau',               'Boisson',       2.00, 10)
) as v(nom, cat, ttc, tva)
where not exists (
  select 1 from recettes r
  where r.nom = v.nom
    and r.etablissement_id = (select id from etablissements where slug = 'fournil')
);

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int; r record;
begin
  select count(*) into nb from recettes
   where etablissement_id = (select id from etablissements where slug = 'fournil');
  raise notice '── Carte Fournil : % produit(s) ──', nb;
  for r in
    select categorie, count(*) c from recettes
     where etablissement_id = (select id from etablissements where slug = 'fournil')
     group by categorie order by categorie
  loop
    raise notice '  % : % produit(s)', r.categorie, r.c;
  end loop;
end $$;
