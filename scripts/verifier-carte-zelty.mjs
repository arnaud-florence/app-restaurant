// Contrôle : ce que Zelty détient est-il conforme à notre carte ?
//
// La chaîne complète est affiches → notre base → Zelty. Le premier maillon est
// vérifié par test-carte-fournil.mjs ; celui-ci vérifie le second, sur le vrai
// compte. Lecture seule : rien n'est écrit, ni chez eux ni chez nous.
//
//   node scripts/verifier-carte-zelty.mjs
import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const eur = n => `${Number(n).toFixed(2).replace('.', ',')} €`

// ── Ce que Zelty détient ────────────────────────────────────────────
const rz = await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}` } })
const plats = (await rz.json()).dishes ?? []

// ⚠️ LES FAMILLES SE CONTRÔLENT CÔTÉ CAISSE, PAS DANS NOTRE BASE.
// Un produit dont la `categorie` est renseignée chez nous peut n'être
// rattaché à AUCUN tag Zelty : l'import CRÉE les plats et les laisse à
// plat. Le plat existe, il est actif, son prix est juste — et il n'a
// aucun bouton au comptoir. Vécu le 06/10/2026 sur la Baguette Jeannette
// et la Baguette Paris : ce contrôle était au vert pendant que le gérant
// ne les trouvait pas sur son iPad.
const rt = await fetch('https://api.zelty.fr/2.11/catalog/tags?limit=0',
  { headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}` } })
const nomDuTag = new Map(((await rt.json()).tags ?? []).map(t => [String(t.id), t.name]))
const famillesCaisse = p => (p.tags ?? [])
  .map(t => nomDuTag.get(String(typeof t === 'object' ? t?.id : t)))
  .filter(Boolean)

// ── Ce que notre base détient ───────────────────────────────────────
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async p => (await fetch(`${U}/rest/v1/${p}`,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json()
const nous = await sb('recettes?select=id,nom,nom_caisse,categorie,prix_vente_ht,prix_sur_place_ttc,tva,contient_alcool,image_url,actif,tag_destination&actif=eq.true')

// La TVA sur place suit la LOI, pas le panneau : un croissant mangé à table
// est à 10 %, pas à 5,5 %. L'alcool reste à 20 %, la presse à 2,1 %.
const tvaSurPlace = r => r.contient_alcool ? 20 : (Number(r.tva) === 2.1 ? 2.1 : 10)
const ttc = r => Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100)

const parId = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))
let ok = 0; const pbs = []
const ecartsVitrine = []
const dire = (r, quoi, attendu, recu) =>
  pbs.push(`${r.nom.padEnd(34).slice(0, 34)} ${quoi} — attendu ${attendu}, Zelty a ${recu}`)

