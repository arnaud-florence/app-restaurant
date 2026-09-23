// La liste à faire chiffrer par Euro-Cash.
//
//   node scripts/selection-eurocash.mjs
//
// Elle est construite À PARTIR DU CATALOGUE : chaque ligne reprend le code,
// la désignation et le colisage tels qu'ils y sont imprimés. Recopier un code
// à la main, c'est faire chiffrer un autre produit — et s'en apercevoir à la
// livraison.
//
// Les RAYONS sont ceux retenus par le gérant le 23/09/2026 : on demande le
// tarif de la totalité de ces rayons, pas une sélection dedans. Un
// représentant ne chiffre pas mille lignes à la main — il sort son tarif ;
// autant lui donner le périmètre complet d'un coup.
//
// La colonne PRIORITÉ marque ce sur quoi il faut qu'il se batte : les
// références qu'on achète DÉJÀ ailleurs (on connaît le prix payé au centime)
// et celles sans lesquelles on ne peut pas ouvrir le rayon tabac.
//
// Le catalogue est lu depuis `data/catalogue-eurocash-*.pdf` (gitignoré :
// c'est le document commercial d'un tiers).
//
// ⚠️ Ce qui est VOLONTAIREMENT laissé de côté est listé en fin de fichier,
// avec la raison. Une liste de courses ne dit rien de ce qu'on a écarté ;
// six mois plus tard on ne sait plus si c'était un oubli ou une décision.

import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF = process.argv.find(a => a.startsWith('--pdf='))?.slice(6)
  ?? 'data/catalogue-eurocash-ete-2026.pdf'
if (!fs.existsSync(PDF)) {
  console.error(`\n  ✗ ${PDF} absent.\n`); process.exit(1)
}

// ─── Lecture du catalogue ────────────────────────────────────────
//
// Deux mises en page cohabitent et il faut les deux :
//   · les rayons, en grille — nom / colisage / « Code : NNNNN » ;
//   · les emballages, en tableau — « NNNNN 1000 Sacs Croissants 12x5x17cm ».
async function lire(chemin) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(chemin)), useSystemFonts: true }).promise
  const par = new Map()
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const it = tc.items.filter(i => i.str.trim())
      .map(i => ({ x: i.transform[4], y: i.transform[5], t: i.str.trim(), w: i.width }))
    const estColis = t => /^c\s*-\s*\d/i.test(t)

    for (const c of it.filter(i => /^Code\s*:/.test(i.t))) {
      const num = c.t.match(/(\d{4,6})/)?.[1]; if (!num) continue
      const centre = c.x + c.w / 2
      const col = it.filter(i => estColis(i.t) && i.y > c.y && i.y < c.y + 40
        && Math.abs(i.x + i.w / 2 - centre) < 85).sort((a, b) => a.y - b.y)[0]
      const base = col ?? c
      const nom = it.filter(i => i.y > base.y + 2 && i.y < base.y + 34
        && Math.abs(i.x + i.w / 2 - centre) < 95
        && !/^Code\s*:/.test(i.t) && !estColis(i.t) && !/^\d{1,3}$/.test(i.t)
        && !/Retour sommair/i.test(i.t))
        .sort((a, b) => a.y - b.y).map(n => n.t).join(' ')
      if (!par.has(num)) par.set(num, { code: num, page: p - 1,
        nom: nom.replace(/\s+/g, ' ').trim(), colisage: col?.t.replace(/\s+/g, '') ?? '' })
    }
    // Tableaux d'emballage — SEULEMENT sur leurs pages.
    //
    // ⚠️ Lancé sur tout le catalogue, ce lecteur inventait des produits : la
    // page des e-liquides aligne des taux de nicotine (« 3 mg- 63002 ») que
    // le motif « NNNNN suivi d'un chiffre » prend pour une ligne de tableau.
    // Vingt-trois références fantômes, avec « mg- » pour désignation, qu'un
    // représentant aurait dû nous renvoyer une par une.
    if (p < 205 || p > 216) continue
    const lignes = new Map()
    for (const i of it) {
      const y = Math.round(i.y)
      if (!lignes.has(y)) lignes.set(y, [])
      lignes.get(y).push(i)
    }
    for (const arr of lignes.values()) {
      const l = arr.sort((a, b) => a.x - b.x).map(i => i.t).join(' ').replace(/\s+/g, ' ').trim()
      // ⚠️ Deux produits partagent parfois la MÊME ligne : « 68420 50 Assiettes
      // Ø22cm 68465 200 Serviettes Blanches ». Lire la ligne entière d'un coup
      // perdait le second en silence — et les serviettes sont justement une
      // référence qu'on achète déjà.
      for (const bout of l.split(/(?=\b\d{5}\s+\d)/)) {
        const m = bout.trim().match(/^(\d{5})\s+(?:\d\s+)?([\d\s]*(?:kg|poches|sacs\/\s*rlx|x\d+m)?)\s*(.+)$/i)
        if (m && !par.has(m[1])) par.set(m[1], { code: m[1], page: p - 1,
          nom: m[3].trim(), colisage: (m[2] || '').trim() })
      }
    }
  }
  return par
}

