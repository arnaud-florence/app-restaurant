-- 0150 — Fiches techniques : maîtriser les portions et les marges
--
-- Le modèle avait déjà tout pour CALCULER une marge : `recette_ingredients`
-- (quantité + unité), `recettes.nb_portions`, `temps_preparation`, et
-- `synthese()` qui additionne composition et coût d'achat.
--
-- Il manquait deux choses pour qu'une fiche soit RESPECTÉE en production :
--
--   `procedure`        la méthode, étape par étape. `description` existait
--                      déjà mais c'est le texte COMMERCIAL, celui que lit le
--                      client sur le site — pas celui que suit le cuisinier.
--                      Les mélanger obligerait à choisir entre vendre et
--                      produire.
--
--   `poids_portion_g`  le grammage servi. Sans lui, une fiche dit ce qu'on
--                      MET DEDANS mais pas ce qu'on SERT : deux assiettes
--                      composées des mêmes ingrédients peuvent coûter du
--                      simple au double. C'est précisément là que les marges
--                      se perdent, et c'est invisible dans une recette.
--
-- ⚠️ Le Fournil reste en achat-revente : un croissant surgelé n'a pas de
-- fiche technique, il a un prix d'achat. Ces colonnes servent aux produits
-- ASSEMBLÉS — sandwichs, paninis, salades — et à la carte du restaurant et
-- de la pizzeria.

alter table recettes add column if not exists procedure text;
alter table recettes add column if not exists poids_portion_g numeric(8,1);

comment on column recettes.procedure is
  'Fiche technique : la méthode à RESPECTER, étape par étape. Distinct de '
  'description, qui est le texte commercial affiché au client.';
comment on column recettes.poids_portion_g is
  'Grammage de la portion servie. Sans lui, une fiche technique dit ce qu''on '
  'met dedans mais pas combien on sert.';

alter table recettes disable row level security;

-- Diagnostic
select
  (select count(*) from recettes where actif)                          as produits_actifs,
  (select count(*) from recettes where actif and procedure is not null) as avec_procedure,
  (select count(*) from recette_ingredients)                            as lignes_composition;
