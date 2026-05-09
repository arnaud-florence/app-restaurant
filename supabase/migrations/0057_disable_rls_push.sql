-- Patch : Supabase a réactivé la RLS sur push_subscriptions après le CREATE TABLE.
-- On la désactive explicitement (pattern récurrent — voir migrations 0040, 0042, 0044…).

alter table push_subscriptions disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into   rls
  from   pg_class
  where  relname = 'push_subscriptions';
  raise notice 'push_subscriptions RLS = %', rls;
end $$;
