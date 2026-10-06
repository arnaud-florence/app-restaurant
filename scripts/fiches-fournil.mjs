// Les fiches techniques des produits ASSEMBLÉS du Fournil.
//
//   node scripts/fiches-fournil.mjs [--ecrire]
//
// Douze produits — 5 sandwiches, 3 paninis, 4 salades — n'avaient AUCUNE
// composition. Leurs matières étaient bien suivies au stock (jambon,
// emmental, mesclun), mais rien ne disait COMBIEN il en faut : impossible de
// connaître leur marge, impossible de dimensionner une commande autrement
// qu'au plancher. C'est le dernier trou du diagnostic — 38 produits du
// Fournil « ni achat-revente, ni composition », dont ces douze sont la part
// réellement assemblée.
//
// Même contrat que `fiches-pizzas.mjs` et `fiches-brasserie.mjs` :
// composition au gramme, procédure numérotée, poids servi.
//
// ⚠️⚠️ LES GRAMMAGES SONT UNE DÉCISION DE PRODUCTION, PAS UNE DONNÉE
// MESURÉE. Ils sont posés ici sur les usages d'une sandwicherie (50 g de
// jambon, 2 tranches d'emmental, 70 g de mesclun) et sur les garnitures
// annoncées par les affiches. Ce sont les SEULS nombres inventés du
// fichier ; tous les prix viennent du catalogue. Ils se vérifient à la
// balance au premier service, et c'est là qu'ils deviennent vrais : c'est
// la dose qui fixe le coût, donc la marge.
//
// ⚠️ LE PAIN DES SANDWICHES N'EST PAS STOCKÉ, ET C'EST VOULU. La baguette
// est déjà commandée en tant que PRODUIT VENDU (« Baguette classique »,
// 0,435 €). En faire aussi une matière suivie la ferait apparaître DEUX
// fois au réassort, et on en commanderait le double sans que rien ne le
// signale. Corollaire à connaître : la consommation des sandwiches ne
// s'ajoute pas toute seule à la cible des baguettes.
//
// ⚠️ Le pain à PANINI, lui, n'est vendu nulle part : personne ne le commande
// aujourd'hui. Il est donc créé en matière suivie — c'est un vrai trou.

import fs from 'node:fs'
import { execSync } from 'node:child_process'

const ECRIRE = process.argv.includes('--ecrire')

const TMP = new URL('../.next/cache/tarifs-lib/', import.meta.url).pathname
execSync(`npx tsc "${new URL('../src/lib/tarifs-fournisseurs.ts', import.meta.url).pathname}" --target es2022 --module es2022 --moduleResolution bundler --outDir "${TMP}"`, { stdio: 'inherit' })
fs.writeFileSync(`${TMP}package.json`, '{"type":"module"}')
const { prixReferenceMatiere } = await import(`${TMP}tarifs-fournisseurs.js`)

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const api = async (chemin, init) => {
  const r = await fetch(`${U}/rest/v1/${chemin}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } })
  const corps = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${corps}`)
  // ⚠️ Un DELETE ou un POST sans `Prefer: return=representation` répond un
  // corps VIDE : `r.json()` y lève « Unexpected end of JSON input », et
  // l'écriture s'arrête au milieu des douze fiches.
  return corps ? JSON.parse(corps) : null
}

// ─── Les matières qui manquaient ──────────────────────────────────────
const A_CREER = [
  { nom: 'Baguette sandwich (pièce)', unite: 'pièce', prix: 0.435, stocke: false,
    fournisseur: 'Gineys (Nicolas)', categorie: 'Boulangerie',
    note: 'même pain que le produit vendu « Baguette classique » — NON stocké pour ne pas le commander deux fois' },
  { nom: 'Pain panini (pièce)', unite: 'pièce', prix: 0.566, stocke: true,
    fournisseur: 'Gineys (Nicolas)', categorie: 'Boulangerie',
    note: 'PANINI OVALE NATURE PRECUIT 20CM 125G ARTIPAT C=50, 28,29 € le colis de 50 (portail Gineys)' },
  { nom: 'Concombre (kg)', unite: 'kg', prix: 2.50, stocke: true,
    fournisseur: null, categorie: 'Restaurant',
    note: 'ESTIMATION — aucun de nos huit fournisseurs ne le propose, comme les tomates et la salade. À chiffrer chez le maraîcher.' },
]

