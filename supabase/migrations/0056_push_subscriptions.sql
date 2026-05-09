-- Module 28+ — Push notifications PWA.
-- Stocke les abonnements Web Push de chaque employé connecté pour pouvoir
-- envoyer des notifs server-side (article prêt → serveur, NC critique → manager).

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid not null references employes(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,            -- clé publique du navigateur (auth)
  auth         text not null,            -- secret partagé
  user_agent   text,
  created_at   timestamptz not null default now(),
  unique (endpoint)                      -- un endpoint = une souscription unique
);

create index if not exists push_subscriptions_employe_idx
  on push_subscriptions(employe_id);

alter table push_subscriptions disable row level security;

do $$ begin raise notice 'push_subscriptions créée'; end $$;
