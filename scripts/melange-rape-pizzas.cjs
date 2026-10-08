// LE MÉLANGE RÂPÉ MOZZARELLA/EMMENTAL SUR LES 13 PIZZAS SALÉES.
//
//   node scripts/melange-rape-pizzas.cjs [--ecrire]
//
// Décision du gérant, 05/10/2026 : les pizzas passent au mélange râpé
// plutôt qu'aux deux fromages séparés.
//
// ⚠️ Le gain en euros est MODESTE et il faut le dire :
// mélange contre 0,10 kg de mozzarella (6,17) + 0,03 kg d'emmental
// (5,599) par pizza, soit 0,769 € contre 0,785 € — 2 %, environ 4,50 €
// par semaine sur 280 pizzas. Le vrai gain est ailleurs : UNE référence
// au lieu de deux à commander, à stocker et à compter.
//
// ⚠️ ON NE TOUCHE QUE LES PIZZAS. Les deux fromages servent aussi deux
// gnocchis et deux paninis : un panini jambon-fromage veut de l'emmental,
// pas un mélange à pizza. Les y basculer changerait le produit servi.
//
// ⚠️ Le grammage total est CONSERVÉ : 0,10 + 0,03 = 0,13 kg de mélange
// (0,08 + 0,03 = 0,11 pour la Signature, qui en porte moins). On change
// de produit, pas de recette.
//
// ⚠️ L'affiche annonce « mozzarella » ET « emmental » — et elle reste
// vraie : le mélange est 60 % mozzarella, 40 % emmental. Rien à corriger
// côté carte ni côté allergènes (les deux sont du LAIT).
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

// ⚠️⚠️ NE JAMAIS FAIRE PASSER UN SCRIPT D'ÉCRITURE DANS `head`. Quand
// `head` ferme le tube, node reçoit SIGPIPE et MEURT EN PLEIN MILIEU de la
// boucle. Vécu le 05/10/2026 sur ce script même : `… --ecrire | head -5` a
// tué le processus entre le `delete` et l'`insert` de la deuxième pizza —
// L'Issole s'est retrouvée SANS AUCUN FROMAGE, et le code de retour lu
// était celui de `head`, donc 0. Une écriture à moitié faite qui se
// présente comme une réussite.
//
// Le script est donc rejouable (il ignore ce qui est déjà basculé), mais
// la vraie règle est en amont : on lit la sortie en entier, ou on la
// redirige vers un fichier.
process.stdout.on('error', e => {
  if (e.code === 'EPIPE') { console.error('\n⚠️ sortie coupée (EPIPE) — ne pas piper un script d\'écriture.'); process.exit(2) }
})
const ou = (r, q) => { if (r.error) { console.error(`ÉCHEC ${q} : ${r.error.message}`); process.exit(1) } return r.data ?? [] }

const NOM = 'Mélange râpé mozzarella 60 % / emmental 40 %'

;(async () => {
  console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — le mélange râpé sur les pizzas\n`)

  // ① L'offre, telle qu'elle est au catalogue — on ne recopie pas un prix
  //    de mémoire, on le relit.
  const [offre] = ou(await sb.from('catalogue_fournisseur')
    .select('reference, designation, prix_ht, unite, nature, fournisseurs(nom)')
    .ilike('designation', '%RAPE MOZZARELLA 60% EMMENTAL 40%').eq('actif', true).limit(1), 'catalogue')
  if (!offre) { console.error('Offre introuvable au catalogue.'); process.exit(1) }
  const prix = Number(offre.prix_ht)
  console.log(`   offre : ${offre.fournisseurs?.nom} · ${prix} €/${offre.unite} · réf. ${offre.reference} · ${offre.nature}`)

  // ② La matière
  let [m] = ou(await sb.from('ingredients').select('id, nom').eq('nom', NOM).limit(1), 'matière')
  if (!m) {
    console.log(`   + CRÉER  ${NOM}  ${prix} €/kg`)
    if (ECRIRE) {
      [m] = ou(await sb.from('ingredients').insert({
        nom: NOM, unite: 'kg', categorie: 'Crémerie',
        prix_achat_ht: prix,
        // ⚠️ Le prix vient d'un DEVIS, pas d'une facture : il reste
        // présumé ESTIMÉ (0165) jusqu'à la première facture Félix Potin.
        prix_estime: offre.nature !== 'facture',
        stocke: true, actif: true,
        fournisseur_principal: offre.fournisseurs?.nom ?? null,
        reference_fournisseur: offre.reference || null,
      }).select('id, nom').limit(1), 'création')
    } else m = { id: 'FICTIF', nom: NOM }
  } else console.log(`   = ${NOM} existe déjà`)

  // ③ Les 13 pizzas salées — celles qui portent les DEUX fromages.
  const mozza = ou(await sb.from('ingredients').select('id').eq('nom', 'Mozzarella râpée').limit(1), 'mozza')[0]
  const emm = ou(await sb.from('ingredients').select('id').eq('nom', 'Emmental râpé').limit(1), 'emmental')[0]
  const pizzas = ou(await sb.from('recettes').select('id, nom').eq('categorie', 'Pizzeria').eq('actif', true).order('nom'), 'pizzas')

  let touchees = 0
  for (const p of pizzas) {
    const compo = ou(await sb.from('recette_ingredients')
      .select('id, ingredient_id, quantite').eq('recette_id', p.id), 'compo')
    const lm = compo.find(c => c.ingredient_id === mozza?.id)
    const le = compo.find(c => c.ingredient_id === emm?.id)
    // ⚠️ Il faut les DEUX : une pizza qui n'a que l'un des deux n'est pas
    // un cas prévu, et la basculer changerait sa recette en silence.
    if (!lm || !le) { console.log(`   · ${p.nom.padEnd(28)} ignorée (pas les deux fromages)`); continue }
    const total = Math.round((Number(lm.quantite) + Number(le.quantite)) * 1000) / 1000
    const avant = Number(lm.quantite) * 6.17 + Number(le.quantite) * 5.599
    const apres = total * prix
    console.log(`   ↻ ${p.nom.padEnd(28)} ${lm.quantite} + ${le.quantite} → ${total} kg   ` +
      `${avant.toFixed(3)} € → ${apres.toFixed(3)} €  (${((apres / avant - 1) * 100).toFixed(1)} %)`)
    touchees++
    if (!ECRIRE) continue
    ou(await sb.from('recette_ingredients').delete().in('id', [lm.id, le.id]).select('id'), 'purge')
    ou(await sb.from('recette_ingredients').insert({
      recette_id: p.id, ingredient_id: m.id, quantite: total, unite: 'kg',
    }).select('id'), 'insert')
  }

  console.log(`\n   ${touchees} pizza(s) basculée(s) sur le mélange.`)
  console.log('   ⚠️ Mozzarella râpée et Emmental râpé RESTENT en base : ils servent')
  console.log('      encore 2 gnocchis et 2 paninis. On ne les désactive pas.')
  if (!ECRIRE) console.log('\n   Rien n\'a été écrit. Relancer avec --ecrire.')
  console.log()
})()
