-- ════════════════════════════════════════════════════════════════════
-- 0115 — Ce qui est réellement commandable en ligne au Fournil
-- ════════════════════════════════════════════════════════════════════
-- La carte 0113 a tout ouvert à la commande en ligne, café compris. Un
-- expresso en click & collect n'a pas de sens : il est servi en tasse, il ne
-- voyage pas, et il arrive froid. On referme ce qui ne peut pas être remis en
-- main propre dans un sac.
--
--   • Boissons chaudes (6)         → tasse, ne se transporte pas
--   • Formules petit-déjeuner (4)  → bâties autour d'une boisson chaude
--   • Formules repas (4)           → « salade + boisson » sans dire LAQUELLE :
--        la commande en ligne ne transmet qu'un produit et une quantité, sans
--        mécanisme d'options. L'équipe recevrait une commande impraticable
--        sans rappeler le client. À rouvrir le jour où le site sait composer.
--
-- Les produits restent ACTIFS : ils sont vendus au comptoir et doivent
-- continuer d'apparaître sur la carte du site. Seul `vendable_online` bascule.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

update recettes
   set vendable_online = false
 where tag_destination = 'FOURNIL'
   and categorie in ('Boisson chaude', 'Formule', 'Formule petit-déjeuner');

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record; nb_on int; nb_off int;
begin
  select count(*) filter (where vendable_online),
         count(*) filter (where not vendable_online)
    into nb_on, nb_off
    from recettes where tag_destination = 'FOURNIL' and actif;

  raise notice '── Fournil : % commandable(s) en ligne, % au comptoir seulement ──', nb_on, nb_off;
  for r in
    select categorie, count(*) n,
           count(*) filter (where vendable_online) en_ligne
      from recettes
     where tag_destination = 'FOURNIL' and actif
     group by categorie order by categorie
  loop
    raise notice '  %-28s % / % en ligne', r.categorie, r.en_ligne, r.n;
  end loop;
end $$;
