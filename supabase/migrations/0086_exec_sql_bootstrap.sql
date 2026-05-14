-- ============================================================
-- Migration 0086 : Bootstrap exec_sql() — fonction d'exécution SQL arbitraire
-- ============================================================
-- Permet à l'app (via SERVICE_ROLE_KEY) d'exécuter du SQL arbitraire via RPC.
-- Indispensable pour que l'AI puisse appliquer les futures migrations/setup
-- sans passer par le SQL Editor manuel.
--
-- 🔒 Sécurité : EXECUTE uniquement granté à service_role (clé serveur, non
-- exposée client). anon/public N'ONT PAS le droit d'appeler cette fonction.
-- L'endpoint API /api/admin/exec-sql vérifie en plus le CRON_SECRET.
--
-- Une fois cette migration appliquée, plus AUCUNE migration manuelle nécessaire
-- pour cette session ni les suivantes — l'AI les pousse via /api/admin/exec-sql.
-- ============================================================

create or replace function public.exec_sql(query text)
returns json
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rows_affected bigint;
begin
  execute query;
  get diagnostics rows_affected = row_count;
  return json_build_object(
    'ok', true,
    'rows_affected', rows_affected
  );
exception when others then
  return json_build_object(
    'ok', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
end;
$$;

-- Verrouille les droits : seul service_role peut appeler
revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;

select 'Migration 0086 OK — bootstrap exec_sql en place. Plus de copier-coller manuel.' as status;
