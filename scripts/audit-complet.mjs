// LES QUATRE AUDITS, D'UN COUP — 02/10/2026.
//
// ⚠️ CE N'EST PAS UN AUDIT « LES PAGES RÉPONDENT ». Les audits de
// disponibilité passaient tous au vert pendant que le réassort ignorait les
// livraisons, que l'onglet Stock lisait un compteur mort depuis la 0135, que
// « Orange » aspirait les entrées du Fanta et qu'un café allait passer à 0,42
// centime au prochain scan. Aucun de ces défauts n'est visible tant que de
// vraies données n'ont pas traversé la chaîne.
//
// Chacun des quatre suit UN FAIT de bout en bout et dit ce qui NE marche pas.
//
//   node scripts/audit-complet.mjs
import { spawnSync } from 'node:child_process'

const AUDITS = [
  ['1. la livraison entre-t-elle en stock ?', 'audit-chaine-livraison.mjs'],
  ['2. la vente redescend-elle et nourrit-elle la marge ?', 'audit-chaine-vente.mjs'],
  ['3. la facture écrit-elle le bon prix, à la bonne unité ?', 'audit-chaine-facture.mjs'],
  ['4. le food cost se recalcule-t-il à la main ?', 'audit-food-cost.mjs'],
]
const bilan = []
for (const [titre, script] of AUDITS) {
  console.log(`\n${'═'.repeat(70)}\n  ${titre}\n${'═'.repeat(70)}`)
  const r = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' })
  bilan.push({ titre, ok: r.status === 0 })
}
console.log(`\n${'═'.repeat(70)}\n  BILAN\n${'═'.repeat(70)}\n`)
for (const b of bilan) console.log(`  ${b.ok ? '✓' : '✗'}  ${b.titre}`)
const ko = bilan.filter(b => !b.ok).length
console.log(`\n  ${bilan.length - ko} audit(s) au vert, ${ko} avec des points à traiter.`)
console.log('\n  ⚠️ Un audit au rouge n’est pas forcément une panne : plusieurs')
console.log('     constats sont des manques connus (références de facture jamais')
console.log('     extraites, ventes Zelty jamais passées en mode école). Ce qui')
console.log('     compte est que chacun soit NOMMÉ, pas qu’il soit vert.\n')
process.exit(0)
