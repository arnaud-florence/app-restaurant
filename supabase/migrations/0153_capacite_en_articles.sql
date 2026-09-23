-- 0153 — La capacité d'un créneau se compte en ARTICLES, pas en commandes
--
-- Le gérant a arrêté la capacité du four le 23/09/2026 : **4 pizzas toutes
-- les 15 minutes**. Écrit « 4 » dans une colonne nommée `max_commandes`, ce
-- chiffre se relit « 4 commandes » — et quatre clients de trois pizzas font
-- douze pizzas dans le même quart d'heure. Le four ne suit pas, et personne
-- ne comprend pourquoi : le réglage affiche bien 4.
--
-- C'est le même défaut que tous ceux de cette semaine — un nombre dont
-- l'unité n'est pas dite. On renomme donc plutôt que de commenter : un nom
-- de colonne est lu par tout le monde, un commentaire par personne.
--
-- ⚠️ Le renommage touche six lecteurs (route publique, écran de capacité et
-- ses actions, listerCreneauxDisponibles, seed) — ils sont mis à jour dans le
-- même commit. Une colonne renommée à moitié casse à la lecture suivante.

alter table capacite_cuisine_par_creneau
  rename column max_commandes to max_articles;

comment on column capacite_cuisine_par_creneau.max_articles is
  'Nombre d''ARTICLES de ce tag qu''on sait produire dans un créneau — pas un '
  'nombre de commandes. Une commande de 3 pizzas consomme 3 places.';

-- ─── Diagnostic ─────────────────────────────────────────────
do $$
declare n integer;
begin
  select count(*) into n from capacite_cuisine_par_creneau where actif;
  raise notice 'capacite_cuisine_par_creneau : % plage(s) active(s), capacité en ARTICLES', n;
end $$;
