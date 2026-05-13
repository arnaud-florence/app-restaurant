-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGER : déduction automatique du stock à la création d'un commande_article
-- + masquage automatique d'une recette si un de ses ingrédients est épuisé
--
-- Pré-requis tables :
--   ingredients(id uuid, nom, stock_actuel numeric, stock_minimum numeric, unite, ...)
--   recette_ingredients(recette_id, ingredient_id, quantite_par_portion numeric)
--   recettes(id, actif boolean, ...)
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Trigger : à chaque INSERT dans commande_articles, décrémente le stock
--    de chaque ingrédient lié à la recette par (quantite × quantite_par_portion).
CREATE OR REPLACE FUNCTION fn_deduire_stock_commande_article()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ingredients i
  SET stock_actuel = GREATEST(0, COALESCE(i.stock_actuel, 0) - (NEW.quantite * ri.quantite_par_portion))
  FROM recette_ingredients ri
  WHERE ri.ingredient_id = i.id
    AND ri.recette_id = NEW.recette_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduire_stock ON commande_articles;
CREATE TRIGGER trg_deduire_stock
AFTER INSERT ON commande_articles
FOR EACH ROW EXECUTE FUNCTION fn_deduire_stock_commande_article();

-- 2) Vue : recettes vendables avec calcul "stock_disponible" basé sur ingrédient le plus rare
CREATE OR REPLACE VIEW v_recettes_avec_stock AS
SELECT r.*,
  COALESCE((
    SELECT MIN(FLOOR(i.stock_actuel / NULLIF(ri.quantite_par_portion, 0)))
    FROM recette_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recette_id = r.id
      AND ri.quantite_par_portion > 0
  ), 9999) AS portions_disponibles
FROM recettes r;

-- 3) (Optionnel) job périodique qui désactive les recettes en rupture
-- À déclencher via cron Vercel (rappel-stock) ou Supabase Edge Function.
-- Pour l'instant : SELECT pour identifier manuellement.
-- SELECT id, nom FROM v_recettes_avec_stock WHERE actif = true AND portions_disponibles = 0;

-- Note : pour masquer automatiquement côté API menu, mieux vaut filtrer dans
--   /api/public/menu en faisant la même jointure (pas besoin d'auto-désactiver actif).
