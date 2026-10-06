// La proposition commerciale de Gineys — le tarif NÉGOCIÉ, à la main de Sabine.
//
// Jusqu'ici ce qu'on savait des prix Gineys venait de deux sources : nos
// FACTURES (82 articles, des prix réellement payés) et le PORTAIL (2 892
// références, dont la 0162 a montré que seuls nos articles contractuels
// portent la remise — le reste s'affiche au prix public, à 0,3 % près).
//
// Une proposition commerciale est la troisième, et c'est la plus utile :
// chiffrée NOMMÉMENT pour CASATASIA, elle dit ce qu'on paierait sur des
// références qu'on n'a jamais achetées.
//
// ⚠️ C'est un DEVIS, pas une facture (`nature = 'devis'`). Un devis est une
// PROPOSITION — il peut être un tarif d'appel consenti pour emporter un
// client, et ne jamais se revoir. Rien ici n'écrit `prix_achat_ht` : faire
// entrer un tarif dans le prix payé ferait dériver tout le food cost sur de
// la marchandise jamais reçue.
//
// Usage : node scripts/import-prop-gineys.mjs [--ecrire]

import fs from 'node:fs'
import { UNITE, conditionnement } from './_tarifs-communs.mjs'

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })

const ECRIRE = process.argv.includes('--ecrire')
const PDF = 'data/devis-gineys-2026-10-05.pdf'
const DATE_TARIF = '2026-10-05'
const SOURCE = 'Proposition commerciale Gineys (Sabine Ramillon) du 05/10/2026'
// ⚠️ Le PDF l'imprime lui-même : c'est le contrôle d'extraction. Un décalage
// de colonne ne lève aucune erreur, il rend des nombres plausibles.
const ATTENDU = 66

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, {
    ...o,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// ─── Lecture du PDF ───────────────────────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true,
}).promise

const lignes = []
let famille = null
let nbImprime = null
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const parY = new Map()
  for (const it of (await page.getTextContent()).items) {
    if (!it.str.trim()) continue
    const y = Math.round(it.transform[5])
    if (!parY.has(y)) parY.set(y, [])
    parY.get(y).push({ x: it.transform[4], s: it.str.trim() })
  }
  for (const y of [...parY.keys()].sort((a, b) => b - a)) {
    const cells = parY.get(y).sort((a, b) => a.x - b.x)
    const texte = cells.map(c => c.s).join(' ')
    // ⚠️ La FAMILLE est l'en-tête de section qui SURPLOMBE la ligne, pas
    // celui de la page : la page 2 en porte deux. Même piège que
    // l'indexation des catalogues de marques (27/09).
    // ⚠️ `[A-Za-z]` NE CONTIENT PAS « é » : « 5-RHF surgelé » ne matchait
    // pas, et ses dix lignes héritaient de la famille PRÉCÉDENTE — les
    // surgelés rangés dans les produits d'entretien, sans une erreur.
    // ⚠️ Le code de section est à 1 ou 2 chiffres : « 305-Sabine RAMILLON »
    // (le commercial) en a trois et ne doit pas passer pour une famille.
    const sec = texte.match(/^(\d{1,2})-(.+?)(?:\s+Réf Tarif|$)/)
    if (sec && !/^Code/.test(texte)) { famille = sec[2].trim().toUpperCase(); continue }
    const n = texte.match(/Nombre de lignes\s*:?\s*(\d+)/)
    if (n) { nbImprime = Number(n[1]); continue }
    // Une ligne d'article : code à 7 chiffres, désignation, UF, prix.
    if (!/^0\d{6}$/.test(cells[0].s)) continue
    const prix = Number(cells[cells.length - 1].s.replace(',', '.'))
    const uf = cells[cells.length - 2].s
    const designation = cells.slice(1, cells.length - 2).map(c => c.s).join(' ').trim()
    if (!Number.isFinite(prix) || prix <= 0 || !designation) continue
    lignes.push({ code: cells[0].s, designation, uf, prix, famille })
  }
}

console.log(`\n📄 ${PDF}`)
console.log(`   ${lignes.length} ligne(s) lue(s)${nbImprime ? ` · ${nbImprime} annoncée(s) par le PDF` : ''}`)
if (nbImprime != null && lignes.length !== nbImprime) {
  console.error(`\n⛔ ${lignes.length} lue(s) pour ${nbImprime} annoncée(s). Rien n'est écrit :`)
  console.error(`   un décalage d'extraction ne lève aucune erreur, il rend des nombres plausibles.`)
  process.exit(1)
}
if (lignes.length !== ATTENDU) {
  console.error(`\n⛔ ${lignes.length} ligne(s) pour ${ATTENDU} attendue(s). Rien n'est écrit.`)
  process.exit(1)
}

