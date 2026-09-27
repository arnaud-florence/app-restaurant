// Le tarif PUBLIC du catalogue Arti'Pat, en face du nôtre.
//
//   node scripts/importer-catalogue-artipat.mjs [chemin.pdf] [--ecrire]
//
// Arti'Pat est la gamme boulangerie distribuée par Gineys. Son catalogue
// 2026 imprime, pour chacune de ses ~600 références, le prix au carton ET
// le prix indicatif à la pièce.
//
// ⚠️⚠️ ARTI'PAT EST UNE MARQUE, PAS UN FOURNISSEUR. Ces lignes sont
// rattachées à GINEYS — comme Lavazza l'a été à France Boissons et Pauwels
// à La Frite Belge. Tant qu'une marque tient la place d'un fournisseur, la
// comparaison désigne un interlocuteur qui n'en est pas un, et une commande
// partie de là va à la mauvaise adresse.
//
// ⚠️ CE PRIX EST PUBLIC, ET C'EST TOUT SON INTÉRÊT. Il ne remplace jamais
// le nôtre : il se met EN FACE. La baguette Victoire est à 24,72 € le
// carton au catalogue et à 17,36 € à notre portail — 30 % de remise, qu'on
// ne pouvait pas chiffrer avant. D'où `nature = 'catalogue'` (0162) et
// `tarif_negocie = false` : c'est le seul cas où « non remisé » est une
// affirmation qu'on peut tenir, puisque c'est imprimé.
//
// ⚠️ CHAQUE LIGNE EST CONTRÔLÉE avant d'être écrite : prix au carton ÷
// nombre de pièces doit retomber sur le prix pièce imprimé. Un décalage de
// colonne dans un PDF ne lève aucune erreur, il rend des nombres
// plausibles — la règle posée sur le devis Félix Potin.

import fs from 'node:fs'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const ECRIRE = process.argv.includes('--ecrire')
const PDF = process.argv.find(a => a.endsWith('.pdf'))
  ?? process.env.HOME + '/Downloads/ARTIPAT_2026 (2).pdf'
// Le catalogue porte son millésime : « Catalogue Général 2026 », 10ᵉ édition.
// ⚠️ Pas la date du jour : ce tarif est celui de l'édition, et c'est elle
// qui doit permettre de comparer avec une édition suivante.
const DATE_TARIF = '2026-01-01'

if (!fs.existsSync(PDF)) { console.error(`\n✗ ${PDF} absent.\n`); process.exit(1) }

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

const nb = s => Number(String(s).replace(/\s/g, '').replace(',', '.'))

// « 71133 Baguette Victoire Long. 50 cm - Poids : 280 g Carton : 28 pièces
//   Prix au carton : 24,72 € Prix indicatif pièce : 0,883 € »
const FICHE = /(?<![\d.,])(\d{5})\s+([A-ZÀ-ÜŒ][^\n]{2,70}?)\s+(?:Long\.|Poids|Ø|Diam|Carton)\b[^]{0,120}?Carton\s*:\s*(\d+)\s*(?:pièces?|pieces?|pcs?)[^]{0,120}?Prix au carton\s*:\s*([\d ]+[.,]\d{1,2})\s*€[^]{0,60}?Prix indicatif pièce\s*:\s*([\d ]+[.,]\d{1,4})\s*€/g

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true }).promise
const fiches = new Map()
let incoherentes = 0
for (let i = 1; i <= doc.numPages; i++) {
  const t = (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ').replace(/\s+/g, ' ')
  for (const m of t.matchAll(FICHE)) {
    const [, ref, nom, pieces, carton, piece] = m
    const n = Number(pieces), pc = nb(carton), pp = nb(piece)
    if (!(n > 0 && pc > 0 && pp > 0)) continue
    // ⚠️ Le contrôle qui compte : le prix pièce doit être le prix carton
    // divisé par le nombre de pièces. 2 % de tolérance pour l'arrondi du
    // catalogue. Sans lui, un décalage de colonne passerait inaperçu.
    if (Math.abs(pc / n - pp) / pp > 0.02) { incoherentes++; continue }
    if (!fiches.has(ref)) fiches.set(ref, {
      ref, nom: nom.replace(/\s+/g, ' ').trim(), pieces: n, prixCarton: pc, prixPiece: pp, page: i,
    })
  }
}
await doc.destroy()

const fournisseurs = await sb('fournisseurs?select=id,nom')
const gineys = fournisseurs.find(f => /gineys/i.test(f.nom))
if (!gineys) { console.error('✗ Gineys introuvable.'); process.exit(1) }

// Les familles déjà posées : on les REPREND plutôt que de les redéduire.
const nos = []
for (let de = 0; de < 20000; de += 1000) {
  const lot = await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&select=reference,famille,nature&order=id&offset=${de}&limit=1000`)
  nos.push(...lot); if (lot.length < 1000) break
}
const familleParRef = new Map()
const prixPortail = new Map()
for (const l of nos) {
  const c = String(l.reference).replace(/^0+/, '')
  if (l.famille && !familleParRef.has(c)) familleParRef.set(c, l.famille)
}
for (let de = 0; de < 20000; de += 1000) {
  const lot = await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&nature=eq.portail&select=reference,prix_ht,unite,achete&order=id&offset=${de}&limit=1000`)
  for (const l of lot) if (l.unite === 'colis' && l.prix_ht != null)
    prixPortail.set(String(l.reference).replace(/^0+/, ''), { prix: Number(l.prix_ht), achete: Boolean(l.achete) })
  if (lot.length < 1000) break
}

