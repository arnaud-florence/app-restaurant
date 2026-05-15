-- Phase 4 visuels : ajout d'une colonne photo_url sur la table ingredients.
-- Permet d'attacher une URL d'image à chaque ingrédient (manuel ou Unsplash).
-- Le rendu côté client utilise un fallback Unsplash thématique par catégorie
-- si la colonne est vide, mais on garde la colonne pour permettre l'upload
-- d'une vraie photo par le manager.

alter table ingredients
  add column if not exists photo_url text;

-- Diagnostic : vérifier que la colonne existe
do $$
declare
  has_col boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_name = 'ingredients' and column_name = 'photo_url'
  ) into has_col;
  raise notice 'ingredients.photo_url present : %', has_col;
end$$;
