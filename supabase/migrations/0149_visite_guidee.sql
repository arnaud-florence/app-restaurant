-- 0149 — Visite guidée : accompagner les premières connexions
--
-- L'onboarding existant (/formation/onboarding, imposé par le middleware) est
-- une PORTE : lire un guide, réussir un quiz, et l'accès s'ouvre. Utile, mais
-- il ne fait entrer personne DANS les écrans — après le quiz, on est lâché sur
-- une application de vingt-huit modules sans savoir par où commencer.
--
-- La visite guidée est l'autre moitié : elle emmène la personne d'écran en
-- écran, dit ce qu'il faut y regarder, et nomme les pièges à l'endroit exact
-- où on peut tomber dedans.
--
-- ⚠️ L'étape est portée par le PROFIL, pas par le navigateur. Une visite
-- commencée sur l'ordinateur du bureau se reprend sur la tablette du comptoir,
-- et un localStorage vidé ne la fait pas recommencer à zéro. C'est aussi ce qui
-- permet au gérant de voir qui a fait la visite et qui l'a passée.
--
--   null = jamais commencée
--   N    = étape en cours (1-indexée)
--   -1   = terminée, ou passée volontairement

alter table profils
  add column if not exists visite_guidee_etape integer;

comment on column profils.visite_guidee_etape is
  'Visite guidée : null = jamais commencée, N = étape en cours, -1 = terminée ou passée.';

alter table profils disable row level security;

-- Diagnostic
select
  (select count(*) from profils)                                        as profils,
  (select count(*) from profils where visite_guidee_etape is null)      as jamais_commencee,
  (select count(*) from profils where visite_guidee_etape = -1)         as terminee;