// ─── Les douze fiches ─────────────────────────────────────────────────
//
// `g` = grammes, `p` = pièces, `ml` = millilitres. La conversion vers
// l'unité de la matière (« barquette 500 g », « colis 36 ») est faite par
// le script, JAMAIS à la main : écrire « 1 pièce » de Pain focaccia quand
// l'unité est le colis de 36 chiffrerait le sandwich à 25 €.
const FICHES = [
  { nom: 'Le Parisien', poids: 330, compo: [
      ['Baguette sandwich (pièce)', { p: 1 }], ['Beurre doux', { g: 15 }],
      ['Jambon blanc tranché', { g: 50 }], ['Emmental en tranches', { g: 30 }]],
    procedure: [
      'Fendre la baguette sur la longueur sans séparer les deux moitiés.',
      'Beurrer la mie sur toute la longueur (15 g, soit une noix).',
      'Jambon 50 g (2 tranches pliées, pas à plat), emmental 30 g (2 tranches).',
      'Sachet sandwich, étiquette du jour. À consommer dans la journée.'] },

  { nom: 'Le Rosette', poids: 320, compo: [
      ['Baguette sandwich (pièce)', { p: 1 }], ['Beurre doux', { g: 15 }],
      ['Rosette de Lyon', { g: 50 }]],
    procedure: [
      'Fendre la baguette sur la longueur.',
      'Beurrer la mie (15 g).',
      'Rosette 50 g, soit 8 à 10 tranches selon le calibre, disposées en écailles.',
      'Sachet sandwich, étiquette du jour.'] },

  { nom: 'Le Poulet', poids: 350, compo: [
      ['Baguette sandwich (pièce)', { p: 1 }], ['Sauce mayonnaise', { g: 20 }],
      ['Filet de poulet rôti', { g: 70 }], ['Salade mesclun (kg)', { g: 20 }]],
    procedure: [
      'Fendre la baguette sur la longueur.',
      'Mayonnaise 20 g, étalée sur la mie du bas uniquement (la salade glisse sinon).',
      'Salade 20 g, puis poulet 70 g (3 à 4 tranchettes).',
      'Sachet sandwich, étiquette du jour.'] },

  { nom: 'Le Nordique', poids: 340, compo: [
      ['Baguette sandwich (pièce)', { p: 1 }], ['Fromage à la crème', { g: 40 }],
      ['Saumon fumé tranché', { g: 50 }]],
    procedure: [
      'Fendre la baguette sur la longueur.',
      'Fromage frais 40 g sur les deux faces.',
      'Saumon 50 g, soit 2 tranches, pliées en accordéon — à plat il paraît moins généreux.',
      '⚠️ Produit le plus cher de la vitrine : peser le saumon, ne pas le servir à l\'œil.',
      'Sachet sandwich, étiquette du jour.'] },

  { nom: 'Focaccia', poids: 300, compo: [
      ['Pain focaccia', { p: 1 }], ['Jambon blanc tranché', { g: 40 }],
      ['Mozzarella en tranches', { g: 30 }], ['Tomates (kg)', { g: 30 }],
      ['Salade mesclun (kg)', { g: 15 }]],
    procedure: [
      '⚠️ La garniture SE CHOISIT AU COMPTOIR — les six focaccias ont été fondues en une seule le 28/08/2026 pour cette raison.',
      'La composition ci-dessous est la garniture de RÉFÉRENCE (jambon-mozzarella) : elle sert à chiffrer le coût, pas à imposer la recette.',
      'Pain focaccia pré-tranché, passer 2 min au four à panini.',
      'Garnir : salade 15 g, tomate 30 g, jambon 40 g, mozzarella 30 g.',
      'Une garniture nettement plus chère (saumon, chèvre) doit se vendre à un autre prix.'] },

  { nom: 'Panini jambon-fromage', poids: 215, compo: [
      ['Pain panini (pièce)', { p: 1 }], ['Jambon blanc tranché', { g: 50 }],
      ['Emmental râpé', { g: 40 }]],
    procedure: [
      'Ouvrir le pain panini sans le séparer.',
      'Emmental râpé 40 g réparti sur toute la longueur, jambon 50 g par-dessus.',
      '⚠️ Le fromage va DESSOUS et DESSUS de la garniture : c\'est lui qui soude le pain à la cuisson.',
      'Grill à panini 4 à 5 min, jusqu\'à ce que le fromage file.'] },

  { nom: 'Panini chèvre-miel', poids: 205, compo: [
      ['Pain panini (pièce)', { p: 1 }],
      // ⚠️ La bûchette se compte en PIÈCES : son unité ne porte pas son
      // poids (180 g), donc un grammage y serait lu comme des kilos. Un
      // tiers de bûchette = 60 g, la même dose que le burger chèvre-miel.
      ['Bûchette de chèvre', { p: 1 / 3 }],
      ['Miel liquide', { g: 15 }]],
    procedure: [
      'Ouvrir le pain panini.',
      'Chèvre 60 g, soit un tiers de bûchette en rondelles de 1 cm.',
      'Miel 15 g en filet sur le chèvre, JAMAIS sur le pain — il brûle au contact de la plaque.',
      'Grill à panini 4 à 5 min.'] },

  { nom: 'Panini poulet-pesto', poids: 220, compo: [
      ['Pain panini (pièce)', { p: 1 }], ['Filet de poulet rôti', { g: 60 }],
      ['Pesto alla genovese', { g: 15 }], ['Mozzarella râpée', { g: 30 }]],
    procedure: [
      'Ouvrir le pain panini.',
      'Pesto 15 g étalé sur la mie du bas, poulet 60 g, mozzarella râpée 30 g.',
      'Grill à panini 4 à 5 min.'] },

  { nom: 'Salade', poids: 300, compo: [
      ['Salade mesclun (kg)', { g: 80 }], ['Tomates (kg)', { g: 60 }],
      ['Concombre (kg)', { g: 40 }], ['Œuf (pièce)', { p: 0.5 }],
      ['Vinaigrette balsamique', { ml: 15 }]],
    procedure: [
      'Bol à salade : mesclun 80 g au fond.',
      'Tomate 60 g en quartiers, concombre 40 g en rondelles, un demi-œuf dur.',
      'Vinaigrette 15 ml en berlingot À PART — versée dans le bol, la salade est molle en une heure.',
      'Kit couvert + serviette.'] },

  { nom: 'Salade poulet-feta', poids: 340, compo: [
      ['Salade mesclun (kg)', { g: 70 }], ['Filet de poulet rôti', { g: 60 }],
      ['Feta en dés', { g: 40 }], ['Tomates (kg)', { g: 50 }],
      ['Concombre (kg)', { g: 40 }], ['Oignons rouges émincés (kg)', { g: 10 }],
      ['Vinaigrette balsamique', { ml: 15 }]],
    procedure: [
      'Bol à salade : mesclun 70 g au fond.',
      'Poulet 60 g, feta 40 g, tomate 50 g, concombre 40 g, oignon rouge 10 g.',
      'Vinaigrette 15 ml à part.',
      'Kit couvert + serviette.'] },

  { nom: 'Salade italienne', poids: 320, compo: [
      ['Salade mesclun (kg)', { g: 70 }], ['Jambon cru Serrano', { g: 30 }],
      ['Mozzarella cerise', { g: 50 }], ['Tomates (kg)', { g: 50 }],
      ['Olives noires', { g: 20 }], ['Vinaigrette balsamique', { ml: 15 }]],
    procedure: [
      'Bol à salade : mesclun 70 g au fond.',
      'Serrano 30 g (3 tranches roulées), mozzarella cerise 50 g, tomate 50 g, olives 20 g.',
      'Vinaigrette balsamique 15 ml à part.',
      'Kit couvert + serviette.'] },

  { nom: 'Salade saumon', poids: 340, compo: [
      ['Salade mesclun (kg)', { g: 70 }], ['Saumon fumé tranché', { g: 50 }],
      ['Tomates (kg)', { g: 50 }], ['Concombre (kg)', { g: 40 }],
      ['Oignons rouges émincés (kg)', { g: 10 }], ['Citron (pièce)', { p: 0.25 }],
      ['Vinaigrette balsamique', { ml: 15 }]],
    procedure: [
      'Bol à salade : mesclun 70 g au fond.',
      'Saumon 50 g plié en accordéon, tomate 50 g, concombre 40 g, oignon rouge 10 g, quart de citron.',
      '⚠️ Peser le saumon : c\'est lui qui fait le coût de cette salade.',
      'Vinaigrette 15 ml à part. Kit couvert + serviette.'] },
]

