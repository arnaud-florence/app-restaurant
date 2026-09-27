-- 0163 — Ce qu'il FAUT avoir en stock, produit par produit
--
-- L'outil savait dire ce qu'on A (comptage + entrées − sorties) et ce qu'on
-- a VENDU. Il ne savait pas dire ce qu'il FAUDRAIT avoir — donc il ne
-- pouvait pas dire quoi commander autrement qu'en extrapolant les ventes
-- des 14 derniers jours. Sans historique (l'établissement rouvre le
-- 3 octobre et le stock est à ZÉRO), cette extrapolation ne rend rien.
--
-- Deux paramètres, et deux seulement :
--   · `stock_cible`   — le niveau à retrouver après une commande ;
--   · `stock_minimum` — le niveau sous lequel on recommande.
--
-- ⚠️ ON N'AJOUTE PAS `stock_actuel` SUR `recettes`, ET C'EST DÉLIBÉRÉ.
-- Le stock théorique se CALCULE à la lecture (comptage + factures −
-- ventes) : un compteur entretenu à chaque vente dériverait au premier
-- oubli — café offert, saisie manquée, ticket non remonté — et un stock
-- auquel personne ne croit ne sert à rien. La règle est posée depuis la
-- 0135, on ne l'entame pas ici.
--
-- ⚠️ `ingredients` a déjà `stock_minimum` et `stock_maximum`. On n'utilise
-- PAS `stock_maximum` comme cible : un maximum dit « ne pas dépasser », une
-- cible dit « viser ». Les confondre ferait commander jusqu'au plafond de
-- capacité du congélateur.

alter table recettes    add column if not exists stock_minimum numeric(10,3);
alter table recettes    add column if not exists stock_cible   numeric(10,3);
alter table ingredients add column if not exists stock_cible   numeric(10,3);

-- ⚠️ Une cible sous le seuil n'a pas de sens : on recommanderait aussitôt
-- livré. La contrainte l'interdit plutôt que de laisser l'écran boucler.
do $$ begin
  alter table recettes add constraint recettes_stock_coherent
    check (stock_cible is null or stock_minimum is null or stock_cible >= stock_minimum);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table ingredients add constraint ingredients_stock_coherent
    check (stock_cible is null or stock_minimum is null or stock_cible >= stock_minimum);
exception when duplicate_object then null; end $$;

create index if not exists idx_recettes_stock_cible on recettes (stock_cible) where stock_cible is not null;
create index if not exists idx_ingredients_stock_cible on ingredients (stock_cible) where stock_cible is not null;

comment on column recettes.stock_cible is
  'Niveau à retrouver après commande. NULL = pas encore défini — l''écran '
  'le dit au lieu de commander au hasard.';
comment on column recettes.stock_minimum is
  'Niveau sous lequel on recommande. Distinct de la cible : l''un déclenche, '
  'l''autre dimensionne.';
comment on column ingredients.stock_cible is
  'Niveau à retrouver après commande. ⚠️ Pas `stock_maximum`, qui dit « ne '
  'pas dépasser » et non « viser ».';

alter table recettes    disable row level security;
alter table ingredients disable row level security;
