-- ============================================================
-- Migration 0077 — Activation Realtime Supabase sur tables clés
-- ============================================================
-- Idempotent : skip silencieusement si une table est déjà dans la publication.
-- ============================================================

do $$
declare
  t text;
  tables_a_publier text[] := array[
    'recettes',
    'parametres',
    'plats_du_jour',
    'promotions',
    'evenements',
    'ingredients',
    'commandes',
    'commande_articles'
  ];
begin
  foreach t in array tables_a_publier loop
    -- Skip si déjà membre de la publication
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
      raise notice '✓ % ajoutée au realtime', t;
    else
      raise notice '⏭ % déjà dans le realtime, skip', t;
    end if;
  end loop;
end$$;

-- Diagnostic final
select pubname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in (
    'recettes','parametres','plats_du_jour','promotions',
    'evenements','ingredients','commandes','commande_articles'
  )
order by tablename;
