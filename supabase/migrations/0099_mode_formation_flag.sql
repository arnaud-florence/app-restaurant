-- 0099 — Flag global « mode formation »
--
-- Quand parametres.mode_formation = 'true' :
--   • les 15 agents IA sont en pause (cf. src/lib/agents/runner.ts runAgent)
--   • un bandeau « MODE FORMATION » s'affiche (cf. FormationBanner.tsx)
--
-- Sert pendant la phase de prise en main par les équipes avant l'ouverture.
-- Bascule via : node scripts/mode-formation.mjs on|off|status

insert into parametres (cle, valeur, description)
values ('mode_formation', 'false',
        'Mode formation/entraînement : true = agents IA en pause + bandeau visible')
on conflict (cle) do nothing;

-- Diagnostic
do $$
declare v text;
begin
  select valeur into v from parametres where cle = 'mode_formation';
  raise notice '0099 OK — mode_formation = %', coalesce(v, '(absent)');
end $$;