// ─── Les rayons retenus par le gérant (23/09/2026) ───────────────
//
// Tabac, bar, boulangerie, relais colis et bientôt PMU : cinq clientèles qui
// se croisent au même comptoir. Le fil de cette liste est là — ce qu'on
// achète pour NOUS (emballages, hygiène) et ce qu'on revend à quelqu'un qui
// entrait pour autre chose.
const RAYONS = [
  ['Pochettes cadeau enfants', 73, 74,
   "Un enfant qui accompagne son parent au tabac repart avec quelque chose, ou le parent revient sans lui."],
  ['Tartinables', 104, 106,
   "Le dépannage d'épicerie que le village achète déjà ailleurs : confitures, miel, pâte à tartiner."],
  ['Boissons — canettes & briquettes', 116, 123,
   "Confirmé par le gérant : les canettes viennent d'Euro-Cash, la canette France Boissons coûte nettement plus cher qu'en cash & carry."],
  ['Boissons — PET & verres perdus', 124, 128, ''],
  ['Boissons — grands formats', 129, 129, ''],
  ['Jus de fruits', 130, 134, ''],
  ['BIB concentrés & jus', 135, 135, ''],
  ['Eaux', 136, 138,
   "Cristaline en entrée de gamme et San Pellegrino pour la table, retenus par le gérant."],
  ['Mr. Freeze', 139, 139, ''],
  ['Bières', 140, 146,
   "⚠️ Second canal face à France Boissons. Le relevé du 21/09 a montré que leur remise est INÉGALE selon la marque — Heineken et Moretti 30 L n'en ont aucune. C'est exactement là qu'un deuxième tarif se rentabilise."],
  ['Vins', 148, 164,
   "⚠️ Le vin tranquille devait passer par un vignoble ou un caviste. Ce tarif sert de repère de négociation, pas de décision."],
  ['Cidres', 165, 165, ''],
  ['Champagnes', 166, 167, ''],
  ['Proseccos', 168, 168,
   "Le spritz est chiffré sur le prosecco Scalini de France Boissons : une alternative moins chère se voit tout de suite."],
  ['Produits pipiers', 171, 181,
   "Feuilles, filtres, tubes, rouleuses. On ne vend pas de tabac sans : un client qui ne les trouve pas ici les prend ailleurs, et son paquet suit."],
  ['Briquets & allumettes', 182, 189,
   "L'achat d'impulsion par excellence, et l'épicerie du village les vend déjà."],
  ['Accessoires — lunettes & téléphonie', 190, 195,
   "Les LOUPES sont le vrai besoin d'un village qui vieillit, et elles se vendent toute l'année — les solaires ne font que l'été."],
  ['Accessoires — piles', 196, 197,
   "Ce qu'on vient chercher un dimanche quand tout est fermé. Marge élevée, rotation lente, encombrement nul."],
  ['Accessoires divers — jeux, couteaux', 198, 200,
   "Jeux de cartes pour les tables du bar. Le PMU amène une clientèle qui attend, et qui consomme pendant qu'elle attend."],
  ['Hygiène', 216, 217,
   "Le plan de nettoyage HACCP suppose des produits ; autant les faire chiffrer avec le reste."],
]

