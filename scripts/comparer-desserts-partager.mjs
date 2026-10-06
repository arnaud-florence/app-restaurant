// Gâteaux ENTIERS à partager — ce que proposent les sept fournisseurs.
//
//   node scripts/comparer-desserts-partager.mjs [--tout]
//
// Décision du gérant (04/10/2026) : les desserts du Fournil, de la
// restauration ET des pizzas passent sur des gâteaux entiers prédécoupés.
// Une seule référence sert les trois étages — on ne commande plus trois
// gammes de portions individuelles.
//
// LECTURE SEULE. Rien n'est écrit, aucune clé de comparaison n'est posée :
// la suggestion se calcule, la DÉCISION s'enregistre (0151).
//
// ⚠️⚠️ L'UNITÉ DE LA LIGNE DÉCIDE, AVANT LE COLISAGE. Une ligne au COLIS
// porte le prix du carton : il se divise par C=N pour obtenir le gâteau.
// Une ligne à la PIÈCE porte déjà le prix du gâteau — la rediviser par C=N
// donnerait un entremets à deux euros, et un food cost de 3 % ne se signale
// pas tout seul. C'est la faute du croissant à 40 € prise dans l'autre sens.
//
// ⚠️ LE NOMBRE DE PARTS N'EST JAMAIS INVENTÉ. Il n'est lu que s'il est
// IMPRIMÉ (« PREDEC 14 PART »). Un entremets de 1,5 kg peut se couper en 10
// comme en 16 ; poser 12 par défaut écrirait un €/part faux, affiché comme
// les autres. Sans lui, on compare au KILO — toujours vrai.
import fs from 'node:fs'
import { conditionnement, norme } from './_tarifs-communs.mjs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }

/** ⚠️ Pagination + tri sur `id` (colonne UNIQUE) : PostgREST plafonne à
 *  1 000 lignes SANS le dire, et sans `order` deux appels ne rendent pas les
 *  mêmes lignes. Un comparateur nourri d'un tiers du catalogue désignerait
 *  un « moins cher » choisi dedans. */
