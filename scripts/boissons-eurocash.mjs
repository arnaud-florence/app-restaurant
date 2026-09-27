// Les boissons du Fournil s'achètent chez Euro-Cash.
//
//   node scripts/boissons-eurocash.mjs [--ecrire]
//
// Décision du gérant, 28/09/2026 : « les boissons c'est Euro-Cash ». Dix
// boissons fraîches du Fournil n'avaient NI coût d'achat NI fournisseur —
// elles ne pouvaient donc entrer dans aucun bon de commande, alors qu'elles
// se vendent tous les jours.
//
// ⚠️ Cela ne concerne QUE le Fournil. Le bar reste chez France Boissons
// (jus 25 cl, Schweppes, limonade, sirops) : sa remise y est négociée et
// ses verres sont consignés. Déplacer le bar en même temps aurait envoyé
// la commande du comptoir au mauvais interlocuteur.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const api = async (chemin, init) => {
  const r = await fetch(`${U}/rest/v1/${chemin}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } })
  const corps = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${corps}`)
  return corps ? JSON.parse(corps) : null
}

// ─── Les correspondances CERTAINES ────────────────────────────────────
//
// Visées par le CODE ARTICLE Euro-Cash, jamais par le libellé : leur
// fichier recolle plusieurs produits sur une même ligne (« Pepsi Zéro Cola
// Pepsi Cola Pepsi Cherry Cola »), et un libellé ainsi mélangé ne désigne
// rien. La référence, elle, ne se trompe pas.
//
// Retenues seulement quand LA MARQUE et LE FORMAT concordent tous les deux.
const CERTAINES = [
  ['Coca-Cola 33 cl',        '53850', 'Coca Cola'],
  ['Coca-Cola Zéro 33 cl',   '53860', 'Coca Zéro'],
  ['Coca-Cola Cherry 33 cl', '53869', 'Coca Cherry'],
  ['Fanta 33 cl',            '53880', 'Fanta Orange'],
  // ⚠️ Le Perrier 33 cl est déjà chez Euro-Cash (réf. 57003, 0,50 €) — il
  // est rangé côté BAR, pas Fournil, et n'entre donc pas dans ce geste.
]

// ─── Ce qu'on ne peut PAS trancher, et pourquoi ───────────────────────
const A_CONFIRMER = [
  ['Jus d\'orange 33 cl', 'deux gammes Euro-Cash s\'en approchent et ce ne sont pas les mêmes produits : « Orange » (réf. 54078, 0,90 €) et « Orange Brésil 100 % » (réf. 52140, 0,70 €). Un nectar et un pur jus ne se remplacent pas.'],
  ['Jus de pomme 33 cl', 'même hésitation : « Pomme » (54012, 0,90 €), « Pomme » (52075, 0,65 €) et « Pomme France 100 % » (52142, 0,65 €).'],
  ['Pago orange 20 cl', 'Euro-Cash liste « Nectar Orange » mais SANS PRIX — le rayon jus n\'a pas été chiffré.'],
  ['Pago pomme 20 cl', 'idem : « Pomme Pressée 100 % » sans prix.'],
  ['Pago pomme 33 cl', 'idem.'],
  ['Red Bull 25 cl', '⚠️ LE FORMAT NE CONCORDE PAS : leur « Red Bull » est en 47,3 cl (réf. 52990, 2,25 €), le nôtre en 25 cl. Les huit lignes à 1,24 € / 25 cl (« Red Pastèque », « Sea Blue », « White Coco », « Zéro »…) sont des éditions Red Bull, mais aucune n\'est le Red Bull classique.'],
  ['Ciao 33 cl', 'aucune ligne Euro-Cash ne porte ce nom. Reste chez Promocash (1,41 €).'],
  ['Eau plate 50 cl', 'le rayon EAUX d\'Euro-Cash (53 références) est revenu SANS AUCUN PRIX.'],
  ['Eau gazeuse 50 cl', 'idem, rayon eaux non chiffré.'],
  ['Ice Tea 33 cl', '« Pêche » (réf. 53015, 0,55 €) est très probablement l\'Ice Tea pêche — la référence est voisine de « Liptonic » et d\'« Ice Tea Tropical » — mais c\'est une déduction sur un numéro, pas une certitude. Et Promocash le fait à 0,48 €.'],
  ['Oasis 33 cl', 'les lignes Oasis d\'Euro-Cash sont des libellés CONCATÉNÉS (« Pomme, Cassis Thé Pêche ») : plusieurs parfums sur une ligne, on ne sait pas lequel est chiffré.'],
  ['Orangina 33 cl', 'aucune ligne Orangina chez Euro-Cash. Reste chez Promocash (0,58 €).'],
  ['Pago orange 33 cl', 'aucun Pago chiffré chez Euro-Cash. Reste chez Promocash (1,25 €).'],
  ['Red Bull Ice', '« Mûre Givrée Vanille » (52978) est à 1,24 € pour 25 cl, à un centime de notre Red Bull Ice Edition Mûre de chez Promocash (1,23 €) — la coïncidence est frappante mais ce n\'est pas une preuve.'],
]

