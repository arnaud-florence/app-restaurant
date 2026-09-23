// La liste à faire chiffrer par Euro-Cash.
//
//   node scripts/selection-eurocash.mjs
//
// Elle est construite À PARTIR DU CATALOGUE : chaque ligne reprend le code,
// la désignation et le colisage tels qu'ils y sont imprimés. Recopier un code
// à la main, c'est faire chiffrer un autre produit — et s'en apercevoir à la
// livraison.
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
    // Tableaux d'emballage.
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

// ─── La sélection, par BESOIN et non par rayon ───────────────────
//
// Le catalogue est rangé par famille de produit ; un commerce se raisonne par
// clientèle. Un client qui entre acheter un paquet de cigarettes n'achète pas
// « du rayon briquets », il achète ce qui va avec.
const SELECTION = [
  ['1 · Tabac — ce qui ne peut pas manquer',
    "On ne vend pas de tabac sans feuilles ni filtres : un client qui ne les trouve pas ici les prend ailleurs, et son paquet suit.",
    ['64035','64056','64038','64060','64033','64030','64037','64059',
     '65271','65273','65287','65288','65286','64226',
     '64076','64077','64074','64232','65284','64082',
     '64090','64092','64094','64096']],

  ['2 · Tabac — accessoires',
    "Rouleuses, tubeuses et cendriers de poche : faible rotation, mais ce sont eux qui font revenir plutôt que d'aller au bureau de tabac du bourg.",
    ['64130','64132','64134','65278','64135','64246','64247','64248','64015','64020']],

  ['3 · Briquets et allumettes',
    "L'achat d'impulsion par excellence, et l'épicerie du village les vend déjà. Les modèles UNIS d'abord : les séries à visuel se démodent et restent en rayon.",
    ['61005','61068','61304','61301','61302','61303','61600','61320',
     '61515','61500','61640','61644']],

  ['4 · Dépannage — piles',
    "Ce qu'on vient chercher un dimanche quand tout est fermé. Marge élevée, rotation lente, encombrement nul.",
    ['66502','66506','66510','66514','66518','66524','66526','66528']],

  ['5 · Dépannage — lunettes',
    "Les LOUPES sont le vrai besoin d'un village qui vieillit, et elles se vendent toute l'année — les solaires ne font que l'été.",
    ['66158','66150','66164','71100']],

  ['6 · Dépannage — téléphonie',
    "Câble oublié, batterie à plat : le client paie sans discuter le prix. Rester sur les formats universels, pas sur un modèle d'iPhone précis.",
    ['66903','66913','66904','66907','66938','66920','66941','66961','66962','66630','66900']],

  ['7 · Bar, PMU et comptoir',
    "Jeux de cartes pour les tables, Opinel en achat d'impulsion. Le PMU amène une clientèle qui attend, et qui consomme pendant qu'elle attend.",
    ['66722','66705','66732','66802','66800']],

  ['8 · Comptoir — confiserie de poche',
    "À côté de la caisse. Le panier moyen d'un tabac se joue là, pas sur les cigarettes dont le prix est imposé.",
    ['28510','28515','28514','28508','28506',
     '40522','40528','40526','40534','32512','32510','32580',
     '41451','41453','35065']],

  ['9 · Canettes 33 cl',
    "Confirmé par le gérant : les canettes viennent d'Euro-Cash, pas de France Boissons — la canette y coûte nettement plus cher qu'en cash & carry.",
    ['53850','53860','52501','53880','53026','57003','52990','53000']],

  ['10 · Eaux',
    "Cristaline en entrée de gamme, San Pellegrino pour la table — les deux retenus par le gérant.",
    ['56217','56215','56990','57090']],

  ['11 · Emballages — boulangerie',
    "À CHIFFRER EN PRIORITÉ : on achète déjà ces références chez Gineys et Promocash, donc on connaît le prix payé au centime. C'est la comparaison la plus immédiatement rentable du catalogue.",
    ['67993','67994','67995','67996','67997','68019','68022','68024',
     '68041','68043','68055','68047','68089','68090','68091','68092']],

  ['12 · Emballages — snacking et bar',
    "Même raison : bols à salade, gobelets, serviettes et kits couverts sont déjà facturés chez nous.",
    ['68406','68407','68465','68420','68436','68437','68438','68439',
     '68447','68451','68453','68473','68475','62321','62322','68702','68383','68384']],

  ['13 · Emballages — caisse et service',
    "Rouleaux de caisse et de terminal : consommable invisible qui bloque le service quand il manque.",
    ['68515','68513','68582','68585','68529','68530','68586','68588']],

  ['14 · Hygiène',
    "Le plan de nettoyage HACCP suppose des produits ; autant les faire chiffrer avec le reste.",
    ['70900','70905','70920','70925','70935','70940','68074','70980']],
]

