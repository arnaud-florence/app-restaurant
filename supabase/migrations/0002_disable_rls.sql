-- ============================================================
-- 0002 — Fix RLS : désactivation explicite + diagnostic
-- ============================================================
-- Pourquoi : Supabase ré-active la RLS par défaut sur les tables
-- créées via l'éditeur SQL dans les projets récents. Sans policy
-- d'écriture, les INSERT/UPDATE/DELETE depuis la clé anon échouent
-- avec l'erreur :
--   "new row violates row-level security policy for table ..."
--
-- L'app n'a pas encore d'auth (le module auth viendra plus tard) :
-- on désactive donc RLS sur toutes les tables. Quand on ajoutera
-- le login + les rôles, on remettra RLS avec des policies fines.
--
-- Idempotent : peut être ré-exécuté sans risque.
-- ============================================================

alter table ingredients               disable row level security;
alter table recettes                  disable row level security;
alter table recette_ingredients       disable row level security;
alter table tables_restaurant         disable row level security;
alter table commandes                 disable row level security;
alter table commande_articles         disable row level security;
alter table employes                  disable row level security;
alter table planning                  disable row level security;
alter table pointage                  disable row level security;
alter table conges                    disable row level security;
alter table fournisseurs              disable row level security;
alter table bons_commande             disable row level security;
alter table bon_commande_lignes       disable row level security;
alter table mouvements_stock          disable row level security;
alter table chambres                  disable row level security;
alter table reservations_chambres     disable row level security;
alter table evenements                disable row level security;
alter table releves_temperatures      disable row level security;
alter table procedures_hygiene        disable row level security;
alter table checklists_hygiene        disable row level security;
alter table equipements               disable row level security;
alter table interventions_maintenance disable row level security;
alter table obligations_legales       disable row level security;
alter table suivi_dechets             disable row level security;
alter table clients                   disable row level security;
alter table parametres                disable row level security;
alter table ventes_journalieres       disable row level security;

-- ─── Diagnostic : confirme l'état RLS de chaque table ───────
-- (s'affiche dans l'onglet "Results" du SQL Editor)
select
  c.relname           as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls,
  case when c.relforcerowsecurity then '⚠ FORCED' else '' end as forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
 order by c.relname;
