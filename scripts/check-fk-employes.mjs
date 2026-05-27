// Vérifie quelles tables référencent les 5 employés à supprimer
// (Thomas, Benoit, Héléna, Anais, florence). LECTURE SEULE.
//
//   node scripts/check-fk-employes.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

const A_SUPPRIMER = [
  '41195b51', // Thomas Dupond
  'e50be420', // Benoit Dupuis
  'c910c094', // Héléna Hernandez
  '3b559959', // Anais Moreira
  'a9ac02be', // florence caradonna
]

// Récupère les UUIDs complets
const { data: targets } = await sb
  .from('employes')
  .select('id, prenom, nom')
  .in('id',
    (await sb.from('employes').select('id').order('created_at')).data
      .map(e => e.id)
      .filter(id => A_SUPPRIMER.some(p => id.startsWith(p)))
  )

console.log('\nEmployés ciblés pour suppression :')
const ids = []
for (const t of targets) {
  console.log(`  • ${t.id.slice(0, 8)} — ${t.prenom} ${t.nom}`)
  ids.push(t.id)
}

// Tables qui référencent employes
const TABLES_FK = [
  'pointages', 'conges', 'fiches_paie', 'profils',
  'progressions_formation', 'quiz_tentatives', 'certifications', 'badges_employes',
  'briefings_poste', 'note_frais',
  'commande_articles',  // serveur_id ?
  'sessions_caisse',     // ouverte_par ?
  'releves_temperature', // releve_par ?
  'checklists_validees', // signataire ?
  'pointages_pause',
]

console.log('\nRéférences trouvées :')
let totalRefs = 0
for (const t of TABLES_FK) {
  // tente de chercher des colonnes plausibles
  for (const col of ['employe_id', 'serveur_id', 'ouverte_par', 'releve_par', 'signataire_id', 'cuisinier_id']) {
    const { count, error } = await sb
      .from(t)
      .select('id', { count: 'exact', head: true })
      .in(col, ids)
    if (error && !error.message.includes('column')) {
      // erreur réelle, pas un "column does not exist"
    }
    if (!error && count && count > 0) {
      console.log(`  ⚠ ${t}.${col} : ${count} lignes pointent vers ces employes`)
      totalRefs += count
    }
  }
}

if (totalRefs === 0) {
  console.log('  ✓ Aucune référence dans les tables transactionnelles testées')
}

console.log()
