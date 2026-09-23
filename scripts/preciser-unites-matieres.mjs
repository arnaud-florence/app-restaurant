// Faire dire son poids à chaque unité de stock.
//
//   node scripts/preciser-unites-matieres.mjs [--ecrire]
//
// Dix matières étaient enregistrées en « barquette » ou « bouteille » tout
// court. Deux prix justes de part et d'autre, et aucune comparaison possible :
// /admin/tarifs-fournisseurs affichait « unités différentes » sur la rosette,
// le serrano, les sauces — alors que la contenance était écrite noir sur
// blanc sur nos propres factures.
//
// ⚠️ ON PRÉCISE L'UNITÉ, ON NE LA CHANGE PAS. « barquette » devient
// « barquette 500 g » : c'est toujours une barquette, elle dit son poids.
// La transformer en « kg » diviserait par cinq cents toutes les quantités
// déjà saisies ailleurs — un stock et un food cost faux, sans une erreur.
//
// ⚠️ AUCUNE CONTENANCE N'EST DEVINÉE. Chacune est relue sur la ligne de
// facture qui a alimenté la matière (« BQT=500G », « BTL=950G »). Le script
// REFUSE d'écrire si la facture ne le confirme pas : une contenance inventée
// produirait un prix au kilo faux, affiché exactement comme les autres.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

/**
 * La contenance telle que le fournisseur l'imprime sur sa ligne.
 *
 * `BQT=500G`, `BTL=950G`, `BTL=750ML`, `C=6 X 500`. On ne lit QUE ces
 * notations : un poids qui traîne ailleurs dans le libellé peut être celui
 * d'une tranche (« 29X17G ») et non celui du contenant.
 */
function contenanceFacture(description) {
  const d = description.toUpperCase()
  const m = d.match(/(?:BQT|BTL|BOT|POT|SEAU|SAC|FLACON|POCHE)\s*=\s*(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)\b/)
  if (m) {
    const v = Number(m[1].replace(',', '.'))
    switch (m[2]) {
      case 'KG': return { texte: `${v} kg`, valeur: v }
      case 'G':  return { texte: v >= 1000 ? `${v / 1000} kg` : `${v} g`, valeur: v / 1000 }
      case 'L':  return { texte: `${v} L`, valeur: v }
      case 'CL': return { texte: `${v} cl`, valeur: v / 100 }
      case 'ML': return { texte: v >= 1000 ? `${v / 1000} L` : `${v} ml`, valeur: v / 1000 }
    }
  }
  // « C=6 X 500 » : six paquets de cinq cents.
  const c = d.match(/C\s*=\s*(\d+)\s*X\s*(\d+)/)
  if (c) return { texte: String(Number(c[1]) * Number(c[2])), valeur: Number(c[1]) * Number(c[2]) }
  return null
}

const CIBLES = ['Emmental en tranches', 'Jambon cru Serrano', 'Mozzarella en tranches',
  'Rosette de Lyon', 'Sauce burger', 'Sauce kebab', 'Sauce mayonnaise', 'Sauce moutarde',
  'Serviettes', 'Vinaigrette balsamique']

const ings = await sb('ingredients?select=id,nom,unite,prix_achat_ht&stocke=eq.true&actif=eq.true')
const aTraiter = ings.filter(i => CIBLES.includes(i.nom))
const lignes = await sb(`facture_lignes?select=description,prix_unitaire_ht,ingredient_id&ingredient_id=in.(${aTraiter.map(i => i.id).join(',')})`)

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const plan = [], sansPreuve = []
for (const i of aTraiter) {
  // La ligne qui porte LE prix de la matière : c'est elle qui décrit le
  // conditionnement réellement payé. Une autre ligne (un paquet de dépannage
  // acheté une fois) décrirait autre chose.
  const candidates = lignes.filter(l => l.ingredient_id === i.id)
  const ligne = candidates.find(l => Math.abs(Number(l.prix_unitaire_ht) - Number(i.prix_achat_ht)) < 0.005)
    ?? (candidates.length === 1 ? candidates[0] : null)
  const c = ligne ? contenanceFacture(ligne.description) : null
  if (!c) { sansPreuve.push(`${i.nom} (${candidates.length} ligne(s), aucune contenance imprimée)`); continue }
  // ⚠️ On repart du NOM DU CONTENANT, jamais de l'unité complète : sinon une
  // deuxième exécution écrivait « barquette 500 g 500 g ». Un script qu'on
  // ne peut pas rejouer n'est pas un script, c'est un coup de chance.
  const base = i.unite.trim().split(/\s+/)[0]
  const unite = `${base} ${c.texte}`
  if (i.unite === unite) continue
  plan.push({ id: i.id, nom: i.nom, avant: i.unite, apres: unite,
    prix: Number(i.prix_achat_ht), ramene: Number(i.prix_achat_ht) / c.valeur, preuve: ligne.description })
}
for (const p of plan) {
  console.log(`  ${p.nom.padEnd(24)} « ${p.avant} » → « ${p.apres} »`)
  console.log(`  ${''.padEnd(24)} ${p.prix.toFixed(3)} € l'unité, soit ${p.ramene.toFixed(3)} € ramené`)
  console.log(`  ${''.padEnd(24)} preuve : ${p.preuve.slice(0, 72)}`)
}
console.log(`\n  à préciser : ${plan.length}`)
if (sansPreuve.length) {
  console.log(`  ⚠️ laissés en l'état faute de preuve sur facture :`)
  for (const s of sansPreuve) console.log(`     · ${s}`)
}

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
for (const p of plan) {
  await sb('ingredients?id=eq.' + p.id, { method: 'PATCH',
    body: JSON.stringify({ unite: p.apres, updated_at: new Date().toISOString() }) })
}
console.log(`\n  → ${plan.length} unité(s) précisée(s). Aucun prix n'a bougé.\n`)
