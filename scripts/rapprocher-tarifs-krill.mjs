// Krill face à nos prix — 02/10/2026.
//
// ⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT (0151). Chaque paire ci-dessous a
// été examinée, et les ÉCARTÉES figurent avec leur motif : sans elles, dans
// six mois, on ne saura plus si une paire absente est un oubli ou une décision.
//
//   node scripts/rapprocher-tarifs-krill.mjs [--ecrire]
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

// ── RETENUS : référence Krill → clé, et pourquoi ─────────────────────
const RETENUS = [
  ['875032', 'Sauce mayonnaise', 'EXACTEMENT le même article que notre « SQUEEZ SAUCE MAYONNAISE GYMA BTL=920G » : même marque, même contenant, même poids'],
  ['873090', 'Sauce moutarde', 'identique à notre « SQUEEZ SAUCE MOUTARDE DE DIJON GYMA BTL=950G », payé chez Gineys'],
  ['877000', 'Sauce ketchup', 'Gyma 950 g ; notre ligne payée est un Saxo 1,04 kg — les deux portent leur poids, donc comparables au kilo'],
  ['872184', 'Sauce tartare', 'même sauce Gyma que le seau 2,8 kg de Gineys, en bouteille — les deux se ramènent au kilo'],
  ['872168', 'Sauce pizza', 'même FORMAT 5/1 que notre Louis Martin ; deux 5/1 se comparent au prix de la boîte'],
  ['574588', 'Oignons rouges émincés (kg)', 'oignon rouge émincé cru, comme le nôtre, et facturé au kilo des deux côtés'],
  // ⚠️ Paris-Brest : MÊME POIDS (80 g) des deux côtés, donc la comparaison à
  // la PIÈCE est honnête — et c'est la seule possible, notre ligne étant
  // tarifée au colis en pièces. La contenance de la ligne Krill est retirée
  // juste après, sinon elle se lit au kilo et les deux bases ne concordent plus.
  ['670157', 'Paris-Brest', 'MÊME POIDS que notre Arti’Pat (80 g) ; le diamètre diffère, la pâtisserie non'],
  // ⚠️ Tartelette : nos deux lignes sont tarifées à la PIÈCE avec un poids de
  // 120 g, donc le kilo se calcule des deux côtés. C'est le seul cas de
  // pâtisserie où les bases concordent sans rien forcer.
  ['670099', 'Tartelette citron meringuée', '97 g contre 120 g chez nous, et les deux lignes portent leur poids : comparable au kilo'],
]

// ── ÉCARTÉS : et il faut que ça le reste sans décision explicite ─────
const ECARTES = [
  // ⚠️⚠️ DEUX PAIRES RETIRÉES APRÈS VÉRIFICATION, et c'est le genre d'erreur
  // que ce fichier doit garder. Je les avais posées en croyant qu'une
  // contenance suffisait à rendre les bases comparables. Elle ne suffit pas :
  // nos lignes Arti'Pat sont tarifées AU COLIS, dont la « contenance » est un
  // NOMBRE DE PIÈCES (16, 12, 30), pas un poids. Le prix de référence sort
  // donc en €/pièce d'un côté et en €/kg de l'autre, et `memeBase()` refuse —
  // à juste titre. Les forcer aurait annoncé « −31 % » sur un éclair de 80 g
  // face au nôtre de 120 g : moins cher parce que plus petit.
  ['671015', 'ECLAIR CHOCOLAT 80 G', 'notre Arti’Pat fait 120 g et se tarife au colis : pas de base commune sans réécrire nos lignes. Au kilo, calculé à la main : Krill 11,13 €/kg contre 10,80 € chez nous — Krill est MARGINALEMENT PLUS CHER, l’écart ne justifie rien.'],
  ['670091', 'A-MAXI COOKIE 106 G', 'même obstacle de base que l’éclair. Mais au kilo, calculé à la main : Krill 9,32 €/kg contre 15,02 € chez nous — ⚠️ −38 %, c’est la plus grosse économie de cette offre et elle mérite une vérification du commercial avant de poser la clé.'],
  ['673491', 'FLAN PATISSIER EPAIS **CUIT**', 'notre « HAOU FLAN CRU » est CRU — le travail diffère, comme « JAMBON CUIT SUP AC 8K » face au jambon tranché. ⚠️ À REGARDER QUAND MÊME : 8,98 € le flan cuit contre 10,79 € notre flan cru, c’est contre-intuitif et ça vaut une question au commercial.'],
  ['670223', 'COULANT CHOCOLAT 100 G', 'le poids de notre « COULANT GOURMAND » Carigel n’est écrit nulle part : sans lui, 0,98 € contre 1,26 € compare deux pâtisseries dont on ignore si elles font le même poids'],
  ['879021', 'OLIVE NOIRE DENOYAUTEE 34/40', 'les nôtres sont « À LA GRECQUE » — séchées et ridées, pas en saumure. Deux produits, deux usages'],
  ['116233', 'POIVRON LANIERE 3 COULEURS **MARINE**', 'mariné contre nos lanières nature : le facteur 4 sur le prix au kilo dit assez que ce n’est pas le même produit'],
  ['492264', 'CARPACCIO VB **MARINE** 70 G', 'mariné et tranché contre notre pièce à travailler — le prix au kilo diffère parce que le TRAVAIL diffère (0151)'],
  ['872189', 'SAUCE CAESAR BOUTEILLE 950 G', 'aucune contrepartie : on n’achète pas de sauce caesar'],
  ['875031', 'MAYONNAISE DOSETTE / moutarde / ketchup dosette', 'on n’achète pas en dosettes — rapprocher une dosette d’une bouteille comparerait deux usages'],
]

