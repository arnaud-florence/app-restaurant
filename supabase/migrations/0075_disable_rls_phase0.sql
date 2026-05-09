-- ============================================================
-- Migration 0075 — Désactive RLS sur les tables Phase 0
-- ============================================================
-- Pattern habituel app-restaurant : RLS désactivée car le filtrage
-- métier est géré côté applicatif (auth + permissions). RLS sera
-- réactivée plus tard SUR LES TABLES EXPOSÉES À L'OUTIL 2 PUBLIC
-- (clients, commandes, mouvements_points, avis_publics, cartes_cadeaux)
-- avec policies « auth.uid() owns row ».
-- ============================================================

alter table etablissements                disable row level security;
alter table plats_du_jour                 disable row level security;
alter table promotions                    disable row level security;
alter table codes_promo                   disable row level security;
alter table cartes_cadeaux                disable row level security;
alter table mouvements_cartes_cadeaux     disable row level security;
alter table capacite_cuisine_par_creneau  disable row level security;
alter table avis_publics                  disable row level security;

-- Diagnostic
select
  c.relname as table_name,
  case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'etablissements','plats_du_jour','promotions','codes_promo',
    'cartes_cadeaux','mouvements_cartes_cadeaux','capacite_cuisine_par_creneau','avis_publics'
  )
order by c.relname;
