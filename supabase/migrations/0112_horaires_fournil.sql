-- ════════════════════════════════════════════════════════════════════
-- 0112 — Amplitude d'ouverture du Fournil
-- ════════════════════════════════════════════════════════════════════
-- Borne les heures de retrait proposées sur le site (« Commander »).
-- Le code retombe sur 06:00 / 20:00 si ces lignes sont absentes, donc la
-- migration est facultative — elle sert à pouvoir ajuster les horaires
-- depuis l'admin (saison, jour férié) sans redéploiement.
--
-- Inerte : ne change rien à ce que voit le public.
-- ════════════════════════════════════════════════════════════════════

insert into parametres (cle, valeur) values
  ('fournil_ouverture', '06:00'),
  ('fournil_fermeture', '20:00')
on conflict (cle) do nothing;

-- ─── Diagnostic ──────────────────────────────────────────────────────
do $$
declare r record;
begin
  raise notice '── Paramètres Fournil ──';
  for r in
    select cle, valeur from parametres
    where cle like 'fournil\_%' order by cle
  loop
    raise notice '  % = %', r.cle, r.valeur;
  end loop;
end $$;
