// Renommer la Heineken BOUTEILLE — « Heineken 33 cl » → « Heineken bouteille 33 cl ».
//
// Pourquoi : depuis l'ajout de la canette (12/10/2026), deux produits
// s'appelaient « Heineken … 33 cl » sur le même écran de caisse, à 3,80 € et
// 2,50 €, et seul le mot « canette » les distinguait — sur l'un des deux
// seulement. Une hésitation d'une seconde au comptoir, répétée cent fois, finit
// en erreur de caisse. La paire devient symétrique : bouteille / canette.
//
// ⚠️ LE RENOMMAGE SE MÈNE DES DEUX CÔTÉS, LA CAISSE D'ABORD. Si elle refuse,
// rien n'a été désynchronisé. L'inverse laisserait un produit dont le nom de
// notre base ne correspond plus à ce qui s'imprime sur le ticket.
//
// ⚠️ `nom_caisse` SUIT, et c'est voulu ici : c'est NOUS qui renommons le
// produit dans la caisse, donc les prochains tickets porteront le nouveau
// libellé. Ne pas le suivre casserait le rapprochement du miroir.
//
//     node scripts/renommer-heineken-bouteille.mjs [--ecrire]

import { readFileSync } from 'node:fs'

const ANCIEN = 'Heineken 33 cl'
const NOUVEAU = 'Heineken bouteille 33 cl'
const ECRIRE = process.argv.includes('--ecrire')

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(),
             l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const CLE_Z = env.ZELTY_API_KEY

const sb = async (chemin, init = {}) => {
  const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation',
               ...(init.headers || {}) },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} ${chemin} :: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// Le helper DIT le code de retour à chaque tentative : un helper qui avale le
// statut m'a déjà fait soupçonner un plafond de débit là où c'était un 500.
const zelty = async (chemin, init = {}) => {
  let dernier = ''
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const r = await fetch(`https://api.zelty.fr/2.11/${chemin}`, {
        ...init,
        headers: { Authorization: `Bearer ${CLE_Z}`, 'Content-Type': 'application/json',
                   ...(init.headers || {}) },
      })
      const t = await r.text()
      if (r.ok) return JSON.parse(t)
      dernier = `${r.status} :: ${t.slice(0, 300)}`
      console.log(`   tentative ${essai} → HTTP ${r.status}`)
      if (r.status !== 429 && r.status < 500) break
    } catch (e) {
      dernier = `réseau :: ${e.message}`
      console.log(`   tentative ${essai} → réseau : ${e.message}`)
    }
    if (essai < 3) await new Promise(s => setTimeout(s, 2000 * essai))
  }
  throw new Error(`Zelty ${chemin} :: ${dernier}`)
}