// ── contenances à poser sur NOS lignes, lues sur leur propre libellé ──
// ⚠️ Rien n'est deviné : le poids est ÉCRIT dans la désignation du
// fournisseur. Sans lui, une comparaison à la pièce opposerait un éclair de
// 80 g à un de 120 g et déclarerait le petit « moins cher ».
// ⚠️ On ne touche QUE les lignes tarifées à la PIÈCE. Écrire un poids sur une
// ligne au COLIS écraserait son nombre de pièces et ferait sortir un éclair à
// 129 €/kg (15,55 € ÷ 0,12).
const CONTENANCES_NOTRES = [
  ['TARTELETTE CITRON MERINGUEE 120G', 0.12, 'kg'],
]

const [krill] = await sb('fournisseurs?nom=eq.Krill&select=id')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — Krill face à nos prix ──\n`)
console.log(`  ${RETENUS.length} paires RETENUES\n`)
for (const [ref, cle, pourquoi] of RETENUS) {
  const [l] = await sb(`catalogue_fournisseur?fournisseur_id=eq.${krill.id}&reference=eq.${ref}&select=id,designation,prix_ht`)
  if (!l) { console.log(`   ⚠ ${ref} introuvable`); continue }
  console.log(`   ${ref}  ${String(l.prix_ht).padStart(7)} €  → « ${cle} »`)
  console.log(`         ${pourquoi}`)
  if (ECRIRE) await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({ cle_comparaison: cle }) })
}
// ⚠️ La 5/1 se compare au CONTENANT, pas au kilo : nos autres lignes 5/1
// n'ont pas de contenance, et `memeBase()` exige que la base concorde.
// Laisser 4,1 kg sur la seule ligne Krill la rendrait incomparable.
if (ECRIRE) {
  // la 5/1 et le Paris-Brest se comparent au CONTENANT / à la PIÈCE
  for (const r of ['872168', '670157'])
    await sb(`catalogue_fournisseur?fournisseur_id=eq.${krill.id}&reference=eq.${r}`,
      { method: 'PATCH', body: JSON.stringify({ contenance_valeur: null, contenance_unite: null }) })
  // les clés posées à tort sont retirées
  for (const r of ['671015', '670091'])
    await sb(`catalogue_fournisseur?fournisseur_id=eq.${krill.id}&reference=eq.${r}`,
      { method: 'PATCH', body: JSON.stringify({ cle_comparaison: null }) })
  console.log(`\n   ⚙ sauce pizza 5/1 et Paris-Brest ramenés au contenant / à la pièce`)
  console.log(`   ⚙ éclair et cookie : clé RETIRÉE, bases non concordantes`)
}
console.log(`\n  ${CONTENANCES_NOTRES.length} contenances posées sur NOS lignes (poids lu sur leur libellé)`)
for (const [frag, v, u] of CONTENANCES_NOTRES) {
  const ls = await sb(`catalogue_fournisseur?designation=ilike.*${encodeURIComponent(frag)}*&select=id,designation,contenance_valeur`)
  console.log(`   « ${frag} » → ${ls.length} ligne(s) à ${v} ${u}`)
  if (!ECRIRE) continue
  for (const l of ls) if (l.contenance_valeur == null)
    await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({ contenance_valeur: v, contenance_unite: u }) })
}
// La clé « Sauce tartare » n'avait AUCUNE ligne : on la pose aussi sur le seau
// Gineys, sinon le face-à-face n'existe pas et Krill paraît seul au monde.
if (ECRIRE) {
  const g = await sb(`catalogue_fournisseur?designation=ilike.*SAUCE%20TARTARE%20GYMA*&select=id,designation,cle_comparaison`)
  for (const l of g) if (!l.cle_comparaison)
    await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({ cle_comparaison: 'Sauce tartare' }) })
  console.log(`\n   ⚙ clé « Sauce tartare » posée aussi sur ${g.length} ligne(s) Gineys`)
}
console.log(`\n  ${ECARTES.length} ÉCARTÉS, et il faut que ça le reste :\n`)
for (const [ref, quoi, pourquoi] of ECARTES) {
  console.log(`   ${ref}  ${quoi}`)
  console.log(`         ${pourquoi}\n`)
}
console.log(ECRIRE ? '' : '  (essai à blanc — relancer avec --ecrire)\n')
