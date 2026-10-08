// Les photos du catalogue remplacent les images d'ambiance, sur le site et
// dans la caisse.
//
// Quatre des sept visuels des pains n'étaient pas des photos produit, et deux
// montraient le MÊME pain aux graines (Campestre et Pavé Le Jeannot). Les
// vraies photos Arti'Pat sont extraites par `photos-pains-artipat.mjs`.
//
// ⚠️ ON ÉCRASE LE FICHIER, ON NE CHANGE PAS L'URL. `image_url` est une URL
// ABSOLUE consommée en CORS par le site vitrine et par Zelty : la changer
// obligerait à repousser la carte des deux côtés, et toute URL ratée est une
// image cassée en vitrine. Même chemin, même nom, nouveau contenu.
//
// ⚠️ Corollaire déjà documenté : rien n'est visible avant DÉPLOIEMENT.
//
//   node scripts/pousser-photos-pains.mjs [--ecrire]

import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
const SRC = 'data/affiche-pains'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY

const SLUG = {
  'Baguette classique': 'baguette-classique', 'Baguette Jeannette': 'baguette-jeannette',
  'Baguette Paris': 'baguette-paris', 'Campestre multicéréales': 'campestre-multicereales',
  'Pain complet': 'pain-complet', 'Pain restaurant': 'pain-restaurant',
  'Pavé Le Jeannot': 'pave-le-jeannot',
}

const r = await fetch(`${U}/rest/v1/recettes?select=nom,image_url&actif=eq.true&categorie=eq.Pain`,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } })
const pains = await r.json()

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · photos des pains ──\n`)
let n = 0
for (const p of pains.sort((a, b) => a.nom.localeCompare(b.nom))) {
  const src = path.join(SRC, (SLUG[p.nom] ?? '') + '.jpg')
  if (!SLUG[p.nom] || !fs.existsSync(src)) { console.log(`   ⚠️ ${p.nom.padEnd(24)} pas de photo catalogue — inchangé`); continue }
  if (!p.image_url) { console.log(`   ⚠️ ${p.nom.padEnd(24)} aucune image_url en base — inchangé`); continue }
  const rel = p.image_url.replace(/^https?:\/\/[^/]+\//, '')
  const dst = path.join('public', rel)
  // ⚠️ Si le fichier visé n'existe pas, l'URL en base pointe déjà dans le
  // vide : on le SIGNALE au lieu de créer un fichier dont rien ne garantit
  // qu'il est celui que la vitrine demande.
  if (!fs.existsSync(dst)) { console.log(`   ⚠️ ${p.nom.padEnd(24)} ${rel} absent du dépôt — inchangé`); continue }
  console.log(`   ${p.nom.padEnd(24)} → ${rel}`)
  // 900×675 qualité 86 : le format des 60 photos de la grille, pour que la
  // vitrine reste régulière.
  if (ECRIRE) await sharp(src).resize(900, 675, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86 }).toFile(dst + '.tmp')
  if (ECRIRE) fs.renameSync(dst + '.tmp', dst)
  n++
}
console.log(`\n   ${n} photo(s)${ECRIRE ? ' remplacée(s) — visible après DÉPLOIEMENT' : '   (essai à blanc — relancer avec --ecrire)'}\n`)
