// Simule ce que /formation/page.tsx renvoie pour un user donné (par email).
// node scripts/test-filter-formation.mjs <email>

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const POSTE_ALIAS = {
  cuisine:        ['cuisine', 'cuisinier'],
  cuisinier:      ['cuisine', 'cuisinier'],
  pizzaiolo:      ['pizzaiolo'],
  bar:            ['bar', 'barman'],
  barman:         ['bar', 'barman'],
  serveur:        ['serveur', 'salle'],
  salle:          ['serveur', 'salle'],
  receptionniste: ['receptionniste'],
  manager:        ['manager', 'gerant'],
  gerant:         ['manager', 'gerant'],
  second:         ['second'],
  plonge:         ['plonge', 'extra'],
  extra:          ['plonge', 'extra'],
  autre:          ['autre'],
}
function guideAccessible(posteEmploye, posteGuide) {
  if (posteGuide === 'tous') return true
  if (!posteEmploye) return false
  const aliases = POSTE_ALIAS[posteEmploye] ?? [posteEmploye]
  return aliases.includes(posteGuide)
}

const email = process.argv[2] ?? 'contact.winedesign@gmail.com'
console.log(`Test pour ${email}\n`)

const { data: profil } = await sb.from('profils').select('*').eq('email', email).maybeSingle()
console.log('PROFIL:', profil)

if (!profil) { console.log('❌ aucun profil'); process.exit(1) }

const isManager = profil.role === 'manager'
console.log(`\nisManager=${isManager}  poste=${profil.poste}  employe_id=${profil.employe_id}`)

const { data: guides } = await sb.from('guides_formation').select('id, titre, poste').eq('actif', true).order('ordre')
console.log('\nGUIDES TOUS :')
for (const g of guides ?? []) console.log(`  ${g.titre.padEnd(28)} poste=${g.poste}`)

let guidesFiltres = guides ?? []
if (profil && !isManager && profil.poste) {
  guidesFiltres = guidesFiltres.filter(g => guideAccessible(profil.poste, g.poste))
}
console.log(`\nAPRÈS FILTRE (poste employe='${profil.poste}') : ${guidesFiltres.length} guide(s)`)
for (const g of guidesFiltres) console.log(`  ✓ ${g.titre} (poste=${g.poste})`)

process.exit(0)