// Les emballages ont leur propre mise en page (tableaux) et couvrent aussi
// « accessoires de cuisine » (p.211) et « vaisselle jetable » (p.209-210).
const RAYONS_TABLEAU = [
  ['Emballages, accessoires de cuisine & vaisselle jetable', 204, 215,
   "PRIORITÉ ABSOLUE : sacs à croissants, sacs baguette, sacs sandwich, boîtes pâtissières, bols à salade, gobelets, serviettes, kits couverts — on achète déjà ces références chez Gineys et Promocash, donc leur prix payé est connu au centime. C'est la comparaison la plus immédiatement rentable du catalogue."],
]

// ─── Ce qu'on paie DÉJÀ, chez quelqu'un d'autre ──────────────────
//
// C'est le cœur du tableau : un fournisseur qui ne sait pas ce qu'il doit
// battre propose son tarif public, et on perd les deux côtés — lui l'affaire,
// nous le temps de comparer.
//
// ⚠️ CHAQUE PAIRE EST UNE DÉCISION, pas un rapprochement automatique. Un prix
// faux en face d'une de SES références, c'est lui demander une remise sur un
// produit qui n'est pas le nôtre : il la refuse, ou pire il l'accorde et on
// découvre l'écart à la livraison. Le FORMAT doit concorder exactement — un
// sac à baguette 19+7x42 n'est pas un sac 9+6,5x58, et on ne le fait pas
// semblant. Ce qui ne concorde pas part dans `A_PROPOSER`, où il devient une
// question : « avez-vous l'équivalent ? »
//
// prix = ce qu'on paie pour UNE unité vendable (un sac, une canette, un kilo).
const PRIX_CONNUS = {
  // ── Emballages : formats identiques au centimètre près ──
  '67996': { prix: 0.01373, base: 'le sac (colis de 1000)' },              // Sacs croissants N°104
  '68043': { prix: 0.026294, base: 'le sac (colis de 1000)' },             // Sandwich kraft blanc 12+6x34
  '68089': { prix: 0.1568,  base: 'la boîte (sachet de 50)' },             // Boîte pâtissière 16x8
  '68406': { prix: 0.246,   base: 'le bol + couvercle (sachet de 25)' },   // Bol salade 750 ml
  '68436': { prix: 0.1184,  base: 'le kit (colis de 250)' },               // Kit couvert 3 pièces bois
  '68465': { prix: 0.0127,  base: 'la serviette 30x30 1 pli' },            // Serviette snack

  // ── Canettes et jus : nos prix cash & carry ──
  '53850': { prix: 0.66, base: 'la canette 33 cl' },
  '53860': { prix: 0.56, base: 'la canette 33 cl' },
  '52501': { prix: 0.58, base: 'la canette 33 cl' },
  '52397': { prix: 1.19, base: 'la bouteille 33 cl' },
  '52456': { prix: 0.85, base: 'la bouteille 20 cl' },
  '52406': { prix: 0.95, base: 'la bouteille 20 cl' },

  // ── Épicerie ──
  '28500': { prix: 26.458, base: 'le pot de 3 kg' },                       // Nutella

  // ⚠️ Les deux suivantes sont des prix France Boissons, DROITS D'ACCISES
  // COMPRIS et en verre CONSIGNÉ. Le dire est indispensable : sans cette
  // précision, le prix paraît élevé et la remise demandée n'a pas de sens.
  '57003': { prix: 0.9392, base: 'la bouteille 33 cl, verre consigné' },   // Perrier
  '54822': { prix: 1.504,  base: 'la bouteille 33 cl, verre consigné, droits compris' }, // Desperados
}

