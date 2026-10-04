// Les sacs à croissants : trois formats, pas un — 04/10/2026.
//
// ⚠️⚠️ CORRECTION D'UN CHIFFRE QUE J'AI ANNONCÉ FAUX. J'avais écrit « Plaza
// −39 % sur les sacs à croissants » en comparant son 8,39 € à nos 13,73 €.
// C'était comparer deux formats différents — exactement la faute que la 0151
// avait déjà écartée chez Euro-Cash (« sacs croissants N°101 au lieu du
// N°104 »), et je l'ai refaite.
//
// La preuve était dans notre propre libellé d'achat :
// « 1000SAC CROIS KBR104 CLAS CERT » — nous achetions le N°104. Et le
// catalogue Plaza donne la correspondance numéro ↔ dimensions :
//
//   N°101  12+5×15 cm   2 croissants
//   N°102  12+5×20 cm
//   N°103  14+6×20 cm   6 croissants
//   N°104  14+6×27 cm   ← le nôtre
//
// Les deux références commandées chez Plaza (S01KN = 12+5×15, S03KN =
// 14+6×20) sont donc un 101 et un 103 : des sacs PLUS PETITS, pas le même
// article moins cher. À format égal, Plaza est à 13,90 € contre nos 13,73 €
// — soit 1 % PLUS cher.
//
// ⚠️ Le vrai face-à-face se fait format par format. Trois matières, trois
// clés de comparaison, et les offres s'y rangent d'elles-mêmes.
//
//   node scripts/sacs-croissants-formats.mjs [--ecrire]
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
const [plaza] = await sb('fournisseurs?nom=eq.Plaza%20Grossiste&select=id')
// ⚠️ On cherche par le LIBELLÉ D'ACHAT, pas par le nom : le script renomme
// la matière, donc une recherche par nom ne la retrouverait pas au second
// passage — et un script qu'on ne peut pas rejouer n'est pas un script.
const [existante] = await sb('ingredients?libelle_achat=like.*KBR104*&select=id,nom,unite,prix_achat_ht,libelle_achat,stock_minimum,stock_cible')
if (!existante) { console.error('✗ matière N°104 introuvable (libellé KBR104)'); process.exit(1) }

// format · nom de matière · clé · réf Plaza payée · prix payé
const FORMATS = [
  ['101', 'Sacs à croissants 101 (12+5×15, 2 pièces)', 'S01KN',  8.39],
  ['103', 'Sacs à croissants 103 (14+6×20, 6 pièces)', 'S03KN', 10.90],
]
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — les sacs à croissants, format par format ──\n`)
console.log(`   existant : « ${existante.nom} » ${existante.prix_achat_ht} €/${existante.unite}`)
console.log(`              libellé « ${existante.libelle_achat} » → c'est un N°104`)
console.log(`   → renommé « Sacs à croissants 104 (14+6×27) » pour que le format soit lisible\n`)
for (const [n, nom, ref, prix] of FORMATS)
  console.log(`   + ${nom.padEnd(44)} ${prix.toFixed(2)} €/colis 1000  (Plaza ${ref}, payé)`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ⚠️ On PRÉCISE le nom, on ne change ni l'unité ni le prix : la matière garde
// son historique et son libellé d'achat Promocash.
await sb(`ingredients?id=eq.${existante.id}`, { method: 'PATCH', body: JSON.stringify({
  nom: 'Sacs à croissants 104 (14+6×27)' }) })
const crees = []
for (const [n, nom, ref, prix] of FORMATS) {
  const [deja] = await sb(`ingredients?nom=eq.${encodeURIComponent(nom)}&select=id`)
  if (deja) { crees.push({ n, id: deja.id }); continue }
  // ⚠️ `prix_estime = false` : ce prix est PAYÉ, pas estimé (0165). C'est le
  // seul cas où l'on peut l'affirmer — la commande est réglée par carte.
  const [m] = await sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom, unite: 'colis 1000', categorie: 'Emballage',
    prix_achat_ht: prix, prix_estime: false, stocke: true, actif: true,
    fournisseur_principal: 'Plaza Grossiste', reference_fournisseur: ref,
    stock_minimum: 0, stock_cible: 1 }) })
  crees.push({ n, id: m.id })
}
console.log(`\n   ✓ ${crees.length} matière(s) en place`)

