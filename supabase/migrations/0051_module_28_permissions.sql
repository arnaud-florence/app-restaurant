-- Module 28 v2 — Permissions par rôle
-- Étend profils pour porter le lien vers employes + overrides personnalisés.
-- employes.poste reste un text libre (pas de check) — la matrice de permissions
-- gère les valeurs reconnues côté lib.

alter table profils
  add column if not exists employe_id         uuid references employes(id) on delete set null,
  add column if not exists poste              text,                                              -- denormalized depuis employes.poste, mis à jour au lien
  add column if not exists custom_permissions jsonb;                                              -- { allowed?: string[], denied?: string[] }

create index if not exists idx_profils_employe on profils(employe_id) where employe_id is not null;
create index if not exists idx_profils_poste   on profils(poste)      where poste      is not null;

-- Bootstrap : pour les profils existants role='manager' qui n'ont pas de poste,
-- on initialise poste='manager' (donne accès complet via la matrice).
update profils set poste = 'manager' where role = 'manager' and poste is null;

do $$
declare nb_p int; nb_link int; nb_pos int;
begin
  select count(*) into nb_p    from profils;
  select count(*) into nb_link from profils where employe_id is not null;
  select count(*) into nb_pos  from profils where poste is not null;
  raise notice 'Module 28 v2 — profils=% lien_employe=% poste=%', nb_p, nb_link, nb_pos;
end $$;