// ─── Exécution ────────────────────────────────────────────────────────
const fourns = await api('fournisseurs?select=id,nom')
const nomF = new Map(fourns.map(f => [f.nom, f.id]))
let ing = await api('ingredients?select=id,nom,unite,prix_achat_ht,prix_estime,stocke,actif&limit=1000')

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'}\n`)

// 1. matières manquantes
const creations = A_CREER.filter(c => !ing.some(i => i.nom === c.nom))
console.log(`── ${creations.length} matière(s) à créer ──`)
for (const c of creations) console.log(`  + ${c.nom.padEnd(28)} ${c.prix.toFixed(3)} / ${c.unite}   ${c.stocke ? 'suivie au stock' : '⚠️ NON stockée'}\n      ${c.note}`)
if (ECRIRE && creations.length) {
  const cree = await api('ingredients', { method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(creations.map(c => ({
      nom: c.nom, unite: c.unite, prix_achat_ht: c.prix, prix_estime: true, stocke: c.stocke,
      // ⚠️ La note vit dans CE fichier, pas dans `fournisseur_principal` :
      // ce champ est du texte libre, et y écrire une méthode est exactement
      // ce qui a fait sortir « ESTIMATION 21/09/2026 » en tête des
      // fournisseurs de la commande d'ouverture. `prix_estime` (0165) porte
      // la seule part de l'information que le code doit lire.
      actif: true, categorie: c.categorie, fournisseur_principal: c.fournisseur }))) })
  ing = ing.concat(cree)
}
// ⚠️ En essai à blanc les matières ne sont pas encore créées : on les
// simule, sinon l'essai ne chiffrerait rien et ne servirait à rien.
const parNom = new Map(ing.map(i => [i.nom, i]))
for (const c of creations) if (!parNom.has(c.nom)) parNom.set(c.nom,
  { id: null, nom: c.nom, unite: c.unite, prix_achat_ht: c.prix, simulee: true })

