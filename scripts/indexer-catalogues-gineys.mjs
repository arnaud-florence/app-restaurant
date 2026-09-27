// Les catalogues des marques distribuées par Gineys → les FAMILLES qui
// manquaient à nos 2 974 références.
//
//   node scripts/indexer-catalogues-gineys.mjs [--ecrire]
//
// Le portail Gineys range ses articles en 21 rayons mais ne les livre qu'au
// compte-gouttes (cf. `familles-gineys.mjs` : 4 rayons arrachés en vingt
// allers-retours). Les catalogues PDF des marques, eux, donnent la section
// de chaque produit — et surtout, leurs références SONT nos codes Gineys.
//
// ✅ Vérifié avant d'écrire une ligne : sur le catalogue Snacking Carigel,
// 16 références sur 16 existent déjà dans `catalogue_fournisseur` ; sur
// ArtiLab, 7 sur 8. Nos codes portent un zéro de tête (`0067822` ↔ `67822`).
//
// ⚠️ ON N'EXTRAIT QUE LA FAMILLE, PAS LE PRIX. Les prix de ces catalogues
// sont INDICATIFS — Gineys consent 20 à 30 % de remise (déjà documenté pour
// Arti'Pat). Les faire entrer dans `catalogue_fournisseur` écraserait des
// prix réellement payés par des tarifs publics.
//
// ⚠️ ET PAS LA DÉSIGNATION NON PLUS. Ces pages sont des grilles à trois
// colonnes : sur une même ligne, trois références et trois libellés se
// concaténent (« 677156783467822 »). Les recoller demande de reconstruire
// les colonnes par coordonnées — faisable, mais chaque catalogue a sa mise
// en page, et un libellé mal recollé décrirait un autre produit. On a déjà
// les désignations, par le portail : on ne prend que ce qui manque.
//
// La famille d'une référence = l'en-tête de section qui la SURPLOMBE. Une
// page en porte souvent plusieurs (« CHOCOLATS AU LAIT », puis « CHOCOLATS
// BLANCS », puis « BÂTONS DE CHOCOLAT ») : prendre l'en-tête de la page
// rangerait les bâtons sous les chocolats au lait.

import fs from 'node:fs'
import path from 'node:path'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const ECRIRE = process.argv.includes('--ecrire')
const DOSSIER = process.env.HOME + '/Downloads'

// ⚠️ Le catalogue GMS est ÉCARTÉ : ses références (32xxx, 36xxx) ne sont
// dans aucune de nos lignes — c'est l'assortiment grande distribution, pas
// celui du pro. Les indexer remplirait la base de familles fantômes.
//
// ⚠️ L'ORDRE COMPTE : le PREMIER catalogue qui connaît une référence donne
// sa famille. Les catalogues PRODUIT viennent donc en tête, et les livres
// d'INSPIRATION en dernier — leurs chapitres sont de la prose commerciale
// (« DANS LES BOIS », « LE VERGER », « P'TITS GOURMANDS ») : personne ne
// cherche un produit sous ce nom. Ils restent en repli, parce qu'une famille
// approximative vaut mieux que « non classé ».
const CATALOGUES = [
  ['CATALOGUE_GENERAL_ ArtiLab_2026.pdf',        'ArtiLab'],
  ['Catalogue_Snacking_Carigel.pdf',             'Carigel Snacking'],
  ['ARTIPAT_2026 (2).pdf',                       "Arti'Pat"],
  ["Arti'pat Festif 2026.pdf",                   "Arti'Pat Festif"],
  ['Catalogue EDT 2025.pdf',                     'EDT'],
  ['catalogue-suneo-2026-PDF Commercial.pdf',    'Suneo'],
  ['2512-hdg-catalogue-rhf-26-pages.pdf',        'HDG'],
  // ─── en repli seulement ───
  ['CARNET_INSPIRATION_2026_CARIGEL_PDF.pdf',    'Carigel Inspiration'],
  ['Mailing_Carigel_Septembre_2026.pdf',         'Carigel Septembre'],
]

