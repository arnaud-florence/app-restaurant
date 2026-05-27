// Vérifie quels postes sont valides et quels guides formation existent par poste.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('\n─── Guides formation par poste ───')
const { data: guides } = await sb
  .from('guides_formation')
  .select('id, titre, poste, niveau, ordre')
  .order('poste').order('niveau').order('ordre')

const byPoste = {}
for (const g of guides) {
  byPoste[g.poste] = byPoste[g.poste] || []
  byPoste[g.poste].push(g)
}
for (const [poste, list] of Object.entries(byPoste)) {
  console.log(`\n  ${poste.toUpperCase()} (${list.length} guides) :`)
  for (const g of list) {
    const niv = g.niveau ? `[N${g.niveau}] ` : ''
    console.log(`    ${niv}${g.titre}`)
  }
}

console.log('\n─── Test insertion "snack" pour voir la CHECK constraint ───')
const { error } = await sb.from('employes').insert({ prenom: 'TEST', nom: 'SNACK', email: 'test-snack-check@example.invalid', poste: 'snack', actif: false })
if (error) {
  console.log(`  ❌ "snack" REJETÉ : ${error.message.slice(0, 200)}`)
} else {
  console.log('  ✓ "snack" est ACCEPTÉ comme poste !')
  await sb.from('employes').delete().eq('email', 'test-snack-check@example.invalid')
}
