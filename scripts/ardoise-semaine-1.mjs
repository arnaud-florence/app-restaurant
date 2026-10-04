// L'ARDOISE DE LA SEMAINE 1 — 12 au 18 octobre 2026.
//
// La carte annoncée par le gérant le 04/10/2026 : cinq plats de brasserie,
// toutes les pizzas, et cinq plats du jour du lundi au vendredi.
//
// ⚠️⚠️ LES GRAMMAGES DES PLATS DU JOUR SONT PROPOSÉS, PAS MESURÉS. Aucun de
// ces cinq plats n'a jamais été servi : les portions sont des portions
// standard de brasserie, calées sur les fiches existantes (0,18 kg de
// garniture, 0,03 kg de salade, 1 pièce de protéine). Elles se corrigent à la
// balance au premier service — mais sans elles, les 140 couverts du midi se
// commandent à l'aveugle, ce qui est pire.
//
// ⚠️ LES INGRÉDIENTS CRÉÉS ICI N'ONT PAS DE PRIX RELEVÉ. Ils arrivent en
// `prix_estime = true` (0165) : ils nourrissent le food cost en disant qu'ils
// sont une hypothèse, et la première facture les confirmera. Un zéro se
// lirait « gratuit » et les ferait remonter en tête du comparateur.
//
//   node scripts/ardoise-semaine-1.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const LUNDI = '2026-10-12', DIMANCHE = '2026-10-18'
const TVA = 10
const ht = ttc => Math.round((ttc / (1 + TVA / 100)) * 10000) / 10000

// ── les matières qui manquent, avec un prix ESTIMÉ et dit comme tel ──
// Les repères viennent des devis Félix Potin / Gineys pour des produits
// voisins ; aucun n'est relevé sur une facture de CES produits.
const AJOUTS = [
  ['Cuisse de poulet (pièce)',        'pièce', 1.80, 'repère : filet de poulet rôti 7,99 €/kg'],
  ['Suprême de poulet (pièce)',       'pièce', 2.60, 'repère : filet de poulet rôti 7,99 €/kg'],
  ['Saucisse de Toulouse (kg)',       'kg',    9.50, 'repère : charcuterie Félix Potin'],
  ['Filet de poisson blanc (kg)',     'kg',   12.00, 'repère : marée, à confirmer au premier devis'],
  ['Pommes grenailles (kg)',          'kg',    2.20, 'repère : pommes de terre en rondelles'],
  ['Poireaux (kg)',                   'kg',    2.50, 'repère : légume frais, aucun fournisseur'],
  ['Échalotes (kg)',                  'kg',    3.20, 'repère : oignons rouges émincés'],
  ['Persil frais (botte)',            'botte', 1.20, 'repère : basilic frais'],
  ['Citron confit (kg)',              'kg',    7.00, 'repère : olives noires 7,67 €/kg'],
  ['Épices à tajine (kg)',            'kg',   18.00, 'repère : épices, aucun fournisseur'],
]

// ── le plat à créer ──
// ⚠️ « Gnocchis quatre fromages » existe au MÊME prix (16,50 €) mais ce n'est
// pas le même plat : quatre fromages ≠ crème de champignons. On crée, on ne
// renomme pas — renommer effacerait un plat de la carte.
const FORESTIERS = {
  nom: 'Gnocchis forestiers',
  description: 'Gnocchis, crème de champignons, parmesan, persillade, gratinés au four',
  ttc: 16.50, categorie: 'Plat',
  compo: [
    ['Gnocchis frais (kg)', 0.3, 'kg'],
    ['Champignons émincés (kg)', 0.12, 'kg'],
    ['Crème fraîche épaisse', 0.1, 'seau 1 L'],
    ['Parmesan (kg)', 0.02, 'kg'],
    ['Persil frais (botte)', 0.05, 'botte'],
  ],
}

// ── l'ardoise de brasserie ──
const BRASSERIE = [
  ['Burger Montagnard', 17.90],   // ⚠️ 15,90 € en base — hausse annoncée par le gérant
  ['Entrecôte grillée', 19.90],
  ['Gnocchis forestiers', 16.50],
  ['Camembert rôti', 18.90],
  ['Salade Chèvre chaud', 14.90],
]

