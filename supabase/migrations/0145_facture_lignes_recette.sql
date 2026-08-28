-- ════════════════════════════════════════════════════════════════════
-- Une ligne de facture doit dire ce qu'elle a nourri — 28 août 2026
-- ════════════════════════════════════════════════════════════════════
-- `facture_lignes.ingredient_id` disait à quelle MATIÈRE une ligne se
-- rattachait. Mais en achat-revente — le modèle du Fournil — une ligne
-- nourrit le plus souvent un PRODUIT VENDU, pas une matière : la ligne
-- « CROISSANT … C=96 » alimente `recettes.cout_achat_ht` du croissant.
-- Ce rattachement-là n'était écrit nulle part.
--
-- Conséquence : impossible de distinguer une ligne ORPHELINE — qui n'a
-- rien nourri, donc dont le prix est perdu — d'une ligne qui a servi.
-- Les deux avaient `ingredient_id` à NULL. Les orphelines étaient donc
-- invisibles, et c'est précisément la liste qu'il faut travailler pour
-- que les correspondances se complètent.
--
-- Bonus de traçabilité : on peut enfin répondre à « d'où vient ce prix
-- d'achat ? » en remontant à la facture et à sa ligne.
-- ════════════════════════════════════════════════════════════════════

alter table facture_lignes
  add column if not exists recette_id uuid references recettes(id) on delete set null;

create index if not exists idx_facture_lignes_recette on facture_lignes(recette_id);
-- L'index qui sert à l'écran des orphelines : les deux liens à NULL.
create index if not exists idx_facture_lignes_orphelines
  on facture_lignes(facture_id) where ingredient_id is null and recette_id is null;

comment on column facture_lignes.recette_id is
  'Produit vendu alimenté par cette ligne (achat-revente). NULL + ingredient_id NULL = ligne orpheline.';

alter table facture_lignes disable row level security;

do $$
declare tot int; orph int;
begin
  select count(*) into tot  from facture_lignes;
  select count(*) into orph from facture_lignes where ingredient_id is null and recette_id is null;
  raise notice '→ % ligne(s), dont % orpheline(s)', tot, orph;
end $$;

-- ─── Écarter une ligne définitivement ────────────────────────────────
-- Toutes les lignes ne correspondent à rien de vendable : frais de port,
-- consigne de palette, remise de fin de mois. Sans moyen de les écarter,
-- elles reviennent à chaque ouverture de l'écran et finissent par le rendre
-- illisible — donc inutilisé.
alter table facture_lignes add column if not exists ignoree boolean not null default false;
