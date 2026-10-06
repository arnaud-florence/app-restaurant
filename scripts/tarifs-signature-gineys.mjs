// Gamme SIGNATURE de Gineys — tarifs négociés par le commercial (28/09/2026).
//
// Trois références proposées hors portail, toutes NETTEMENT sous le tarif
// affiché : c'est une offre nominative, donc `nature = 'devis'` et
// `tarif_negocie = true`. Elle n'est PAS une facture : rien ici ne touche
// `recettes.cout_achat_ht` (0165) — le coût d'un produit ne change qu'au
// premier scan, ou par la fiche produit, à la main.
//
// ⚠️ AUCUNE `cle_comparaison`, et c'est délibéré. Un croissant de 85 g n'est
// pas notre 70 g : les ranger sous la même clé ferait afficher « +58 % » sur
// la ligne de réassort, c'est-à-dire « tu paies trop cher » là où la vérité
// est « tu paierais plus pour mieux ». Même règle que le mini-croissant de
// 25 g écarté en septembre. La décision de gamme se prend ici, pas sur un
// écart de prix coloré en rouge.
//
//   node scripts/tarifs-signature-gineys.mjs [--ecrire]
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const eur = (n, d = 2) => `${n.toFixed(d).replace('.', ',')} €`
const pct = n => `${n.toFixed(1).replace('.', ',')} %`
const DATE = '2026-09-28'

// ── L'offre, telle qu'annoncée par le commercial ────────────────────
// Les références et désignations sont celles du PORTAIL (déjà en base) :
// on ne les recopie pas de tête, on les retrouve par leur code.
const OFFRE = [
  { ref: '0073562', colis: 26.50, pcs: 56, g: 85, vente: 1.30, remplace: 'CROISSANT PREPOUSSE 70G AUDACIEUX C=96' },
  { ref: '0073563', colis: 31.92, pcs: 60, g: 85, vente: 1.40, remplace: 'PAIN AU CHOCOLAT PREPOUSSE 80G AUDACIEUX C=90' },
  { ref: '0073480', colis: 32.77, pcs: 56, g: 90, vente: 1.50, remplace: null },
]

const [gineys] = await sb('fournisseurs?nom=eq.Gineys%20(Nicolas)&select=id,nom')
if (!gineys) throw new Error('fournisseur Gineys introuvable')

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`)
console.log(`║ Gamme Signature — offre Gineys du ${DATE}                        ║`)
console.log(`╚══════════════════════════════════════════════════════════════════════╝`)
if (!ECRIRE) console.log('\n  (essai à blanc — rien n’est écrit. --ecrire pour appliquer)')

const lignes = []
for (const o of OFFRE) {
  const [portail] = await sb(`catalogue_fournisseur?reference=eq.${o.ref}&nature=eq.portail&fournisseur_id=eq.${gineys.id}&select=designation,prix_ht,famille`)
  if (!portail) { console.log(`\n  ✗ ${o.ref} introuvable au portail — on n’invente pas une désignation`); continue }

  const piece = o.colis / o.pcs
  const kilo = piece / (o.g / 1000)
  const remise = (1 - o.colis / Number(portail.prix_ht)) * 100

  // Ce que ça donne à la vente. TVA 5,5 % — viennoiserie.
  const ht = o.vente / 1.055
  const fc = piece / ht * 100
  const marge = ht - piece

  // Le produit remplacé, s'il y en a un.
  let avant = null
  if (o.remplace) {
    const [a] = await sb(`catalogue_fournisseur?designation=eq.${encodeURIComponent(o.remplace)}&nature=eq.facture&select=prix_ht,contenance_valeur`)
    if (a) {
      const p = Number(a.prix_ht) / Number(a.contenance_valeur)
      avant = { piece: p, kilo: p / (o.remplace.includes('70G') ? 0.070 : 0.080) }
    }
  }

  console.log(`\n  ── ${portail.designation}`)
  console.log(`     colis ${eur(o.colis)} / ${o.pcs} pc   →  ${eur(piece, 4)} la pièce   ·   ${eur(kilo, 2)} le kilo`)
  console.log(`     portail ${eur(Number(portail.prix_ht))}  →  remise obtenue ${pct(remise)}`)
  console.log(`     vendu ${eur(o.vente)} TTC (HT ${eur(ht, 4)})  →  food cost ${pct(fc)}  ·  marge ${eur(marge, 3)}`)
  if (avant) {
    const htA = (o.ref === '0073562' ? 1.20 : 1.30) / 1.055
    const mA = htA - avant.piece
    console.log(`     aujourd’hui : ${eur(avant.piece, 4)}/pc (${eur(avant.kilo)}/kg), vendu ${eur(o.ref === '0073562' ? 1.20 : 1.30)} → marge ${eur(mA, 3)}`)
    console.log(`     ⇒ achat ${pct((piece / avant.piece - 1) * 100)} plus cher la pièce, ${pct((kilo / avant.kilo - 1) * 100)} au kilo · marge ${eur(marge - mA, 3)}`)
  }

  lignes.push({
    fournisseur_id: gineys.id,
    reference: o.ref,
    designation: portail.designation,
    famille: portail.famille ?? 'VIENNOISERIE',
    unite: 'colis',
    prix_ht: o.colis,
    colis_quantite: 1,
    colis_libelle: 'Col',
    contenance_valeur: o.pcs,
    contenance_unite: 'piece',
    cle_comparaison: null,        // ⚠️ voir l'en-tête : format différent
    nature: 'devis',
    tarif_negocie: true,
    date_tarif: DATE,
    source: `Offre commerciale Gineys du ${DATE} — gamme Signature`,
    actif: true,
  })
}

if (ECRIRE && lignes.length) {
  // Clé d'upsert : (fournisseur, référence, date). Rejouable le même jour.
  await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif',
    { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lignes) })
  console.log(`\n  ✓ ${lignes.length} tarif(s) écrit(s) dans la plateforme d’achat.`)
} else if (lignes.length) {
  console.log(`\n  ${lignes.length} tarif(s) prêts à écrire.`)
}
console.log()
