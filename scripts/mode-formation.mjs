// Bascule le « mode formation » (flag global parametres.mode_formation).
//
// Quand ON : les 15 agents IA sont en pause + le bandeau « MODE FORMATION »
// s'affiche dans toute l'app. Quand OFF : fonctionnement normal.
//
// Usage :
//   node scripts/mode-formation.mjs status   # affiche l'état
//   node scripts/mode-formation.mjs on        # active la formation (agents en pause + bandeau)
//   node scripts/mode-formation.mjs off       # retour normal (production)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const action = (process.argv[2] || 'status').toLowerCase()
if (!['on', 'off', 'status'].includes(action)) {
  console.error('Usage : node scripts/mode-formation.mjs on|off|status')
  process.exit(1)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

async function readFlag() {
  const { data } = await sb.from('parametres').select('valeur').eq('cle', 'mode_formation').maybeSingle()
  return data?.valeur === 'true'
}

if (action === 'status') {
  const on = await readFlag()
  console.log(`\n🎓 Mode formation : ${on ? 'ACTIVÉ ✅ (agents en pause + bandeau visible)' : 'désactivé (production normale)'}\n`)
  process.exit(0)
}

const valeur = action === 'on' ? 'true' : 'false'
const { error } = await sb.from('parametres')
  .upsert({ cle: 'mode_formation', valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' })

if (error) {
  console.error('❌ Erreur :', error.message)
  process.exit(1)
}

if (action === 'on') {
  console.log('\n🎓 MODE FORMATION ACTIVÉ')
  console.log('   • Les 15 agents IA sont en pause (aucune notification parasite).')
  console.log('   • Le bandeau « MODE FORMATION » s\'affiche dans toute l\'app.')
  console.log('   • Les équipes peuvent s\'entraîner librement.')
  console.log('   → Pour revenir à la normale : node scripts/mode-formation.mjs off\n')
} else {
  console.log('\n✅ MODE FORMATION DÉSACTIVÉ — retour au fonctionnement normal (production).')
  console.log('   ⚠️  Pense à lancer la remise à zéro avant l\'ouverture :')
  console.log('   node scripts/reset-transactionnel.mjs --execute\n')
}
