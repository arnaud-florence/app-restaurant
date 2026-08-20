-- ════════════════════════════════════════════════════════════════════
-- 0118 — Mettre en sommeil les produits qui n'ouvrent qu'en octobre
-- ════════════════════════════════════════════════════════════════════
-- Le Fournil a ouvert seul le 17 août 2026. Le bar, le restaurant, le snack et
-- la pizzeria ne rouvrent qu'en octobre / novembre, mais leurs ~150 produits
-- encombrent toutes les listes de l'outil : recettes, stock, food cost,
-- prise de commande. On les endort.
--
-- ⚠️ LE PIÈGE : `actif = false` seul serait un aller sans retour praticable.
-- Le bouton « Ouvrir le restaurant » de /admin/etablissements ne touche que
-- `activites_modules` — PAS `recettes.actif`. En octobre, on rouvrirait donc
-- le restaurant avec une carte vide, sans comprendre pourquoi.
--
-- Et un `update ... set actif = true where tag_destination <> 'FOURNIL'` ne
-- réglerait rien : il ressusciterait aussi les recettes déjà retirées à la
-- main (doublons, seed de démo) qui n'ont jamais eu vocation à revenir.
--
-- D'où `masque_hors_saison` : on note EXACTEMENT qui a été endormi ici, et le
-- réveil ne rallume que ceux-là. Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table recettes
  add column if not exists masque_hors_saison boolean not null default false;

comment on column recettes.masque_hors_saison is
  'Produit éteint le temps que son activité ouvre (cf. 0118). Le réveil ne '
  'rallume que ces lignes — voir sql/reveil-restaurant.sql.';

-- On n'endort que ce qui est ACTIF aujourd'hui : ce qui était déjà éteint
-- l'était pour une autre raison et doit le rester.
update recettes
   set masque_hors_saison = true,
       actif = false
 where tag_destination <> 'FOURNIL'
   and actif = true;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb_dodo int; nb_actif int;
begin
  select count(*) into nb_dodo  from recettes where masque_hors_saison;
  select count(*) into nb_actif from recettes where actif;
  raise notice '── % produit(s) endormi(s), % encore actif(s) ──', nb_dodo, nb_actif;
  for r in
    select tag_destination,
           count(*) filter (where actif) actifs,
           count(*) filter (where masque_hors_saison) dodo
      from recettes group by tag_destination order by tag_destination
  loop
    raise notice '  %-10s actifs=%  endormis=%', r.tag_destination, r.actifs, r.dodo;
  end loop;
end $$;
