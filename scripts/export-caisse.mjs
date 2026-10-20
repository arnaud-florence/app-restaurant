// EXPORT DU CATALOGUE POUR UN NOUVEL ÉDITEUR DE CAISSE — 20/10/2026.
//
// Le gérant passe de Zelty à **Cash Mag**, qui doit préparer et importer nos
// produits dans la caisse qu'ils mettront en place. Ce script produit le
// classeur qu'on leur envoie : `data/export-caisse-casatasia-AAAA-MM-JJ.xlsx`.
//
// ⚠️⚠️ AUCUN PRIX D'ACHAT, AUCUN FOURNISSEUR, AUCUNE RÉFÉRENCE FOURNISSEUR n'y
// figure, et c'est délibéré. Une caisse n'en a pas besoin pour encaisser, et ce
// sont des conditions NÉGOCIÉES. Même règle que le dépôt public : ce qui a été
// négocié ne part pas chez un tiers.
//
// ⚠️ LES PRIX ET LES TAUX SONT LUS SUR LA CAISSE ACTUELLE, pas recalculés. Ils
// y sont déjà contrôlés — `verifier-carte-zelty.mjs` rend 209/209 conformes, 0
// écart. Les recalculer rouvrirait le risque d'un arrondi divergent sur le
// document qui servira de référence à l'import. Pour les 8 fiches sans
// contrepartie (toutes éteintes et obsolètes), on retombe sur la base.
//
// ⚠️ DEUX ONGLETS DE PRODUITS, PAS UN. 290 fiches dont 81 éteintes, c'est du
// bruit pour qui doit importer : « Produits » ne contient que les 209 actifs,
// et « Éteints (ne pas vendre) » garde les autres en référence avec la RAISON
// du retrait — 16 reviendront (la brasserie tourne chaque semaine sur une
// ardoise), 65 sont des retraits décidés.
//
// ⚠️ Un nom d'onglet de plus de 31 caractères fait refuser le fichier par
// certaines applications. openpyxl ne lève qu'un AVERTISSEMENT : le fichier
// part, et c'est le destinataire qui ne peut plus l'ouvrir.
//
//   node scripts/export-caisse.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const q = async c => {
  let der
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`,
        { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                     Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })
      if (r.ok) return r.json()
      der = `${r.status} ${(await r.text()).slice(0, 150)}`
      if (r.status < 500) break
    } catch (e) { der = e.cause?.code ?? e.message }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(`Supabase : ${der}`)
}
const zl = async p => {
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch('https://api.zelty.fr/2.11/' + p,
        { headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}` } })
      if (r.status === 200) return r.json()
      if (r.status === 404) return null
      console.log(`   caisse, tentative ${n} sur ${p} → HTTP ${r.status}`)
    } catch (e) { console.log(`   caisse, tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return null
}

console.log('\n📦 Export du catalogue de caisse\n')

const recettes = await q('recettes?select=id,nom,nom_caisse,categorie,prix_vente_ht,prix_sur_place_ttc,tva,contient_alcool,allergenes_complementaires,allergenes_valides_le,image_url,vendable_online,etablissement_id,tag_destination,actif,type_revenu,description&order=categorie,nom')
const ets = await q('etablissements?select=id,nom,slug')
const opts = (await zl('catalog/options'))?.options ?? []
const plats = (await zl('catalog/dishes?show_all=true&limit=0'))?.dishes ?? []
const tags = (await zl('catalog/tags'))?.tags ?? []
const fab = await zl('fabrication-places')

// Ce qu'il faut pour INSTALLER la caisse, et qui n'est pas un produit.
// ⚠️ Les clients sont lus SANS `allergies` (donnée de SANTÉ) et SANS
// `opt_in_marketing` : un consentement ne se transfère pas d'un prestataire à
// l'autre par défaut — c'est la règle du pont client, et une erreur ici ne
// produit pas un message d'erreur, elle produit une plainte CNIL.
const paiements = await zl('transaction-methods')
const tables = await q('tables_restaurant?select=numero,zone,capacite&order=zone,numero')
const clients = await q('clients?select=nom,prenom,telephone,email,total_depense,nb_visites,niveau_fidelite,points_fidelite,caisse_externe_id,notes_internes&order=total_depense.desc')
const employes = await q('employes?select=prenom,nom,poste,actif&actif=eq.true&order=prenom')

// ⚠️ une lecture de catalogue qui rend moins de 100 plats est une lecture
// RATÉE, pas un catalogue vide (règle éprouvée depuis le 28/08). Ici elle ne
// bloque pas l'export — on retombe sur la base — mais elle doit être DITE,
// sinon les prix de l'export viendraient d'ailleurs sans qu'on le sache.
if (plats.length < 100) console.log(`   ⚠ la caisse n'a rendu que ${plats.length} plats : prix et taux viendront de la BASE pour les autres`)

console.log(`   ${recettes.length} produits · ${plats.length} plats en caisse · ${opts.length} groupes d'options · ${tags.length} familles`)
const nbPaiements = (paiements?.transaction_methods ?? paiements?.data ?? []).length
console.log(`   ${nbPaiements} modes de paiement · ${tables.length} tables · ${clients.length} comptes clients · ${employes.length} employés actifs`)
fs.mkdirSync('data', { recursive: true })
fs.writeFileSync('data/export-caisse.json', JSON.stringify({ recettes, ets, opts, plats, tags, fab, paiements, tables, clients, employes }, null, 1))

console.log(execFileSync('python3', ['scripts/export-caisse-xlsx.py', 'data'], { encoding: 'utf8' }))
