// LE PRODUIT « PLAT DU JOUR » — un seul bouton, un titre qui change.
//
// ⚠️⚠️ ON NE VEND PAS CE QUE LA CAISSE NE CONNAÎT PAS. Le plat du jour est
// hors carte (décision du gérant, 04/10/2026) : il n'a donc aucune fiche. Il
// lui faut pourtant un bouton en caisse, un prix et une ligne de ticket.
//
// ⚠️ LA RÉPONSE N'EST PAS 365 PRODUITS PAR AN. Créés à la volée, ils
// partiraient vers Zelty par l'import ET vers casatasia.fr par le menu
// public, et le catalogue serait illisible au bout d'un trimestre. UN produit
// permanent, dont `plats_du_jour.titre` (0167) porte le nom du jour.
//
//   node scripts/produit-plat-du-jour.mjs [--ecrire] [--prix=16.90]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const PRIX_TTC = Number((process.argv.find(a => a.startsWith('--prix=')) ?? '--prix=15.90').split('=')[1])
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
// ⚠️ 15,90 € est le prix du PREMIER plat de la carte (Gnocchis CasaTasia),
// pas un nombre inventé : le plat du jour ne doit ni casser l'entrée de
// gamme ni la dépasser. Moyenne des « Plat » : 17,97 € (15,90 → 19,90).
// C'est un point de départ — le gérant tranche, et ça se change en une
// ligne depuis la fiche produit.
const [deja] = await sb('recettes?nom=eq.Plat%20du%20jour&select=id,nom,prix_vente_ht,actif')
// ⚠️ TVA 10 % : c'est de la restauration sur place (src/lib/tva.ts).
const TVA = 10
const ht = Math.round((PRIX_TTC / (1 + TVA / 100)) * 10000) / 10000
const [resto] = await sb('etablissements?nom=eq.Restauration&select=id')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — le produit « Plat du jour » ──\n`)
if (deja) { console.log(`   déjà en place : ${deja.nom}, ${deja.prix_vente_ht} € HT, ${deja.actif ? 'actif' : 'INACTIF'}\n`); process.exit(0) }
console.log(`   nom            Plat du jour`)
console.log(`   prix           ${PRIX_TTC.toFixed(2)} € TTC  →  ${ht} € HT à ${TVA} %`)
console.log(`   carte          CUISINE · catégorie « Plat du jour »`)
console.log(`   en ligne       NON — son contenu change chaque jour, le site`)
console.log(`                  afficherait un plat qui n'est plus servi.`)
console.log(`   coût d'achat   AUCUN — il vient de la composition du jour`)
console.log(`                  (plat_du_jour_ingredients, 0167), pas du produit.`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const [r] = await sb('recettes', { method: 'POST', body: JSON.stringify({
  nom: 'Plat du jour',
  description: 'Le plat du jour, annoncé à l’ardoise. Son contenu change chaque jour.',
  categorie: 'Plat du jour',
  tag_destination: 'CUISINE',
  etablissement_id: resto?.id ?? null,
  prix_vente_ht: ht,
  tva: TVA,
  actif: true,
  // ⚠️ Jamais en ligne : le site publierait le plat de la veille.
  vendable_online: false,
}) })
console.log(`\n   ✓ créé — ${r.id}`)
console.log(`   ⚠️ reste à le pousser vers Zelty (node scripts/pousser-carte-zelty.mjs)`)
console.log(`      et à lui donner une photo, sans quoi il reste invisible du site.\n`)