// ── les cinq plats du jour ──
const JOURS = [
  ['2026-10-12', 'Cuisse de poulet façon tajine',
    'Cuisse de poulet confite, pommes grenailles aux épices, olives, citron confit & salade.',
    [['Cuisse de poulet (pièce)', 1, 'pièce'], ['Pommes grenailles (kg)', 0.18, 'kg'],
     ['Olives noires', 0.03, 'kg'], ['Citron confit (kg)', 0.02, 'kg'],
     ['Épices à tajine (kg)', 0.005, 'kg'], ['Salade mesclun (kg)', 0.03, 'kg'],
     ['Huile d’olive', 0.01, 'litre']]],
  ['2026-10-13', 'Suprême de poulet forestier',
    'Suprême de poulet, sauce crème aux champignons, pommes grenailles rôties & salade.',
    [['Suprême de poulet (pièce)', 1, 'pièce'], ['Champignons émincés (kg)', 0.1, 'kg'],
     ['Crème fraîche épaisse', 0.08, 'seau 1 L'], ['Pommes grenailles (kg)', 0.18, 'kg'],
     ['Salade mesclun (kg)', 0.03, 'kg']]],
  ['2026-10-14', 'Saucisse de Toulouse, jus à l’échalote',
    'Saucisse grillée, écrasé de pommes de terre, jus aux échalotes & salade verte.',
    [['Saucisse de Toulouse (kg)', 0.18, 'kg'], ['Pommes grenailles (kg)', 0.2, 'kg'],
     ['Échalotes (kg)', 0.04, 'kg'], ['Beurre doux', 0.02, 'kg'],
     ['Salade mesclun (kg)', 0.03, 'kg']]],
  ['2026-10-15', 'Gnocchis crémeux aux champignons',
    'Gnocchis, champignons poêlés, crème, parmesan & persillade, gratinés au four.',
    [['Gnocchis frais (kg)', 0.3, 'kg'], ['Champignons émincés (kg)', 0.12, 'kg'],
     ['Crème fraîche épaisse', 0.1, 'seau 1 L'], ['Parmesan (kg)', 0.02, 'kg'],
     ['Persil frais (botte)', 0.05, 'botte']]],
  ['2026-10-16', 'Filet de poisson rôti, beurre citronné',
    'Poisson du moment, pommes grenailles rôties, fondue de poireaux & beurre citronné.',
    [['Filet de poisson blanc (kg)', 0.16, 'kg'], ['Pommes grenailles (kg)', 0.18, 'kg'],
     ['Poireaux (kg)', 0.1, 'kg'], ['Beurre doux', 0.02, 'kg'],
     ['Citron (pièce)', 0.25, 'pièce']]],
]

const lire = async (t, s) => { let o = [], f = 0; for (;;) { const r = await sb(`${t}?select=${s}&order=id&offset=${f}&limit=1000`); o = o.concat(r); if (r.length < 1000) break; f += 1000 } return o }
const ing = await lire('ingredients', 'id,nom,unite,prix_achat_ht,actif')
const parIng = new Map(ing.map(i => [i.nom, i]))
const rec = await lire('recettes', 'id,nom,prix_vente_ht,tva,categorie,tag_destination,actif,etablissement_id')
const parRec = new Map(rec.map(r => [r.nom, r]))
const [resto] = await sb('etablissements?nom=eq.Restauration&select=id')
const [pdjProd] = await sb('recettes?nom=eq.Plat%20du%20jour&select=id')
const pizzas = rec.filter(r => r.actif && r.tag_destination === 'PIZZA' && r.categorie === 'Pizzeria')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ardoise du ${LUNDI} au ${DIMANCHE} ──\n`)
console.log(`   matières à créer : ${AJOUTS.filter(a => !parIng.has(a[0])).length} / ${AJOUTS.length}`)
for (const [nom, u, p, note] of AJOUTS)
  if (!parIng.has(nom)) console.log(`      + ${nom.padEnd(30)} ${String(p).padStart(6)} €/${u.padEnd(6)} ESTIMÉ — ${note}`)
console.log(`\n   plat à créer     : ${parRec.has(FORESTIERS.nom) ? 'déjà là' : FORESTIERS.nom + ' · ' + FORESTIERS.ttc + ' €'}`)
const bm = parRec.get('Burger Montagnard')
const bmTtc = bm ? Math.round(Number(bm.prix_vente_ht) * (1 + Number(bm.tva) / 100) * 100) / 100 : null
console.log(`   prix à corriger  : Burger Montagnard ${bmTtc} € → 17.90 €`)
console.log(`\n   ardoise          : ${BRASSERIE.length} plats de brasserie + ${pizzas.length} pizzas`)
console.log(`   plats du jour    : ${JOURS.length} (lundi → vendredi)`)
for (const [d, t] of JOURS) console.log(`      ${d}  ${t}`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── 1. les matières ──
for (const [nom, unite, prix, note] of AJOUTS) {
  if (parIng.has(nom)) continue
  const [m] = await sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom, unite, categorie: 'Restaurant', prix_achat_ht: prix,
    prix_estime: true, stocke: true, actif: true,
    fournisseur_principal: null,
    notes: `Prix ESTIMÉ au 04/10/2026 — ${note}. À remplacer par la première facture.`,
  }) }).catch(async () => sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom, unite, categorie: 'Restaurant', prix_achat_ht: prix,
    prix_estime: true, stocke: true, actif: true }) }))
  parIng.set(nom, m)
  console.log(`   + matière ${nom}`)
}

// ── 2. le plat ──
let forestiers = parRec.get(FORESTIERS.nom)
if (!forestiers) {
  const [r] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: FORESTIERS.nom, description: FORESTIERS.description, categorie: FORESTIERS.categorie,
    tag_destination: 'CUISINE', etablissement_id: resto?.id ?? null,
    prix_vente_ht: ht(FORESTIERS.ttc), tva: TVA, actif: true, vendable_online: false,
  }) })
  forestiers = r
  await sb('recette_ingredients', { method: 'POST', body: JSON.stringify(
    FORESTIERS.compo.map(([n, q, u]) => ({ recette_id: r.id, ingredient_id: parIng.get(n).id, quantite: q, unite: u })),
  ) })
  console.log(`   + plat ${FORESTIERS.nom} (${FORESTIERS.compo.length} ingrédients)`)
}

// ── 3. le prix du burger ──
if (bm && bmTtc !== 17.90) {
  await sb(`recettes?id=eq.${bm.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: ht(17.90) }) })
  console.log(`   ~ Burger Montagnard ${bmTtc} € → 17.90 €`)
}

