-- Centre de notifications internes (alertes manager/employé).
-- Utilisé pour : NC critique, demande/validation congé, pourboires versés, etc.

create table if not exists notifications (
  id                       uuid primary key default gen_random_uuid(),
  destinataire_employe_id  uuid references employes(id) on delete cascade,    -- null = destinée au(x) manager(s)
  type                     text not null check (type in (
    'nc_critique',
    'conge_demande',
    'conge_validee',
    'conge_refusee',
    'pourboires_distribues',
    'challenge_atteint',
    'formation_expire',
    'message_general'
  )),
  titre                    text not null,
  message                  text not null,
  url_action               text,                                              -- ex /admin/hygiene
  lu                       boolean not null default false,
  email_envoye             boolean not null default false,                    -- pour future intégration Resend
  created_at               timestamptz not null default now()
);

create index if not exists idx_notifs_destinataire on notifications(destinataire_employe_id, lu, created_at desc);
create index if not exists idx_notifs_manager on notifications(created_at desc) where destinataire_employe_id is null;
create index if not exists idx_notifs_type on notifications(type, created_at desc);

alter table notifications disable row level security;

do $$ begin raise notice 'notifications créée'; end $$;
