// Quick debug : inspecte capacite_cuisine_par_creneau pour comprendre pourquoi
// aucun créneau n'apparaît dans la modal snack.

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

const today = new Date()
const jourSemaine = today.getDay()
const dateStr = today.toISOString().slice(0, 10)

console.log(`\n== Date : ${dateStr} (jour_semaine = ${jourSemaine}) ==\n`)

const { data: configs, error } = await sb
  .from('capacite_cuisine_par_creneau')
  .select('id, jour_semaine, heure_debut, heure_fin, duree_creneau_min, max_commandes, tag_destination, actif')
  .order('tag_destination')
  .order('jour_semaine')

if (error) {
  console.error('Erreur :', error.message)
  process.exit(1)
}

if (!configs || configs.length === 0) {
  console.log('❌ Table capacite_cuisine_par_creneau VIDE.')
  console.log('   Aucun planning configuré → aucun créneau ne peut être proposé.')
  console.log('   Solution : aller dans /admin/capacite-cuisine pour en créer.')
  process.exit(0)
}

console.log(`${configs.length} config(s) trouvées :\n`)

// Group by tag
const parTag = {}
for (const c of configs) {
  const tag = c.tag_destination ?? '(null)'
  if (!parTag[tag]) parTag[tag] = []
  parTag[tag].push(c)
}

for (const [tag, list] of Object.entries(parTag)) {
  console.log(`── ${tag} : ${list.length} config(s) ──`)
  for (const c of list) {
    const dayName = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][c.jour_semaine] ?? '?'
    const isToday = c.jour_semaine === jourSemaine ? ' ← AUJOURD\'HUI' : ''
    console.log(`   ${dayName} ${c.heure_debut}–${c.heure_fin} (${c.duree_creneau_min}min, max ${c.max_commandes}) actif=${c.actif}${isToday}`)
  }
  console.log()
}

// Verdict
const tags = ['SNACKING', 'PIZZA', 'BAR']
console.log('\n== Verdict pour la modal /emporter ==')
for (const t of tags) {
  const aujourdHui = (parTag[t] ?? []).filter(c => c.jour_semaine === jourSemaine && c.actif)
  if (aujourdHui.length === 0) {
    console.log(`  ❌ ${t} : aucun créneau actif pour aujourd'hui`)
  } else {
    console.log(`  ✓ ${t} : ${aujourdHui.length} plage(s) actives aujourd'hui`)
  }
}