async function lireTout(table, select) {
  const out = []
  for (let d = 0; d < 20000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${table}?select=${select}&order=id&offset=${d}&limit=1000`, { headers: H })
    const lot = JSON.parse(await r.text())
    out.push(...lot); if (lot.length < 1000) break
  }
  return out
}

const eur = n => n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' €'

// ─── Ce qui est un GÂTEAU ENTIER À PARTAGER, et ce qui ne l'est pas ───────
const SUCRE = /(ENTREMET|TARTE|GATEAU|GÂTEAU|FLAN|CHEESECAKE|TIRAMISU|FRAISIER|OPERA|FORET.?NOIRE|ROYAL|FRAMBOISIER|MILLE.?FEUILLE|CHARLOTTE|BAVAROIS|CRUMBLE|BROWNIE|FONDANT|MOELLEUX|CLAFOUTIS|PARIS.?BREST|SAINT.?HONORE|BABA|PITHIVIER|GALETTE|PAVLOVA|TROPEZIENNE|TROPÉZIENNE|CAKE|SUCCES|DELICE|GOURMAND)/i

// ⚠️ Le SALÉ partage le vocabulaire du sucré — « BUCHE CHEVRE », « TARTE
// SAUMON », « DUO ROYAL BRIE ». Sans ce filtre, une bûche de chèvre se
// retrouverait en dessert, et c'est le genre de ligne qu'on commande.
const SALE = /(CHEVRE|CHÈVRE|BRIE|RACLETTE|SAUMON|FROMAGE|COMTE|CHEDDAR|JAMBON|POULET|THON|QUICHE|PIZZA|TOURNESOL|LIN|CEREALE|SEIGLE|CAMPAGNE|BAGUETTE|PAIN\b|PUREE|PURÉE|\bPDT\b|\bPOIS\b|HACHE|HACHÉ|BURGER|BOUCHER|VIANDE|STEAK|LEGUME|LÉGUME|POMME DE TERRE|FRITE|SAUCE|DORADE|CABILLAUD|FILET DE|POISSON|CREVETTE|MERLU|LIEU NOIR|COLIN)/i

// Ni un ingrédient, ni un emballage, ni une préparation en poudre.
const PASUNGATEAU = /(BOITE|BOÎTE|COUVERCLE|POT\b|PIPETTE|CLIP|PREPARATION|PRÉPARATION|MIX\b|SUPPORT|SEMELLE|CARTON|PLATEAU|FILM|SACHET|ETUI|BAC\b|NAPPAGE|COULIS|DECOR|DÉCOR|GLACAGE|GLAÇAGE)/i

// Une PORTION individuelle n'est pas un gâteau à partager.
const INDIVIDUEL = /(INDIV|\bMINI\b|BOUCHON|VERRINE|BUCHETTE|TARTELETTE|SACRISTAIN|PETIT.?FOUR)/i

/** Nombre de parts — UNIQUEMENT s'il est imprimé. */
function parts(d) {
  const m = norme(d).match(/(\d{1,2})\s*PARTS?\b/) || norme(d).match(/PREDEC(?:OUPE)?\s*(\d{1,2})\b/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 4 && n <= 30 ? n : null
}

/**
 * Poids d'UN gâteau, en kg — lu dans le libellé.
 *
 * ⚠️⚠️ ON LIT LE LIBELLÉ BRUT, PAS SA FORME NORMALISÉE. `norme()` remplace
 * toute ponctuation par une espace : « DIAM 27 CM 1.6 KG » y devient
 * « 1 6 KG », donc le gâteau Krill de 1,6 kg était lu à 6 kg — et son prix
 * au kilo s'effondrait, le faisant passer pour le MOINS CHER de toute la
 * comparaison. Aucune erreur, un nombre plausible, et un fournisseur
 * couronné à tort sur l'écran qui déclenche la commande.
 */
function poidsPiece(d) {
  const t = d.toUpperCase()
  // « 1710G », « 2.55KG », « 1,5KG »
  const m = [...t.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(KG|G)\b/g)]
    .map(x => ({ v: Number(x[1].replace(',', '.')), u: x[2] }))
    .map(x => x.u === 'KG' ? x.v : x.v / 1000)
    .filter(v => v >= 0.4 && v <= 6)   // un gâteau à partager, pas une part ni un sac de farine
  if (!m.length) return null
  // Plusieurs poids contradictoires → on se tait (règle de la 0151).
  return new Set(m.map(v => v.toFixed(3))).size > 1 ? null : m[0]
}

/** Diamètre en cm — « ø26 CM », « DIAM 28 CM ». */
function diametre(d) {
  const m = norme(d).match(/(?:DIAM(?:ETRE)?\s*|O\s*|Ø\s*)(\d{2})\s*CM/)
  return m ? Number(m[1]) : null
}

const lignes = await lireTout('catalogue_fournisseur',
  'id,reference,designation,famille,unite,prix_ht,nature,colis_quantite,colis_libelle,fournisseur_id,fournisseurs(nom)')
const actifs = lignes.filter(l => l.actif !== false)

const candidats = []
for (const l of actifs) {
  const d = l.designation || ''
  if (!SUCRE.test(d) || SALE.test(d) || PASUNGATEAU.test(d) || INDIVIDUEL.test(d)) continue
  const p = parts(d), kg = poidsPiece(d), dia = diametre(d)
  // Un gâteau à PARTAGER se reconnaît à l'une de ces trois marques.
  if (!p && !(kg && kg >= 0.7) && !(dia && dia >= 18)) continue

  // ⚠️⚠️ UN COLIS DE 1 SE LIT CHEZ GINEYS, PAS DANS UN CATALOGUE DE MARQUE.
  // Le portail écrit « Col » + colis_quantite 1 : le colis EST le gâteau,
  // et son prix est notre prix. Un catalogue de marque écrit « Carton » +
  // 1 par défaut — or le carton en contient plusieurs, et rien ne dit
  // combien. Preuve sur le même produit : le Carrot Cake prédécoupé sort à
  // Le portail et le catalogue diffèrent d'un facteur trois exactement.
  // Prendre le second pour un gâteau triplerait le prix de la part — et
  // c'est ce prix qui déciderait de ne pas le mettre à la carte.
  const colis = conditionnement(d)
    ?? (l.nature === 'portail' && Number(l.colis_quantite) === 1 ? 1 : null)
  const u = (l.unite || '').toLowerCase()
  const prix = l.prix_ht == null ? null : Number(l.prix_ht)

  // ⚠️ Prix d'UN gâteau : l'unité de la ligne décide.
  let prixGateau = null, base = null
  if (prix != null) {
    if (u.startsWith('col')) { if (colis) { prixGateau = prix / colis; base = colis === 1 ? 'colis de 1' : `colis de ${colis}` } }
    else if (u.startsWith('pi') || u === 'piece' || u === 'pièce') { prixGateau = prix; base = 'à la pièce' }
    else if (u === 'kg' && kg) { prixGateau = prix * kg; base = `${prix} €/kg × ${kg} kg` }
  }
  candidats.push({
    f: l.fournisseurs?.nom ?? '?', d, famille: l.famille, ref: l.reference,
    nature: l.nature, unite: l.unite, prix, colis, parts: p, kg, dia,
    prixGateau, base,
    parPart: prixGateau != null && p ? prixGateau / p : null,
    parKg: prixGateau != null && kg ? prixGateau / kg : null,
  })
}

console.log(`\n═══ GÂTEAUX ENTIERS À PARTAGER — ${candidats.length} références sur ${actifs.length} du catalogue\n`)

const parF = new Map()
for (const c of candidats) parF.set(c.f, (parF.get(c.f) ?? 0) + 1)
console.log('Par fournisseur :')
for (const [f, n] of [...parF].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${f}`)

// ─── Ceux qui disent leur nombre de parts : le chiffre qui décide ─────────
const avecParts = candidats.filter(c => c.parPart != null).sort((a, b) => a.parPart - b.parPart)
console.log(`\n\n━━━ ① PRÉDÉCOUPÉS — le prix de LA PART (${avecParts.length} références)\n`)
console.log('   €/part   parts   €/kg      fournisseur     désignation')
for (const c of avecParts) {
  console.log(`   ${eur(c.parPart).padStart(8)} ${String(c.parts).padStart(5)}  ${(c.parKg ? eur(c.parKg) : '—').padStart(8)}  ${c.f.slice(0, 14).padEnd(15)} ${c.d.slice(0, 58)}`)
}

// ─── Les autres : comparables au kilo ────────────────────────────────────
const sansParts = candidats.filter(c => c.parPart == null && c.parKg != null).sort((a, b) => a.parKg - b.parKg)
console.log(`\n\n━━━ ② ENTIERS SANS NOMBRE DE PARTS IMPRIMÉ — comparables au KILO (${sansParts.length})\n`)
console.log('   €/kg      poids   ø     prix gâteau  fournisseur     désignation')
for (const c of sansParts.slice(0, 40)) {
  console.log(`   ${eur(c.parKg).padStart(8)} ${String(c.kg).padStart(6)}  ${String(c.dia ?? '—').padStart(3)}  ${eur(c.prixGateau).padStart(10)}  ${c.f.slice(0, 14).padEnd(15)} ${c.d.slice(0, 52)}`)
}
if (sansParts.length > 40) console.log(`   … ${sansParts.length - 40} autres`)

const muets = candidats.filter(c => c.parKg == null && c.parPart == null)
if (muets.length) {
  console.log(`\n\n━━━ ③ CE QU'ON NE SAIT PAS CHIFFRER — ${muets.length} références\n`)
  console.log('   ⚠️ ni prix, ni poids lisible, ni base de calcul sûre. Listées plutôt')
  console.log('      que masquées : ce sont des lignes à faire préciser au commercial.\n')
  for (const c of muets.slice(0, 15)) {
    const pourquoi = c.prix == null ? 'prix sur demande'
      : c.prixGateau == null ? `unité « ${c.unite} » sans colisage lisible`
      : 'poids du gâteau non imprimé'
    console.log(`   ${c.f.slice(0, 14).padEnd(15)} ${(pourquoi).padEnd(34)} ${c.d.slice(0, 50)}`)
  }
  if (muets.length > 15) console.log(`   … ${muets.length - 15} autres`)
}

// ─── Face-à-face par TYPE de dessert ─────────────────────────────────────
const TYPES = [
  ['Chocolat',      /CHOCOLAT|CHOCO|BROWNIE|FONDANT/i],
  ['Citron',        /CITRON/i],
  ['Flan',          /FLAN/i],
  ['Tiramisu',      /TIRAMISU/i],
  ['Pomme',         /POMME/i],
  ['Fruits rouges', /FRAISE|FRAMBOISE|FRUITS? ROUGE|CASSIS|MYRTILLE/i],
  ['Caramel',       /CARAMEL|SPECULOOS/i],
  ['Café / Opéra',  /CAFE|CAFÉ|OPERA|MOKA/i],
  ['Pistache',      /PISTACHE/i],
  ['Tarte fruits',  /ABRICOT|POIRE|FIGUE|MYRTIL|RHUBARBE/i],
]
console.log('\n\n━━━ ④ FACE-À-FACE PAR TYPE DE DESSERT\n')
for (const [nom, re] of TYPES) {
  const l = candidats.filter(c => re.test(c.d) && (c.parPart != null || c.parKg != null))
  if (l.length < 1) continue
  const fs_ = new Set(l.map(c => c.f))
  l.sort((a, b) => (a.parPart ?? Infinity) - (b.parPart ?? Infinity) || (a.parKg ?? Infinity) - (b.parKg ?? Infinity))
  console.log(`\n   ▸ ${nom} — ${l.length} réf. chez ${fs_.size} fournisseur${fs_.size > 1 ? 's' : ''}${fs_.size === 1 ? '  ⚠️ aucune concurrence' : ''}`)
  for (const c of l.slice(0, 6)) {
    const t = c.parPart != null ? `${eur(c.parPart)}/part` : `${eur(c.parKg)}/kg`
    console.log(`       ${t.padStart(15)}  ${c.f.slice(0, 14).padEnd(15)} ${c.d.slice(0, 54)}`)
  }
  if (l.length > 6) console.log(`       … ${l.length - 6} autres`)
}

// ─── Ce que NOUS vendons aujourd'hui en dessert ──────────────────────────
const nos = await lireTout('recettes', 'id,nom,categorie,prix_vente_ht,cout_achat_ht,tva,actif,etablissement_id')
const desserts = nos.filter(r => r.actif && /p[aâ]tisserie|dessert|gourmandise|glace/i.test(r.categorie || ''))
console.log(`\n\n━━━ ⑤ CE QUE NOUS VENDONS — ${desserts.length} desserts actifs\n`)
console.log('   prix TTC   coût HT    marge     food cost   produit')
for (const r of desserts.sort((a, b) => Number(b.prix_vente_ht) - Number(a.prix_vente_ht)).slice(0, 25)) {
  const ht = Number(r.prix_vente_ht), ttc = ht * (1 + Number(r.tva ?? 5.5) / 100)
  const c = r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
  const fc = c && ht ? (c / ht) * 100 : null
  console.log(`   ${eur(ttc).padStart(9)} ${(c == null ? 'inconnu' : eur(c)).padStart(9)} ${(c == null ? '—' : eur(ht - c)).padStart(9)}  ${(fc == null ? 'inconnu' : fc.toFixed(1) + ' %').padStart(9)}   ${r.nom.slice(0, 40)}`)
}
console.log()