// ⚠️ La contenance de NOTRE unité se DÉDUIT du prix de référence, jamais
// d'une table écrite à la main : « barquette 500 g » → 0,5 kg, « colis 36 »
// → 36 pièces. Une table recopiée finirait par diverger d'une unité
// précisée entre-temps (`preciser-unites-matieres.mjs`).
function convertir(i, q) {
  const ref = prixReferenceMatiere(String(i.unite ?? ''), Number(i.prix_achat_ht ?? 0))
  if (!ref || !ref.prix) return null
  const contenance = Number(i.prix_achat_ht) / ref.prix     // en kg, L ou pièces
  const besoin = q.g !== undefined ? q.g / 1000 : q.ml !== undefined ? q.ml / 1000 : q.p
  const attendu = q.g !== undefined ? 'kg' : q.ml !== undefined ? 'L' : 'piece'
  if (ref.unite !== attendu) return { erreur: `la matière est en ${ref.unite}, la fiche demande des ${attendu}` }
  return { quantite: besoin / contenance, cout: (besoin / contenance) * Number(i.prix_achat_ht), ref }
}

const recettes = await api(`recettes?select=id,nom,prix_vente_ht,categorie,actif&nom=in.(${FICHES.map(f => `"${f.nom}"`).join(',')})`)
const lignes = [], bilan = [], erreurs = []

