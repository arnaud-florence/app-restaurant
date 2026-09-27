-- 0160 — Un bon de commande qu'on peut vraiment ENVOYER
--
-- Le chaînon manquant entre « l'outil sait quoi commander » et « le
-- fournisseur l'a reçu ». Trois trous, mesurés le 27/09/2026 :
--
-- 1. ⚠️ RIEN NE PARTAIT. `changerStatutBon(id, 'envoye')` ne faisait que
--    changer une étiquette : aucun message ne quittait l'outil. Un bon
--    marqué « envoyé » que personne n'a reçu est pire qu'un bon en
--    brouillon — on croit la commande passée.
--
-- 2. ⚠️ UNE LIGNE NE POUVAIT PORTER QU'UN INGRÉDIENT. Or le Fournil est en
--    achat-revente : ce qu'on commande, ce sont des PRODUITS VENDUS
--    (croissants, pâtons, baguettes), pas des matières. C'est pour ça que
--    `/admin/commande-fournil` ne savait produire qu'une liste à recopier
--    — même trou que `facture_lignes` avant la 0145.
--
-- 3. Et un fournisseur vend des choses qui ne sont ni l'un ni l'autre
--    (port, consigne, un article vu au catalogue). D'où `libelle`, en
--    texte libre, qui sert de repli.
--
-- ⚠️ La contrainte exige AU MOINS une identification. Une ligne sans
-- ingrédient, sans produit et sans libellé serait une ligne vide dans un
-- document qui engage de l'argent.

alter table bon_commande_lignes
  add column if not exists recette_id uuid references recettes(id) on delete set null;
alter table bon_commande_lignes
  add column if not exists libelle text;
alter table bon_commande_lignes
  add column if not exists unite text;

do $$ begin
  alter table bon_commande_lignes
    add constraint bon_commande_lignes_identifiee
    check (ingredient_id is not null or recette_id is not null or libelle is not null);
exception when duplicate_object then null; end $$;

create index if not exists idx_bcl_recette on bon_commande_lignes (recette_id) where recette_id is not null;

-- ─── L'envoi ────────────────────────────────────────────────────────
-- ⚠️ `envoye_le` est posé APRÈS un envoi réussi, jamais avant. Un bon
-- préparé puis abandonné doit rester à envoyer — même règle que
-- `remise_demandee_le` (0159).
alter table bons_commande add column if not exists envoye_le  timestamptz;
-- L'adresse RÉELLEMENT utilisée. Les carnets d'adresses changent ; savoir
-- où c'est parti est la première question quand le fournisseur dit « je
-- n'ai rien reçu ».
alter table bons_commande add column if not exists envoye_a   text;
alter table bons_commande add column if not exists reference  text;

create index if not exists idx_bc_envoye on bons_commande (fournisseur_id, envoye_le);

comment on column bons_commande.envoye_le is
  'Quand le bon est PARTI. Posé après un envoi réussi seulement : un bon '
  'marqué envoyé que personne n''a reçu fait croire la commande passée.';
comment on column bons_commande.envoye_a is
  'Adresse réellement utilisée — la première question quand le fournisseur '
  'dit n''avoir rien reçu.';
comment on column bon_commande_lignes.recette_id is
  'Le produit VENDU commandé — le cas courant en achat-revente (croissants, '
  'pâtons). Sans lui, la commande conseillée du Fournil ne pouvait pas '
  'devenir un bon.';

alter table bons_commande       disable row level security;
alter table bon_commande_lignes disable row level security;
