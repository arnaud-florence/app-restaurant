#!/usr/bin/env node
// Catalogues Gel Var — le référentiel produits, et les prix quand il y en a.
//
// 16 PDF téléchargés depuis l'espace client le 24/09/2026
// (`data/gelvar/`, gitignoré : documents commerciaux d'un tiers, dépôt public).
//
// ⚠️ UN SEUL DES SEIZE CATALOGUES PORTE DES PRIX : « Nos bonnes affaires
// RESTAURATION », 26 articles. Les quinze autres sont des catalogues
// PRODUITS — référence, désignation, colisage, photo, et rien d'autre — soit
// 1 619 références sans tarif. Elles ne peuvent pas entrer dans
// `catalogue_fournisseur`, qui exige un prix, et c'est bien ainsi : une table
// de tarifs sans tarif ne compare rien.
//
// ⚠️ « Nos bonnes affaires BOULANGERIE PÂTISSERIE » n'en a aucun malgré son
// titre : ce sont des nouveautés et des idées de recettes (poke bowl, panini,
// bagel). Un intitulé n'est pas un contenu.
//
// ⚠️⚠️ ET LES PRIX QUI EXISTENT SONT DES PROMOTIONS DE SEPTEMBRE 2026, pas le
// tarif courant. Un prix d'appel oublié dans le comparateur ferait croire six
// mois plus tard que Gel Var est le moins cher sur des références dont la
// promo est passée. Ils sont donc datés et la source le dit en toutes lettres.
//
// Usage : node scripts/import-catalogue-gelvar.mjs [--ecrire]

import { readFileSync, readdirSync } from 'node:fs'
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs'

const RACINE = new URL('..', import.meta.url).pathname
const DOSSIER = `${RACINE}data/gelvar`
const env = Object.fromEntries(
  readFileSync(`${RACINE}.env.local`, 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ECRIRE = process.argv.includes('--ecrire')
const DATE = '2026-09-24'

const sb = (chemin, init = {}) => fetch(`${U}/rest/v1/${chemin}`, {
  ...init,
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
}).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }))

async function texte(fichier) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(`${DOSSIER}/${fichier}`)), useSystemFonts: true,
  }).promise
  let out = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    out += ' ' + tc.items.map(i => i.str).join(' ')
  }
  return { texte: out.replace(/\s+/g, ' ').trim(), pages: doc.numPages }
}

/** Une ligne de « bonnes affaires ».
 *
 *  Le PDF met le prix AVANT le produit, éclaté par le rendu :
 *    « 6 € 45 Le sac Seiche entière nettoyée 20/40 Inde Sac de 800 g 1002020 »
 *  soit : prix · unité tarifée · désignation · colisage · référence.
 *
 *  ⚠️ « 6 € 45 » n'est PAS « 6,45 » dans le flux : les centimes sont un bloc
 *  séparé, en exposant à l'impression. Les lire comme deux nombres distincts
 *  donnerait des articles à 6 € et des lignes fantômes à 45 €.
 *
 *  ⚠️ L'UNITÉ TARIFÉE CHANGE D'UNE LIGNE À L'AUTRE — « Le kg », « Le sac »,
 *  « La boîte », « La pièce ». Une seiche à 6,45 € « le sac » de 800 g n'est
 *  pas à 6,45 €/kg : la confondre avec un prix au kilo sous-estimerait le
 *  produit de 20 %. On garde l'unité telle qu'elle est écrite, et la
 *  contenance ne se déduit que du colisage quand il est sans ambiguïté. */
const MOTIF = /(\d+)\s*€\s*(\d{2})\s+(Le kg|Le sac|La boîte|La boite|Le paquet|La pièce|Le carton|L'unité|Le lot|Le bidon|Le seau|Le pot)\s+(.+?)\s+((?:Sac|Boîte|Boite|Paquet|Carton|Pièce|Sachet|Bidon|Seau|Pot|Barquette|Plaque|Filet|Colis)[^0-9]{0,18}(?:de\s+)?[\d,.]+\s*(?:kg|g|L|ml|cl|unités?|pièces?)?(?:\s*x\s*\d+)?)\s+(\d{6,9})/gi

/** Contenance en kg, SEULEMENT si le colisage la donne sans ambiguïté. */
function contenance(colisage) {
  const m = /([\d,.]+)\s*(kg|g)\b/i.exec(colisage)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(v) || v <= 0) return null
  // ⚠️ « Carton de 1 kg x 6 » : le multiplicateur change tout. On se tait
  // plutôt que de choisir — même règle que « PAIN BURGER 90GX9 », qui avait
  // donné 64 €/kg pour du pain à burger.
  if (/x\s*\d+/i.test(colisage)) return null
  return m[2].toLowerCase() === 'g' ? v / 1000 : v
}

const fichiers = readdirSync(DOSSIER).filter(f => f.endsWith('.pdf')).sort()
console.log(`\n📚 ${fichiers.length} catalogues Gel Var\n`)

