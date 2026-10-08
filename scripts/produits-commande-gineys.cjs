// LES PRODUITS DE LA COMMANDE GINEYS QUI N'EXISTAIENT PAS À LA CARTE.
//
//   node scripts/produits-commande-gineys.cjs [--ecrire]
//
// Essai à blanc par défaut.
//
// ⚠️ Quatre lignes de la commande du 05/10 n'avaient AUCUN produit en face :
// elles seraient livrées sans que personne puisse les encaisser — pas de
// fiche, pas de prix, pas de bouton en caisse.
//
// ⚠️⚠️ LES PRIX DE VENTE SONT PROPOSÉS, PAS DÉCIDÉS. Ils sont calés sur le
// food cost OBSERVÉ de la carte du Fournil, famille par famille : ~40 % sur
// le pain (baguette Victoire 44 %, Campestre 43 %, pain complet 39 %),
// ~30 % sur la gourmandise (cannelé 30 %, donuts 27 %). Ce n'est pas une
// mesure, c'est une cohérence — le gérant tranche.
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(2) })
const fs = require('node:fs')
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })
const ECRIRE = process.argv.includes('--ecrire')
const ou = (r, q) => { if (r.error) { console.error(`ÉCHEC ${q} : ${r.error.message}`); process.exit(1) } return r.data ?? [] }
const TVA = 5.5

// [nom, catégorie, coût/pièce, TTC proposé, libellé d'achat Gineys, réf, note]
const NOUVEAUX = [
  ['Baguette Jeannette', 'Pain', 0.8896, 2.10,
   'BAGUETTE LA JEANNETTE PRECUITE 40CM 270G ARTIPAT C=25', '0071149',
   '270 g sur sole — calé juste au-dessus de la Campestre'],
  ['Pain Paris', 'Pain', 1.1295, 3.00,
   'PAIN PARIS PRECUIT 50CM 280G ARTIPAT C=20', '0071012',
   'calé sur le pain complet'],
  ['Mini beignet chocolat', 'Gourmandise', 0.4715, 1.70,
   'MINI BEIGNET CHOCOLAT NOISETTE 25G ARTIPAT C=175', '0073328',
   '⚠️ réf à confirmer : Gineys a aussi un mini beignet fourré chocolat'],
  ['Mini beignet nature', 'Gourmandise', 0.3349, 1.20,
   'BEIGNET NATURE 60G C=40', '0073370',
   '⚠️ aucun « MINI beignet NATURE » à notre extrait du catalogue — c’est le 60 g'],
]

;(async () => {
  console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — les produits manquants de la commande Gineys\n`)
  const [etab] = ou(await sb.from('etablissements').select('id, nom').ilike('nom', '%fournil%').limit(1), 'etab')
  const [four] = ou(await sb.from('fournisseurs').select('id').eq('nom', 'Gineys (Nicolas)').limit(1), 'fournisseur')

  // ① Le pavé : c'est LE JEANNOT nature, pas le céréale.
  // ⚠️ Notre coût actuel correspond en fait au PAVE CÉRÉALE :
  // la fiche décrivait donc l'autre pain. Le nom suit, sinon la carte
  // annonce « multicéréales » un pain qui ne l'est pas — et c'est ce que
  // le client lit.
  const [pave] = ou(await sb.from('recettes').select('id, nom, cout_achat_ht, prix_vente_ht, tva')
    .eq('nom', 'Pavé multicéréales').eq('actif', true).limit(1), 'pave')
  if (pave) {
    const ttc = Number(pave.prix_vente_ht) * (1 + Number(pave.tva) / 100)
    console.log('① LE PAVÉ')
    console.log(`   ↻ Pavé multicéréales → Pavé Le Jeannot`)
    console.log(`     coût ${pave.cout_achat_ht} → 1,9919 €  ·  prix inchangé ${ttc.toFixed(2)} € TTC  ·  food cost ${((1.9919 / Number(pave.prix_vente_ht)) * 100).toFixed(0)} %`)
    console.log(`     ⚠️ le nom change parce que le PAIN change : notre coût correspondait`)
    console.log(`        au PAVE CÉRÉALE (1,8213 €), pas au Jeannot nature.`)
    if (ECRIRE) ou(await sb.from('recettes').update({
      nom: 'Pavé Le Jeannot', cout_achat_ht: 1.9919,
      libelle_achat: 'PAVE LE JEANNOT PRECUIT SUR SOLE 450G ARTIPAT C=16',
      reference_fournisseur: '0071374', fournisseur_id: four?.id ?? null,
    }).eq('id', pave.id).select('id'), 'maj pavé')
  }

  console.log('\n② LES QUATRE PRODUITS À CRÉER')
  for (const [nom, cat, cout, ttc, libelle, ref, note] of NOUVEAUX) {
    const [deja] = ou(await sb.from('recettes').select('id').eq('nom', nom).limit(1), 'doublon')
    if (deja) { console.log(`   = ${nom} existe déjà`); continue }
    const ht = Math.round((ttc / (1 + TVA / 100)) * 10000) / 10000
    console.log(`   + ${nom.padEnd(24)} ${cat.padEnd(12)} coût ${cout.toFixed(4)} → ${ttc.toFixed(2)} € TTC  food cost ${((cout / ht) * 100).toFixed(0)} %`)
    console.log(`       ${note}`)
    if (!ECRIRE) continue
    ou(await sb.from('recettes').insert({
      nom, categorie: cat, prix_vente_ht: ht, tva: TVA,
      cout_achat_ht: cout,
      // ⚠️ Prix de PORTAIL, pas de facture : la première facture Gineys le
      // confirmera par la propagation (0142).
      libelle_achat: libelle, reference_fournisseur: ref,
      // ⚠️ LES QUATRE CHAMPS QUI CASSENT EN SILENCE quand ils manquent :
      // sans établissement les ventes sortent de la ventilation ; sans
      // famille le produit n'a pas de bouton en caisse ; sans
      // `vendable_online` il reste hors click & collect ; sans image il est
      // invisible du site (le menu public exige famille ET photo).
      etablissement_id: etab?.id ?? null,
      fournisseur_id: four?.id ?? null,
      tag_destination: 'FOURNIL',
      vendable_online: true,
      actif: true,
    }).select('id'), 'création')
  }

  console.log('\n   ⚠️ AUCUNE PHOTO : les quatre produits restent invisibles du site tant')
  console.log('      qu\'ils n\'en ont pas. Lancer `node scripts/generer-visuels-sans-photo.mjs')
  console.log('      --ecrire` pour poser une plaque d\'attente, puis déployer.')
  console.log('   ⚠️ Et ils ne seront sur la CAISSE qu\'après un passage de')
  console.log('      `/api/cron/caisse/zelty/import` — sans quoi pas de bouton au comptoir.')
  if (!ECRIRE) console.log('\n   Rien écrit. --ecrire pour appliquer.')
  console.log()
})()
