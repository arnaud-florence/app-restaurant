// Renseigne les correspondances produit vendu ↔ matière achetée (0131).
//
// Ces libellés viennent des factures Gineys / Brake réellement scannées.
// Une fois posés, le scanner de factures met les coûts à jour TOUT SEUL à
// chaque livraison — ce script ne sert qu'à l'amorçage et aux ajouts.
//
// `unites` = combien d'unités VENDUES tire-t-on d'une unité ACHETÉE.
// Usage : node scripts/correspondances-achat.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// [produit vendu, libellé sur la facture, unités vendues par unité achetée]
const CORRESPONDANCES = [
  // Le nom du produit ne ressemble pas à celui de la matière
  ['Panuozzi',                'PATON A PIZZA',                 1],
  ['Pizza ronde Reine',       'PATON A PIZZA',                 1],
  ['Pizza ronde chèvre-miel', 'PATON A PIZZA',                 1],
  ['Pizza ronde poulet-pesto','PATON A PIZZA',                 1],
  ['Lin tournesol',           'BUCHE LIN TOURNSOL',            1],
  ['Moelleux choco',          'COULANT GOURMAND AU CHOCOLAT',  1],
  // Une même capsule sert deux boissons — d'où le `filter` dans la propagation
  ['Café expresso',           'Kit complet café Lavazza',      1],
  ['Café allongé',            'Kit complet café Lavazza',      1],
  ['Café noisette',           'Kit complet café Lavazza',      1],
  ['Cappuccino',              'Kit complet café Lavazza',      1],
  ['Chocolat chaud',          'dosettes chocolat Blue',        1],
  ['Thé',                     'Dosette Thé menthé',            1],
  // Un flan entier de 2 kg donne 10 parts
  ['Part de flan pâtissier',  'HAOU FLAN CRU',                10],
]

let ok = 0
const absents = []
for (const [nom, libelle, unites] of CORRESPONDANCES) {
  const { data, error } = await sb.from('recettes')
    .update({ libelle_achat: libelle, unites_par_achat: unites })
    .eq('nom', nom).eq('tag_destination', 'FOURNIL')
    .select('nom')
  if (error) { console.log(`  ✗ ${nom} : ${error.message}`); continue }
  if (!data?.length) { absents.push(nom); continue }
  console.log(`  ✓ ${nom.padEnd(26)} ← ${libelle}${unites !== 1 ? `  (÷ ${unites})` : ''}`)
  ok++
}
if (absents.length) console.log(`  · introuvables : ${absents.join(', ')}`)

const { count } = await sb.from('recettes')
  .select('*', { count: 'exact', head: true })
  .eq('tag_destination', 'FOURNIL').not('libelle_achat', 'is', null)
console.log(`\n── ${ok} correspondance(s) posée(s) · ${count} au total ──`)