const fourns = await api('fournisseurs?select=id,nom')
const EC = fourns.find(f => f.nom === 'Euro-Cash')
if (!EC) throw new Error('fournisseur Euro-Cash introuvable')

const rec = await api('recettes?actif=eq.true&categorie=eq.Boisson%20fra%C3%AEche&tag_destination=eq.FOURNIL&select=id,nom,cout_achat_ht,libelle_achat,reference_fournisseur,fournisseur_id')
const cat = await api(`catalogue_fournisseur?fournisseur_id=eq.${EC.id}&select=id,reference,designation,prix_ht,recette_id,contenance_valeur,contenance_unite&limit=2000`)
const parRef = new Map(cat.map(c => [String(c.reference), c]))

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — ${rec.length} boissons fraîches du Fournil\n`)

const prix = [], designations = [], erreurs = []
for (const [nom, ref, libelle] of CERTAINES) {
  const r = rec.find(x => x.nom === nom)
  const c = parRef.get(ref)
  if (!r) { erreurs.push(`produit introuvable : ${nom}`); continue }
  if (!c) { erreurs.push(`référence Euro-Cash ${ref} introuvable (${nom})`); continue }
  // ⚠️ Garde-fou : on vérifie que la ligne visée porte bien le libellé
  // attendu. Une référence recopiée de travers écrirait le prix d'un autre
  // produit, et ça ne se verrait qu'à la livraison.
  if (c.designation.trim() !== libelle) { erreurs.push(`réf. ${ref} : attendu « ${libelle} », trouvé « ${c.designation} »`); continue }
  if (c.prix_ht === null) { erreurs.push(`réf. ${ref} (${nom}) n'a pas de prix`); continue }
  prix.push({ r, c, ref, libelle })
}

console.log(`── ${prix.length} boisson(s) rattachée(s) au tarif Euro-Cash ──\n`)
for (const p of prix) {
  const av = p.r.cout_achat_ht === null ? '—' : Number(p.r.cout_achat_ht).toFixed(3)
  console.log(`  • ${p.r.nom.padEnd(26)} ${av.padStart(7)} → ${Number(p.c.prix_ht).toFixed(3)} €   réf. ${p.ref} « ${p.libelle} »`)
}

// Toutes les autres : le FOURNISSEUR change même quand le tarif manque.
// Une boisson sans interlocuteur n'entre dans aucun bon de commande, et
// c'est ce qui la fait oublier à la commande.
const autres = rec.filter(r => !prix.some(p => p.r.id === r.id) && r.fournisseur_id !== EC.id)
console.log(`\n── ${autres.length} boisson(s) : fournisseur désigné Euro-Cash, tarif à confirmer ──\n`)
for (const r of autres) {
  const motif = A_CONFIRMER.find(([n]) => n === r.nom)?.[1] ?? 'pas de correspondance relevée'
  const cout = r.cout_achat_ht === null ? 'aucun coût connu' : `coût ${Number(r.cout_achat_ht).toFixed(3)} € — ⚠️ venu d'un AUTRE fournisseur, à confirmer à la première facture Euro-Cash`
  console.log(`  · ${r.nom.padEnd(26)} ${cout}\n      ${motif}`)
}

if (erreurs.length) { console.log(`\n⚠️ ${erreurs.length} problème(s) :`); erreurs.forEach(e => console.log('  ·', e)) }

console.log(`\n⚠️ LE VRAI FREIN : Euro-Cash n'a chiffré que 3 rayons sur 21. Les`)
console.log(`   EAUX (53 réf.), les JUS (67) et les PET/verres perdus (86) sont`)
console.log(`   revenus VIDES — c'est exactement là que vivent les boissons qu'on`)
console.log(`   ne peut pas rattacher. Une relance chez eux règle la moitié de`)
console.log(`   cette liste d'un coup.`)

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(erreurs.length ? 1 : 0) }
if (erreurs.length) { console.error('\n⛔ Rien écrit : une référence fausse est pire qu\'une référence absente.'); process.exit(1) }

for (const p of prix) {
  await api(`recettes?id=eq.${p.r.id}`, { method: 'PATCH', body: JSON.stringify({
    cout_achat_ht: Number(p.c.prix_ht), fournisseur_id: EC.id,
    reference_fournisseur: p.ref, libelle_achat: p.r.libelle_achat ?? p.libelle }) })
  // ⚠️ Sans `recette_id` sur la ligne de catalogue, l'offre reste invisible
  // de `/admin/achats` et du réassort : c'est par la CIBLE qu'on les cherche.
  if (!p.c.recette_id) await api(`catalogue_fournisseur?id=eq.${p.c.id}`, { method: 'PATCH', body: JSON.stringify({ recette_id: p.r.id }) })
}
for (const r of autres) await api(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ fournisseur_id: EC.id }) })
console.log(`\n✅ ${prix.length} tarif(s) posé(s), ${autres.length} fournisseur(s) désigné(s).`)