// ─── Ce qu'on achète ailleurs et qu'on ne trouve pas chez eux ────
//
// La moitié la plus utile du tableau pour un commercial : chaque ligne est
// une affaire qu'il peut prendre en proposant un équivalent. Sans cette
// liste, il ne sait même pas que le besoin existe.
const A_PROPOSER = [
  ['Sac à baguette kraft 19+7x42 cm',        1000, 35.804, 'Aucun format équivalent au catalogue (vous avez 9+3,5x41 et 9+6,5x58)'],
  ['Sachet à baguette blanc 9,3+5x55 cm',    1000, 39.354, 'Proche de votre 68022 (9+6,5x58) sans être identique'],
  ['Sac kraft brun à poignée, fond 12/6',     250, 31.850, 'Vos cabas lisses 68582 / 68585 ont un autre fond'],
  ['Boîte pâtissière blanche 22x8 cm',         50, 10.450, 'Vous passez de 20x20 à 23x23 — rien en 22'],
  ['Touillette bois',                         300,  1.594, 'Vos touillettes Genovese sont emballées, pas les nôtres'],
  ['Paille carton kraft 46 mm',               500,  7.304, 'À rapprocher de vos 68433 / 68434'],
  ['Film alimentaire, boîte distributrice 45 cm x 300 m', 1, 11.522, 'Vos distributeurs sont en 30 cm'],
  ['Aluminium, boîte distributrice 45 cm x 200 m',        1, 23.584, 'Vos rouleaux sont en 20 cm'],
  ['Sac à croissants — autres tailles que le N°104',    1000, null, 'Nous ne prenons que le N°104 aujourd\'hui ; un tarif dégressif sur la gamme nous intéresse'],
]

// ─── Ce sur quoi il faut qu'il se batte ──────────────────────────
//
// Deux raisons d'être prioritaire, et une seule suffit :
//   · on l'achète DÉJÀ ailleurs — le prix payé est en base, l'écart se lit
//     le jour même ;
//   · sans elle, le rayon tabac ne peut pas ouvrir.
const PRIORITAIRES = new Set([
  // feuilles, filtres, tubes — le rayon ne peut pas ouvrir sans
  '64035','64056','64038','64060','64033','64030','64037','64059',
  '65271','65273','65287','65288','65286','64226',
  '64076','64077','64074','64232','65284','64082','64090','64092','64094','64096',
  // briquets unis : ils tournent toute l'année, les séries à visuel se démodent
  '61005','61068','61304','61301','61302','61303','61600','61320',
  '61515','61500','61640','61644',
  // dépannage : les formats universels d'abord
  '66502','66506','66510','66514','66518','66524','66526','66528',
  '66158','71100','66903','66913','66904','66907','66938','66920','66941',
  '66630','66900','66722','66705','66802',
  // canettes et eaux retenues
  '53850','53860','52501','53880','53026','57003','52990','53000',
  '56217','56215','56990','57090',
  // emballages déjà facturés chez Gineys / Promocash
  '67993','67994','67995','67996','67997','68019','68022','68024',
  '68041','68043','68055','68047','68089','68090','68091','68092',
  '68406','68407','68465','68420','68436','68437','68438','68439',
  '68447','68451','68453','68473','68475','62321','62322','68702',
  '68383','68384','68515','68513','68582','68585','68529','68530','68586','68588',
  // hygiène
  '70900','70905','70920','70925','70935','70940','68074','70980',
])