// ── 4. l'ardoise ──
// ⚠️ ON REMPLACE LA SEMAINE : décocher doit retirer, sinon le réassort
// continue de commander pour un plat qu'on ne sert plus.
const voulus = [...BRASSERIE.map(([n]) => parRec.get(n)?.id ?? forestiers?.id), ...pizzas.map(p => p.id)]
  .filter(Boolean)
const dejaS = await sb(`plats_du_jour?select=id,recette_id&date_debut=eq.${LUNDI}&date_fin=eq.${DIMANCHE}`)
const presents = new Set(dejaS.map(x => x.recette_id))
const aPoser = voulus.filter(id => !presents.has(id))
const aRetirer = dejaS.filter(x => !voulus.includes(x.recette_id)).map(x => x.id)
if (aRetirer.length) await sb(`plats_du_jour?id=in.(${aRetirer.join(',')})`, { method: 'DELETE' })
if (aPoser.length) await sb('plats_du_jour', { method: 'POST', body: JSON.stringify(
  aPoser.map((recette_id, i) => ({ recette_id, date_debut: LUNDI, date_fin: DIMANCHE, ordre: i, actif: true })),
) })
console.log(`   ✓ ardoise : ${aPoser.length} posé(s), ${aRetirer.length} retiré(s)`)

// ── 5. les plats du jour ──
if (!pdjProd) { console.error('   ✗ produit « Plat du jour » introuvable'); process.exit(1) }
for (const [date, titre, , compo] of JOURS) {
  const [deja] = await sb(`plats_du_jour?select=id&recette_id=eq.${pdjProd.id}&date_debut=eq.${date}&date_fin=eq.${date}`)
  let id = deja?.id
  if (!id) {
    const [o] = await sb('plats_du_jour', { method: 'POST', body: JSON.stringify({
      recette_id: pdjProd.id, titre, date_debut: date, date_fin: date, actif: true }) })
    id = o.id
  } else {
    await sb(`plats_du_jour?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ titre }) })
  }
  await sb(`plat_du_jour_ingredients?plat_du_jour_id=eq.${id}`, { method: 'DELETE' })
  await sb('plat_du_jour_ingredients', { method: 'POST', body: JSON.stringify(
    compo.map(([n, q, u]) => ({ plat_du_jour_id: id, ingredient_id: parIng.get(n).id, quantite: q, unite: u })),
  ) })
  console.log(`   ✓ ${date}  ${titre} (${compo.length} ingrédients)`)
}
console.log('')
