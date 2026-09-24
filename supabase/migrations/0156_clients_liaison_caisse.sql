-- ============================================================
-- 0156 — La liaison entre nos clients et ceux de la caisse
--
-- Aujourd'hui il y a DEUX fichiers clients, donc aucun des deux n'est LE
-- fichier client : celui qui commande sur casatasia.fr est ici (module 20 —
-- fidélité, allergies mémorisées, segments), celui qui donne son nom au
-- comptoir est chez Zelty. Le même habitué peut exister des deux côtés sans
-- que rien ne le relie, et sa fidélité se partage entre deux comptes dont
-- aucun n'est juste.
--
-- Mêmes noms génériques que pour les commandes (0140) et les réservations
-- (0155) : le connecteur doit survivre à un changement de caisse.
--
-- ⚠️ AUCUNE COLONNE DE CONSENTEMENT N'EST AJOUTÉE ICI, et c'est délibéré.
-- `opt_in_marketing` existe déjà, et Zelty porte de son côté
-- `accept_marketing`, `sms_optin` et `mail_optin`. Multiplier les colonnes
-- ferait perdre la trace de celle qui fait foi — or un consentement qu'on
-- devine est une infraction, pas un défaut d'affichage. Le miroir ne touche
-- JAMAIS `opt_in_marketing` d'un client existant.
-- ============================================================

do $$ begin
  alter table clients
    add column if not exists caisse_externe_systeme text,
    add column if not exists caisse_externe_id      text,
    add column if not exists caisse_externe_at      timestamptz;
exception when duplicate_column then null; end $$;

-- Un client de la caisse n'entre qu'une fois, même si le miroir est rejoué.
create unique index if not exists idx_clients_caisse_externe
  on clients(caisse_externe_systeme, caisse_externe_id)
  where caisse_externe_id is not null;

-- Le rapprochement se fait sur l'email puis le téléphone : ces deux colonnes
-- se lisent à chaque passage du miroir, sur toute la table.
create index if not exists idx_clients_email_rapprochement
  on clients(lower(email)) where email is not null;
create index if not exists idx_clients_telephone_rapprochement
  on clients(telephone) where telephone is not null;

alter table clients disable row level security;

-- ─── Diagnostic ────────────────────────────────────────────
select 'clients' as table_,
       count(*) as lignes,
       count(*) filter (where caisse_externe_id is not null) as liees_a_la_caisse,
       count(*) filter (where email is not null)             as avec_email,
       count(*) filter (where telephone is not null)         as avec_telephone
from clients;

select c.relname, c.relrowsecurity as rls_active
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'clients';
