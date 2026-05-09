-- ============================================================
-- Migration 0077 — Activation Realtime Supabase sur tables clés
-- ============================================================
-- Permet à l'outil 2 (vitrine) de réagir en temps réel aux changements :
--   - recettes vendable_online toggled → masquage/affichage immédiat sur menu
--   - parametres modifié → horaires/contact mis à jour instantanément
--   - plats_du_jour ajouté/désactivé → hero du site mis à jour
--   - promotions activées → bannière apparait/disparait
--   - evenements créés → page événements rafraîchie
--   - ingredients stock épuisé → plats associés masqués
--
-- Pattern Supabase : ajouter les tables à la publication 'supabase_realtime'.
-- Les clients (outil 2 navigateur) peuvent ensuite s'abonner via :
--   supabase.channel('public-changes').on('postgres_changes', { ... })
-- ============================================================

-- Tables exposées au Realtime public (lecture site)
alter publication supabase_realtime add table recettes;
alter publication supabase_realtime add table parametres;
alter publication supabase_realtime add table plats_du_jour;
alter publication supabase_realtime add table promotions;
alter publication supabase_realtime add table evenements;
alter publication supabase_realtime add table ingredients;
alter publication supabase_realtime add table commandes;
alter publication supabase_realtime add table commande_articles;

-- Diagnostic
select pubname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
