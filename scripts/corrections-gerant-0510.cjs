// LES CORRECTIONS DU GÉRANT — 05/10/2026.
//
//   node scripts/corrections-gerant-0510.cjs [--ecrire]
//
// Essai à blanc par défaut. Chaque correction porte sa raison : dans six
// mois on ne saura plus si une ligne absente est un oubli ou une décision.
//
// ⚠️ AUCUN PRIX N'EST INVENTÉ. Terre d'Azur n'a pas encore envoyé son
// tarif (rendez-vous du 28/09) : les matières qu'on lui rattache gardent
// leur prix ESTIMÉ et le drapeau `prix_estime` (0165). Leur attribuer un
// prix de maraîcher au jugé ferait passer une hypothèse pour un relevé.
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
const maj = async (table, id, champs, quoi) => {
  if (!ECRIRE) return
  ou(await sb.from(table).update(champs).eq('id', id).select('id'), quoi)
}

// ⚠️ Le frais, c'est Terre d'Azur — décision du gérant. Ce sont EXACTEMENT
// les matières qu'il a nommées : on n'étend pas la liste par analogie, un
// fournisseur attribué à tort envoie un bon à la mauvaise adresse.
const TERRE_AZUR = [
  'Roquette (kg)', 'Banane (pièce)', 'Aneth frais (botte)', 'Citron (pièce)',
  'Pommes grenailles (kg)', 'Tomates (kg)', 'Poireaux (kg)', 'Échalotes (kg)',
  'Persil frais (botte)', 'Concombre (kg)',
]
// Renommages : le nom doit dire le PRODUIT RÉEL qu'on achète, sinon la
// commande part sur autre chose que ce qu'on reçoit.
const RENOMMER = [
  ['Pâte à tartiner chocolat-noisette', 'Nutella (kg)', null,
   'le gérant achète du Nutella, pas une pâte à tartiner générique'],
  ['Suprême de poulet (pièce)', 'Blanc de poulet (pièce)', null,
   'c\'est du blanc de poulet'],
  ['Champignons émincés (kg)', 'Champignons de Paris frais (kg)', 'Pomona TerreAzur',
   'champignons de Paris FRAIS chez Terre d\'Azur — il faudra les émincer'],
  ['Pommes de terre en rondelles (kg)', 'Pommes de terre (kg)', 'Pomona TerreAzur',
   'pommes de terre ENTIÈRES chez Terre d\'Azur — il faudra les trancher'],
]

