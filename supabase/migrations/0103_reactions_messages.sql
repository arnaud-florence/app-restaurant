-- ────────────────────────────────────────────────────────────────────────
-- Réactions emoji sur les messages internes (chat équipe « façon Messenger »).
-- Une réaction par personne : reactions = { "<employe_id>": "<emoji>" }.
-- ────────────────────────────────────────────────────────────────────────

alter table if exists public.messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

-- Single-tenant : RLS désactivée (Supabase la réactive après exécution via le
-- SQL Editor → on la remet OFF).
alter table public.messages disable row level security;

-- ─── Diagnostic ───────────────────────────────────────────────────────────
select
  count(*)                                          as nb_messages,
  count(*) filter (where reactions <> '{}'::jsonb)  as nb_avec_reaction
from public.messages;
