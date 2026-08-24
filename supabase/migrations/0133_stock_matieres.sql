-- ════════════════════════════════════════════════════════════════════
-- 0133 — L'inventaire compte aussi les MATIÈRES PREMIÈRES
-- ════════════════════════════════════════════════════════════════════
-- Un sandwich ou un panini ne se stocke pas : il s'assemble à la commande.
-- Ce qui se compte en réserve, c'est le pain, la rosette, le jambon, la
-- mozzarella… Ces matières vivent dans `ingredients`, mais cette table
-- contient aussi 100 lignes de démo héritées du modèle restaurant (bière
-- pression, tequila, malt de brassage) qui n'ont rien à faire dans un
-- comptage de boulangerie.
--
-- `ingredients.stocke` : marque celles qu'on compte réellement. Faux par
-- défaut — on n'affiche jamais une ligne que personne n'a validée.
--
-- `inventaires` accepte désormais une ligne SOIT sur un produit revendu tel
-- quel (recette_id), SOIT sur une matière première (ingredient_id). Deux
-- index uniques partiels remplacent la contrainte d'origine, et un CHECK
-- garantit qu'une ligne porte exactement l'un des deux.
-- ════════════════════════════════════════════════════════════════════

alter table ingredients add column if not exists stocke boolean not null default false;
create index if not exists idx_ingredients_stocke on ingredients(stocke) where stocke;

alter table inventaires alter column recette_id drop not null;
alter table inventaires add column if not exists ingredient_id uuid references ingredients(id) on delete cascade;

do $$ begin
  alter table inventaires drop constraint inventaires_date_inventaire_recette_id_key;
exception when undefined_object then null;
end $$;

create unique index if not exists uniq_inventaire_recette
  on inventaires(date_inventaire, recette_id) where recette_id is not null;
create unique index if not exists uniq_inventaire_ingredient
  on inventaires(date_inventaire, ingredient_id) where ingredient_id is not null;

do $$ begin
  alter table inventaires add constraint inventaires_une_cible
    check (num_nonnulls(recette_id, ingredient_id) = 1);
exception when duplicate_object then null;
end $$;

do $$
declare nb int;
begin
  select count(*) into nb from ingredients where stocke;
  raise notice '── ingrédients marqués « stocké » : % ──', nb;
end $$;
