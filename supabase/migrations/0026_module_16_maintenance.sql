-- ============================================================
-- 0026 — Module 16 : Maintenance & équipements (/admin/maintenance)
-- ============================================================
-- Réutilise les tables Module 1 :
--   equipements                 (id, nom, marque, modele, ...)
--   interventions_maintenance   (id, equipement_id, type, date, ...)
--
-- Ajoute :
--   ALTER equipements ADD categorie + type_controle_obligatoire
--   + prochain_controle_obligatoire (alerte 1 mois avant)
-- ============================================================

do $$ begin
  alter table equipements add column if not exists categorie text
    check (categorie in ('cuisine','froid','chaud','laverie','climatisation','securite','divers'));
  alter table equipements add column if not exists type_controle_obligatoire text
    check (type_controle_obligatoire in ('electricite','gaz','extincteur','hotte','desenfumage','climatisation','autre'));
  alter table equipements add column if not exists prochain_controle_obligatoire date;
  alter table equipements add column if not exists derniere_controle_obligatoire date;
  alter table equipements add column if not exists organisme_certifie text;  -- prestataire agréé pour les contrôles
exception when duplicate_column then null; end $$;

create index if not exists idx_equip_categorie on equipements(categorie) where actif = true;
create index if not exists idx_equip_controle  on equipements(prochain_controle_obligatoire)
  where actif = true and prochain_controle_obligatoire is not null;
create index if not exists idx_equip_maintenance on equipements(prochaine_maintenance)
  where actif = true and prochaine_maintenance is not null;

-- Disable RLS (Supabase pourrait ré-activer après ALTER)
alter table equipements                 disable row level security;
alter table interventions_maintenance   disable row level security;

-- Diagnostic
select
  (select count(*) from equipements)               as nb_equip,
  (select count(*) from interventions_maintenance) as nb_inter,
  (select count(*) from equipements where prochain_controle_obligatoire is not null) as nb_controles_planifies;

-- Vérif colonnes
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'equipements'
   and column_name in ('categorie','type_controle_obligatoire','prochain_controle_obligatoire','derniere_controle_obligatoire','organisme_certifie');

-- Vérif RLS
select c.relname as table_name,
       case when c.relrowsecurity then '🔒 ON' else '🔓 OFF' end as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in ('equipements','interventions_maintenance')
 order by c.relname;
