-- ════════════════════════════════════════════════════════════════════
-- 0122 — Le catalogue se construit tout seul depuis la caisse
-- ════════════════════════════════════════════════════════════════════
-- SumUp n'expose PAS d'API catalogue : impossible de lire la liste des
-- produits de la caisse pour la recopier. Vérifié dans la référence de l'API,
-- qui ne comporte que Checkouts, Readers, Customers, Transactions, Payouts,
-- Receipts, Members, Memberships, Roles et Merchants.
--
-- Le seul endroit où les produits de la caisse apparaissent, c'est dans les
-- tickets. On construit donc le miroir à partir de ce qui se vend : un libellé
-- inconnu rencontré sur un ticket crée sa fiche, avec le prix et la TVA du
-- ticket lui-même.
--
-- Sans ça, un produit ajouté dans SumUp un mardi matin vend toute la journée
-- sans que l'outil sache à quoi rattacher ces lignes : le CA est compté, mais
-- le produit reste invisible dans le top des ventes et dans les marges.
--
-- `cree_par_caisse` marque ces fiches : elles sont fonctionnelles mais n'ont
-- ni photo, ni description, ni catégorie choisie à la main. C'est un filtre
-- de relecture, pas un défaut.
-- ════════════════════════════════════════════════════════════════════

alter table recettes
  add column if not exists cree_par_caisse boolean not null default false;

comment on column recettes.cree_par_caisse is
  'Fiche créée automatiquement à partir d''un ticket de caisse (cf. 0122). '
  'À relire : catégorie, photo et description sont des valeurs par défaut.';

create index if not exists idx_recettes_cree_par_caisse
  on recettes(cree_par_caisse) where cree_par_caisse;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare nb int;
begin
  select count(*) into nb from recettes where cree_par_caisse;
  raise notice '── % fiche(s) créée(s) depuis la caisse ──', nb;
end $$;
