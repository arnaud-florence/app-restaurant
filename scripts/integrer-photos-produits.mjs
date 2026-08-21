// Intègre des photos prises au comptoir (téléphone) dans la carte du site.
//
// Pourquoi ce script plutôt qu'une recherche d'images sur le web : les
// banques ouvertes (Open Food Facts, Wikimedia Commons) n'ont pour ces
// références que des clichés amateur — une main qui tient la canette, une
// cuisine en arrière-plan, ou le mauvais format (1,25 L au lieu de 33 cl).
// Sur douze candidats examinés, un seul était exploitable. Une photo prise au
// comptoir en trente secondes fait mieux, montre le produit réellement vendu,
// et n'appartient qu'au fournil.
//
// Usage :
//   1. Photographier les produits, nommer chaque fichier avec son slug
//      (ex. fanta.jpg, red-bull.jpg, focaccia-tomate-anchois.jpg)
//   2. PHOTOS=/Users/admin/Downloads/photos node scripts/integrer-photos-produits.mjs
//
// Le script recadre en 4:3 centré et sort en 900×675 qualité 86 — exactement
// le format des 60 photos découpées dans les affiches, pour que la grille du
// site reste régulière. Les fichiers existants sont écrasés : les URL en base
// ne changent pas, rien à rejouer côté SQL.

import sharp from 'sharp'
import { readdirSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const SRC = process.env.PHOTOS
if (!SRC || !existsSync(SRC)) {
  console.error('Renseigner PHOTOS=/chemin/vers/le/dossier (dossier introuvable).')
  process.exit(1)
}

const L = 900, H = 675
const EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

const fichiers = readdirSync(SRC).filter(f => EXT.has(extname(f).toLowerCase()))
if (!fichiers.length) {
  console.error(`Aucune image dans ${SRC}.`)
  process.exit(1)
}

let n = 0
for (const f of fichiers) {
  const slug = basename(f, extname(f)).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  try {
    await sharp(join(SRC, f))
      .rotate()                       // respecte l'orientation EXIF du téléphone
      .resize(L, H, { fit: 'cover', position: 'attention' })  // cadre sur le sujet
      .jpeg({ quality: 86 })
      .toFile(`public/produits/${slug}.jpg`)
    console.log(`  ✓ ${f}  →  public/produits/${slug}.jpg`)
    n++
  } catch (e) {
    console.log(`  ✗ ${f} : ${e.message}`)
  }
}
console.log(`\n${n} photo(s) intégrée(s). Committer et déployer pour les voir en ligne.`)
