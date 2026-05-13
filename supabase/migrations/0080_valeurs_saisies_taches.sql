-- Module : valeurs saisies sur tâches obligatoires (températures, fond caisse,
-- kilométrage, comptage boissons, etc.). Une ligne = une saisie validée par
-- un employé pour une tâche donnée à une date donnée.
--
-- Lié à la matrice statique `TACHES` dans src/lib/taches-du-jour.ts via tache_id.
-- Permet au gérant de consulter en /admin/hygiene les valeurs réelles relevées.

create table if not exists valeurs_saisies_taches (
  id            uuid primary key default gen_random_uuid(),
  tache_id      text not null,                              -- ex: 'c-m-temp-frigo-principal'
  employe_id    uuid not null references employes(id) on delete cascade,
  date          date not null default current_date,
  poste         text,                                       -- 'cuisinier', 'snacking', 'pizzaiolo'…
  moment        text,                                       -- 'matin' | 'service' | 'fin'

  -- Valeur saisie (un seul des 2 champs sera renseigné selon type)
  type_saisie   text not null check (type_saisie in ('temperature','montant','nombre','texte')),
  valeur_num    numeric(10, 2),                             -- pour temperature / montant / nombre
  valeur_texte  text,                                       -- pour texte libre
  unite         text,                                       -- '°C', '€', 'km', 'L', 'kg'…
  commentaire   text,                                       -- remarque optionnelle de l'employé

  cree_le       timestamptz not null default now()
);

create index if not exists idx_valeurs_saisies_employe_date  on valeurs_saisies_taches(employe_id, date desc);
create index if not exists idx_valeurs_saisies_date          on valeurs_saisies_taches(date desc);
create index if not exists idx_valeurs_saisies_tache         on valeurs_saisies_taches(tache_id, date desc);

-- RLS désactivée pour cohérence avec le reste du schéma (cf. 0002_disable_rls.sql).
-- Sécurité applicative dans les server actions.
alter table valeurs_saisies_taches disable row level security;
