// Les VRAIES photos produit des pains, tirées du catalogue Arti'Pat 2026.
//
// Les sept pains du Fournil sont tous des références Arti'Pat (la gamme
// boulangerie de Gineys), et le catalogue porte la photo de chacun. Quatre
// des sept visuels du site n'en venaient pas : ce sont des images d'ambiance
// génériques, et deux sont interchangeables — le Campestre et le Pavé Le
// Jeannot y montrent le même pain aux graines.
//
// ⚠️ Une image d'ambiance n'est pas une photo produit (règle déjà posée pour
// le « Pain aux céréales » qui portait un cliché de banque d'images). Sur une
// affiche de PRIX, le client vient chercher au comptoir ce qu'il a vu.
//
// ── LA RÈGLE, relevée page par page et non déduite ──
//
// Chaque produit occupe un BANDEAU photo pleine largeur et sa référence est
// posée en texte PAR DESSUS : on retient donc l'image dont la bande
// VERTICALE contient la référence. Vérifié sur les six pages concernées, en
// confrontant à chaque fois le libellé imprimé par le catalogue.
//
// ⚠️ On ne teste QUE le vertical. Les images de plusieurs pages sont peintes
// à x 541..1028 sur une page large de 595 — le catalogue est composé en
// double page et pdf.js rend la matrice du Form XObject autrement que ce que
// le fichier laisse croire. Exiger que la colonne contienne la référence
// perdait le Campestre, le Pain restaurant et le Pavé, en silence.
//
// ⚠️ LA PAGE 83 EST EN GRILLE — quatre fiches carrées, texte SOUS la photo —
// et aucune règle verticale ne la couvre. Elle est tranchée à la main, par
// élimination sur ce que les photos MONTRENT : le Pain Sportif se reconnaît à
// ses cranberries et ses abricots, le Bâtard Maïs à ses graines de tournesol,
// le Bâtard aux Céréales à ses graines sur linge. Restent les deux bâtards
// complets sur linge blanc — le Pain Complet.
//
// ⚠️⚠️ LES NOMS D'OBJETS pdf.js NE SONT PAS STABLES d'une exécution à
// l'autre : « img_p118_3 » désigne une image un jour et une autre le
// lendemain. Rien ne doit donc être codé sur ces noms. Ce qui est stable,
// c'est la TAILLE EN PIXELS de l'image incorporée — d'où le contrôle
// `attendu` : si la règle désigne une image d'une autre taille, le produit
// est REFUSÉ et signalé, jamais remplacé par un autre pain en silence.
//
// ⚠️ Ces photos appartiennent à Arti'Pat. Elles illustrent LEURS produits que
// nous revendons, mais n'ont rien à faire dans un dépôt public : la sortie va
// dans data/affiche-pains/, gitignoré.
//
// Nécessite pdfjs-dist :  npm install --no-save pdfjs-dist@4
//   node scripts/photos-pains-artipat.mjs [--ecrire] [chemin-du-pdf]

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
const PDF = process.argv.find(a => a.endsWith('.pdf')) ?? '/Users/admin/Downloads/ARTIPAT_2026.pdf'
const DEST = 'data/affiche-pains'

// `ref` vient de `recettes.reference_fournisseur`, jamais d'une saisie.
// `attendu` est la taille en pixels CONSTATÉE, et sert de garde-fou.
// `libelle` est le nom imprimé par le catalogue en face de la référence.
const PAINS = [
  { ref: '71033', slug: 'baguette-classique',      nom: 'Baguette classique',      attendu: [986, 738],  libelle: 'Baguette Précuite sur Four à Sole' },
  { ref: '71149', slug: 'baguette-jeannette',      nom: 'Baguette Jeannette',      attendu: [1016, 393], libelle: 'Baguette La Jeannette' },
  { ref: '71012', slug: 'baguette-paris',          nom: 'Baguette Paris',          attendu: [1015, 613], libelle: 'Pain Paris' },
  { ref: '71170', slug: 'campestre-multicereales', nom: 'Campestre multicéréales', attendu: [1015, 613], libelle: 'Baguette Campestre Multicéréales' },
  // ⚠️ page en GRILLE : choisi par la taille, pas par la règle verticale.
  { ref: '71365', slug: 'pain-complet',            nom: 'Pain complet',            attendu: [528, 512],  libelle: 'Pain Complet', grille: true },
  // ⚠️ Cette page illustre une GAMME : trois références (71032, 71002, 71031)
  // partagent la même photo de baguettes. C'est le choix du catalogue, pas un
  // mauvais appariement.
  { ref: '71031', slug: 'pain-restaurant',         nom: 'Pain restaurant',         attendu: [1015, 671], libelle: 'Pain Précuit 58 cm' },
  { ref: '71374', slug: 'pave-le-jeannot',         nom: 'Pavé Le Jeannot',         attendu: [1035, 625], libelle: 'Pavé Le Jeannot Campagne' },
]

if (!fs.existsSync(PDF)) { console.error(`⛔ catalogue introuvable : ${PDF}`); process.exit(1) }

