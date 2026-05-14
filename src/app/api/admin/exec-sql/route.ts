// ─── Endpoint admin : exécution de SQL arbitraire via service_role ───
//
// Permet à l'AI (ou n'importe quel script outillé) d'exécuter du SQL arbitraire
// (DDL, DML, fonctions, cron…) sans passer par le SQL Editor Supabase.
//
// Sécurité (multi-couches) :
//   1. Auth obligatoire : Bearer CRON_SECRET (env serveur, non commit)
//   2. La fonction PG exec_sql() est en security definer + grant uniquement
//      à service_role (qui n'est jamais exposée côté client)
//   3. createAdminClient() valide SUPABASE_SERVICE_ROLE_KEY
//
// Usage :
//   POST /api/admin/exec-sql
//   Authorization: Bearer ${CRON_SECRET}
//   Content-Type: application/json
//   { "sql": "CREATE TABLE ..." }
//
// Pré-requis : migration 0086_exec_sql_bootstrap.sql appliquée.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

export async function POST(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  let body: { sql?: string; statements?: string[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 }) }

  // Accepte soit `sql` (string unique) soit `statements` (array de strings exécutés séquentiellement)
  const statements = Array.isArray(body.statements) && body.statements.length > 0
    ? body.statements
    : (typeof body.sql === 'string' ? [body.sql] : [])
  if (statements.length === 0) {
    return NextResponse.json({ ok: false, error: 'Fournir `sql` (string) ou `statements` (array)' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Admin client init failed' }, { status: 500 })
  }

  const results: Array<{ index: number; ok: boolean; rows_affected?: number; error?: string; sqlstate?: string }> = []
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i]
    if (!sql || typeof sql !== 'string') {
      results.push({ index: i, ok: false, error: 'statement vide ou invalide' })
      continue
    }
    try {
      const { data, error } = await supabase.rpc('exec_sql', { query: sql })
      if (error) {
        results.push({ index: i, ok: false, error: error.message })
        continue
      }
      const r = data as { ok: boolean; rows_affected?: number; error?: string; sqlstate?: string }
      results.push({ index: i, ...r })
    } catch (e) {
      results.push({ index: i, ok: false, error: e instanceof Error ? e.message : 'inconnu' })
    }
  }

  const allOk = results.every(r => r.ok)
  return NextResponse.json({ ok: allOk, count: results.length, results }, { status: allOk ? 200 : 207 })
}
