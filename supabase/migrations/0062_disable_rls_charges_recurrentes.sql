-- Patch — Supabase a auto-réactivé la RLS sur charges_fixes_recurrentes
-- (pattern récurrent — idem 0040, 0044, 0048, 0050, 0057, 0060…).

alter table charges_fixes_recurrentes disable row level security;

do $$
declare rls text;
begin
  select case when relrowsecurity then 'ON' else 'OFF' end
  into rls
  from pg_class
  where relname = 'charges_fixes_recurrentes';
  raise notice 'charges_fixes_recurrentes RLS = %', rls;
end $$;
