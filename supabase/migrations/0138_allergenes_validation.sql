-- ════════════════════════════════════════════════════════════════════
-- 0138 — Allergènes : distinguer « rien déclaré » de « aucun allergène »
-- ════════════════════════════════════════════════════════════════════
-- Le problème, constaté le 27/08/2026 : la page publique du QR code affiche
-- « ✓ Aucun allergène déclaré », en vert, pour les 85 produits actifs — dont
-- les croissants, les sandwiches et les paninis. Aucun n'a d'allergène
-- renseigné, et un tableau vide était rendu comme une absence d'allergène.
--
-- Ce n'est pas une information manquante, c'est une AFFIRMATION FAUSSE, et
-- elle est rassurante : un client allergique au gluten lit une coche verte
-- sur un croissant.
--
-- Un tableau vide ne peut pas porter deux sens. Il faut une date de
-- validation :
--
--   allergenes_valides_le IS NULL  → personne n'a encore vérifié
--                                    → le public voit « information non
--                                      disponible, demandez-nous »
--   allergenes_valides_le renseigné → un humain a vérifié et validé
--                                    → un tableau vide veut alors vraiment
--                                      dire « aucun allergène »
--
-- La validation est nominative : en cas de contrôle ou d'incident, on doit
-- pouvoir dire qui a déclaré quoi et quand.
--
-- Idempotent, rejouable.
-- ════════════════════════════════════════════════════════════════════

alter table recettes add column if not exists allergenes_valides_le  timestamptz;
alter table recettes add column if not exists allergenes_valides_par text;

comment on column recettes.allergenes_valides_le is
  'Date de validation humaine des allergènes. NULL = jamais vérifié : le public ne doit PAS lire « aucun allergène », mais « information non disponible ».';
comment on column recettes.allergenes_valides_par is
  'Qui a validé. La déclaration d''allergènes engage : elle doit être nominative.';

create index if not exists idx_recettes_allerg_a_valider
  on recettes(actif) where allergenes_valides_le is null;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare valides int; total int;
begin
  select count(*) filter (where allergenes_valides_le is not null), count(*)
    into valides, total
    from recettes where actif;
  raise notice '── 0138 ── % produit(s) actif(s) validé(s) sur % — % restant(s)',
    valides, total, total - valides;
end $$;
