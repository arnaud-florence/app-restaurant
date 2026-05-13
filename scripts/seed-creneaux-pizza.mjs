// One-shot : clone toutes les configs SNACKING de capacite_cuisine_par_creneau
// vers le tag PIZZA. Skip les lignes PIZZA existantes pour rester idempotent.
//
//   node scripts/seed-creneaux-pizza.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  const v = m[2].replace(/^['"]|['"]$/g, '').trim()
  if (!v) continue
  process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// 1. Charge toutes les configs SNACKING
const { data: snacks, error: e1 } = await sb
  .from('capacite_cuisine_par_creneau')
  .select('jour_semaine, heure_debut, heure_fin, duree_creneau_min, max_commandes, actif, etablissement_id')
  .eq('tag_destination', 'SNACKING')
if (e1) { console.error('Erreur lecture SNACKING :', e1.message); process.exit(1) }
console.log(`${snacks.length} configs SNACKING chargées`)

// 2. Charge les configs PIZZA déjà présentes pour skip
const { data: pizzasExistantes, error: e2 } = await sb
  .from('capacite_cuisine_par_creneau')
  .select('jour_semaine, heure_debut, heure_fin')
  .eq('tag_destination', 'PIZZA')
if (e2) { console.error('Erreur lecture PIZZA :', e2.message); process.exit(1) }
const cleExistantes = new Set(
  (pizzasExistantes ?? []).map(p => `${p.jour_semaine}|${p.heure_debut}|${p.heure_fin}`)
)
console.log(`${pizzasExistantes?.length ?? 0} configs PIZZA déjà existantes (skip)`)

// 3. Construit les nouvelles lignes à insérer
const aInserer = snacks
  .filter(s => !cleExistantes.has(`${s.jour_semaine}|${s.heure_debut}|${s.heure_fin}`))
  .map(s => ({
    jour_semaine: s.jour_semaine,
    heure_debut: s.heure_debut,
    heure_fin: s.heure_fin,
    duree_creneau_min: s.duree_creneau_min,
    max_commandes: s.max_commandes,
    actif: s.actif,
    etablissement_id: s.etablissement_id,
    tag_destination: 'PIZZA',
  }))

if (aInserer.length === 0) {
  console.log('\n✓ Toutes les plages SNACKING sont déjà clonées en PIZZA. Rien à faire.')
  process.exit(0)
}

console.log(`\n${aInserer.length} configs à insérer (clones SNACKING → PIZZA)`)

const { error: e3 } = await sb.from('capacite_cuisine_par_creneau').insert(aInserer)
if (e3) {
  console.error('\n❌ Erreur insertion :', e3.message)
  process.exit(1)
}

console.log('\n✓ Configs PIZZA insérées avec succès.')
console.log('  Vérification dans /admin/capacite-cuisine.')
