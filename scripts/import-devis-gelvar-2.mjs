// Devis Gel Var « DIVERS PRIX TONY 2 » du 28/09/2026 — bon n° 02060173,
// représentant Tony Moreno, 102 lignes, 1 436,74 € HT.
//
// ⚠️ CE N'EST PAS LE MÊME TARIF QUE CELUI DE SEPTEMBRE. Les 26 lignes déjà en
// base venaient du dépliant « Nos bonnes affaires RESTAURATION » — des
// PROMOTIONS de septembre, pas le tarif courant (documenté le 24/09). Celui-ci
// est un tarif nominatif, chiffré pour CASATASIA par son commercial : il fait
// foi. Les deux cohabitent, distingués par leur `date_tarif`.
//
// ⚠️ L'EXTRACTION SE CONTRÔLE. Un décalage d'une colonne ne lève aucune erreur,
// il rend des nombres plausibles. Le script REFUSE d'écrire tant que, sur
// CHAQUE ligne, quantité × prix unitaire ne retombe pas sur le total imprimé.
//
// ⚠️ `P.U. Net` est le prix de l'UNITÉ DE FACTURATION, et la quantité est
// exprimée dans cette même unité — c'est ce que vérifie le contrôle ci-dessus.
// Mais QUELLE unité (kg, litre, pièce, colis) n'est écrite nulle part : elle
// se déduit en confrontant la quantité au contenu annoncé par la désignation.
// Quand les deux ne concordent pas, on s'abstient : `prix_ht` reste juste, et
// la ligne sort simplement du comparateur au lieu d'y entrer avec un €/kg
// inventé. C'est la règle qui a évité le pain à burger à 64 €/kg.
//
//   node scripts/import-devis-gelvar-2.mjs [--ecrire]
import fs from 'node:fs'

const PDF = 'data/gelvar/devis-gelvar-2026-09-28.pdf'
const DATE = '2026-09-28'
const ECRIRE = process.argv.includes('--ecrire')
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const n = s => Number(String(s).replace(',', '.'))
const f2 = x => x.toFixed(2).replace('.', ',')

// ── Lecture du PDF, ligne par ligne, par coordonnées ──────────────────
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true }).promise
const brut = []
for (let p = 1; p <= doc.numPages; p++) {
  const c = await (await doc.getPage(p)).getTextContent()
  const par = new Map()
  for (const i of c.items) { const y = Math.round(i.transform[5]); if (!par.has(y)) par.set(y, []); par.get(y).push(i) }
  for (const [, items] of [...par].sort((a, b) => b[0] - a[0]))
    brut.push(items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim())
}

// `code désignation  qté  condt  remise  P.U.  total  codeTVA`
const LIGNE = /^(\d{8})\s+(.+?)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([\d,]+)\s+(\d)$/

/** TOUTES les pistes de contenu lues dans la désignation, sans trancher. */
function mesuresAnnoncees(d) {
  const out = []
  let m = d.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)\s*[X\u00D7]\s*(\d+)/i)
  if (m) { const x = mesure(n(m[1]) * n(m[3]), m[2]); if (x) out.push(x) }
  m = d.match(/(\d+)\s*[X\u00D7]\s*(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)/i)
  if (m) { const x = mesure(n(m[1]) * n(m[2]), m[3]); if (x) out.push(x) }
  for (const g of d.matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)(?![A-Z])/gi)) {
    const x = mesure(n(g[1]), g[2]); if (x) out.push(x)
  }
  return out
}

/** Ce que la désignation annonce comme contenu, dans l'unité de mesure. */
function contenuAnnonce(d) {
  // « 150G X20 », « 2.5KG X5 », « 12X 720 ML », « 120G X 6 »
  let m = d.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)\s*[X×]\s*(\d+)/i)
  if (m) return mesure(n(m[1]) * n(m[3]), m[2])
  m = d.match(/(\d+)\s*[X×]\s*(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)/i)
  if (m) return mesure(n(m[1]) * n(m[2]), m[3])
  // ⚠️ PLUSIEURS POIDS = ON SE TAIT. « MOZZARELLA CERISE BILLE 5G 1KG » porte
  // le poids de la BILLE et celui du seau : prendre le premier donnait
  // 2 151 €/kg, soit deux cent vingt fois le prix réel, en tête du
  // comparateur. C'est la règle que `extraireContenance()` applique déjà
  // dans la bibliothèque partagée — cette fonction-ci existe parce que Gel
  // Var écrit ses poids EN FIN de désignation, sans marqueur « BQT= », ce que
  // la version partagée ne lit pas.
  const t = [...d.matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CL)(?![A-Z])/gi)]
    .map(x => mesure(n(x[1]), x[2])).filter(Boolean)
  if (!t.length) return null
  return new Set(t.map(x => `${x.v}${x.u}`)).size > 1 ? null : t[0]
}
const mesure = (v, u) => {
  const U2 = u.toUpperCase()
  if (U2 === 'KG') return { v, u: 'kg' }
  if (U2 === 'G') return { v: v / 1000, u: 'kg' }
  if (U2 === 'L') return { v, u: 'L' }
  if (U2 === 'ML') return { v: v / 1000, u: 'L' }
  if (U2 === 'CL') return { v: v / 100, u: 'L' }
  return null
}

