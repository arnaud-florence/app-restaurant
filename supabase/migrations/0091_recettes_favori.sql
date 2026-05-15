-- ============================================================
-- Migration 0091 : Flag favori sur recettes pour quick-access dans /serveur
-- ============================================================
-- Permet au gérant de marquer ses plats best-sellers / favoris via
-- /admin/recettes. Ces favoris apparaissent en haut du catalogue de prise
-- de commande sur /serveur, /emporter, /bar pour un accès en 1 clic
-- pendant le rush (style "produits stars" des kiosques McDo/KFC).
-- ============================================================

alter table recettes
  add column if not exists favori boolean not null default false;

create index if not exists idx_recettes_favori
  on recettes(favori, tag_destination) where favori = true and actif = true;

-- Diagnostic
select 'Migration 0091 OK' as status,
  count(*) filter (where favori = true) as nb_favoris,
  count(*) as nb_total
from recettes where actif = true;
