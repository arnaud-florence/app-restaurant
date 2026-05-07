-- Module 24 — Assistant IA gérant
-- Tables : conversations + messages
-- Le contexte (snapshot KPIs au démarrage de la conversation) est figé en jsonb sur la conversation.

create table if not exists assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null default 'Nouvelle conversation',
  contexte_snap   jsonb,                              -- KPIs gelés au début (CA, masse sal, food cost, alertes...)
  modele          text not null default 'claude-haiku-4-5',
  archivee        boolean not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists assistant_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references assistant_conversations(id) on delete cascade,
  role               text not null check (role in ('user','assistant','system')),
  contenu            text not null,
  tokens_in          integer,                          -- input tokens (uncached)
  tokens_out         integer,                          -- output tokens
  cache_read_tokens  integer,                          -- tokens lus depuis le cache (~0.1×)
  cache_write_tokens integer,                          -- tokens écrits dans le cache (~1.25×)
  stop_reason        text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_assistant_msg_conv on assistant_messages(conversation_id, created_at);
create index if not exists idx_assistant_conv_last on assistant_conversations(last_message_at desc) where archivee = false;

alter table assistant_conversations disable row level security;
alter table assistant_messages disable row level security;

-- diagnostic
do $$
declare nb_conv int; nb_msg int; rls_conv text; rls_msg text;
begin
  select count(*) into nb_conv from assistant_conversations;
  select count(*) into nb_msg  from assistant_messages;
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_conv
    from pg_class where relname='assistant_conversations';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_msg
    from pg_class where relname='assistant_messages';
  raise notice 'Module 24 — conv=% msg=% RLS conv=% msg=%', nb_conv, nb_msg, rls_conv, rls_msg;
end $$;
