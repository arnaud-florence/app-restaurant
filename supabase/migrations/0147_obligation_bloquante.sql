-- 0147 — Une obligation BLOQUANTE, c'est autre chose qu'une obligation en retard
--
-- L'agent HACCP alerte sur les échéances légales, mais uniquement quand une
-- DATE est renseignée (`.not('date_echeance','is',null)`). C'était suffisant
-- tant que le registre ne portait que des renouvellements — un contrôle gaz a
-- toujours une date.
--
-- Ça ne l'est plus. Le registre d'ouverture (septembre 2026) contient des
-- obligations qui n'ont PAS de date parce que personne ne les a encore
-- engagées : licence IV, permis d'exploitation, visite de la commission de
-- sécurité. Or c'est exactement l'inverse d'un signal rassurant — une
-- obligation bloquante sans date ne veut pas dire « rien à faire », elle veut
-- dire « pas commencé ».
--
-- Sans cette colonne, les 6 obligations qui peuvent empêcher l'ouverture
-- seraient les SEULES du registre à n'émettre aucune alerte.

alter table obligations_legales
  add column if not exists bloquant boolean not null default false;

comment on column obligations_legales.bloquant is
  'Empêche l''exploitation tant qu''elle n''est pas satisfaite (licence, permis, '
  'visite de sécurité). Alerte l''agent HACCP même SANS date d''échéance : '
  'l''absence de date y est le symptôme, pas une excuse.';

create index if not exists idx_obligations_bloquantes
  on obligations_legales(bloquant) where bloquant and statut <> 'fait';

alter table obligations_legales disable row level security;

-- Diagnostic
select
  (select count(*) from obligations_legales)                                    as total,
  (select count(*) from obligations_legales where bloquant)                     as bloquantes,
  (select count(*) from obligations_legales where date_echeance is null)        as sans_date,
  (select relrowsecurity from pg_class where relname = 'obligations_legales')    as rls_active;
