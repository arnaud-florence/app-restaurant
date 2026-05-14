// Audit lecture seule : volume de chaque table métier pour identifier
// ce qui est seed/démo vs vraie donnée. Aucun write, sûr à lancer.
//
//   node scripts/audit-db.mjs

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

const GROUPS = {
  'Configuration': ['etablissement', 'parametres', 'profils'],
  'Carte & coûts': ['recettes', 'ingredients', 'boissons', 'tags_recettes', 'accords_mets_vins'],
  'Stock & achats': ['fournisseurs', 'mouvements_stock', 'factures_fournisseurs', 'bons_commande'],
  'Service & caisse': ['commandes', 'commande_articles', 'tables_restaurant', 'sessions_caisse', 'paiements'],
  'RH': ['employes', 'pointages', 'conges', 'fiches_paie'],
  'Clients & resa': ['clients', 'reservations', 'chambres', 'evenements_groupe', 'campagnes_marketing'],
  'Hygiène & légal': ['releves_temperature', 'checklists_validees', 'allergenes_etablissement', 'obligations_legales', 'equipements'],
  'Données IA & agents': ['agents_runs', 'agent_findings', 'assistant_conversations', 'assistant_messages', 'suggestions_ia', 'journal_entrees'],
  'Formation': ['guides_formation', 'progressions_formation', 'certifications', 'badges_employes'],
  'Public & avis': ['avis_clients', 'menu_du_jour', 'affichage_promos'],
  'Pilotage': ['objectifs', 'plan_action', 'releves_energie'],
}

let totalTables = 0
let totalRows = 0
let totalErrors = 0

for (const [groupName, tables] of Object.entries(GROUPS)) {
  console.log(`\n─── ${groupName} ───`)
  for (const t of tables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true })
    totalTables++
    if (error) {
      console.log(`  ${t.padEnd(30)} —  ${error.message.slice(0, 50)}`)
      totalErrors++
    } else {
      const n = count ?? 0
      totalRows += n
      const mark = n === 0 ? '·' : n > 100 ? '●' : '○'
      console.log(`  ${mark} ${t.padEnd(28)} ${String(n).padStart(6)} lignes`)
    }
  }
}

console.log(`\n${'═'.repeat(50)}`)
console.log(`Total : ${totalTables} tables auditées, ${totalRows} lignes au total, ${totalErrors} erreurs`)
console.log(`Légende : · = vide  ○ = quelques lignes  ● = >100 lignes`)
