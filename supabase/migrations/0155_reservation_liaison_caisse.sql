-- ============================================================
-- 0155 — La liaison entre une réservation et celle de la caisse
--
-- Le gérant veut voir les réservations DES DEUX CÔTÉS : celles prises sur
-- casatasia.fr doivent apparaître sur la caisse, et celles notées au
-- téléphone sur la caisse doivent apparaître dans l'outil.
--
-- Deux registres qui ne se parlent pas divergent toujours — c'est déjà la
-- raison d'être de la frontière posée le 24/08 pour les ventes. Le soir de
-- l'inauguration, ça veut dire deux familles à la même table, ou du monde
-- refusé alors qu'il reste de la place.
--
-- Ces colonnes sont le socle de la synchronisation : elles disent qu'une
-- ligne d'ici EST une ligne de là-bas. Sans elles, chaque passage recréerait
-- la réservation en double, sans rien signaler.
--
-- ⚠️ Noms volontairement GÉNÉRIQUES (`caisse_externe_*`, pas `zelty_*`),
-- exactement comme la 0140 pour les commandes : le connecteur doit survivre à
-- un changement de caisse. SumUp a été remplacé par Zelty en quatre mois.
--
-- ⚠️ Cette migration ne fait AUCUNE hypothèse sur la forme des données de la
-- caisse — elle est volontairement posée AVANT le connecteur, qui lui ne sera
-- écrit que sur une charge utile réelle. `GET /bookings` répond 200 mais rend
-- une liste vide : ni les noms de champs, ni le codage des statuts ne sont
-- connus, et cette API a déjà coûté cher à ce projet sur exactement ce point
-- (`expand[]=items`, la TVA en millièmes, les `null` refusés par zod).
--
-- L'identifiant distant est en TEXTE : Zelty numérote ses objets en entiers,
-- mais une autre caisse utilisera un uuid, et un identifiant ne sert jamais à
-- compter.
-- ============================================================

do $$ begin
  alter table reservations_tables
    add column if not exists caisse_externe_systeme text,
    add column if not exists caisse_externe_id      text,
    add column if not exists caisse_externe_at      timestamptz;
exception when duplicate_column then null; end $$;

-- Une réservation de la caisse ne doit entrer qu'UNE fois, même si le miroir
-- est rejoué ou si deux passages se chevauchent.
create unique index if not exists idx_resa_tables_caisse_externe
  on reservations_tables(caisse_externe_systeme, caisse_externe_id)
  where caisse_externe_id is not null;

-- Ce qui n'est pas encore parti vers la caisse : c'est la file d'attente,
-- exactement comme pour les commandes web (0140). Un envoi raté laisse
-- l'identifiant à NULL et repart au tour suivant.
create index if not exists idx_resa_tables_a_envoyer
  on reservations_tables(date_resa)
  where caisse_externe_id is null and statut in ('demande', 'confirmee');

-- Supabase réactive RLS après toute création via le SQL Editor.
alter table reservations_tables disable row level security;

-- ─── Diagnostic ────────────────────────────────────────────
select 'reservations_tables' as table_,
       count(*) as lignes,
       count(*) filter (where caisse_externe_id is not null) as liees_a_la_caisse,
       count(*) filter (where canal = 'site_web')            as depuis_le_site
from reservations_tables;

select c.relname, c.relrowsecurity as rls_active
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'reservations_tables';