for (const r of nous) {
  const p = parId.get(String(r.id))
  if (!p) { dire(r, 'ABSENT de la caisse', 'présent', 'rien'); continue }
  let bon = true
  const attTtc = ttc(r)
  if (p.price_togo !== attTtc) { dire(r, 'prix à emporter', eur(attTtc / 100), eur((p.price_togo ?? 0) / 100)); bon = false }
  // Le prix SALLE est distinct dès qu'un tarif sur place est renseigné : un
  // Coca en canette au comptoir et le même dans un verre consigné à table.
  // Ne contrôler que l'emporter laisserait passer 70 centimes par verre.
  const attSalle = r.prix_sur_place_ttc == null
    ? attTtc : Math.round(Number(r.prix_sur_place_ttc) * 100)
  if (p.price !== attSalle) { dire(r, 'prix sur place', eur(attSalle / 100), eur((p.price ?? 0) / 100)); bon = false }
  if (p.tax_takeaway !== Number(r.tva) * 100) { dire(r, 'TVA à emporter', `${r.tva} %`, `${(p.tax_takeaway ?? 0) / 100} %`); bon = false }
  if (p.tax !== tvaSurPlace(r) * 100) { dire(r, 'TVA sur place', `${tvaSurPlace(r)} %`, `${(p.tax ?? 0) / 100} %`); bon = false }
  if (r.image_url && !p.image) { dire(r, 'photo', 'une image', 'aucune'); bon = false }
  // ⚠️ Le nom attendu en caisse est `nom_caisse` quand il existe, pas le nom
  // de vitrine : c'est la règle que l'import applique depuis le 28/09/2026,
  // pour que l'éclair du comptoir (3,20 €) et celui servi à table (5,50 €)
  // ne fassent pas deux boutons du même nom. Comparer au nom de vitrine
  // rendrait ce contrôle rouge en permanence sur un comportement correct —
  // et un contrôle rouge en permanence finit par être ignoré.
  const attendu = (r.nom_caisse?.trim() || r.nom)
  if (p.name !== attendu) { dire(r, 'nom', attendu, p.name); bon = false }
  // ⚠️⚠️ ET ON SIGNALE QUAND LA CAISSE AFFICHE AUTRE CHOSE QUE LA CARTE,
  // même si `nom_caisse` le justifie. Le 06/10/2026 le gérant a vu « Pavé
  // multicéréales » sur sa caisse alors que sa carte disait « Pavé Le
  // Jeannot » depuis la veille — douze noms divergeaient, et ce contrôle
  // annonçait « conformes en tout point ». Il avait raison selon sa règle,
  // et c'est précisément le problème : une règle juste qui laisse
  // l'exploitant devant un nom qu'il ne reconnaît pas.
  //
  // Ce n'est PAS une erreur — le suffixe « (salle) » est voulu, et
  // `nom_caisse` existe pour que l'éclair du comptoir et celui de la table
  // ne portent pas le même libellé. C'est une INFORMATION, et elle doit
  // être lisible sans qu'on ait à la chercher.
  if (p.name !== r.nom) ecartsVitrine.push(`${r.nom.padEnd(32).slice(0, 32)} caisse : « ${p.name} »`)
  if (p.disable) { dire(r, 'état', 'actif', 'désactivé'); bon = false }
  // ⚠️⚠️ UN PLAT SANS FAMILLE EST UN BOUTON INTROUVABLE AU COMPTOIR.
  // Il ne s'affiche sous aucun onglet de la caisse : il est vendable en
  // théorie et invendable en pratique. C'est un ÉCART, pas une remarque —
  // le prix peut être parfait, le produit ne se vend pas.
  // Correctif : `node scripts/pousser-familles-zelty.mjs --ecrire`.
  const fams = famillesCaisse(p)
  if (fams.length === 0) { dire(r, 'famille', r.categorie || 'une famille', 'aucune — bouton introuvable'); bon = false }
  // ⚠️ Et une famille qui ne concorde PAS range le bouton au mauvais
  // onglet : la pizza chez les pains. Le tag Zelty porte notre nom de
  // famille (son `remote_id`), donc la comparaison est exacte.
  else if (r.categorie && !fams.includes(r.categorie)) {
    dire(r, 'famille', r.categorie, fams.join(' + ')); bon = false
  }
  if (bon) ok++
}

// ⚠️ `show_all=true` rend AUSSI les plats éteints — c'est voulu : un plat
// actif en caisse que nous ne connaissons pas est le cas dangereux, celui
// qui se vend sans rien derrière. Mais un plat ÉTEINT sans contrepartie
// n'est pas un orphelin, c'est un retrait mené des deux côtés (les quatre
// Pago, 28/09/2026). Le compter ferait rougir ce contrôle sur une décision
// assumée, et un contrôle rouge en permanence finit par être ignoré.
const orphelins = plats.filter(p =>
  p.disable !== true && !nous.some(r => String(r.id) === String(p.remote_id ?? '')))
const eteints = plats.filter(p => p.disable === true).length

console.log(`\n── Carte Zelty vs notre base ──\n`)
console.log(`  produits actifs chez nous : ${nous.length}`)
console.log(`  plats dans la caisse      : ${plats.length}`)
console.log(`  conformes en tout point   : ${ok}`)
if (ecartsVitrine.length) {
  console.log(`\n  ℹ ${ecartsVitrine.length} produit(s) dont la CAISSE affiche un autre nom que la CARTE`)
  console.log(`    (voulu quand c'est le suffixe « (salle) » ; à corriger sinon)`)
  for (const e of ecartsVitrine) console.log(`      ${e}`)
}
console.log(`  écarts                    : ${pbs.length}`)
console.log(`  plats sans contrepartie   : ${orphelins.length}`)
console.log(`  plats éteints en caisse   : ${eteints}`)
if (pbs.length) { console.log('\n  ── écarts ──'); pbs.slice(0, 30).forEach(l => console.log('   ' + l)) }
if (orphelins.length) { console.log('\n  ── orphelins ──'); orphelins.slice(0, 10).forEach(p => console.log('   ' + p.name)) }
console.log(`\n── ${pbs.length === 0 && orphelins.length === 0 ? '✓ carte conforme' : '✗ à corriger'} ──\n`)
process.exit(pbs.length || orphelins.length ? 1 : 0)
