-- ════════════════════════════════════════════════════════════════════
-- RÉVEIL DU RESTAURANT — à jouer en octobre / novembre 2026
-- ════════════════════════════════════════════════════════════════════
-- À exécuter APRÈS avoir cliqué « Ouvrir le restaurant » sur
-- /admin/etablissements. Ce bouton rallume les modules (activites_modules)
-- mais pas les produits : la migration 0118 les avait endormis pour ne pas
-- encombrer l'outil pendant que seul le Fournil tournait.
--
-- ⚠️ DEVENU SANS EFFET LE 27 AOÛT 2026 — à ne plus considérer comme une
-- étape de la réouverture. Les 150 produits restaurant/bar/pizza/snack
-- étaient des produits de TEST (seed de développement, mai-juin 2026) et ont
-- été purgés : plus aucune ligne ne porte `masque_hors_saison`, donc cette
-- requête met désormais 0 ligne à jour.
--
-- La vraie carte du haut sera saisie quand elle sera arrêtée, et créée
-- directement `actif = true`. Ce fichier ne subsiste que pour l'historique et
-- au cas où un endormissement saisonnier serait remis en place un jour.
--
-- Rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

update recettes
   set actif = true,
       masque_hors_saison = false
 where masque_hors_saison = true;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb int;
begin
  select count(*) into nb from recettes where masque_hors_saison;
  raise notice '── Réveil : % produit(s) encore endormi(s) (attendu : 0) ──', nb;
  for r in
    select tag_destination, count(*) filter (where actif) actifs, count(*) total
      from recettes group by tag_destination order by tag_destination
  loop
    raise notice '  %-10s % actif(s) sur %', r.tag_destination, r.actifs, r.total;
  end loop;
end $$;