// ── les clés de comparaison, posées PAR FORMAT ──────────────────────
// ⚠️ Le rapprochement se fait sur le NUMÉRO ou sur les DIMENSIONS écrites
// dans la désignation — jamais sur « sac à croissants » tout court, qui
// mettrait six formats dans le même panier.
const cat = await sb('catalogue_fournisseur?designation=ilike.*sac*croissant*&select=id,reference,designation,prix_ht,fournisseur_id')
// ⚠️ LA DÉSIGNATION S'ÉCRIT TANTÔT « 14+6x20 », TANTÔT « 14+6×20 » (signe
// multiplier). Un regex sur le seul « x » a manqué le S03KN payé — en
// silence, comme toujours : la ligne est simplement restée sans clé, donc
// invisible du comparateur. On normalise avant de chercher.
const dim = d => d.replace(/[×✕✖]/g, 'x').replace(/\s+/g, '')
// ⚠️ LA COULEUR EST TARIFÉE, DONC ELLE SÉPARE LES GROUPES. Gineys imprime
// le 103 brun à 16,76 € et le 103 BLANC à 18,72 € : les mélanger afficherait
// un « +12 % » qui ne compare pas le même sac. Notre libellé Promocash dit
// « KBR104 » — K-B-R, kraft BRun.
const blanc = d => /blanc/i.test(d)
// ⚠️ LE NUMÉRO SE CHERCHE SUR LA DÉSIGNATION D'ORIGINE, les dimensions sur
// la normalisée. `dim()` retire les espaces, donc il DÉTRUIT les frontières
// de mots : dans « BRUN104 », `\b104\b` ne matche plus — et les lignes
// Gineys et Euro-Cash sont sorties des groupes sans un mot. Deux tests, deux
// chaînes.
const num = (d, n) => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(d)
const par = { '101': [], '103': [], '104': [] }
for (const c of cat) {
  if (blanc(c.designation)) continue
  const o = c.designation, d = dim(o), r = c.reference ?? ''
  if (/12\+5x15/.test(d) || /S01KN/.test(r) || num(o, 101)) par['101'].push(c)
  else if (/14\+6x20/.test(d) || /S03KN/.test(r) || num(o, 103)) par['103'].push(c)
  else if (/14\+6x27/.test(d) || num(o, 104)) par['104'].push(c)
}
// On repart des clés déjà posées à tort (le sac blanc) pour ne rien laisser
// derrière : une clé orpheline ferait un face-à-face d'une seule ligne.
for (const c of cat) if (blanc(c.designation))
  await sb(`catalogue_fournisseur?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({
    cle_comparaison: null, ingredient_id: null }) })
const idPar = { '104': existante.id, ...Object.fromEntries(crees.map(c => [c.n, c.id])) }
for (const [n, lignes] of Object.entries(par)) {
  const cle = `Sacs à croissants ${n}`
  console.log(`\n   « ${cle} » — ${lignes.length} offre(s)`)
  for (const l of lignes) {
    console.log(`      ${String(l.prix_ht).padStart(7)} €  ${l.designation.slice(0, 54)}`)
    await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({
      cle_comparaison: cle, ingredient_id: idPar[n] ?? null }) })
  }
}
console.log('')

// ── la contenance, UNIQUEMENT là où la désignation la prouve ─────────
// Sans contenance, `prixReference()` ne rend rien et le groupe reste
// « non comparable » : trois face-à-face parfaitement constitués et muets.
// ⚠️ On ne pose 1000 que si le libellé l'écrit (« carton de 1000 »,
// « SAC=1000 », « 1000SAC CROIS ») — jamais par analogie avec les voisins.
// Les trois lignes Euro-Cash (« Sacs Croissants N°104 14x7x27cm ») ne disent
// AUCUNE quantité : elles restent sans contenance, donc hors comparaison.
// Leur prix est nul de toute façon — c'est la relance à faire.
const aPoser = (await sb('catalogue_fournisseur?cle_comparaison=like.Sacs%20%C3%A0%20croissants*&contenance_valeur=is.null&select=id,designation'))
  .filter(c => /(?:carton de|sac\s*=|^)\s*1000|1000\s*sac/i.test(c.designation))
for (const c of aPoser) {
  await sb(`catalogue_fournisseur?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({
    contenance_valeur: 1000, contenance_unite: 'piece' }) })
  console.log(`   contenance 1000 pièces ← « ${c.designation.slice(0, 52)} »`)
}
const sans = await sb('catalogue_fournisseur?cle_comparaison=like.Sacs%20%C3%A0%20croissants*&contenance_valeur=is.null&select=designation')
if (sans.length) console.log(`\n   ${sans.length} ligne(s) sans contenance prouvée, laissées hors comparaison :`)
for (const c of sans) console.log(`      ${c.designation}`)
console.log('')