const mul = (a, b) => [
  a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
]
// ⚠️ pdf.js décode certaines images APRÈS `getOperatorList()` : l'accès direct
// lève « Requesting object that isn't resolved yet », et la Baguette classique
// sortait « illisible ». La forme à callback attend la résolution.
const objet = (page, nom) => new Promise(res => {
  const t = setTimeout(() => res(null), 30000)
  try { page.objs.get(nom, o => { clearTimeout(t); res(o) }) } catch { clearTimeout(t); res(null) }
})

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true }).promise
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · catalogue Arti'Pat, ${doc.numPages} pages ──\n`)

const reste = new Set(PAINS.map(p => p.ref))
const pageDe = new Map()
for (let i = 1; i <= doc.numPages && reste.size; i++) {
  const page = await doc.getPage(i)
  const txt = (await page.getTextContent()).items.map(x => x.str).join(' ')
  for (const r of [...reste]) if (txt.includes(r)) { pageDe.set(r, i); reste.delete(r) }
  page.cleanup()
}

if (ECRIRE) fs.mkdirSync(DEST, { recursive: true })
let ok = 0
for (const p of PAINS) {
  const n = pageDe.get(p.ref)
  if (!n) { console.log(`   ⚠️ ${p.nom.padEnd(24)} référence ${p.ref} absente du catalogue`); continue }
  const page = await doc.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  const airePage = vp.width * vp.height
  const ol = await page.getOperatorList()

  let ctm = [1,0,0,1,0,0]; const pile = []; const cand = []
  for (let k = 0; k < ol.fnArray.length; k++) {
    const f = ol.fnArray[k], a = ol.argsArray[k]
    if (f === OPS.save) pile.push(ctm.slice())
    else if (f === OPS.restore) ctm = pile.pop() ?? [1,0,0,1,0,0]
    else if (f === OPS.transform) ctm = mul(ctm, a)
    else if (f === OPS.paintImageXObject || f === OPS.paintJpegXObject) {
      const w = Math.abs(ctm[0]), h = Math.abs(ctm[3])
      // ⚠️ Le fond de page contient TOUTES les références : sans ce filtre,
      // chaque pain reçoit la page entière en guise de photo.
      if (w * h >= airePage * 0.9) continue
      if (w < 150 || h < 80) continue              // filets, logos, pictos
      cand.push({ nom: a[0], y0: ctm[5], y1: ctm[5] + h })
    }
  }

  const item = (await page.getTextContent()).items.find(i => i.str.trim().replace(/^0+/, '') === p.ref)
  if (!item) { console.log(`   ⚠️ ${p.nom.padEnd(24)} p.${n} — référence illisible`); page.cleanup(); continue }

  // On résout les candidats, puis on choisit.
  const vus = []
  for (const c of cand) {
    const o = await objet(page, c.nom)
    if (o?.data && o.width) vus.push({ ...c, o })
  }
  const choix = p.grille
    // Page en grille : la taille constatée tranche (voir l'en-tête).
    ? vus.find(v => v.o.width === p.attendu[0] && v.o.height === p.attendu[1])
    // Bandeau : l'image dont la bande verticale porte la référence.
    : vus.find(v => item.transform[5] >= v.y0 && item.transform[5] <= v.y1)

  if (!choix) { console.log(`   ⚠️ ${p.nom.padEnd(24)} p.${n} — aucune image ne porte la référence`); page.cleanup(); continue }
  const o = choix.o
  // ⚠️ LE GARDE-FOU : une image d'une autre taille que celle constatée veut
  // dire que la mise en page a changé. On REFUSE — un pain qui en remplace un
  // autre sur une affiche de prix ne se voit pas, et le client s'en aperçoit
  // au comptoir.
  if (o.width !== p.attendu[0] || o.height !== p.attendu[1]) {
    console.log(`   ⚠️ ${p.nom.padEnd(24)} p.${n} — ${o.width}×${o.height} au lieu de ${p.attendu.join('×')} : REFUSÉ, à revérifier à l'œil`)
    page.cleanup(); continue
  }
  const ch = o.kind === 3 ? 4 : o.kind === 2 ? 3 : 1
  if (o.data.length < o.width * o.height * ch) { console.log(`   ⚠️ ${p.nom.padEnd(24)} données tronquées`); page.cleanup(); continue }

  console.log(`   ${p.nom.padEnd(24)} p.${String(n).padStart(3)} · ${String(o.width).padStart(4)}×${String(o.height).padEnd(4)} · « ${p.libelle} »`)
  if (ECRIRE) {
    // ⚠️ APLATI SUR BLANC : une image RGBA écrite telle quelle a son fond
    // transparent rendu en NOIR — la Baguette classique sortait sur fond noir,
    // inutilisable sur une affiche blanche.
    await sharp(Buffer.from(o.data.buffer ?? o.data), { raw: { width: o.width, height: o.height, channels: ch } })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92 }).toFile(path.join(DEST, `${p.slug}.jpg`))
  }
  ok++
  page.cleanup()
}
console.log(`\n   ${ok} photo(s) sur ${PAINS.length}${ECRIRE ? ` → ${DEST}/` : '   (essai à blanc — relancer avec --ecrire)'}\n`)
if (ok < PAINS.length) process.exitCode = 1
