// DEUX PÂTONS, DEUX USAGES — 350 g pour la pizzeria, le petit pour le Fournil.
//
//   node scripts/paton-350-pizzeria.cjs [--ecrire]
//
// Décision du gérant, 05/10/2026 : les pizzas de la PIZZERIA se font sur
// un pâton de 350 g ; les pizzas rondes et le panuozzi du FOURNIL gardent
// le petit. La base n'en connaissait qu'un, et les 16 pizzas de la carte
// tournaient donc sur le pâton du Fournil.
//
// ⚠️ Ce n'est pas qu'une question de coût : une pizza de 350 g n'a pas le
// même diamètre ni le même temps de cuisson. La fiche technique servait
// autre chose que ce qui sort du four.
//
// ⚠️⚠️ LE FOURNIL N'EST PAS TOUCHÉ. Panuozzi et pizzas rondes sont liés
// au pâton par `libelle_achat` (« PATON A PIZZA »), pas par une
// composition : les basculer changerait quatre produits qui se vendent
// déjà, et dont la marge est mesurée.
//
// ⚠️ Le prix est RELU au catalogue, jamais recopié de mémoire.
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
const NOM = 'Pâton à pizza 350 g (pièce)'

;(async () => {
  console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — le pâton 350 g pour la pizzeria\n`)

  // ① Les offres de 350 g, relues au catalogue et ramenées à la PIÈCE.
  const cat = ou(await sb.from('catalogue_fournisseur')
    .select('reference, designation, prix_ht, unite, nature, colis_quantite, fournisseurs(nom)')
    .ilike('designation', '%350G%').eq('actif', true), 'catalogue')
  const offres = []
  for (const l of cat) {
    if (!/PATON|PÂTON/i.test(l.designation) || l.prix_ht == null) continue
    // ⚠️ L'UNITÉ DE LA LIGNE DÉCIDE : un prix au colis se divise par le
    // nombre de pâtons, un prix à la pièce se prend tel quel. S'y tromper
    // donne un pâton à 22 € ou à 2 centimes, et les deux sont plausibles
    // à l'œil dans un tableau.
    const n = Number((l.designation.match(/[CX]\s*=?\s*(\d{2,3})\b/i) ?? [])[1] ?? 0)
    if (!n) { console.log(`   ? colisage illisible, ignorée : ${l.designation}`); continue }
    offres.push({ f: l.fournisseurs?.nom ?? '?', ref: l.reference, nature: l.nature,
      piece: Number(l.prix_ht) / n, n, d: l.designation })
  }
  offres.sort((a, b) => a.piece - b.piece)
  if (!offres.length) { console.error('Aucune offre de pâton 350 g lisible.'); process.exit(1) }
  console.log('   offres de 350 g, au pâton :')
  for (const o of offres) console.log(`     ${o.piece.toFixed(4)} €  ${o.f.padEnd(10)} ×${o.n}  ${o.d.slice(0, 44)}`)

  // ⚠️ L'écart entre les deux est de 0,3 % : c'est du BRUIT, pas une
  // affaire. Le comparateur lui-même ignore tout écart sous 10 %. On reste
  // donc chez le fournisseur où l'on commande déjà des pâtons — même
  // camion, pas de minimum de commande à atteindre ailleurs.
  const dejaChezNous = offres.find(o => o.f === 'Gineys') ?? offres[0]
  const ecart = ((dejaChezNous.piece / offres[0].piece) - 1) * 100
  console.log(`\n   retenu : ${dejaChezNous.f} à ${dejaChezNous.piece.toFixed(4)} €/pâton` +
    (ecart > 0.01 ? `  (+${ecart.toFixed(1)} % vs ${offres[0].f} — sous le seuil de 10 %, c'est du bruit)` : ''))

  // ② La matière
  let [m] = ou(await sb.from('ingredients').select('id, nom').eq('nom', NOM).limit(1), 'matière')
  if (!m) {
    console.log(`\n   + CRÉER  ${NOM}  ${dejaChezNous.piece.toFixed(4)} €/pièce`)
    if (ECRIRE) [m] = ou(await sb.from('ingredients').insert({
      nom: NOM, unite: 'pièce', categorie: 'Pizzeria',
      prix_achat_ht: Math.round(dejaChezNous.piece * 10000) / 10000,
      // ⚠️ Prix de PORTAIL, pas de facture : il reste présumé estimé (0165).
      prix_estime: dejaChezNous.nature !== 'facture',
      stocke: true, actif: true,
      fournisseur_principal: dejaChezNous.f,
      reference_fournisseur: /^\d+$/.test(dejaChezNous.ref ?? '') ? dejaChezNous.ref : null,
    }).select('id, nom').limit(1), 'création')
    else m = { id: 'FICTIF', nom: NOM }
  } else console.log(`\n   = ${NOM} existe déjà`)

  // ③ Les 16 pizzas de la PIZZERIA
  const [petit] = ou(await sb.from('ingredients').select('id, nom, prix_achat_ht')
    .eq('nom', 'Pâton à pizza (pièce)').limit(1), 'petit pâton')
  const pizzas = ou(await sb.from('recettes').select('id, nom')
    .eq('categorie', 'Pizzeria').eq('actif', true).order('nom'), 'pizzas')
  let n = 0
  for (const p of pizzas) {
    const [l] = ou(await sb.from('recette_ingredients')
      .select('id, quantite').eq('recette_id', p.id).eq('ingredient_id', petit.id).limit(1), 'compo')
    if (!l) { console.log(`   · ${p.nom.padEnd(28)} déjà sur un autre pâton`); continue }
    const d = (dejaChezNous.piece - Number(petit.prix_achat_ht)) * Number(l.quantite)
    console.log(`   ↻ ${p.nom.padEnd(28)} ${l.quantite} pâton  +${d.toFixed(3)} € de coût`)
    n++
    if (!ECRIRE) continue
    ou(await sb.from('recette_ingredients').update({ ingredient_id: m.id })
      .eq('id', l.id).select('id'), 'bascule')
  }
  console.log(`\n   ${n} pizza(s) passée(s) au pâton de 350 g.`)
  console.log(`   Le Fournil garde le petit : ${petit.nom} à ${petit.prix_achat_ht} €.`)
  console.log('   ⚠️ Ce petit pâton vaut EXACTEMENT le colis divisé par 40 —')
  console.log('      c\'est le PATON A PIZZA 250G de Gineys, pas du 280 g. À confirmer.')
  if (!ECRIRE) console.log('\n   Rien n\'a été écrit. Relancer avec --ecrire.')
  console.log()
})()
