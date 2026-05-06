-- ============================================================
-- 0005 — Module 4 : Fiches Recettes & Food Cost
-- ============================================================
-- Aucun changement de schéma : recettes & recette_ingredients existent
-- déjà depuis 0001_init.sql. On se contente de :
--   1. Désactiver RLS au cas où Supabase l'ait ré-activée (ceinture-bretelle)
--   2. Seed 5 recettes réalistes liées aux 10 ingrédients seedés en 0003,
--      gated 'if not exists' pour rester idempotent.
--
-- Note : les allergènes recette ne sont PAS stockés en base — ils sont
-- auto-dérivés à la volée depuis ingredients.allergenes côté app.
-- Single source of truth = ingrédient.
-- ============================================================

-- ─── 1. Sécurité RLS ────────────────────────────────────────
alter table recettes              disable row level security;
alter table recette_ingredients   disable row level security;

-- ─── 2. Seed 5 recettes liées aux ingrédients seedés ───────
do $$
declare
  ing_mozza      uuid;
  ing_tomate     uuid;
  ing_farine     uuid;
  ing_magret     uuid;
  ing_saumon     uuid;
  ing_oeufs      uuid;
  ing_huile      uuid;
  ing_creme      uuid;
  ing_basilic    uuid;
  ing_pignons    uuid;
  rec_marg       uuid;
  rec_pesto_pizza uuid;
  rec_magret     uuid;
  rec_saumon     uuid;
  rec_oeufs      uuid;
begin
  -- Skip si la table contient déjà une recette
  if exists (select 1 from recettes limit 1) then return; end if;

  -- Récupère les ids ingrédients (par nom des seeds 0003)
  select id into ing_mozza   from ingredients where nom = 'Mozzarella di Bufala' limit 1;
  select id into ing_tomate  from ingredients where nom = 'Tomate San Marzano' limit 1;
  select id into ing_farine  from ingredients where nom = 'Farine T55 Bio' limit 1;
  select id into ing_magret  from ingredients where nom = 'Magret de canard' limit 1;
  select id into ing_saumon  from ingredients where nom = 'Saumon frais' limit 1;
  select id into ing_oeufs   from ingredients where nom = 'Œufs plein air L' limit 1;
  select id into ing_huile   from ingredients where nom = 'Huile olive vierge' limit 1;
  select id into ing_creme   from ingredients where nom = 'Crème fraîche 30%' limit 1;
  select id into ing_basilic from ingredients where nom = 'Basilic frais' limit 1;
  select id into ing_pignons from ingredients where nom = 'Pignons de pin' limit 1;

  -- Si les seeds 0003 ne sont pas là, on s'arrête — l'opérateur doit
  -- ré-exécuter 0003 d'abord.
  if ing_mozza is null or ing_farine is null then
    raise notice 'Seeds 0003 manquants — exécute d''abord 0003_ingredients_module.sql';
    return;
  end if;

  -- ─── Recette 1 — Pizza Margherita (PIZZA, 1 pizza, 11.50 €) ────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Pizza Margherita', 'Pizzas', 'PIZZA',
          'Tomate San Marzano, mozzarella di bufala, basilic frais, huile d''olive — la classique.',
          8, 1, 11.50, 10, true)
  returning id into rec_marg;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_marg, ing_farine,  0.2500, 'kg'),
    (rec_marg, ing_mozza,   0.1500, 'kg'),
    (rec_marg, ing_tomate,  0.1200, 'kg'),
    (rec_marg, ing_huile,   0.0150, 'L'),
    (rec_marg, ing_basilic, 0.5,    'botte');

  -- ─── Recette 2 — Pizza Pesto (PIZZA, 1 pizza, 13.00 €) ──────────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Pizza Pesto Pignons', 'Pizzas', 'PIZZA',
          'Pâte au pesto maison (basilic, pignons, huile d''olive), mozzarella, copeaux de parmesan.',
          10, 1, 13.00, 10, true)
  returning id into rec_pesto_pizza;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_pesto_pizza, ing_farine,  0.2500, 'kg'),
    (rec_pesto_pizza, ing_mozza,   0.1200, 'kg'),
    (rec_pesto_pizza, ing_basilic, 1.0,    'botte'),
    (rec_pesto_pizza, ing_pignons, 0.0300, 'kg'),
    (rec_pesto_pizza, ing_huile,   0.0500, 'L');

  -- ─── Recette 3 — Magret aux pignons (CUISINE, 1 portion, 22 €) ──
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Magret de canard, sauce crème aux pignons', 'Plats', 'CUISINE',
          'Magret rosé, sauce à la crème et pignons torréfiés, accompagnement de saison.',
          18, 1, 22.00, 10, true)
  returning id into rec_magret;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_magret, ing_magret,  0.2500, 'kg'),
    (rec_magret, ing_creme,   0.0500, 'L'),
    (rec_magret, ing_pignons, 0.0200, 'kg');

  -- ─── Recette 4 — Saumon à l'huile d'olive (CUISINE, 1 p., 18.50 €) ─
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Saumon mi-cuit à l''huile d''olive', 'Plats', 'CUISINE',
          'Pavé de saumon mi-cuit, huile d''olive vierge, basilic frais, fleur de sel.',
          12, 1, 18.50, 10, true)
  returning id into rec_saumon;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_saumon, ing_saumon,  0.1800, 'kg'),
    (rec_saumon, ing_huile,   0.0200, 'L'),
    (rec_saumon, ing_basilic, 0.25,   'botte');

  -- ─── Recette 5 — Œufs cocotte (CUISINE, 1 portion, 8.00 €) ──────
  insert into recettes (nom, categorie, tag_destination, description, temps_preparation, nb_portions, prix_vente_ht, tva, actif)
  values ('Œufs cocotte à la crème', 'Entrées', 'CUISINE',
          'Œufs plein air cuits à la crème, ciboulette, gratiné au four.',
          15, 1, 8.00, 10, true)
  returning id into rec_oeufs;

  insert into recette_ingredients (recette_id, ingredient_id, quantite, unite) values
    (rec_oeufs, ing_oeufs, 2.0,    'pièce'),
    (rec_oeufs, ing_creme, 0.0400, 'L');
end $$;

-- ─── 3. Diagnostic ──────────────────────────────────────────
select 'recettes'             as table_name, count(*) as nb_lignes from recettes
union all
select 'recette_ingredients'  as table_name, count(*) as nb_lignes from recette_ingredients;