// ─── Ce qu'on NE demande PAS, et pourquoi ────────────────────────
const ECARTES = [
  ['CBD, e-liquides, cigarettes électroniques (p.176-181)',
   "Ils tombent dans le rayon « produits pipiers » et partent donc avec lui. À trancher avant de les mettre en vitrine : image de la maison, réglementation, vitrine sécurisée."],
  ['Poppers « Rush » (p.180)',
   "Même rayon, même réserve — vente encadrée et sans rapport avec la clientèle visée."],
  ['Pétards et artifices (p.199, dans « Divers »)',
   "Catégories F2/F3 : stockage réglementé, âge minimum, responsabilité en cas d'accident. Un commerce qui ouvre n'a pas besoin de ça la première année."],
  ['Confiseries, biscuits, chocolats (p.8-101)',
   "PAS dans la liste du gérant. C'est pourtant là que se joue le panier moyen d'un tabac, dont le prix des cigarettes est imposé. À confirmer : oubli ou décision ?"],
  ['Cafés et thés (p.111-113)',
   "Le café vient de France Boissons, avec machine et moulin mis à disposition. Changer de canal romprait cette mise à disposition."],
]

// Une poignée de libellés sont COUPÉS par la mise en page : le mot
// « Gobelets » est posé au-dessus d'une colonne de contenances, et la ligne
// du tableau ne porte plus que « 18cl ». Les rétablir ici, à la vue du
// catalogue, vaut mieux que d'envoyer « cl » à chiffrer.
const LIBELLES = {
  '68447': 'Gobelets Carton 10cl',
  '68451': 'Gobelets Carton 18cl',
  '68453': 'Gobelets Carton 25cl',
  '66502': 'Piles LR06 (AA) — blister',
  '66506': 'Piles LR03 (AAA) — blister',
  '66510': 'Piles LR14 (C)',
  '66514': 'Piles LR20 (D)',
  '66518': 'Piles 9V',
  '66961': 'Verre trempé iPhone 14 / 14 Pro / 15 / 15 Pro / 16',
  '66962': 'Verre trempé iPhone 14+ / 14 Pro Max / 15+ / 15 Pro Max',
  '56990': 'San Pellegrino',
  '57003': 'Perrier',
  '28510': 'Tic Tac T1 Menthe',
  '28515': 'Tic Tac T1 Menthe Extra Fresh',
  '28514': 'Tic Tac T1 Duo',
  '28508': 'Tic Tac T100 Menthe',
  '28506': 'Tic Tac T100 Menthe Extra Fraîche',
}

const cat = await lire(PDF)
for (const [code, nom] of Object.entries(LIBELLES)) {
  const p = cat.get(code); if (p) p.nom = nom
}
/**
 * Combien d'unités VENDABLES dans un colis.
 *
 * « c-24x33cl » = 24 canettes ; « c-1x50 » = 50 pièces ; « c-4x6x33cl » = 24 ;
 * « c-10x4 » = 40 piles ; « 1000 » (emballages) = 1000.
 *
 * ⚠️ Le facteur qui porte une CONTENANCE (33cl, 3kg) n'est pas un nombre
 * d'unités : le multiplier donnerait 792 canettes au lieu de 24, et le prix
 * de colis équivalent demandé serait absurde.
 */
function unitesColis(colisage) {
  if (!colisage) return null
  const c = String(colisage).trim()
  if (/^\d+$/.test(c)) return Number(c)
  const facteurs = [...c.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml|pcs?)?/gi)]
    .filter(m => !/^(kg|g|l|cl|ml)$/i.test(m[2] ?? ''))
    .map(m => Number(m[1].replace(',', '.')))
  if (!facteurs.length) return null
  const n = facteurs.reduce((a, b) => a * b, 1)
  return Number.isFinite(n) && n > 0 ? n : null
}

const lignes = []
const tous = [...cat.values()]
for (const [rayon, a, b, pourquoi] of [...RAYONS, ...RAYONS_TABLEAU]) {
  const refs = tous.filter(p => p.page >= a && p.page <= b)
    .sort((x, y) => x.page - y.page || x.code.localeCompare(y.code))
  for (const r of refs) {
    const connu = PRIX_CONNUS[r.code] ?? null
    const u = unitesColis(r.colisage)
    lignes.push({ rayon, pourquoi, ...r,
      prioritaire: PRIORITAIRES.has(r.code),
      notrePrix: connu?.prix ?? null,
      base: connu?.base ?? null,
      // Le chiffre qu'elle doit battre sur SON colis. Rendu seulement quand
      // on sait combien d'unités il contient — sinon on demanderait une
      // remise sur un nombre inventé.
      colisEquivalent: connu && u ? Number((connu.prix * u).toFixed(2)) : null })
  }
}

