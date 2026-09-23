// Tarifs fournisseurs : ce que l'écran REFUSE de faire compte plus que ce
// qu'il affiche. Un classement faux se lit comme un classement juste.
//
//   PORT=3000 node scripts/test-tarifs-fournisseurs.mjs
//
// ⚠️ Ce fichier RECOPIE les règles de `src/lib/tarifs-fournisseurs.ts`
// (la source est en TS). Modifier les deux ensemble.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

let ok = 0, ko = 0
const T = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ' — ' + detail : ''}`) }
}

// ─── Règles recopiées ────────────────────────────────────────────
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const CONTENANTS = new Set(['BA', 'SA', 'BT', 'SO', 'CO', 'PO', 'CT', 'BQ'])
const conv = (v, u) => u === 'KG' ? { valeur: v, unite: 'kg' }
  : u === 'G' ? { valeur: v / 1000, unite: 'kg' }
  : u === 'L' ? { valeur: v, unite: 'L' }
  : u === 'CL' ? { valeur: v / 100, unite: 'L' }
  : u === 'ML' ? { valeur: v / 1000, unite: 'L' } : null

function extraireContenance(designation, unite) {
  const d = norm(designation)
  const contenant = unite ? CONTENANTS.has(unite.toUpperCase()) : false
  const mult = d.match(/(\d+(?:[.,]\d+)?)\s*(G|KG|ML|CL|L)\s*X\s*\d+/)
  if (mult) { if (contenant) return null; return conv(Number(mult[1].replace(',', '.')), mult[2]) }
  const trouves = []
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)(?![A-Z])/g)) {
    const c = conv(Number(m[1].replace(',', '.')), m[2]); if (c) trouves.push(c)
  }
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+)K(\d*)(?![A-Z0-9])/g))
    trouves.push({ valeur: Number(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0), unite: 'kg' })
  if (!trouves.length) return null
  return new Set(trouves.map(t => `${t.valeur}${t.unite}`)).size > 1 ? null : trouves[0]
}
const formatConserve = d => norm(d).match(/(?<![\d/])(\d{1,2}\/\d{1,2})(?![\d/])/)?.[1] ?? null

console.log('\n═══ Tarifs fournisseurs ═══\n')
console.log('── Lecture d’un format, ou silence ──')

// Le cas qui a vraiment produit un faux chiffre : un sachet de 9 pains de
// 90 g, dont le prix est celui du SACHET. Lu comme une pièce de 90 g, il
// donnait 64 €/kg pour du pain à burger.
T('sachet de 9 × 90 g : ambigu, donc rien',
  extraireContenance('PAIN BURGER BRIOCHE 90GX9 MAISON BUNS', 'SA') === null)
T('pièce de 110 g dans un colis de 40 : 0,110 kg',
  extraireContenance('FEUILLETE COMTE 110GX40', 'PI')?.valeur === 0.11)
T('deux poids contradictoires : rien',
  extraireContenance('RACLETTE 26% TR 22G 400G CDF', 'BA') === null)
T('barquette de 500 g sans multiplicateur : 0,5 kg',
  extraireContenance('ROSETTE S/AT 50TR 500G T&T', 'BA')?.valeur === 0.5)
T('notation du grossiste 1K033 = 1,033 kg',
  extraireContenance('CHEDDAR FONDU 26% 12.3GX84TR 8X8 1K033', 'KG') === null
  || extraireContenance('CHEDDAR FONDU 1K033', 'KG')?.valeur === 1.033)
T('2,5 L lus en litres',
  extraireContenance('V 2.5L SORBET ANANAS G CELESTINE', 'PI')?.unite === 'L')
T('un format de conserve est reconnu', formatConserve('SAUCE PIZZA AROMATISEE 5/1 SFF') === '5/1')
T('… et n’est pas confondu avec un poids',
  extraireContenance('CAPRE FINE VINAIGRE 4/4 VITAL', 'BT') === null)

console.log('\n── Le devis lu en base ──')
const [f] = await sb('fournisseurs?select=id,nom,email&nom=eq.' + encodeURIComponent('Félix Potin Provence'))
T('le fournisseur existe', Boolean(f))
if (f) {
  const tarifs = await sb(`catalogue_fournisseur?select=id,reference,designation,unite,prix_ht,colis_quantite,cle_comparaison,ingredient_id,date_tarif&fournisseur_id=eq.${f.id}`)
  T('184 tarifs importés', tarifs.length === 184, `${tarifs.length}`)
  T('toutes les lignes ont une référence', tarifs.every(t => t.reference))
  T('tous les prix sont strictement positifs', tarifs.every(t => Number(t.prix_ht) > 0))
  T('toutes les lignes portent la date du devis', tarifs.every(t => t.date_tarif === '2026-09-28'))

  const lies = tarifs.filter(t => t.ingredient_id)
  T('des rapprochements sont posés', lies.length >= 15, `${lies.length}`)
  T('un rapprochement porte toujours une clé', lies.every(t => t.cle_comparaison))

  // ⚠️ La règle qui protège le food cost : un devis ne devient jamais un
  // prix payé. Si elle saute, toutes les marges bougent sans qu'une seule
  // facture soit arrivée.
  const ids = [...new Set(lies.map(t => t.ingredient_id))]
  const ings = await sb(`ingredients?select=id,nom,prix_achat_ht&id=in.(${ids.join(',')})`)
  const colle = ings.filter(i => lies.some(t => Math.abs(Number(t.prix_ht) - Number(i.prix_achat_ht)) < 0.0001))
  T('aucun prix d’achat n’a pris la valeur d’un tarif', colle.length === 0,
    colle.map(i => i.nom).join(', '))

  // La coppa n'est pas du jambon serrano, les herbes de Provence ne sont pas
  // de l'origan : écartés à la main, ils doivent le rester.
  const coppa = tarifs.find(t => t.reference === '115748')
  T('la coppa n’est pas rapprochée au serrano', !coppa?.ingredient_id)
  const herbes = tarifs.find(t => t.reference === '180396')
  T('les herbes de Provence ne sont pas rapprochées à l’origan', !herbes?.ingredient_id)

  // Le jambon en pièce entière ne doit pas être présenté comme du tranché.
  const piece = tarifs.find(t => t.reference === '63273')  // JAMBON CUIT SUP AC 8K
  T('le jambon en pièce entière reste non rapproché', !piece?.ingredient_id)
}

if (PORT) {
  // ⚠️ On ne vérifie PAS le contenu de la page : depuis le module 28 le
  // middleware renvoie un 307 vers /login, et c'est ce qu'on veut. Cet écran
  // expose des CONDITIONS NÉGOCIÉES — des remises obtenues fournisseur par
  // fournisseur. Les laisser répondre à un appel anonyme serait les publier.
  // Même correction que `test-rh.mjs`, pour la même raison.
  console.log('\n── L’écran est fermé aux appels anonymes ──')
  const r = await fetch(`http://localhost:${PORT}/admin/tarifs-fournisseurs`, { redirect: 'manual' })
  T('un appel non authentifié est redirigé', r.status === 307 || r.status === 302, `HTTP ${r.status}`)
  T('… vers la page de connexion', (r.headers.get('location') ?? '').includes('/login'))
  const suivi = await fetch(`http://localhost:${PORT}/admin/tarifs-fournisseurs`)
  const html = await suivi.text()
  T('aucun tarif ne fuit dans la réponse', !html.includes('Félix Potin'))
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