for (const f of FICHES) {
  const r = recettes.find(x => x.nom === f.nom && x.actif)
  if (!r) { erreurs.push(`produit introuvable : ${f.nom}`); continue }
  let cout = 0; const detail = []
  for (const [nom, q] of f.compo) {
    const i = parNom.get(nom)
    if (!i) { erreurs.push(`${f.nom} : matière « ${nom} » absente`); continue }
    const c = convertir(i, q)
    if (!c) { erreurs.push(`${f.nom} : « ${nom} » — unité « ${i.unite} » illisible`); continue }
    if (c.erreur) { erreurs.push(`${f.nom} : « ${nom} » — ${c.erreur}`); continue }
    cout += c.cout
    if (ECRIRE && !i.id) { erreurs.push(`${f.nom} : « ${nom} » n'a pas d'identifiant`); continue }
    detail.push({ nom, q, quantite: c.quantite, unite: i.unite, cout: c.cout, id: i.id })
  }
  const pv = Number(r.prix_vente_ht)
  bilan.push({ f, r, cout, pv, fc: cout / pv * 100, detail })
  lignes.push({ recette_id: r.id, detail, f })
}

console.log(`\n── ${bilan.length} fiche(s) ──`)
for (const b of bilan.sort((a, c) => c.fc - a.fc)) {
  const feu = b.fc > 32 ? '🔴' : b.fc > 28 ? '🟡' : '🟢'
  console.log(`\n${feu} ${b.f.nom.padEnd(24)} coût ${b.cout.toFixed(3)} €  ·  PV ${b.pv.toFixed(2)} € HT  ·  food cost ${b.fc.toFixed(0)} %  ·  ${b.f.poids} g`)
  for (const d of b.detail) console.log(`      ${String(Math.round((d.q.g ?? d.q.ml ?? d.q.p) * 100) / 100).padStart(5)} ${(d.q.g ? 'g' : d.q.ml ? 'ml' : 'pce').padEnd(3)} ${d.nom.padEnd(30)} ${d.quantite.toFixed(4).padStart(9)} ${d.unite.padEnd(18)} ${d.cout.toFixed(3)} €`)
}
if (erreurs.length) { console.log(`\n⚠️ ${erreurs.length} problème(s) :`); erreurs.forEach(e => console.log('  ·', e)) }

const chers = bilan.filter(b => b.fc > 32)
if (chers.length) {
  console.log(`\n⚠️⚠️ ${chers.length} produit(s) au-dessus de 32 % — ce n'est PAS un défaut de la fiche, c'est un prix de vente trop bas :`)
  for (const b of chers) console.log(`   ${b.f.nom.padEnd(24)} ${b.fc.toFixed(0)} %  — à ${(b.cout / 0.32).toFixed(2)} € HT (${(b.cout / 0.32 * 1.1).toFixed(2)} € TTC) il reviendrait à 32 %`)
}

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(erreurs.length ? 1 : 0) }
if (erreurs.length) { console.error('\n⛔ Des problèmes subsistent : rien n\'est écrit. Une fiche à moitié saisie est pire qu\'aucune fiche.'); process.exit(1) }

for (const b of bilan) {
  await api(`recette_ingredients?recette_id=eq.${b.r.id}`, { method: 'DELETE' })
  await api('recette_ingredients', { method: 'POST', body: JSON.stringify(
    b.detail.map(d => ({ recette_id: b.r.id, ingredient_id: d.id, quantite: Number(d.quantite.toFixed(6)), unite: d.unite }))) })
  await api(`recettes?id=eq.${b.r.id}`, { method: 'PATCH', body: JSON.stringify({
    poids_portion_g: b.f.poids, nb_portions: 1, procedure: b.f.procedure.join('\n') }) })
}
console.log(`\n✅ ${bilan.length} fiches écrites, ${creations.length} matière(s) créée(s).`)
