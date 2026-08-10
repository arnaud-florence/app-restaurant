-- 0102 — Journal d'activité « qui a fait quoi » + PIN opérateur
--
-- Les colonnes PIN existent déjà sur employes (migration 0093 : pin_hash,
-- pin_salt, pin_essais, pin_lock_until, pin_last_try). On les réutilise pour
-- TOUS les employés (pas seulement les managers).
--
-- Nouveau : table journal_activite — chaque action métier sur les écrans de
-- service est estampillée avec l'opérateur (celui qui a « pris le poste » via PIN).

create table if not exists journal_activite (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid references employes(id) on delete set null,
  employe_nom  text,                       -- dénormalisé (l'employé peut être supprimé)
  action       text not null,              -- 'encaissement','commande_creee','statut','stock_entree'…
  zone         text,                       -- 'Caisse','Cuisine','Salle'…
  cible        text,                       -- libellé : 'Table 4', 'Cmd #12', nom ingrédient…
  details      jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

create index if not exists idx_journal_activite_created on journal_activite(created_at desc);
create index if not exists idx_journal_activite_employe on journal_activite(employe_id, created_at desc);

alter table journal_activite disable row level security;

-- Realtime pour le flux live dans /admin/supervision
do $$
begin
  alter publication supabase_realtime add table journal_activite;
exception when duplicate_object then null;
end $$;

do $$
begin
  raise notice '0102 OK — journal_activite prêt';
end $$;
