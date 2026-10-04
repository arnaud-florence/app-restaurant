-- 0167 — L'ARDOISE DE LA SEMAINE ET LE PLAT DU JOUR
--
-- Décision du gérant, 04/10/2026 : la carte de la restauration sera une
-- ARDOISE. Toutes les pizzas restent en permanence ; la brasserie tourne
-- chaque semaine sur quelques plats ; et un PLAT DU JOUR, qui n'est PAS de
-- la carte, change chaque jour — mais se décide une semaine à l'avance.
--
-- ⚠️⚠️ CE QUE ÇA CASSE DANS LE MODÈLE ACTUEL. Le réassort commande
-- aujourd'hui pour les 48 plats de la carte, dont deux ou trois seront
-- réellement servis : mesuré le 04/10/2026, c'est 62 ingrédients mobilisés
-- et 152 € de périssable jeté par semaine, contre ~100 € sur une ardoise.
-- Il lui manque la seule donnée qui permette de trancher : CE QUI EST À
-- L'ARDOISE.
--
-- `plats_du_jour` (0074) porte déjà la bonne forme — recette, date_debut,
-- date_fin — et elle est VIDE depuis sa création. Deux choses l'empêchent
-- de servir ici.
--
-- ① UN PLAT DU JOUR HORS CARTE N'A PAS DE `recette_id`, et la colonne est
--    NOT NULL. Or le plat du jour doit quand même exister en caisse : on ne
--    vend pas ce que la caisse ne connaît pas. La réponse n'est pas de créer
--    365 produits par an — ils partiraient vers Zelty et vers casatasia.fr —
--    mais UN produit permanent « Plat du jour », dont le libellé du ticket ne
--    bouge pas et dont la description change chaque jour.
--
-- ② SA COMPOSITION CHANGE CHAQUE JOUR. `recette_ingredients` porte UNE
--    composition par produit : elle ne peut pas décrire sept plats
--    différents sur le même `recette_id`. D'où `plat_du_jour_ingredients`,
--    qui attache la composition à l'OCCURRENCE et non au produit.
--
--    ⚠️ Sans elle, les 140 couverts du midi se commandent à l'aveugle —
--    c'est le plus gros volume de la semaine.

-- ── la composition d'un plat du jour, pour CE jour-là ──────────────
create table if not exists plat_du_jour_ingredients (
  id               uuid primary key default gen_random_uuid(),
  plat_du_jour_id  uuid not null references plats_du_jour(id) on delete cascade,
  ingredient_id    uuid not null references ingredients(id) on delete restrict,
  quantite         numeric(10,3) not null check (quantite > 0),
  unite            text not null,
  created_at       timestamptz not null default now(),
  unique (plat_du_jour_id, ingredient_id)
);

create index if not exists idx_pdj_ing_plat on plat_du_jour_ingredients(plat_du_jour_id);
create index if not exists idx_pdj_ing_ing  on plat_du_jour_ingredients(ingredient_id);

-- ⚠️ `on delete restrict` sur l'ingrédient, pas `cascade` : supprimer une
-- matière ne doit pas effacer en silence la composition d'un plat déjà servi
-- — on perdrait la trace de ce qui a été consommé.

-- ── de quoi nommer le plat du jour sans créer un produit par jour ──
alter table plats_du_jour add column if not exists titre text;
comment on column plats_du_jour.titre is
  'Le nom du plat CE jour-là (« Blanquette de veau »). Le produit reste le '
  'même en caisse — un seul bouton, un seul prix — et c''est ce titre qui '
  'change. NULL pour une ligne d''ardoise ordinaire, où le produit porte '
  'déjà son nom.';

-- ⚠️ UN PLAT DU JOUR QUI REVIENT NE SE RESAISIT PAS. Au bout de quelques
-- mois la blanquette, les lasagnes et le poulet rôti reviennent : on
-- enregistre la composition une fois, on la rappelle ensuite. Sans ça la
-- saisie du dimanche soir reste entière chaque semaine, et une corvée
-- hebdomadaire finit par ne plus être faite — le réassort redeviendrait
-- aveugle sans que rien ne le signale.
alter table plats_du_jour add column if not exists modele_de uuid
  references plats_du_jour(id) on delete set null;
comment on column plats_du_jour.modele_de is
  'L''occurrence dont la composition a été recopiée. Sert à construire la '
  'bibliothèque des plats qui reviennent.';

alter table plat_du_jour_ingredients disable row level security;

-- ── diagnostic ──────────────────────────────────────────────────────
do $$
declare n_pdj int; n_ing int; n_rls int;
begin
  select count(*) into n_pdj from plats_du_jour;
  select count(*) into n_ing from plat_du_jour_ingredients;
  select count(*) into n_rls from pg_tables
    where schemaname = 'public' and tablename = 'plat_du_jour_ingredients' and rowsecurity;
  raise notice '0167 — plats_du_jour : % ligne(s)', n_pdj;
  raise notice '0167 — plat_du_jour_ingredients : % ligne(s)', n_ing;
  raise notice '0167 — RLS encore active : % (0 attendu)', n_rls;
end $$;
