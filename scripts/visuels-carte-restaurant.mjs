// Visuels des pizzas et de la brasserie, découpés dans les affiches CasaTasia
// (carte des pizzas 1024×1536, carte brasserie 1021×1540, septembre 2026).
//
// Même principe que la carte du Fournil (generer-photos-fournil.mjs) : la
// photo vient de NOTRE affiche, pas d'une banque d'images.
//
// ⚠️ Les affiches sont en basse définition : la photo de chaque case ne fait
// que ~506×144 px (pizzas) et ~500×82 px (brasserie). Recadrée en 4:3 puis
// agrandie, elle devient floue. On garde donc la bande ENTIÈRE, nette,
// centrée sur un fond flou de la même image, au format 900×675 du site.
// Ce sont des visuels d'attente : les fichiers HD de l'affiche, ou de vraies
// photos, les remplaceront sans changer les URL en base.
//
//   node scripts/visuels-carte-restaurant.mjs <dossier-sortie>
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const OUT = process.argv[2] ?? 'public/produits'
const PIZZAS = path.join(os.homedir(), 'Downloads/2A513CB6-CA53-47CA-9C0B-ADC0923CD7CB.png')
const BRASSERIE = path.join(os.homedir(), 'Downloads/FA1B435A-F75F-4B75-9CB5-DEEF15AC3925.png')

const P_ROWS = [122, 343, 564, 785, 1006, 1227], P_COLS = [2, 516]
const P_NOMS = [['La Marguerite', 'La Tasia'], ['La Reine Tasia', 'La Provençale'], ['La Ferrage', 'La St-Quinis'],
  ["L'Issole", "L'Anastasie"], ['La CasaTasia Signature', 'La Quatre Fromages'], ['La Naples', 'La Camembert']]
const B_ROWS = [105, 250, 395, 540, 685, 830, 975, 1120], B_COLS = [6, 510]
const B_NOMS = [['Burger Montagnard', 'Friture de la mer'], ['Burger CasaTasia', 'Carpaccio CasaTasia'],
  ['Burger Chèvre-Miel', 'Camembert rôti'], ['Andouillette grillée', 'Entrecôte grillée'],
  ['Tartiflette gratinée', 'Gnocchis CasaTasia'], ['Gnocchis quatre fromages', 'Salade Burrata'],
  ['Salade Chèvre chaud', 'Planche CasaTasia'], ['Planche de charcuteries', 'Planche de fromages']]

export const slug = s => s.replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const cases = []
P_ROWS.forEach((y, i) => P_COLS.forEach((x, j) => cases.push([P_NOMS[i][j], PIZZAS, { left: x, top: y + 2, width: 506, height: 142 }])))
// ⚠️ Les cases de la BRASSERIE ne font que 82 px de haut : agrandies, elles
// deviennent méconnaissables (essayé le 21/09/2026 — un burger ressemblait à
// une tache). Les plats gardent une plaque typographique en attendant de vraies
// photos ; seul le menu enfant, en grand format sur l'affiche, est découpé.
void B_ROWS; void B_COLS; void B_NOMS
cases.push(['Menu enfant', BRASSERIE, { left: 706, top: 1408, width: 308, height: 116 }])

fs.mkdirSync(OUT, { recursive: true })
for (const [nom, src, reg] of cases) {
  const fg = await sharp(src).extract(reg).resize({ width: 900, height: 600, fit: 'inside', kernel: 'lanczos3' }).toBuffer()
  const m = await sharp(fg).metadata()
  const bg = await sharp(src).extract(reg).resize(900, 675, { fit: 'cover' }).blur(18).modulate({ brightness: 0.55 }).toBuffer()
  await sharp(bg).composite([{ input: fg, top: Math.round((675 - m.height) / 2), left: Math.round((900 - m.width) / 2) }])
    .jpeg({ quality: 86 }).toFile(path.join(OUT, slug(nom) + '.jpg'))
}
console.log(`${cases.length} visuels → ${OUT}`)
