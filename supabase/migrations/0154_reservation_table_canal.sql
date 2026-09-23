-- ============================================================
-- 0154 — D'où vient une réservation de table
--
-- `reservations_tables` (module 21, migration 0035) ne dit pas COMMENT la
-- demande est arrivée. Tant que tout se prenait au téléphone, la question ne
-- se posait pas. Le guichet en ligne s'ouvre : sans ce champ, impossible de
-- répondre à « est-ce que le site sert à quelque chose ? » — on ne saurait
-- pas distinguer une demande web d'une table notée sur le cahier.
--
-- Défaut 'autre' plutôt que 'site_web' : une ligne dont on ignore l'origine
-- ne doit pas être comptée au crédit du site.
--
-- ⚠️ On n'ajoute PAS de colonne `service` (midi / soir). Elle se déduit de
-- `heure_arrivee` et des horaires de service — et la règle de la maison est
-- que ce qui se calcule ne se stocke pas : un service figé à la saisie
-- deviendrait faux le jour où le gérant décale une plage horaire, sans que
-- rien ne le signale.
-- ============================================================

do $$ begin
  alter table reservations_tables
    add column if not exists canal text not null default 'autre';
exception when duplicate_column then null; end $$;

do $$ begin
  alter table reservations_tables
    add constraint reservations_tables_canal_check
    check (canal in ('site_web', 'telephone', 'sur_place', 'autre'));
exception when duplicate_object then null; end $$;

create index if not exists idx_resa_tables_canal
  on reservations_tables(canal, date_resa);

-- Supabase réactive RLS après toute création via le SQL Editor — constaté
-- plus de six fois sur ce projet.
alter table reservations_tables disable row level security;

-- ─── Diagnostic ────────────────────────────────────────────
select 'reservations_tables' as table_, count(*) as lignes,
       count(*) filter (where canal = 'site_web') as depuis_le_site
from reservations_tables;

select c.relname, c.relrowsecurity as rls_active
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'reservations_tables';
