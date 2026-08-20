// Découpe le logo CasaTasia dans la photo d'enseigne (public/videos/logo casatasia.png).
//
// La photo fait 1693×929 et 2,3 Mo : superbe en fond de page, inutilisable dans
// une barre latérale de 288 px. On en tire deux visuels légers :
//
//   logo-casatasia.png       le lettrage complet + « MAISON MÉDITERRANÉENNE »
//   logo-casatasia-mono.png  le monogramme CT seul, pour les emplacements carrés
//
// Rectangles en fractions de l'image, pour rester justes si la source est
// un jour réexportée à une autre définition.
import sharp from 'sharp'

const SRC = 'public/videos/logo casatasia.png'
const { width: W, height: H } = await sharp(SRC).metadata()

const decoupe = async (nom, [x0, y0, x1, y1], largeur) => {
  const left = Math.round(x0 * W), top = Math.round(y0 * H)
  await sharp(SRC)
    .extract({ left, top, width: Math.round((x1 - x0) * W), height: Math.round((y1 - y0) * H) })
    .resize({ width: largeur })
    .png({ compressionLevel: 9, palette: true })
    .toFile(`public/${nom}`)
  const { size } = await sharp(`public/${nom}`).metadata()
  console.log(`✓ ${nom.padEnd(26)} ${largeur}px  ${Math.round((size ?? 0) / 1024)} Ko`)
}

// Lettrage + baseline « MAISON MÉDITERRANÉENNE »
await decoupe('logo-casatasia.png', [0.045, 0.465, 0.955, 0.725], 720)
// Monogramme CT seul
await decoupe('logo-casatasia-mono.png', [0.325, 0.010, 0.655, 0.480], 256)