// ⚠️ ON DÉTECTE LES PRIX, ON NE LES PRÉSUME PAS D'APRÈS LE NOM DU FICHIER.
// Une première version ne cherchait que dans les deux « bonnes affaires » —
// et l'un des deux, « Bonnes affaires BOULANGERIE PÂTISSERIE », n'a en fait
// aucun tarif : ce sont des nouveautés et des idées de recettes. Le titre
// promettait des prix, le contenu n'en avait pas. Chercher partout coûte
// quelques secondes et évite de croire un intitulé.
const lignes = []
const sansPrix = []
for (const f of fichiers) {
  const { texte: t, pages } = await texte(f)
  const trouves = [...t.matchAll(MOTIF)]
  if (trouves.length === 0) { sansPrix.push([f, pages, t]); continue }
  console.log(`  ${f.replace('.pdf', '').padEnd(30)} ${String(pages).padStart(2)} p.  ${String(trouves.length).padStart(3)} article(s) tarifé(s)`)
  for (const m of trouves) {
    const prix = parseFloat(`${m[1]}.${m[2]}`)
    const uniteTarif = m[3].trim()
    const designation = m[4].trim()
    const colisage = m[5].trim()
    const reference = m[6]
    lignes.push({
      reference, designation: `${designation} — ${colisage}`,
      famille: f.includes('boulangerie') ? 'Boulangerie-pâtisserie' : 'Restauration',
      unite: uniteTarif, prix_ht: prix,
      contenance_valeur: /kg/i.test(uniteTarif) ? 1 : contenance(colisage),
      contenance_unite: /kg/i.test(uniteTarif) || contenance(colisage) ? 'kg' : null,
      colis_libelle: colisage,
      date_tarif: DATE,
      source: 'Gel Var — promotions de septembre 2026 (⚠️ prix promotionnels, pas le tarif courant)',
      nature: 'devis', actif: true,
    })
  }
}

// Les catalogues PRODUITS : référence, désignation, colisage — pas de tarif.
// ⚠️ Ils ne peuvent pas entrer dans `catalogue_fournisseur`, qui exige un
// prix, et il ne faut SURTOUT PAS les y mettre à 0 : un zéro se lit comme
// « gratuit » et remonterait en tête du comparateur. Même faute que
// `statutFoodCost(0)` qui affichait vert le produit dont on ne savait rien.
// Ils attendent le devis ; leurs références serviront alors à le rapprocher.
console.log('\n  — sans prix, catalogues PRODUITS seulement :')
let refsProduits = 0
for (const [f, pages, t] of sansPrix) {
  const refs = new Set((t.match(/\b\d{7}\b/g) || []))
  refsProduits += refs.size
  console.log(`    ${f.replace('.pdf', '').padEnd(28)} ${String(pages).padStart(2)} p.  ${String(refs.size).padStart(3)} référence(s)`
    + (t.length < 50 ? '   ⚠️ PDF en images : illisible sans OCR' : ''))
}
console.log(`    → ${refsProduits} références produits en attente du devis.`)

console.log(`\n${lignes.length} ligne(s) tarifée(s) à importer.`)
const sansRef = lignes.map(l => l.prix_ht / (l.contenance_valeur || 1))
  .filter(v => v > 60)
if (sansRef.length) console.log(`⚠️ ${sansRef.length} prix au kilo au-dessus de 60 € — à contrôler.`)

// Doublons de référence : le même article peut figurer deux fois.
const vus = new Map()
for (const l of lignes) {
  if (vus.has(l.reference)) {
    console.log(`  ⚠️ référence ${l.reference} en double : « ${vus.get(l.reference)} » / « ${l.designation} »`)
  } else vus.set(l.reference, l.designation)
}

if (!ECRIRE) {
  console.log('\nAperçu :')
  lignes.slice(0, 8).forEach(l => console.log(`   ${l.reference}  ${l.prix_ht.toFixed(2)} € ${l.unite.padEnd(10)} ${l.designation}`))
  console.log('\n(essai à blanc — relancer avec --ecrire)')
  process.exit(0)
}

// ─── Le fournisseur ────────────────────────────────────────────────────────
let { data: trouves } = await sb('fournisseurs?select=id,nom&nom=ilike.*gel*var*')
let fournisseurId = trouves?.[0]?.id ?? null
if (!fournisseurId) {
  const r = await sb('fournisseurs', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      nom: 'Gel Var', telephone: '04 94 90 65 80', actif: true,
      conditions_tarifaires:
        'gelvar.com — surgelés, boulangerie-pâtisserie et restauration. '
        + '⚠️ Les prix en base viennent des PROMOTIONS de septembre 2026, pas '
        + 'du tarif courant : le devis est attendu.',
    }),
  })
  if (!r.ok) { console.error('création impossible :', JSON.stringify(r.data)); process.exit(1) }
  fournisseurId = r.data[0].id
  console.log('\nfournisseur « Gel Var » créé :', fournisseurId)
} else {
  console.log(`\nfournisseur « ${trouves[0].nom} » déjà présent`)
}

const r = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
  method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([...vus.keys()].map(ref => ({
    ...lignes.find(l => l.reference === ref), fournisseur_id: fournisseurId,
  }))),
})
console.log(`${vus.size} ligne(s) :`, r.ok ? 'écrites' : JSON.stringify(r.data))
console.log('\n→ /admin/tarifs-fournisseurs')
