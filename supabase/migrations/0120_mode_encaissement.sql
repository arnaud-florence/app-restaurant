-- ════════════════════════════════════════════════════════════════════
-- 0120 — Déclarer qui encaisse vraiment
-- ════════════════════════════════════════════════════════════════════
-- Au Fournil, c'est SumUp qui encaisse. L'app prend les commandes web et
-- prépare, elle n'est pas la caisse.
--
-- Sans cette déclaration, l'outil continue d'afficher des écrans qui
-- SUPPOSENT le contraire, et qui mentent en silence :
--
--   • /caisse propose d'ouvrir une session et de sortir un rapport Z. Le Z
--     sera vide en permanence : les ventes du comptoir n'écrivent aucune
--     ligne dans `paiements_caisse`. Clôturer produirait un état à 0 € et un
--     écart de caisse imaginaire.
--
--   • Le stock ne décrémente que sur les articles passés à 'servi'. Les
--     ventes SumUp n'ayant pas de lignes, `stock_actuel` ne bouge jamais :
--     l'outil affichera « stock OK » indéfiniment. Ce n'est pas du bruit,
--     c'est pire — c'est un feu vert permanent qui ne veut rien dire.
--
--   • Menu engineering et food cost afficheraient des zéros, qui se lisent
--     « on ne vend rien » et non « je ne sais pas ».
--
-- Un paramètre plutôt qu'une constante : le jour où l'app redevient la caisse
-- (ou pour le restaurant en octobre), c'est une ligne à changer, pas un
-- déploiement.
-- ════════════════════════════════════════════════════════════════════

insert into parametres (cle, valeur) values
  ('caisse_encaissement', 'externe'),   -- 'externe' = caisse agréée | 'app' = l'outil encaisse
  ('caisse_externe_nom', 'SumUp'),
  ('caisse_externe_detail_produits', 'attente')  -- attente | oui | non
on conflict (cle) do nothing;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── Mode d''encaissement ──';
  for r in select cle, valeur from parametres where cle like 'caisse\_%' order by cle loop
    raise notice '  % = %', r.cle, r.valeur;
  end loop;
end $$;
