-- ════════════════════════════════════════════════════════════════════
-- 0116 — Autoriser le type de notification « commande web reçue »
-- ════════════════════════════════════════════════════════════════════
-- /api/public/commande insère une notification de type
-- 'commande_online_recue' à chaque commande du site. Ce type ne figure pas
-- dans le check de la 0069 : l'insert était rejeté par Postgres à chaque
-- fois, et personne ne l'a vu parce que l'appel ne lisait pas `.error`
-- (supabase-js retourne l'erreur, il ne la lève pas — le try/catch autour
-- ne pouvait rien attraper).
--
-- Conséquence concrète : depuis l'ouverture de la commande en ligne, aucune
-- commande web n'a jamais déclenché la moindre alerte à l'équipe. Elles
-- n'étaient visibles qu'en regardant l'écran du comptoir au bon moment.
--
-- On ajoute le type plutôt que de replier sur 'message_general' : il sert au
-- filtrage et au routage des push, et une commande n'est pas un message.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table notifications drop constraint if exists notifications_type_check;

alter table notifications add constraint notifications_type_check
  check (type in (
    'nc_critique',
    'conge_demande',
    'conge_validee',
    'conge_refusee',
    'pourboires_distribues',
    'challenge_atteint',
    'formation_expire',
    'message_general',
    'commande_online_recue'
  ));

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint where conname = 'notifications_type_check';
  raise notice '── notifications_type_check ──';
  raise notice '  %', def;
  raise notice '  commande_online_recue autorisé : %',
    (def like '%commande_online_recue%');
end $$;
