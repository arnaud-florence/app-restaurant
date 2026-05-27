// Finalise la suppression bloquée par FK avec auto-detection.
//   node scripts/finish-delete-test-employes.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

const PREFIXES = ['41195b51', 'e50be420', 'c910c094', '3b559959', 'a9ac02be']
const ARNAUD = '44c3b7cd'

const { data: allEmployes } = await sb.from('employes').select('id, prenom, nom')
const ids = allEmployes
  .filter(e => !e.id.startsWith(ARNAUD) && PREFIXES.some(p => e.id.startsWith(p)))
  .map(e => e.id)

console.log(`→ ${ids.length} employes à finaliser`)

// Boucle : tente delete, lit le nom de la table FK dans l'erreur, nettoie, retry
const MAX_ATTEMPTS = 15
let attempt = 0
while (attempt < MAX_ATTEMPTS) {
  attempt++
  const { count, error } = await sb.from('employes').delete({ count: 'exact' }).in('id', ids)
  if (!error) {
    console.log(`\n✅ ${count} employes supprimés (tentative ${attempt})`)
    break
  }
  // Parse le nom de table : 'foreign key constraint "xxx_yyy_fkey" on table "ZZZ"'
  const m = error.message.match(/constraint "[^"]+" on table "([^"]+)"/)
  if (!m) {
    console.error(`❌ Erreur non-FK : ${error.message}`)
    process.exit(1)
  }
  const blockTable = m[1]
  console.log(`  ⚠ Bloqué par ${blockTable} — nettoyage…`)

  // Tente de nettoyer cette table (employe_id, serveur_id, signataire_id…)
  const cols = ['employe_id', 'serveur_id', 'cuisinier_id', 'ouverte_par', 'fermee_par', 'releve_par', 'signataire_id', 'createur_id', 'pizzaiolo_id', 'barman_id']
  let cleaned = false
  for (const c of cols) {
    const { count: nDel, error: e2 } = await sb.from(blockTable).delete({ count: 'exact' }).in(c, ids)
    if (e2?.message.includes('column') || e2?.message.includes('does not exist')) continue
    if (!e2) {
      if (nDel && nDel > 0) console.log(`    ✓ ${blockTable}.${c} : ${nDel} supprimées`)
      cleaned = true
      break
    }
  }
  if (!cleaned) {
    console.error(`❌ Impossible de nettoyer ${blockTable} — colonne inconnue.`)
    process.exit(1)
  }
}

const { count: remain } = await sb.from('employes').select('id', { count: 'exact', head: true })
console.log(`\n→ ${remain} employe(s) restant(s) (attendu : 1 — Arnaud)`)
