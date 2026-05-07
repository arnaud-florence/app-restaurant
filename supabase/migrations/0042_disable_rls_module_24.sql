-- Patch : forcer RLS désactivée si Supabase l'a réactivée après le CREATE TABLE.
alter table assistant_conversations disable row level security;
alter table assistant_messages       disable row level security;

do $$
declare rls_conv text; rls_msg text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_conv
    from pg_class where relname='assistant_conversations';
  select case when relrowsecurity then 'ON' else 'OFF' end into rls_msg
    from pg_class where relname='assistant_messages';
  raise notice 'RLS post-patch — conv=% msg=%', rls_conv, rls_msg;
end $$;
