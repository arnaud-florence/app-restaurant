-- 0165 — Un prix ESTIMÉ doit le dire, dans une colonne à lui.
--
-- Le marqueur vivait dans `ingredients.fournisseur_principal`, un champ
-- LIBRE : « ESTIMATION 21/09/2026 — à remplacer par la première facture ».
-- Il portait donc deux informations dans une seule chaîne, et le jour où
-- on y a écrit le vrai fournisseur (27/09/2026, rattachement des devis),
-- le marqueur a disparu avec — 24 matières dont le prix est une hypothèse
-- se sont mises à ressembler à des prix relevés.
--
-- ⚠️ C'est la faute que ce projet traque partout : une absence rendue
-- comme une certitude (`statutFoodCost(0)` en vert, le tableau
-- d'allergènes vide lu « aucun allergène »). Un prix estimé qui ne
-- s'annonce pas se retrouve dans un total de commande, dans un food cost
-- et dans la valeur du fonds, sans que rien ne le signale.
--
-- ⚠️ Le défaut est `true` : tant que personne n'a prouvé qu'un prix vient
-- d'une facture, il est présumé estimé. L'inverse — présumer relevé —
-- ferait passer pour mesuré tout prix saisi à la main.

alter table ingredients
  add column if not exists prix_estime boolean not null default true;

comment on column ingredients.prix_estime is
  'true = le prix est une HYPOTHÈSE (carte bâtie, saisie à la main). '
  'false = il vient d''une facture ou d''un relevé fournisseur. '
  'Défaut true : on ne présume pas qu''un prix a été mesuré.';

alter table ingredients disable row level security;

do $$
declare n_est int; n_rel int;
begin
  select count(*) into n_est from ingredients where actif and stocke and prix_estime;
  select count(*) into n_rel from ingredients where actif and stocke and not prix_estime;
  raise notice 'matières suivies — prix estimé : % · prix relevé : %', n_est, n_rel;
end $$;
