// Phase 2 — Suppression des 5 employés (Thomas, Benoit, Héléna, Anais, florence)
// + leurs profils (2) + leurs progressions formation (4).
//
// Préserve : Arnaud CECCHERINI (44c3b7cd) et son profil manager.
//
// Backup pris : backups/backup-2026-05-27T06-44-27.json
//
//   node scripts/delete-test-employes.mjs

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
  { auth: { persistSession: false } },
)

// Récupère les UUIDs complets à partir des préfixes
const PREFIXES = ['41195b51', 'e50be420', 'c910c094', '3b559959', 'a9ac02be']
const ARNAUD_PREFIX = '44c3b7cd'

const { data: allEmployes } = await sb.from('employes').select('id, prenom, nom')
const idsToDelete = []
for (const e of allEmployes) {
  if (e.id.startsWith(ARNAUD_PREFIX)) continue
  if (PREFIXES.some(p => e.id.startsWith(p))) {
    idsToDelete.push({ id: e.id, name: `${e.prenom} ${e.nom}` })
  }
}

if (idsToDelete.length !== 5) {
  console.error(`❌ Sécurité : ${idsToDelete.length} employés cibles trouvés au lieu de 5. Abandon.`)
  process.exit(1)
}

console.log('Employés à supprimer (5) :')
for (const x of idsToDelete) console.log(`  • ${x.id.slice(0, 8)} — ${x.name}`)
const ids = idsToDelete.map(x => x.id)

// ─── Étape 1 — progressions_formation ────────────────────────────
console.log('\n→ Suppression progressions_formation…')
const { count: nProg, error: e1 } = await sb
  .from('progressions_formation')
  .delete({ count: 'exact' })
  .in('employe_id', ids)
if (e1) { console.error('  ❌', e1.message); process.exit(1) }
console.log(`  ✓ ${nProg ?? 0} progressions supprimées`)

// ─── Étape 1b — quiz_tentatives / certifications / badges si présents ────
for (const t of ['quiz_tentatives', 'certifications', 'badges_employes']) {
  const { count, error } = await sb.from(t).delete({ count: 'exact' }).in('employe_id', ids)
  if (error && !error.message.includes('does not exist')) {
    console.warn(`  ⚠ ${t} : ${error.message.slice(0, 60)}`)
  } else {
    console.log(`  ✓ ${t} : ${count ?? 0} supprimées`)
  }
}

// ─── Étape 2 — profils (Auth) ────────────────────────────────────
console.log('\n→ Suppression profils Auth (2 attendus)…')
const { data: profilsToDelete } = await sb
  .from('profils')
  .select('id, email, employe_id')
  .in('employe_id', ids)

console.log(`  → ${profilsToDelete?.length ?? 0} profils trouvés`)
for (const p of profilsToDelete ?? []) {
  console.log(`    • ${p.email}`)
}
const { count: nProf, error: e2 } = await sb
  .from('profils')
  .delete({ count: 'exact' })
  .in('employe_id', ids)
if (e2) { console.error('  ❌', e2.message); process.exit(1) }
console.log(`  ✓ ${nProf ?? 0} profils supprimés`)

// ─── Étape 3 — employes ──────────────────────────────────────────
console.log('\n→ Suppression employes (5 attendus)…')
const { count: nEmp, error: e3 } = await sb
  .from('employes')
  .delete({ count: 'exact' })
  .in('id', ids)
if (e3) { console.error('  ❌', e3.message); process.exit(1) }
console.log(`  ✓ ${nEmp ?? 0} employes supprimés`)

// ─── Vérification finale ─────────────────────────────────────────
console.log('\n─── Vérification finale ───')
const { count: remainEmp } = await sb.from('employes').select('id', { count: 'exact', head: true })
const { count: remainProf } = await sb.from('profils').select('id', { count: 'exact', head: true })
const { count: remainProg } = await sb.from('progressions_formation').select('id', { count: 'exact', head: true })
console.log(`  employes restants : ${remainEmp} (attendu 1 — Arnaud)`)
console.log(`  profils restants  : ${remainProf} (attendu 1 — Arnaud manager)`)
console.log(`  progressions restantes : ${remainProg} (attendu 0)`)

console.log('\n✅ Nettoyage terminé.')
console.log('⚠️  Les comptes Auth Supabase de Anais et florence sont encore actifs (orphans).')
console.log('    → Besoin de SUPABASE_SERVICE_ROLE_KEY pour les supprimer proprement via admin API.')
