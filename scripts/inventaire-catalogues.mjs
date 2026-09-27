// Que contiennent VRAIMENT ces catalogues ? On mesure avant d'extraire.
//
//   node scripts/inventaire-catalogues.mjs
//
// ⚠️ La leçon de Gel Var : sur seize catalogues, UN SEUL portait des prix,
// et son titre ne le disait pas — « Nos bonnes affaires BOULANGERIE » n'en
// avait aucun. Un intitulé n'est pas un contenu. Ce script cherche, page
// par page, ce qu'on peut réellement en tirer : texte extractible ou non,
// densité de références, de prix, de colisages.
//
// Verdict du 27/09/2026 sur les dix catalogues Gineys : tous extractibles,
// mais SEULS Arti'Pat et Arti'Pat Festif portent des prix. Les huit autres
// n'apportent que références, désignations et colisages — ce qui est
// précisément ce qui manquait (les familles).
import fs from 'node:fs'
import path from 'node:path'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const DOSSIER = process.env.HOME + '/Downloads'
const FICHIERS = [
  "Arti'pat Festif 2026.pdf",
  'ARTIPAT_2026 (2).pdf',
  'CARNET_INSPIRATION_2026_CARIGEL_PDF.pdf',
  'Catalogue EDT 2025.pdf',
  'Catalogue Général GMS 2026_Gineys.pdf',
  'catalogue-suneo-2026-PDF Commercial.pdf',
  'Catalogue_Snacking_Carigel.pdf',
  'CATALOGUE_GENERAL_ ArtiLab_2026.pdf',
  'Mailing_Carigel_Septembre_2026.pdf',
  '2512-hdg-catalogue-rhf-26-pages.pdf',
]

const RE_REF = /\b\d{6,8}\b/g
const RE_PRIX = /\d+[.,]\d{2}\s*€|€\s*\d+[.,]\d{2}/g
const RE_COLIS = /C\s*=\s*\d+|\bx\s?\d{1,3}\b/gi

for (const f of FICHIERS) {
  const p = path.join(DOSSIER, f)
  if (!fs.existsSync(p)) { console.log(`✗ ${f} — absent`); continue }
  const mo = (fs.statSync(p).size / 1048576).toFixed(0)
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: true }).promise
    const n = doc.numPages
    // échantillon : 6 pages réparties
    const idx = [...new Set([1, Math.ceil(n*0.2), Math.ceil(n*0.4), Math.ceil(n*0.6), Math.ceil(n*0.8), n])].filter(i=>i>=1&&i<=n)
    let texte = '', refs = 0, prix = 0, colis = 0
    for (const i of idx) {
      const pg = await doc.getPage(i)
      const c = await pg.getTextContent()
      const t = c.items.map(x => x.str).join(' ')
      texte += t + ' '
      refs += (t.match(RE_REF) || []).length
      prix += (t.match(RE_PRIX) || []).length
      colis += (t.match(RE_COLIS) || []).length
    }
    const parPage = (x) => (x / idx.length).toFixed(1)
    console.log(`\n▸ ${f}`)
    console.log(`   ${n} pages · ${mo} Mo · texte ${texte.length > 200 ? 'EXTRACTIBLE' : '⚠️ QUASI ABSENT (images ?)'} (${texte.length} car. sur ${idx.length} pages)`)
    console.log(`   par page — références ${parPage(refs)} · prix ${parPage(prix)} · colisages ${parPage(colis)}`)
    console.log(`   extrait : ${texte.replace(/\s+/g,' ').slice(0, 150)}`)
    await doc.destroy()
  } catch (e) {
    console.log(`\n▸ ${f}\n   ✗ illisible : ${String(e).slice(0, 80)}`)
  }
}