;(async () => {
  console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — corrections du 05/10/2026\n`)
  const ings = ou(await sb.from('ingredients').select('id, nom, unite, prix_achat_ht, fournisseur_principal').eq('actif', true), 'ingredients')
  const parNom = new Map(ings.map(i => [i.nom, i]))

  console.log('① LE FRAIS PASSE CHEZ TERRE D\'AZUR')
  for (const n of TERRE_AZUR) {
    const m = parNom.get(n)
    if (!m) { console.log(`   ⚠️ introuvable : ${n}`); continue }
    console.log(`   ↻ ${n.padEnd(30)} ${(m.fournisseur_principal ?? '⛔ aucun').slice(0, 24).padEnd(25)} → Pomona TerreAzur`)
    await maj('ingredients', m.id, { fournisseur_principal: 'Pomona TerreAzur' }, n)
  }

  console.log('\n② CE QUI CHANGE DE NOM — le nom doit dire le produit réel')
  for (const [avant, apres, four, pourquoi] of RENOMMER) {
    const m = parNom.get(avant)
    if (!m) { console.log(`   ⚠️ introuvable : ${avant}`); continue }
    console.log(`   ↻ ${avant.padEnd(34)} → ${apres}`)
    console.log(`        ${pourquoi}${four ? `  ·  fournisseur : ${four}` : ''}`)
    await maj('ingredients', m.id, four ? { nom: apres, fournisseur_principal: four } : { nom: apres }, avant)
  }

  console.log('\n③ LE PAIN DES PANINIS — la moitié d\'un pain restaurant')
  // ⚠️ « Pain restaurant » est un PRODUIT VENDU (PAIN PRECUIT 58CM 450G
  // ARTIPAT C=20). Les paninis en prennent la MOITIÉ, ce qui revient
  // sensiblement moins cher que le pain panini dédié.
  //
  // ⚠️ Il faut une MATIÈRE en face, parce qu'une composition vise un
  // `ingredient_id`. Elle coexistera avec le produit vendu, et c'est
  // normal : on achète du pain pour le vendre ET pour les paninis. Les
  // deux lignes de commande s'ADDITIONNENT, elles ne se doublonnent pas —
  // mais il faut le savoir en lisant le bon.
  const [prod] = ou(await sb.from('recettes').select('cout_achat_ht, libelle_achat')
    .eq('nom', 'Pain restaurant').eq('actif', true).limit(1), 'pain restaurant')
  if (!prod) { console.error('   ⚠️ « Pain restaurant » introuvable — rien n\'est changé.'); }
  else {
    const prix = Number(prod.cout_achat_ht)
    let m = parNom.get('Pain restaurant (pièce)')
    if (!m) {
      console.log(`   + CRÉER  Pain restaurant (pièce)  ${prix} €/pièce  « ${prod.libelle_achat} »`)
      if (ECRIRE) [m] = ou(await sb.from('ingredients').insert({
        nom: 'Pain restaurant (pièce)', unite: 'pièce', categorie: 'Boulangerie',
        prix_achat_ht: prix, prix_estime: false, stocke: true, actif: true,
        fournisseur_principal: 'Gineys', libelle_achat: prod.libelle_achat,
      }).select('id, nom').limit(1), 'création pain')
      else m = { id: 'FICTIF' }
    }
    const panini = parNom.get('Pain panini (pièce)')
    if (panini) {
      const lignes = ou(await sb.from('recette_ingredients')
        .select('id, quantite, recettes(nom)').eq('ingredient_id', panini.id), 'compo panini')
      for (const l of lignes) {
        console.log(`   ↻ ${(l.recettes?.nom ?? '?').padEnd(28)} pain panini ${l.quantite} → pain restaurant 0,5` +
          `   ${(0.566 * Number(l.quantite)).toFixed(3)} € → ${(prix * 0.5).toFixed(3)} €`)
        await maj('recette_ingredients', l.id, { ingredient_id: m.id, quantite: 0.5, unite: 'pièce' }, 'bascule pain')
      }
      // ⚠️ On DÉSACTIVE, on ne supprime pas : l'historique de prix et les
      // éventuelles lignes de facture doivent survivre (doctrine du projet).
      console.log('   ⊗ Pain panini (pièce) → désactivé (on ne supprime jamais)')
      await maj('ingredients', panini.id, { actif: false, stocke: false }, 'désactivation pain panini')
    }
  }

  console.log('\n④ LE SNACKING PASSE AU MÊME MÉLANGE RÂPÉ QUE LES PIZZAS')
  const melange = parNom.get('Mélange râpé mozzarella 60 % / emmental 40 %')
  if (!melange) console.error('   ⚠️ mélange introuvable')
  else {
    for (const n of ['Emmental râpé', 'Mozzarella râpée']) {
      const m = parNom.get(n); if (!m) continue
      const lignes = ou(await sb.from('recette_ingredients')
        .select('id, quantite, recettes(nom, categorie)').eq('ingredient_id', m.id), 'compo')
      for (const l of lignes) {
        const cat = l.recettes?.categorie
        // ⚠️ SEULEMENT le snacking du Fournil. Les gnocchis de la
        // restauration gardent leur mozzarella : ce n'est pas une pizza,
        // et le mélange y apporterait de l'emmental non voulu.
        if (!['Panini', 'Sandwich', 'Salade'].includes(cat)) {
          console.log(`   · ${(l.recettes?.nom ?? '?').padEnd(28)} gardé (${cat})`); continue
        }
        console.log(`   ↻ ${(l.recettes?.nom ?? '?').padEnd(28)} ${n} ${l.quantite} → mélange ${l.quantite}`)
        await maj('recette_ingredients', l.id, { ingredient_id: melange.id, unite: 'kg' }, 'bascule snacking')
      }
    }
  }

  if (!ECRIRE) console.log('\n   Rien n\'a été écrit. Relancer avec --ecrire.')
  console.log()
})()