// ─── Ce qu'on NE demande PAS, et pourquoi ────────────────────────
const ECARTES = [
  ['CBD, e-liquides, cigarettes électroniques (p.176-181)',
   "Ce n'est pas un oubli : ces rayons demandent une décision du gérant (image de la maison, réglementation, vitrine sécurisée). À rouvrir sciemment, pas par habitude de cocher toute une page."],
  ['Poppers « Rush » (p.180)',
   "Vente encadrée et sans rapport avec la clientèle visée."],
  ['Pétards et artifices (p.199)',
   "Catégories F2/F3 : stockage réglementé, âge minimum, responsabilité en cas d'accident. Un commerce qui ouvre n'a pas besoin de ça la première année."],
  ['Displays de briquets à visuel, 50 pièces (p.184-188)',
   "Un display, c'est cinquante briquets d'une même série qui se démode. Les modèles UNIS tournent toute l'année et se réassortissent."],
  ['Vins, bières, champagnes (p.140-168)',
   "La cave passe par France Boissons (contrat brasseur) et le vin tranquille par un vignoble. Demander un tarif ici brouillerait deux négociations en cours."],
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
const lignes = [], manquants = []
for (const [rubrique, pourquoi, codes] of SELECTION) {
  for (const code of codes) {
    const p = cat.get(code)
    if (!p) { manquants.push(`${rubrique} → ${code}`); continue }
    lignes.push({ rubrique, pourquoi, ...p })
  }
}

console.log(`\n── SÉLECTION EURO-CASH ──  ${lignes.length} références\n`)
let r = null
for (const l of lignes) {
  if (l.rubrique !== r) { r = l.rubrique; console.log(`\n  ${r}`); console.log(`  ${'─'.repeat(r.length)}`) }
  console.log(`    ${l.code}  ${l.nom.slice(0, 46).padEnd(48)}${l.colisage.padEnd(14)}p.${l.page}`)
}
if (manquants.length) console.log(`\n  ⚠️ codes introuvables au catalogue : ${manquants.join(', ')}`)

console.log(`\n  Écartés volontairement :`)
for (const [quoi, pourquoi] of ECARTES) console.log(`    · ${quoi}\n      ${pourquoi}`)

// ─── Le fichier à envoyer ────────────────────────────────────────
const esc = s => `"${String(s).replace(/"/g, '""')}"`
const csv = ['Rubrique;Code;Désignation;Colisage;Page catalogue;Prix HT unité;Prix HT colis;Remise']
for (const l of lignes) csv.push([l.rubrique, l.code, l.nom, l.colisage, l.page, '', '', ''].map(esc).join(';'))
const sortie = 'data/selection-eurocash-2026-09-23.csv'
fs.writeFileSync(sortie, '﻿' + csv.join('\r\n'), 'utf8')
console.log(`\n  → ${sortie} (${lignes.length} lignes, 3 colonnes vides à remplir par Euro-Cash)\n`)
