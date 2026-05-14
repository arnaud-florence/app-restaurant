-- ============================================================
-- Migration 0084 : Push rate limits (3 notifs / heure / employé)
-- ============================================================
-- Évite le spam : un employé reçoit MAX 3 push par heure.
-- Quand un agent essaie d'envoyer une 4ème dans la même heure, c'est silencieux.
-- Sauf cas extrême (urgence rouge) où le code peut bypasser via force=true.
-- ============================================================

create table if not exists push_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid not null references employes(id) on delete cascade,
  hour_bucket  timestamptz not null,    -- début de l'heure UTC tronquée
  count        integer not null default 1,
  created_at   timestamptz not null default now(),
  unique (employe_id, hour_bucket)
);

create index if not exists idx_push_rate_employe_hour
  on push_rate_limits(employe_id, hour_bucket desc);

-- Nettoyage auto via pg_cron : supprime les buckets de plus de 7 jours
-- (table ne grossit pas indéfiniment)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- unschedule si déjà présent (idempotent)
    perform cron.unschedule('push_rate_limits_cleanup') where exists (
      select 1 from cron.job where jobname = 'push_rate_limits_cleanup'
    );
    perform cron.schedule(
      'push_rate_limits_cleanup',
      '0 4 * * *',                       -- 04h UTC tous les jours
      $sql$delete from push_rate_limits where hour_bucket < now() - interval '7 days'$sql$
    );
  end if;
end$$;

alter table push_rate_limits disable row level security;

select 'Migration 0084 OK' as status,
  (select count(*) from push_rate_limits) as nb_buckets;
