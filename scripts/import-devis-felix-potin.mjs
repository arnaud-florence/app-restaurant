// Importer un devis Félix Potin dans le catalogue tarifaire (0151).
//
//   node scripts/import-devis-felix-potin.mjs [--ecrire] [--pdf=chemin]
//
// Essai à blanc par défaut.
//
// ⚠️ LE PDF RESTE SUR LE POSTE. `data/devis-*.pdf` est gitignoré : ce sont
// des conditions négociées et le dépôt est public — même règle que le relevé
// France Boissons.
//
// ⚠️ Ce script n'écrit RIEN dans `ingredients.prix_achat_ht`. Un devis est
// une proposition, une facture est une preuve. Écrire un tarif dans le prix
// payé ferait dériver tout le food cost sur une marchandise que personne n'a
// reçue.
//
// La lecture du PDF se CONTRÔLE : sur chaque ligne, quantité × prix unitaire
// doit retomber sur le total imprimé. Une extraction de PDF qui décale d'une
// colonne ne lève aucune erreur — elle rend juste des nombres plausibles.

import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const PDF = process.argv.find(a => a.startsWith('--pdf='))?.slice(6)
  ?? 'data/devis-felix-potin-2026-09-28.pdf'

const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

// ─── Le fournisseur, tel qu'il est écrit sur le devis ────────────
const FOURNISSEUR = {
  nom: 'Félix Potin Provence',
  contact: 'Sandra Iannetti',
  telephone: '04 94 69 69 69',
  email: 'brignoles@felixpotin.com',
  adresse: 'ZAC de Nicopolis, 582 avenue des chênes verts, 83170 Brignoles',
  conditions_tarifaires: 'Proposition EX212546 du 28/09/2026 — compte client 47163472',
}
const DATE_TARIF = '2026-09-28'
const SOURCE = 'Devis EX212546 du 28/09/2026'

// ─── Lecture du PDF ──────────────────────────────────────────────
//
// Le tableau est reconstruit par COORDONNÉES, pas par ordre de lecture :
// pdf.js rend les colonnes dans le désordre, et un simple découpage du texte
// mélangeait la quantité du colis avec la quantité facturée.
//
// ⚠️ Les deux quantités partagent la même colonne (nombres alignés à droite).
// C'est la LIGNE qui les distingue : celle du code porte le nombre de colis,
// celle du dessous la quantité facturée. Les séparer par leur abscisse
// laissait 65 articles sans quantité — tous ceux facturés à la pièce.
async function lire(chemin) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(chemin)), useSystemFonts: true }).promise
  const out = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const it = tc.items.filter(i => i.str.trim())
      .map(i => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), t: i.str.trim() }))
    const codes    = it.filter(i => i.x < 70 && /^\d{5,6}$/.test(i.t) && i.y < 560)
    const desig    = it.filter(i => i.x >= 90 && i.x < 340)
    const familles = it.filter(i => i.x < 40 && !/^\d/.test(i.t) && i.y < 565)
    const qte      = it.filter(i => i.x >= 355 && i.x < 400 && /^[\d.]+$/.test(i.t))
    const uColis   = it.filter(i => i.x >= 388 && i.x < 402 && /^[A-Z]{2}$/.test(i.t))
    const uFac     = it.filter(i => i.x >= 402 && i.x < 450 && /^[A-Z]{1,3}$/.test(i.t))
    const pu       = it.filter(i => i.x >= 450 && i.x < 500 && /^[\d.]+$/.test(i.t))
    const tot      = it.filter(i => i.x >= 520 && /^[\d.]+$/.test(i.t))
    for (const c of codes) {
      const at = (a, lo, hi) => a.filter(i => i.y - c.y >= lo && i.y - c.y <= hi)
        .sort((x, y) => Math.abs(x.y - c.y) - Math.abs(y.y - c.y))[0]?.t
      out.push({
        famille: familles.filter(f => f.y > c.y).sort((a, b) => a.y - b.y)[0]?.t ?? null,
        code: c.t,
        designation: desig.filter(i => i.y <= c.y + 2 && i.y >= c.y - 13)
          .sort((a, b) => b.y - a.y).map(i => i.t).join(' ')
          .replace(/\s+/g, ' ').replace(/\s*-\s*$/, '').trim(),
        colis_libelle: at(uColis, -3, 3) ?? at(uColis, -13, 3) ?? null,
        quantite: Number(at(qte, -13, -5) ?? at(qte, -3, 3)),
        unite: at(uFac, -3, 3),
        pu_ht: Number(at(pu, -3, 3)),
        total_ht: Number(at(tot, -3, 3)),
      })
    }
  }
  return out
}

