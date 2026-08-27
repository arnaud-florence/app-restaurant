// Index du catalogue Arti'Pat — la gamme boulangerie de Gineys.
//
// 292 pages, 146 Mo : on ne l'ouvre pas page par page. Ce script en tire un
// index texte, dont on extrait ensuite les RÉFÉRENCES — la clé qui rend le
// rapprochement facture ↔ produit exact au lieu d'approximatif (0142).
//
// Structure d'une fiche produit :
//   75924  Paris Brest Individuel
//   Poids : 80 g - Carton : 33 pièces
//   Prix au carton : 42,75 €  ·  Prix indicatif pièce : 1,296 €
//
// ⚠️ Le prix du catalogue est INDICATIF (tarif public). Gineys consent une
// remise : sur les 34 lignes rapprochées d'août 2026, le prix payé est
// systématiquement 20 à 30 % sous le tarif. Un prix calculé AU-DESSUS du
// tarif indicatif signale donc un mauvais rapprochement, pas une hausse.
//
// Nécessite pdfjs-dist :  npm install --no-save pdfjs-dist@4
// Usage : node scripts/indexer-catalogue-artipat.mjs <chemin-du-pdf>

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import fs from 'node:fs'

const data = new Uint8Array(fs.readFileSync(process.argv[2] ?? '/Users/admin/Downloads/ARTIPAT_2026.pdf'))
const doc = await getDocument({ data, useSystemFonts: true }).promise
console.error(`pages : ${doc.numPages}`)

const out = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const tc = await page.getTextContent()
  const txt = tc.items.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim()
  out.push(`${i}\t${txt}`)
  if (i % 200 === 0) console.error(`  … ${i}`)
  page.cleanup()
}
fs.writeFileSync('/tmp/artipat-index.tsv', out.join('\n'))
console.error(`index écrit : ${out.length} pages`)