const lignes = [], ecarts = [], ignorees = []
for (const t of brut) {
  const m = LIGNE.exec(t)
  if (!m) { if (/^\d{8}\s/.test(t)) ignorees.push(t); continue }
  const [, ref, des, q, , , pu, tot, tva] = m
  const qte = n(q), prix = n(pu), total = n(tot)
  // ⚠️ LE CONTRÔLE. Sans lui, un décalage de colonne écrit des prix plausibles.
  // ⚠️ La tolérance tient compte de l'ARRONDI DE LA QUANTITÉ, pas d'un confort :
  // le PDF imprime « 1,11 » pour 1,107 kg de toastinettes, donc le produit
  // dévie légitimement de ±0,005 × prix. Un décalage de colonne, lui, se
  // chiffre en euros — il reste attrapé.
  const tolerance = 0.011 + 0.005 * prix
  if (Math.abs(qte * prix - total) > tolerance) { ecarts.push(`${ref} ${des} : ${qte} × ${prix} = ${(qte * prix).toFixed(3)} ≠ ${total} (tolérance ${tolerance.toFixed(3)})`); continue }

  // ⚠️ DEUX QUESTIONS DIFFÉRENTES, DEUX NIVEAUX D'EXIGENCE.
  //
  // Pour DÉDUIRE L'UNITÉ, la quantité imprimée sert de contrôle croisé : si
  // elle égale l'un des poids annoncés, ce n'est pas une supposition, c'est
  // une concordance entre deux colonnes du document. « ENTRECOTE TRANCHE
  // 280/320G C/5kg » avec une quantité de 5,00 se facture au kilo, sans
  // ambiguïté — même si la désignation porte deux poids.
  //
  // Pour STOCKER UNE CONTENANCE (quantité de 1), il n'y a aucun contrôle
  // croisé : deux poids différents, on se tait.
  const c = contenuAnnonce(des)          // refuse si ambigu
  const tous = mesuresAnnoncees(des)     // toutes les pistes
  let unite = 'contenant', contenance = null
  if (Math.abs(qte - 1) < 1e-9) {
    if (c) contenance = c
  } else {
    const concordant = tous.find(x => Math.abs(qte - x.v) < Math.max(0.02, qte * 0.005))
    if (concordant) unite = concordant.u
    else if (Number.isInteger(qte) && !tous.length) unite = 'piece'
  }
  lignes.push({ ref, des: des.trim(), prix, unite, contenance, tva: tva === '2' ? 20 : 5.5, qte, total })
}

console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`)
console.log(`║ Devis Gel Var du ${DATE} — « DIVERS PRIX TONY 2 »                   ║`)
console.log(`╚════════════════════════════════════════════════════════════════════════╝\n`)
console.log(`  ${lignes.length} lignes lues et CONTRÔLÉES (quantité × PU = total)`)
if (ignorees.length) { console.log(`  ⚠️ ${ignorees.length} ligne(s) à 8 chiffres non reconnues :`); ignorees.forEach(l => console.log('     ' + l.slice(0, 90))) }
if (ecarts.length) { console.log(`\n  ✗ ${ecarts.length} INCOHÉRENCE(S) — rien ne sera écrit :`); ecarts.forEach(l => console.log('     ' + l)); process.exit(1) }

const total = lignes.reduce((s, l) => s + l.total, 0)
console.log(`  total recalculé : ${f2(total)} € HT   (le PDF imprime 1 436,74 €)`)
if (Math.abs(total - 1436.74) > 0.05) { console.error(`  ✗ le total ne retombe pas — extraction incomplète, rien n'est écrit.`); process.exit(1) }

const parUnite = {}
for (const l of lignes) parUnite[l.unite] = (parUnite[l.unite] ?? 0) + 1
console.log(`  unités déduites : ${Object.entries(parUnite).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`  ${lignes.filter(l => l.contenance).length} contenances lues sur la désignation\n`)

// Les unités DÉDUITES sont les seules qui puissent produire un €/kg faux :
// on les imprime toutes pour contrôle à l'œil.
console.log('  ── unités de mesure déduites (à vérifier) ──')
for (const l of lignes.filter(x => x.unite === 'kg' || x.unite === 'L' || x.unite === 'piece'))
  console.log(`  ${l.ref} ${l.des.slice(0, 48).padEnd(49)} qté ${String(l.qte).padStart(6)} → ${f2(l.prix).padStart(8)} € / ${l.unite}`)
console.log()

if (!ECRIRE) { console.log('  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const [f] = await sb('fournisseurs?nom=ilike.*gel%20var*&select=id,nom')
if (!f) { console.error('  ✗ fournisseur Gel Var introuvable'); process.exit(1) }

// ⚠️ La clé porte la DATE : réimporter ce devis corrige, un devis d'une autre
// date s'ajoute et l'ancien survit. C'est lui qui rendra une hausse lisible.
const charge = lignes.map(l => ({
  fournisseur_id: f.id, reference: l.ref, designation: l.des,
  famille: l.tva === 20 ? 'EMBALLAGE' : null,
  unite: l.unite, prix_ht: l.prix,
  contenance_valeur: l.contenance?.v ?? null, contenance_unite: l.contenance?.u ?? null,
  nature: 'devis', tarif_negocie: true, date_tarif: DATE, actif: true,
  source: `Devis Gel Var n° 02060173 du ${DATE} — représentant Tony Moreno`,
}))
for (let i = 0; i < charge.length; i += 200)
  await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif',
    { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(charge.slice(i, i + 200)) })
console.log(`  ✓ ${charge.length} tarifs écrits chez ${f.nom}.\n`)