// L'unité du devis, dans le vocabulaire de la table.
const UNITE = { KG: 'kg', L: 'L', PI: 'piece' }

const lignes = await lire(PDF)
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──  ${PDF}\n`)
console.log(`  lignes lues : ${lignes.length}`)

// ─── Contrôle arithmétique ───────────────────────────────────────
const faux = lignes.filter(l =>
  !l.pu_ht || !l.quantite || !l.unite || Math.abs(l.quantite * l.pu_ht - l.total_ht) > 0.02)
if (faux.length) {
  console.error(`\n  ✗ ${faux.length} ligne(s) dont quantité × prix ≠ total imprimé.`)
  for (const l of faux.slice(0, 10)) console.error(`     ${l.code} ${l.designation} — q=${l.quantite} pu=${l.pu_ht} tot=${l.total_ht}`)
  console.error(`\n  Extraction non fiable : rien ne sera écrit.\n`)
  process.exit(1)
}
console.log(`  ✓ quantité × prix unitaire = total imprimé sur les ${lignes.length}`)

const parFamille = {}
for (const l of lignes) parFamille[l.famille ?? '?'] = (parFamille[l.famille ?? '?'] ?? 0) + 1
for (const [f, n] of Object.entries(parFamille)) console.log(`     ${String(n).padStart(4)}  ${f}`)
console.log(`  total du devis : ${lignes.reduce((s, l) => s + l.total_ht, 0).toFixed(2)} € HT`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

// ─── Fournisseur ─────────────────────────────────────────────────
let [f] = await sb(`fournisseurs?select=id,nom&nom=eq.${encodeURIComponent(FOURNISSEUR.nom)}`)
if (!f) {
  ;[f] = await sb('fournisseurs', { method: 'POST', body: JSON.stringify(FOURNISSEUR) })
  console.log(`\n  fournisseur créé : ${f.nom}`)
} else {
  await sb(`fournisseurs?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify(FOURNISSEUR) })
  console.log(`\n  fournisseur mis à jour : ${f.nom}`)
}

// ─── Lignes de tarif ─────────────────────────────────────────────
// Upsert sur (fournisseur, référence, date) : rejouer le même devis corrige,
// un devis d'une autre date s'ajoute à côté et l'ancien tarif survit — c'est
// lui qui rendra une hausse lisible.
const rows = lignes.map(l => ({
  fournisseur_id: f.id,
  reference: l.code,
  designation: l.designation,
  famille: l.famille,
  unite: UNITE[l.unite] ?? l.unite,
  prix_ht: l.pu_ht,
  colis_quantite: l.quantite,
  colis_libelle: l.colis_libelle,
  contenance_valeur: null,
  contenance_unite: null,
  cle_comparaison: null,
  ingredient_id: null,
  date_tarif: DATE_TARIF,
  source: SOURCE,
  actif: true,
}))
const ecrites = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif',
  { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows) })
console.log(`  ${ecrites.length} tarif(s) enregistré(s).`)
console.log(`\n  Aucun prix d'achat n'a été modifié : un devis n'est pas une facture.`)
console.log(`  Les rapprochements avec nos matières se posent dans /admin/tarifs-fournisseurs.\n`)
