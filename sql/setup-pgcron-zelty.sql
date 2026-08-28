-- ════════════════════════════════════════════════════════════════════
-- Planification du pont Zelty — 28 août 2026
-- ════════════════════════════════════════════════════════════════════
-- Cinq routes cron existaient pour le pont Zelty. Aucune n'était appelée
-- par quoi que ce soit. Le webhook order.ended couvre le temps réel, mais
-- un webhook n'a pas de mémoire : si une livraison échoue — déploiement en
-- cours, coupure réseau, 500 passager — la vente est perdue DÉFINITIVEMENT.
-- Personne ne la réclame, rien ne la redemande, et elle manque au chiffre
-- sans laisser de trace.
--
-- Le sondage n'est donc pas un doublon du webhook : c'est son filet.
--
-- ─── Le secret n'est écrit nulle part ────────────────────────────────
-- Même procédé que call_sumup() : on lit la constante dans le source de
-- call_agent(). Le secret n'existe qu'à UN endroit, donc le jour où il
-- tourne il n'y a qu'une fonction à refaire. Ce fichier ne contient aucun
-- secret et peut être committé. Rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.call_zelty(chemin text, params text default '')
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
    url     := base_url || chemin || params,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 55000
  ) into req_id;
  return req_id;
end$function$;

do $$
begin
  -- ─── Le filet du webhook ───────────────────────────────────────────
  -- Toutes les heures à HH:20 : les agents occupent HH:05 et HH:10, on ne
  -- se marche pas dessus. Deux jours de fenêtre, parce qu'un incident qui
  -- commence à 23 h doit être rattrapé le lendemain sans intervention.
  -- L'idempotence (source_caisse + ticket_externe) protège du double
  -- comptage : repasser sur une commande déjà ingérée ne fait rien.
  if exists (select 1 from cron.job where jobname = 'zelty-commandes') then
    perform cron.unschedule('zelty-commandes');
  end if;
  perform cron.schedule('zelty-commandes', '20 * * * *',
    $q$select call_zelty('/api/cron/caisse/zelty', '?jours=2')$q$);

  -- ─── Ce que la caisse a changé de son côté ─────────────────────────
  -- Une fois par nuit. Un prix corrigé au comptoir doit revenir dans
  -- l'outil, sinon les marges se calculent sur un tarif qui n'existe plus.
  -- Pas plus souvent : le miroir n'écrit rien, il signale.
  if exists (select 1 from cron.job where jobname = 'zelty-catalogue') then
    perform cron.unschedule('zelty-catalogue');
  end if;
  perform cron.schedule('zelty-catalogue', '10 3 * * *',
    $q$select call_zelty('/api/cron/caisse/zelty/catalogue')$q$);

  -- ─── Les ruptures, pendant le service seulement ────────────────────
  -- Toutes les 15 minutes de 4 h à 20 h UTC (6 h – 22 h Paris). Une
  -- rupture constatée au comptoir doit couper la vente en ligne vite :
  -- au-delà du quart d'heure, on vend ce qu'on n'a plus et il faut
  -- l'expliquer au client sur le pas de la porte. La nuit, rien ne change.
  if exists (select 1 from cron.job where jobname = 'zelty-disponibilites') then
    perform cron.unschedule('zelty-disponibilites');
  end if;
  perform cron.schedule('zelty-disponibilites', '*/15 4-20 * * *',
    $q$select call_zelty('/api/cron/caisse/zelty/disponibilites')$q$);

  -- ─── Le contrôle qui dit si tout ce qui précède fonctionne ─────────
  -- 5 h 30 UTC, après le filet de 5 h 20. Il compare ce qu'on a REÇU à ce
  -- qu'on en a COMPRIS. Sans lui, une ingestion qui perd 3 % des lignes
  -- depuis six semaines ne se voit nulle part : le CA reste juste — il
  -- vient des totaux — et seules les marges dérivent. On finit par
  -- accuser les fournisseurs.
  if exists (select 1 from cron.job where jobname = 'caisse-rapprochement') then
    perform cron.unschedule('caisse-rapprochement');
  end if;
  perform cron.schedule('caisse-rapprochement', '30 5 * * *',
    $q$select call_zelty('/api/cron/caisse/rapprochement', '?jours=3')$q$);
end $$;

-- ─── Volontairement NON planifié ─────────────────────────────────────
-- /api/cron/caisse/zelty/emission : envoie les commandes de casatasia.fr
-- vers la caisse. Tant qu'aucune méthode de paiement n'est configurée dans
-- Zelty, chaque passage échouerait en 400 « Méthode de paiement invalide »
-- et polluerait le monitoring, qui compte tout code ≠ 200 comme une panne.
-- À planifier le jour où le mode de paiement existe.
--
-- ⚠️ SUMUP TOURNE ENCORE (sumup-sync, toutes les 10 min). C'est voulu : le
-- Fournil vend sur SumUp aujourd'hui et Zelty est en mode école, donc il ne
-- rend aucune commande. Le jour du basculement, ARRÊTER sumup-sync —
-- sinon deux caisses alimentent le même chiffre d'affaires.
--     select cron.unschedule('sumup-sync');

-- ─── Vérification ────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job order by jobname;
--   select status_code, count(*) from net._http_response
--    where created > now() - interval '1 day' group by 1;
-- Tout code différent de 200 = pont en panne.
