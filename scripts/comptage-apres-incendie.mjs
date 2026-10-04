// Comptage d'ouverture du Fournil — après l'incendie, 04/10/2026.
//
// Le gérant : « j'ai pas d'autre stock, tout a brûlé, mon premier stock est
// cette facture ». Il n'y a donc RIEN à retrouver : le point de départ est
// zéro, et la livraison du 01/10 est la première entrée.
//
// ⚠️⚠️ UN ZÉRO ÉCRIT N'EST PAS UNE LIGNE ABSENTE. Sans ce comptage, les 237
// références du Fournil restent « personne n'a compté » — et le stock
// théorique ne se calcule pas du tout, parce qu'il n'a pas de point de
// départ. Avec lui, il devient : 0 + ce que les documents font entrer. C'est
// exactement le geste posé pour le bar le 30/09.
//
// ⚠️ DATÉ DU 30/09, LA VEILLE DE LA LIVRAISON. Daté du 01/10 ou après, il
// annulerait l'entrée qu'il doit servir à mesurer : une entrée ne compte que
// si son document est POSTÉRIEUR au comptage.
//
// ⚠️ LE COMPTAGE DU 24 AOÛT EST CONSERVÉ. Il décrit un stock qui a brûlé,
// mais il a eu lieu : l'effacer réécrirait l'histoire, et la valorisation
// d'août s'appuie dessus. Le calcul retient de toute façon le PLUS RÉCENT.
//
//   node scripts/comptage-apres-incendie.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const LE = '2026-09-30'
// ⚠️ Les catégories ASSEMBLÉES ne se comptent pas : un sandwich s'assemble,
// ce sont ses matières qui sont en réserve (0133).
const ASSEMBLEES = new Set(['Formule', 'Formule petit-déjeuner', 'Sandwich', 'Panini', 'Salade'])

const prods = await sb('recettes?actif=is.true&tag_destination=eq.FOURNIL'
  + '&select=id,nom,categorie,nom_matiere,libelle_achat,cout_achat_ht,unites_par_achat&order=id')
const mats = await sb('ingredients?actif=is.true&stocke=is.true&select=id,nom,prix_achat_ht&order=id')
const deja = new Set((await sb(`inventaires?date_inventaire=eq.${LE}&select=cible_id`)).map(x => x.cible_id))

// ⚠️ Même regroupement que l'écran : le congélateur contient des pâtons, pas
// quatre noms de pizza. Représentant STABLE = premier par id.
const groupes = new Map()
for (const r of prods) {
  if (ASSEMBLEES.has(r.categorie ?? '')) continue
  const cle = (r.nom_matiere ?? '').trim() || (r.libelle_achat ?? '').trim() || r.nom
  if (groupes.has(cle)) continue
  const par = Number(r.unites_par_achat ?? 1) || 1
  groupes.set(cle, { id: r.id, nom: cle,
    cout: r.cout_achat_ht == null ? null : Math.round(Number(r.cout_achat_ht) * par * 10000) / 10000 })
}
const lignes = [
  ...[...groupes.values()],
  ...mats.map(m => ({ id: `ing:${m.id}`, nom: m.nom, cout: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht), mat: m.id })),
].filter(l => !deja.has(l.id))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — comptage d'ouverture du Fournil au ${LE} ──\n`)
console.log(`   ${prods.length} produits du Fournil → ${groupes.size} matières à compter`)
console.log(`   ${mats.length} matières premières suivies`)
console.log(`   ${lignes.length} ligne(s) à écrire à zéro (le bar en a déjà ${deja.size})`)
const sansCout = lignes.filter(l => l.cout == null)
if (sansCout.length) console.log(`   ⚠️ ${sansCout.length} sans coût connu — comptées quand même, valorisées à rien`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ⚠️ UN INSERT GROUPÉ EXIGE LES MÊMES CLÉS SUR CHAQUE LIGNE (PGRST102) :
// on écrit `null` plutôt que d'omettre. La contrainte `num_nonnulls = 1`
// reste respectée — une ligne porte SOIT un produit, SOIT une matière.
const corps = lignes.map(l => ({
  date_inventaire: LE,
  recette_id: l.mat ? null : l.id,
  ingredient_id: l.mat ?? null,
  quantite: 0,
  cout_unitaire_ht: l.cout ?? 0,
}))
for (let i = 0; i < corps.length; i += 100)
  await sb('inventaires', { method: 'POST', body: JSON.stringify(corps.slice(i, i + 100)) })
console.log(`\n   ✓ ${corps.length} lignes à zéro écrites au ${LE}`)
console.log(`   ✓ le stock se calcule désormais : 0 + les documents postérieurs\n`)
