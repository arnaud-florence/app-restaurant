-- ════════════════════════════════════════════════════════════════════
-- 0141 — Rupture du jour
-- ════════════════════════════════════════════════════════════════════
-- Ce que l'outil sait et que la caisse ignore : l'inventaire du matin dit
-- qu'il ne reste que quatre paninis. Sans le lui dire, on continue de les
-- vendre en ligne et il faut ensuite l'expliquer au client.
--
-- ⚠️ Pourquoi une colonne DISTINCTE de `actif`, et pas une réutilisation :
-- le miroir du catalogue fait de Zelty le maître de `actif`. Si une rupture
-- éteignait `actif` chez eux, le miroir le relirait et éteindrait la fiche
-- CHEZ NOUS — le produit disparaîtrait définitivement, même réapprovisionné.
-- Une boucle silencieuse dont personne ne trouverait la cause.
--
-- La rupture coupe donc les CANAUX EN LIGNE (`disable_takeaway`,
-- `disable_delivery` côté Zelty), jamais le produit lui-même : ce qui reste
-- au comptoir peut encore se vendre au comptoir.
--
-- Datée : une rupture est une décision du JOUR. Sans date, personne ne
-- penserait à la lever le lendemain matin et le produit resterait invisible.
--
-- Idempotent, rejouable.
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists rupture_le date;

comment on column recettes.rupture_le is
  'Jour pour lequel le produit est déclaré en rupture. Coupe la vente en ligne, jamais la vente au comptoir. Se périme seule : une date passée ne vaut plus rupture.';

create index if not exists idx_recettes_rupture on recettes(rupture_le) where rupture_le is not null;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from recettes where rupture_le = current_date;
  raise notice '── 0141 ── % produit(s) en rupture aujourd''hui', n;
end $$;