// ─── Unité de facturation ─────────────────────────────────────────────
// ⚠️ L'UNITÉ DE FACTURATION DÉCIDE, AVANT LE C=N. « AUBERGINE GRILLEE EN
// TRANCHE SAC=1KG » facturée au Kg donne directement un prix au kilo ;
// « DUO DE POIVRON C=10X450G » facturée au Sac donne le prix des 450 g.
// Confondre les deux donne un prix au kilo faux d'un facteur dix.
//
// ⚠️⚠️ TOUT CE QUI N'EST PAS kg / L / piece DEVIENT `'contenant'`, la
// convention du projet (`CONTENANTS` dans `tarifs-fournisseurs.ts`).
// Première version écrite avec l'UF en minuscules (`bqt`, `bte`, `seau`) :
// aucune n'étant reconnue, `prixReference()` rendait NULL et les lignes
// sortaient de toute comparaison — le miel, les câpres, la burrata et les
// cornichons affichaient « non comparable » alors que leur contenance est
// écrite dans leur propre désignation. Encore une absence rendue comme une
// conclusion.
//
// ⚠️ LA CONTENANCE N'EST PAS STOCKÉE, ET C'EST VOULU. Elle se CALCULE à la
// lecture par `extraireContenance()` : une meilleure extraction profite
// alors à tout le catalogue sans réimport (règle de la 0151). Elle ne
// s'écrit en base que quand un HUMAIN tranche une désignation ambiguë —
// c'est le rôle de `cles-prop-gineys.mjs`.
const REF = new Set(['kg', 'L', 'piece'])
const rows = lignes.map(l => {
  const u = UNITE[l.uf] ?? null
  return {
    reference: l.code,
    designation: l.designation,
    famille: l.famille,
    // `colis` n'est pas une unité de référence : il faut sa contenance.
    unite: u && REF.has(u) ? u : 'contenant',
    prix_ht: l.prix,
    colis_libelle: l.uf,
    colis_quantite: conditionnement(l.designation),
    date_tarif: DATE_TARIF,
    source: SOURCE,
    nature: 'devis',
    // ⚠️ Un devis est chiffré NOMMÉMENT pour CASATASIA : c'est notre prix,
    // pas un tarif public. Le laisser à NULL afficherait « remise inconnue »
    // sur un tarif qu'on vient de négocier.
    tarif_negocie: true,
    actif: true,
    // ⚠️⚠️ `cle_comparaison`, `contenance_valeur` et `contenance_unite` sont
    // VOLONTAIREMENT ABSENTS de la charge : PostgREST ne met à jour que les
    // colonnes présentes, donc une relance de l'import PRÉSERVE ce qu'un
    // humain a posé à la main. Les y écrire à `null` effaçait vingt-cinq
    // rapprochements et cinq contenances — même piège que `tarif_negocie`
    // dans l'import du portail (0158).
  }
})

const parUF = {}
for (const l of lignes) parUF[l.uf] = (parUF[l.uf] ?? 0) + 1
console.log(`\n   ${rows.filter(r => REF.has(r.unite)).length} ligne(s) à l'unité de RÉFÉRENCE (kg/L/pièce)`)
console.log(`   ${rows.filter(r => r.unite === 'contenant').length} au CONTENANT — leur prix de référence se calcule à la lecture`)
console.log('   unités de facturation :', Object.entries(parUF).map(([k, v]) => `${k} ${v}`).join(' · '))

const parFam = {}
for (const r of rows) parFam[r.famille ?? '?'] = (parFam[r.famille ?? '?'] ?? 0) + 1
console.log('\n   familles :', Object.entries(parFam).map(([k, v]) => `${k} ${v}`).join(' · '))

// ─── Écriture ─────────────────────────────────────────────────────────
const [f] = await sb('fournisseurs?select=id,nom&nom=eq.Gineys%20(Nicolas)')
if (!f) { console.error('\n⛔ Fournisseur Gineys introuvable.'); process.exit(1) }

// ⚠️ LA CLÉ PORTE LA DATE : rejouer la même proposition corrige, une
// proposition d'une autre date s'ajoute et l'ancien tarif survit. C'est lui
// qui rendra une hausse lisible.
if (!ECRIRE) {
  console.log(`\n   (essai à blanc — ${rows.length} ligne(s) prête(s). Relancer avec --ecrire.)\n`)
  process.exit(0)
}
const ecrites = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(rows.map(r => ({ ...r, fournisseur_id: f.id }))),
})
console.log(`\n   ✅ ${ecrites.length} tarif(s) enregistré(s) chez ${f.nom}.`)
console.log(`   ⚠️ Aucun prix d'achat modifié : un devis n'est pas une facture.`)
console.log(`   Les rapprochements se posent à la main dans /admin/tarifs-fournisseurs.\n`)
