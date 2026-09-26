-- 0159 — Demander une remise, et savoir qu'on l'a déjà demandée
--
-- La 0158 fait entrer 2 892 références Gineys dont 2 800 avec
-- `tarif_negocie = NULL` : on ignore si le prix affiché porte notre remise.
-- La suite naturelle est de le DEMANDER au fournisseur — et de garder trace
-- de la demande.
--
-- ⚠️ Sans cette trace, on redemande. Un commercial relancé trois fois sur les
-- mêmes vingt références cesse de répondre, et on ne saurait pas dire si le
-- silence vient de lui ou d'un envoi qui n'a jamais eu lieu.
--
-- ⚠️ La date est posée à l'ENVOI, jamais à la préparation du message : une
-- demande écrite puis abandonnée doit rester à faire. Et elle ne vaut PAS
-- réponse — `tarif_negocie` reste NULL tant que le fournisseur n'a rien dit.
-- Confondre « demandé » et « obtenu » remplirait l'écran de remises
-- imaginaires.

alter table catalogue_fournisseur
  add column if not exists remise_demandee_le timestamptz;

create index if not exists idx_catalogue_four_demande
  on catalogue_fournisseur (fournisseur_id, remise_demandee_le)
  where remise_demandee_le is not null;

comment on column catalogue_fournisseur.remise_demandee_le is
  'Quand on a demandé une remise au fournisseur sur cet article. Posée à '
  'l''ENVOI. Ne vaut PAS réponse : tarif_negocie reste NULL jusqu''à la sienne.';

alter table catalogue_fournisseur disable row level security;