// ⚠️ Un code prioritaire qui ne tombe dans AUCUN rayon retenu serait perdu en
// silence — c'est le cas des sacs poubelle et gants, rangés en fin
// d'emballages. Mieux vaut le dire que le découvrir à la commande.
const vus = new Set(lignes.map(l => l.code))
const orphelins = [...PRIORITAIRES].filter(c => !vus.has(c))

const avecPrix = lignes.filter(l => l.notrePrix !== null)
console.log(`\n── DEMANDE DE TARIF EURO-CASH ──  ${lignes.length} références`)
console.log(`   dont ${lignes.filter(l => l.prioritaire).length} prioritaires`)
console.log(`   dont ${avecPrix.length} avec notre prix actuel en face\n`)
for (const l of avecPrix)
  console.log(`   ${l.code}  ${l.nom.slice(0, 40).padEnd(42)}${String(l.notrePrix).padStart(8)} € ${l.base.padEnd(42)}→ colis à battre : ${l.colisEquivalent ?? '?'} €`)
const inconnus = Object.keys(PRIX_CONNUS).filter(c => !cat.has(c))
if (inconnus.length) console.log(`\n  ⚠️ prix posés sur des codes ABSENTS du catalogue : ${inconnus.join(', ')}`)
let r = null
for (const l of lignes) {
  if (l.rayon !== r) {
    r = l.rayon
    const n = lignes.filter(x => x.rayon === r)
    console.log(`\n  ${r}  —  ${n.length} réf., ${n.filter(x => x.prioritaire).length} prioritaire(s)`)
    if (l.pourquoi) console.log(`    ${l.pourquoi}`)
  }
}
if (orphelins.length) console.log(`\n  ⚠️ prioritaires hors rayons retenus : ${orphelins.join(', ')}`)

console.log(`\n  Écartés :`)
for (const [quoi, pourquoi] of ECARTES) console.log(`    · ${quoi}\n      ${pourquoi}`)

// ─── Le fichier à envoyer ────────────────────────────────────────
const esc = s => `"${String(s).replace(/"/g, '""')}"`
const csv = ['Rayon;Priorité;Code;Désignation;Colisage;Page catalogue;Notre prix actuel HT;Base de notre prix;Prix colis à battre;VOTRE PRIX HT;VOTRE REMISE']
for (const l of lignes) csv.push([
  l.rayon, l.prioritaire ? 'PRIORITAIRE' : '', l.code, l.nom, l.colisage, l.page,
  l.notrePrix === null ? '' : String(l.notrePrix).replace('.', ','),
  l.base ?? '',
  l.colisEquivalent === null ? '' : String(l.colisEquivalent).replace('.', ','),
  '', '',
].map(esc).join(';'))

// Les besoins sans équivalent au catalogue : une affaire à prendre pour qui
// sait proposer le produit. Elles ferment le tableau plutôt que de disparaître.
csv.push('')
csv.push(esc('CE QUE NOUS ACHETONS AILLEURS ET QUE NOUS N’AVONS PAS TROUVÉ À VOTRE CATALOGUE — avez-vous un équivalent ?'))
csv.push('Désignation;Par;Notre prix HT du colis;Remarque;;;;;;VOTRE PRIX HT;VOTRE REMISE')
for (const [nom, par, prix, remarque] of A_PROPOSER)
  csv.push([nom, par, prix === null ? '' : String(prix).replace('.', ','), remarque, '', '', '', '', '', '', ''].map(esc).join(';'))
const sortie = 'data/tarif-eurocash-2026-09-23.csv'
fs.writeFileSync(sortie, '﻿' + csv.join('\r\n'), 'utf8')
console.log(`\n  → ${sortie} — ${lignes.length} lignes, 3 colonnes vides à remplir par Euro-Cash\n`)
