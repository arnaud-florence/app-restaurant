-- ════════════════════════════════════════════════════════════════════
-- ⛔ RETIRÉ LE 28 AOÛT 2026 — NE PAS REJOUER
-- ════════════════════════════════════════════════════════════════════
-- SumUp est abandonné : l'établissement passe sur UN logiciel Zelty et
-- DEUX caisses Zelty couvrant toutes les activités. `sumup-sync` a été
-- déplanifié (select cron.unschedule('sumup-sync')) au moment où le
-- Fournil était fermé — dernier ticket le 24 août — donc aucune vente
-- n'a été perdue dans la bascule.
--
-- ⚠️ LES DONNÉES SUMUP RESTENT, ET DOIVENT RESTER. 426 tickets, 2 357 €
-- du 17 au 24 août : c'est TOUT l'historique de vente réel de la maison.
-- Il alimente /admin/ventes, /admin/patrimoine, le rapprochement et le
-- calcul du food cost. Ne jamais purger `encaissements_externes` sur
-- source_caisse = 'sumup', ni les commandes qui en découlent.
--
-- Ce fichier est conservé pour mémoire : si un écart apparaît un jour sur
-- les chiffres d'août, il documente comment ils sont entrés.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- Synchro SumUp automatique — APPLIQUÉ le 20 août 2026
-- ════════════════════════════════════════════════════════════════════
-- Sans planification, le chiffre d'affaires n'entrait dans l'outil que si
-- quelqu'un cliquait « Lancer la synchronisation ». Une synchro qu'on
-- déclenche à la main n'en est pas une : au premier coup de feu personne
-- n'y pense, et le chiffre du jour est faux au moment précis où on le
-- regarde.
--
-- Pourquoi pas un cron Vercel : le plan Hobby plafonne à 2 tâches — déjà
-- prises par la collecte d'avis et les rappels de réservation — et ne les
-- exécute qu'une fois par jour.
--
-- ─── Pourquoi call_sumup() ne contient PAS le secret ─────────────────
-- Les 16 agents passent par call_agent(), qui porte `cron_secret` en
-- constante. On aurait pu recopier la même constante ici. On ne l'a pas
-- fait : le secret n'existe qu'à UN endroit, donc le jour où il tourne, il
-- n'y a qu'une fonction à refaire au lieu de deux qui divergent en
-- silence. Accessoirement, il n'a jamais eu à transiter par un
-- presse-papier ni une conversation.
--
-- Ce fichier ne contient aucun secret : il peut être committé.
-- Rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.call_sumup(jours int default 1)
returns bigint
language plpgsql
security definer
as $function$
declare
  src         text;
  base_url    text;
  cron_secret text;
  req_id      bigint;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'call_agent' limit 1;
  if src is null then
    raise exception 'call_agent() introuvable — impossible de retrouver le secret';
  end if;

  base_url    := substring(src from 'base_url constant text := ''([^'']+)''');
  cron_secret := substring(src from 'cron_secret constant text := ''([^'']+)''');
  if base_url is null or cron_secret is null then
    raise exception 'Secret ou URL illisibles dans call_agent()';
  end if;

  select net.http_post(
    url     := base_url || '/api/cron/caisse/sumup?jours=' || jours::text,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 55000
  ) into req_id;
  return req_id;
end$function$;

-- Toutes les 10 minutes : assez fin pour que le CA du jour soit à jour quand
-- on ouvre le tableau de bord, assez espacé pour ne pas marteler l'API SumUp
-- (chaque passage = un appel de liste + un appel par ticket).
--
-- jours=1 : inutile de redemander une semaine toutes les 10 minutes.
-- L'idempotence (source_caisse + ticket_externe) protège du double comptage.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sumup-sync') then
    perform cron.unschedule('sumup-sync');
  end if;
  perform cron.schedule('sumup-sync', '*/10 * * * *', 'select call_sumup(1)');
end $$;

-- ─── Vérification ────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job where jobname = 'sumup-sync';
--   select status_code, count(*) from net._http_response
--    where created > now() - interval '1 hour' group by 1;
-- Tout code différent de 200 = synchro en panne.