console.log(`\n🍺 Renommage « ${ANCIEN} » → « ${NOUVEAU} »`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// ── 1. le produit chez nous ───────────────────────────────────────────
const prods = await sb(`recettes?nom=eq.${encodeURIComponent(ANCIEN)}&select=id,nom,nom_caisse,prix_vente_ht,tva,nom_matiere,actif`)
if (prods.length !== 1) throw new Error(`${prods.length} produit(s) nommé(s) « ${ANCIEN} » — on ne renomme pas à l'aveugle`)
const p = prods[0]
const ttc = Number(p.prix_vente_ht) * (1 + Number(p.tva) / 100)
console.log(`   produit ${p.id}`)
console.log(`   ${ttc.toFixed(2)} € TTC · TVA ${p.tva} % · nom_caisse « ${p.nom_caisse ?? '—'} »`)

// Le nouveau nom ne doit pas déjà exister : deux fiches homonymes rendraient
// le rapprochement des tickets ambigu pour toujours.
const collision = await sb(`recettes?nom=eq.${encodeURIComponent(NOUVEAU)}&select=id`)
if (collision.length) throw new Error(`« ${NOUVEAU} » existe déjà (${collision[0].id})`)

// ── 2. aucune vente ne doit porter l'ancien libellé ───────────────────
// Un renommage ne déplace pas l'historique : il n'y a rien à déplacer si rien
// n'a été vendu, et c'est le cas ici (ouverture ce matin).
const ventes = await sb(`commande_articles?recette_id=eq.${p.id}&select=id&limit=1`)
console.log(`   ventes enregistrées : ${ventes.length ? 'OUI — à vérifier avant de renommer' : 'aucune'}`)

// ── 3. la correspondance de caisse ────────────────────────────────────
const corr = await sb(`correspondances_catalogue?recette_id=eq.${p.id}&select=id,identifiant_externe,libelle_externe`)
if (corr.length !== 1) throw new Error(`${corr.length} correspondance(s) de caisse — attendu 1`)
const idZelty = Number(corr[0].identifiant_externe)
console.log(`   caisse Zelty #${idZelty} · « ${corr[0].libelle_externe} »`)

// ── 4. relire le catalogue caisse ─────────────────────────────────────
// ⚠️ show_all=true : sans lui, GET /catalog/dishes OMET les plats désactivés
// (192 rendus contre 242 réels le 10/10). Et moins de 100 plats = lecture
// ratée, pas catalogue vide : on n'écrit rien.
const cat = await zelty('catalog/dishes?show_all=true&limit=0')
const plats = cat.dishes ?? []
console.log(`   catalogue caisse : ${plats.length} plats`)
if (plats.length < 100) throw new Error('lecture du catalogue ratée — rien ne sera écrit')

const plat = plats.find(d => Number(d.id) === idZelty)
if (!plat) throw new Error(`plat #${idZelty} absent du catalogue caisse`)
console.log(`   caisse : « ${plat.name} » · ${(plat.price / 100).toFixed(2)} € · tax ${plat.tax}`)

// ⚠️ POST /catalog/dishes est un UPSERT qui EXIGE name, price et tax : on
// RELIT, on RECOPIE ces trois champs tels quels, on ne touche QUE le nom, et
// on REFUSE de construire s'il en manque un. Un objet incomplet écraserait le
// prix qui s'imprime sur les tickets.
if (plat.price == null || plat.tax == null)
  throw new Error('prix ou taxe manquant côté caisse — refus de construire')

const charge = { id: Number(plat.id), name: NOUVEAU, price: plat.price, tax: plat.tax }
if (plat.price_togo != null)   charge.price_togo = plat.price_togo
if (plat.tax_takeaway != null) charge.tax_takeaway = plat.tax_takeaway

if (!ECRIRE) {
  console.log(`\n   → caisse  : name « ${plat.name} » → « ${NOUVEAU} » (prix et taxes recopiés)`)
  console.log(`   → recettes: nom + nom_caisse → « ${NOUVEAU} »`)
  console.log(`   → corresp.: libelle_externe → « ${NOUVEAU} »`)
  if (p.nom_matiere === ANCIEN) console.log(`   → nom_matiere : laissé tel quel (« ${p.nom_matiere} »)`)
  console.log('\nEssai à blanc — rien écrit.\n')
  process.exit(0)
}

// ── 5. LA CAISSE D'ABORD ──────────────────────────────────────────────
// ⚠️ TABLEAU NU, jamais { dishes: [...] } : enveloppé, l'API répond 400 en
// réclamant name/price/tax_id — elle ne voit aucun plat, et le message laisse
// croire à des champs manquants alors que c'est la FORME qui est fausse.
await zelty('catalog/dishes', { method: 'POST', body: JSON.stringify([charge]) })
console.log('   ✓ caisse renommée')

// ── 6. puis notre base ────────────────────────────────────────────────
await sb(`recettes?id=eq.${p.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ nom: NOUVEAU, nom_caisse: NOUVEAU }),
})
console.log('   ✓ recettes : nom + nom_caisse')

await sb(`correspondances_catalogue?id=eq.${corr[0].id}`, {
  method: 'PATCH', body: JSON.stringify({ libelle_externe: NOUVEAU }),
})
console.log('   ✓ correspondance de caisse')

// ⚠️ nom_matiere n'est PAS touché : c'est ce qu'on COMPTE à l'inventaire, et
// la matière est le libellé France Boissons (« Heineken VC 33 cl »), pas le
// nom de vitrine. Trois champs, trois rôles (0131/0132).
console.log(`   · nom_matiere inchangé : « ${p.nom_matiere ?? '—'} »`)

console.log('\n✅ Renommé des deux côtés.\n')
