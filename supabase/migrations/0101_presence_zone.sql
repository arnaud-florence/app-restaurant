-- 0101 — Zone de présence (sur quel écran est l'employé connecté)
--
-- Alimentée par un battement côté navigateur (~60 s) via POST /api/presence,
-- qui met aussi à jour derniere_activite. Affiché dans /admin/supervision
-- (« en ligne — sur Cuisine »). Ne concerne que les employés CONNECTÉS.

alter table profils add column if not exists derniere_zone text;
alter table profils disable row level security;

do $$
begin
  raise notice '0101 OK — profils.derniere_zone présent';
end $$;