// ⚠️⚠️ CE QUE LA COMPARAISON A RÉVÉLÉ, ET QUI CHANGE LA LECTURE DU PORTAIL.
//
// Sur 445 références comparables : les 41 QUE NOUS ACHETONS sont 22 % sous
// le tarif catalogue — les 20 à 30 % documentés, confirmés. Les 404 autres
// sont à 0,3 %, c'est-à-dire AU TARIF PUBLIC, au centime près.
//
// Le portail n'applique donc notre tarif négocié qu'aux articles de notre
// contrat ; tout le reste s'affiche au prix affiché à tout le monde. C'est
// une information qu'on ne pouvait pas avoir sans ce catalogue.
//
// Deux conséquences :
//
// 1. on N'IMPORTE PAS une ligne de catalogue dont le prix est déjà celui du
//    portail : elle n'ajouterait rien qu'un doublon au centime près, et
//    400 doublons rendent l'écran illisible ;
// 2. sur ces références-là, `tarif_negocie` passe de NULL à FALSE — c'est
//    le seul cas où « non remisé » est une affirmation qu'on peut tenir,
//    puisqu'on l'a MESURÉE contre un tarif imprimé.
const MEME_PRIX = 0.01
const doublons = [], aProuver = []
const retenues = [...fiches.values()].filter(f => {
  const p = prixPortail.get(f.ref)
  if (!p || !f.prixCarton) return true
  const ecart = Math.abs(1 - p.prix / f.prixCarton)
  if (ecart <= MEME_PRIX) { doublons.push(f); if (!p.achete) aProuver.push(f.ref); return false }
  return true
})

const rows = retenues.map(f => ({
  fournisseur_id: gineys.id,
  // Même forme que nos autres codes Gineys : 7 chiffres, zéros de tête.
  reference: f.ref.padStart(7, '0'),
  designation: f.nom,
  famille: familleParRef.get(f.ref) ?? null,
  unite: 'colis',
  prix_ht: f.prixCarton,
  colis_quantite: 1,
  colis_libelle: 'Carton',
  // ⚠️ La contenance est un NOMBRE DE PIÈCES, jamais le poids imprimé sur la
  // fiche : « Poids : 280 g » est le poids d'UNE baguette, pas celui du
  // carton. Le confondre donnerait un prix au kilo trente fois trop élevé.
  contenance_valeur: f.pieces,
  contenance_unite: 'piece',
  cle_comparaison: null,
  date_tarif: DATE_TARIF,
  source: `Catalogue Arti'Pat 2026 p.${f.page} — tarif public indicatif`,
  nature: 'catalogue',
  remise_pct: null,
  tarif_negocie: false,
  achete: false,
  actif: true,
}))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · catalogue Arti'Pat 2026 ──\n`)
console.log(`  ${fiches.size} fiche(s) lue(s) et contrôlées`)
if (incoherentes) console.log(`  ⚠️ ${incoherentes} écartée(s) : prix carton ÷ pièces ≠ prix pièce imprimé`)
console.log(`  ${doublons.length} écartée(s) : déjà au portail AU MÊME PRIX (doublon sans information)`)
console.log(`  ${rows.length} à écrire · ${rows.filter(r => r.famille).length} avec une famille connue`)
console.log(`  ${aProuver.length} référence(s) du portail dont on peut désormais AFFIRMER qu'elles sont au tarif public`)

