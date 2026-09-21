// Photos des plats de la brasserie — générées, puis mises au format du site.
//
// L'affiche brasserie est trop petite pour être découpée (82 px de haut par
// case, cf. visuels-carte-restaurant.mjs). Les visuels sont donc GÉNÉRÉS par
// image.pollinations.ai (sans compte : modèle simple, petit filigrane en bas à
// droite), dans l'esprit de l'affiche — photo culinaire chaude, fond sombre,
// table rustique. Ce sont des illustrations : les photos réelles des assiettes
// les remplaceront, sans changer les URL en base.
//
// Ce script ne fait que la mise au format : il retire la bande du filigrane
// (bas de l'image) et recadre en 900×675, le format de toutes les photos
// produit. Les fichiers gardent le nom des plaques qu'ils remplacent.
//
//   node scripts/photos-brasserie.mjs <dossier des images générées>
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2]
if (!SRC) { console.log('usage : node scripts/photos-brasserie.mjs <dossier>'); process.exit(1) }
const fichiers = fs.readdirSync(SRC).filter(f => /\.jpg$/.test(f) && !/^(test|t-)/.test(f))
let n = 0
for (const f of fichiers) {
  const cible = path.join('public/produits', f)
  if (!fs.existsSync(cible)) { console.log('  ? pas de produit pour ' + f); continue }
  const m = await sharp(path.join(SRC, f)).metadata()
  // Le filigrane occupe ~5 % du bas : on garde 93 % de la hauteur, recadrage
  // centré en 4:3 ensuite.
  const h = Math.floor(m.height * 0.93)
  const w = Math.min(m.width, Math.floor(h * 4 / 3))
  await sharp(path.join(SRC, f))
    .extract({ left: Math.floor((m.width - w) / 2), top: 0, width: w, height: Math.floor(w * 3 / 4) })
    .resize(900, 675, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 })
    .jpeg({ quality: 86 }).toFile(cible)
  n++
}
console.log(`${n} photo(s) mises au format → public/produits`)