/** Un en-tête de section : grand, en capitales, pas un prix ni un poids. */
function estEntete(t, h) {
  const s = t.trim()
  if (h < 10.5 || s.length < 4 || s.length > 46) return false
  if (!/^[A-ZÀ-ÜŒ0-9&'’\-\/ .]+$/.test(s)) return false
  if (!/[A-ZÀ-ÜŒ]{3}/.test(s)) return false
  // ⚠️ « 41%38%35% » et « 39% MG » sont de gros caractères eux aussi.
  if (/%|\bKG\b|\bG\b$|€/.test(s)) return false
  return true
}

/** ⚠️ Les titres sont parfois composés en lettres ESPACÉES
 *  (« T A P A S & F I N G E R F O O D ») — le piège déjà rencontré sur le
 *  pied de page de Gel Var. On les recolle. */
function recoller(s) {
  const mots = s.trim().split(/\s+/)
  const isoles = mots.filter(m => m.length === 1).length
  if (mots.length >= 5 && isoles / mots.length > 0.6) {
    return s.replace(/(?<=\S) (?=\S)/g, '').replace(/\s{2,}/g, ' ').trim()
  }
  return s.replace(/\s+/g, ' ').trim()
}

async function indexer(fichier, marque) {
  const p = path.join(DOSSIER, fichier)
  if (!fs.existsSync(p)) return { marque, erreur: 'absent', trouvees: new Map() }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: true }).promise
  const trouvees = new Map()   // ref → famille
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n)
    const vp = pg.getViewport({ scale: 1 })
    const items = (await pg.getTextContent()).items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ t: i.str, x: i.transform[4], width: i.width, y: vp.height - i.transform[5], h: Math.abs(i.transform[3]) }))

    // ⚠️ Un en-tête se lit sur la LIGNE RECOMPOSÉE, pas sur l'item isolé :
    // « ÉPICERIE » arrive souvent en deux morceaux (« É » puis « PICERIE »),
    // et tester les morceaux séparément donnait la famille « PICERIE ».
    const parLigne = new Map()
    for (const i of items) {
      const k = Math.round(i.y / 4)
      if (!parLigne.has(k)) parLigne.set(k, [])
      parLigne.get(k).push(i)
    }
    const entetes = []
    for (const [, l] of parLigne) {
      l.sort((a, b) => a.x - b.x)
      // ⚠️ Deux en-têtes peuvent partager une ligne (colonne gauche et
      // colonne droite). Recollés d'un bloc, ils donnaient des familles
      // comme « INCONTOURNABLESDESSERTS PÂTISSIERS ». On coupe dès que
      // l'écart horizontal dépasse la largeur d'un caractère — même
      // raisonnement que la reconstruction par coordonnées du devis
      // Félix Potin.
      let groupe = []
      const fermer = () => {
        if (!groupe.length) return
        const nom = recoller(groupe.map(i => i.t).join(''))
        const h = Math.max(...groupe.map(i => i.h))
        if (estEntete(nom, h)) entetes.push({ y: Math.min(...groupe.map(i => i.y)), nom })
        groupe = []
      }
      let finPrec = null
      for (const i of l) {
        const large = i.h * 0.9
        if (finPrec !== null && i.x - finPrec > large) fermer()
        groupe.push(i)
        finPrec = i.x + (i.width ?? i.t.length * i.h * 0.5)
      }
      fermer()
    }
    entetes.sort((a, b) => a.y - b.y)
    for (const i of items) {
      for (const m of i.t.matchAll(/(?<![\d.,])(\d{5})(?![\d.,])/g)) {
        // ⚠️ L'en-tête le plus proche AU-DESSUS, pas celui de la page :
        // une page porte souvent trois sections.
        let fam = null
        for (const e of entetes) { if (e.y <= i.y + 2) fam = e.nom; else break }
        if (fam && !trouvees.has(m[1])) trouvees.set(m[1], fam)
      }
    }
  }
  await doc.destroy()
  return { marque, pages: doc.numPages, trouvees }
}

// ─── Nos lignes Gineys ────────────────────────────────────────────
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
const lignes = []
for (let de = 0; de < 20000; de += 1000) {
  const lot = await sb(`catalogue_fournisseur?select=id,reference,designation,famille&actif=eq.true&offset=${de}&limit=1000`)
  lignes.push(...lot); if (lot.length < 1000) break
}
const parRef = new Map()
for (const l of lignes) {
  const c = String(l.reference).replace(/^0+/, '')
  if (!parRef.has(c)) parRef.set(c, [])
  parRef.get(c).push(l)
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · familles depuis les catalogues ──\n`)
console.log(`${lignes.length} lignes au catalogue tarifaire\n`)

const aPoser = new Map()   // id → famille
for (const [fichier, marque] of CATALOGUES) {
  const r = await indexer(fichier, marque)
  if (r.erreur) { console.log(`  ✗ ${marque.padEnd(20)} ${r.erreur}`); continue }
  let connues = 0, nouvelles = 0
  for (const [ref, fam] of r.trouvees) {
    const nos = parRef.get(ref); if (!nos) continue
    connues++
    // ⚠️ Premier arrivé, premier servi : un catalogue produit ne doit pas
    // être écrasé par un livre d'inspiration lu plus tard.
    for (const l of nos) if (!l.famille && !aPoser.has(l.id)) { aPoser.set(l.id, fam); nouvelles++ }
  }
  console.log(`  ${marque.padEnd(20)} ${String(r.pages).padStart(3)} p · ${String(r.trouvees.size).padStart(4)} réf. · ${String(connues).padStart(4)} chez nous · ${String(nouvelles).padStart(4)} famille(s) à poser`)
}

const parFam = {}
for (const f of aPoser.values()) parFam[f] = (parFam[f] || 0) + 1
console.log(`\n  ${aPoser.size} ligne(s) à catégoriser · ${Object.keys(parFam).length} famille(s) distinctes`)
console.log(`  Top 18 :`)
Object.entries(parFam).sort((a, b) => b[1] - a[1]).slice(0, 18)
  .forEach(([k, v]) => console.log(`     ${String(v).padStart(4)}  ${k}`))

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
let n = 0
for (const [id, famille] of aPoser) {
  await sb(`catalogue_fournisseur?id=eq.${id}`, {
    method: 'PATCH', body: JSON.stringify({ famille }), headers: { Prefer: 'return=minimal' },
  })
  if (++n % 100 === 0) process.stdout.write(`\r  écrit ${n}/${aPoser.size}`)
}
console.log(`\n\n✓ ${n} famille(s) posée(s).\n`)
