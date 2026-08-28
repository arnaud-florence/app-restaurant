-- 0148 — Un mi-temps fait 17,5 h, pas 17 ni 18
--
-- `employes.heures_contrat` était un ENTIER. Le temps partiel le plus courant
-- en France — la moitié de 35 h — y est donc inexprimable, et PostgREST
-- refuse l'écriture (22P02) plutôt que d'arrondir.
--
-- Refuser vaut mieux qu'arrondir en silence, mais le bon comportement est
-- d'accepter : 17 h ou 18 h à la place de 17,5 décalent le salaire mensuel
-- d'une trentaine d'euros, et ce décalage se propage à la masse salariale,
-- à l'alerte « > 35 % du CA », au coût par shift du planning et à l'EBE —
-- donc à la valorisation du fonds. Personne ne remonterait de là jusqu'à
-- une colonne mal typée.
--
-- 24 h, 28 h, 30,5 h : les quotités partielles sont la règle en restauration,
-- pas l'exception.

alter table employes
  alter column heures_contrat type numeric(5,2)
  using heures_contrat::numeric(5,2);

comment on column employes.heures_contrat is
  'Heures HEBDOMADAIRES du contrat. Décimal : un mi-temps fait 17,5 h. '
  'Mensualisation = heures_contrat × 52 / 12.';

alter table employes disable row level security;

-- Diagnostic
select
  (select data_type from information_schema.columns
    where table_name = 'employes' and column_name = 'heures_contrat')      as type_colonne,
  (select count(*) from employes where actif)                             as actifs,
  (select relrowsecurity from pg_class where relname = 'employes')         as rls_active;
