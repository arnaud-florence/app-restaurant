// Génère les icônes PWA carrées (192x192 + 512x512) à partir du logo CASATASIA
// rectangulaire (1693x929). On crop la zone du monogramme "CT" en haut-centre
// pour avoir une icône reconnaissable et lisible à petite taille.

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SRC = join(ROOT, 'public', 'videos', 'logo casatasia.png')
const OUT_192 = join(ROOT, 'public', 'icon-192.png')
const OUT_512 = join(ROOT, 'public', 'icon-512.png')

// Logo source : 1693x929 (paysage).
// Zone du monogramme "CT" : haut-centre. Crop serré sur la lettre CT en or +
// croissant émeraude + olivier à gauche. Évite "MAISON MÉDITERRANÉENNE" et les
// pictos en bas qui seraient illisibles à petite taille.
const CROP = { left: 596, top: 30, width: 500, height: 500 }

async function generate() {
  console.log('🎨 Génération des icônes CASATASIA…')
  console.log(`   source : ${SRC}`)

  const meta = await sharp(SRC).metadata()
  console.log(`   logo source : ${meta.width}×${meta.height}`)
  console.log(`   crop : ${CROP.width}×${CROP.height} @ (${CROP.left}, ${CROP.top})`)

  // Crop carré → resize 512
  const cropped = sharp(SRC).extract(CROP)

  await cropped.clone().resize(512, 512, { fit: 'cover' }).png({ quality: 90, compressionLevel: 9 }).toFile(OUT_512)
  console.log(`✅ ${OUT_512}`)

  await cropped.clone().resize(192, 192, { fit: 'cover' }).png({ quality: 90, compressionLevel: 9 }).toFile(OUT_192)
  console.log(`✅ ${OUT_192}`)

  console.log('\n🎉 Icônes générées. Redémarrer le SW (CACHE_VERSION bumpé) pour appliquer.')
}

generate().catch(e => {
  console.error('❌ Erreur :', e.message)
  process.exit(1)
})