// Ce que la remise vaut, référence par référence.
const remises = []
for (const f of fiches.values()) {
  const p = prixPortail.get(f.ref)
  if (p && f.prixCarton > 0) remises.push({ nom: f.nom, pct: (1 - p.prix / f.prixCarton) * 100, cat: f.prixCarton, nous: p.prix, achete: p.achete })
}
if (remises.length) {
  const moy = remises.reduce((a, r) => a + r.pct, 0) / remises.length
  console.log(`\n  ⚖️  ${remises.length} référence(s) comparables à notre tarif portail`)
  console.log(`      remise moyenne obtenue : ${moy.toFixed(1)} %`)
  remises.sort((a, b) => b.pct - a.pct)
  for (const r of remises.slice(0, 5))
    console.log(`      ${r.pct.toFixed(0).padStart(3)} %  ${r.nom.slice(0, 38).padEnd(38)} ${r.cat.toFixed(2).padStart(7)} € → ${r.nous.toFixed(2)} €`)
  const ach = remises.filter(r => r.achete), autres = remises.filter(r => !r.achete)
  const moyDe = l => l.length ? (l.reduce((a,r)=>a+r.pct,0)/l.length).toFixed(1) : '—'
  console.log(`      · ${ach.length} article(s) QUE NOUS ACHETONS   → remise moyenne ${moyDe(ach)} %`)
  console.log(`      · ${autres.length} autre(s) du catalogue portail → remise moyenne ${moyDe(autres)} %`)
  const tranches = { '≥30 %':0, '20-30 %':0, '10-20 %':0, '0-10 %':0, 'négative':0 }
  for (const r of remises) {
    if (r.pct >= 30) tranches['≥30 %']++
    else if (r.pct >= 20) tranches['20-30 %']++
    else if (r.pct >= 10) tranches['10-20 %']++
    else if (r.pct >= 0) tranches['0-10 %']++
    else tranches['négative']++
  }
  console.log('      distribution : ' + Object.entries(tranches).map(([k,v])=>`${k} ${v}`).join(' · '))
  const proches = remises.filter(r => r.pct >= 0 && r.pct < 10).sort((a,b)=>a.pct-b.pct)
  console.log('      exemples 0-10 % :')
  for (const r of proches.slice(0, 6))
    console.log(`        ${r.pct.toFixed(1).padStart(5)} %  ${r.nom.slice(0,40).padEnd(40)} ${r.cat.toFixed(2).padStart(7)} € → ${r.nous.toFixed(2)} €`)
  const negatives = remises.filter(r => r.pct < -1)
  // ⚠️ Un prix payé AU-DESSUS du tarif public signale un mauvais
  // rapprochement, pas une hausse (règle déjà posée pour ce catalogue).
  if (negatives.length) {
    console.log(`\n  ⚠️ ${negatives.length} référence(s) payée(s) AU-DESSUS du tarif public — à vérifier :`)
    for (const r of negatives.slice(0, 5))
      console.log(`      ${r.pct.toFixed(0).padStart(4)} %  ${r.nom.slice(0, 38).padEnd(38)} ${r.cat.toFixed(2)} € → ${r.nous.toFixed(2)} €`)
  }
}

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

// Les références PROUVÉES au tarif public : NULL → false.
// ⚠️ Seulement celles qu'on a mesurées. Généraliser aux 2 800 lignes du
// portail serait une déduction, pas un constat — et l'écran distingue
// justement « vérifié » de « personne n'a vérifié ».
let prouvees = 0
for (let i = 0; i < aProuver.length; i += 80) {
  const lot = aProuver.slice(i, i + 80).map(r => r.padStart(7, '0'))
  await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&nature=eq.portail&tarif_negocie=is.null&reference=in.(${lot.join(',')})`, {
    method: 'PATCH', body: JSON.stringify({ tarif_negocie: false }),
    headers: { Prefer: 'return=minimal' },
  })
  prouvees += lot.length
}
console.log(`\n✓ ${prouvees} référence(s) marquée(s) « tarif public confirmé ».`)

let n = 0
for (let i = 0; i < rows.length; i += 200) {
  const lot = rows.slice(i, i + 200)
  await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
    method: 'POST', body: JSON.stringify(lot),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  n += lot.length
}
console.log(`\n✓ ${n} tarif(s) catalogue Arti'Pat enregistré(s).\n`)
