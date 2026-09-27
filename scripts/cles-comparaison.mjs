// Poser les clés de comparaison qui manquaient.
//
//   node scripts/cles-comparaison.mjs [--ecrire]
//
// `cle_comparaison` est ce qui met deux fournisseurs face à face. Sans elle,
// une référence vit au catalogue sans jamais être confrontée à personne :
// 4 672 lignes, et seulement 24 face-à-face réels au 28/09/2026.
//
// ⚠️⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT (0151). Chaque paire ci-dessous a
// été regardée une par une, et chacune porte sa RAISON. Les paires ÉCARTÉES
// figurent aussi, avec leur motif : sans elles, dans six mois, on ne saura
// plus si une paire absente est un oubli ou une décision. La méthode
// automatique a été essayée et elle range « Roquette » sous « ROQUEFORT ».
//
// ⚠️⚠️ AJOUTER UNE LIGNE À UN GROUPE PEUT LE CASSER. `comparer()` exige que
// TOUTES les lignes du groupe tombent sur la même base : une conserve 5/1
// glissée dans un groupe au kilo rend le groupe ENTIER incomparable, et le
// face-à-face qui marchait disparaît sans un mot. Chaque ajout a donc été
// simulé avec la VRAIE `comparer()` avant d'être retenu — 24 face-à-face
// avant, 37 après, aucun perdu.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }

// ⚠️ PostgREST plafonne à 1 000 lignes SANS le dire, et sans tri sur une
// colonne UNIQUE la pagination saute et duplique (0162).
async function lireTout(chemin) {
  const out = []; const sep = chemin.includes('?') ? '&' : '?'
  for (let de = 0; de < 40000; de += 1000) {
    const r = await fetch(`${U}/rest/v1/${chemin}${sep}order=id&offset=${de}&limit=1000`, { headers: H })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    const lot = await r.json(); out.push(...lot); if (lot.length < 1000) break
  }
  return out
}

// ─── 1. DEUX NOMS POUR LE MÊME PRODUIT ────────────────────────────────
//
// Une clé qui ne porte qu'UNE ligne est invisible : `comparer()` écarte les
// groupes d'une seule ligne, « un groupe d'UNE ligne n'est pas une
// comparaison, c'est une entrée de catalogue » (0152). Deux noms pour la
// même chose, c'est donc deux invisibilités là où il y avait un face-à-face.
const FUSIONS = {
  // Le miel de fleurs de Gineys et celui de Félix Potin, séparés par un
  // simple adjectif. C'est le −45 % documenté depuis le 27/09 : il avait
  // disparu de l'écran sans que rien ne le signale.
  'Miel liquide':        'Miel',
  // La moutarde de Dijon Gyma face au tube Pauwels de La Frite Belge.
  'Sauce moutarde (kg)': 'Sauce moutarde',
  // Le 20 cl et le 33 cl du même jus : ce n'est pas un duel de
  // fournisseurs, c'est une comparaison de FORMAT chez Promocash — et
  // c'est le grand format qui gagne, ce qui ne se voyait pas.
  'Pago orange 20 cl':   'Pago orange',
  'Pago orange 33 cl':   'Pago orange',
  // ⚠️ « Pommes » désignait un JUS. C'est aussi le nom d'une de nos
  // matières (le fruit) : le jour où un maraîcher chiffre des pommes,
  // elles se seraient retrouvées face à du Pago.
  'Pommes':              'Pago pomme',
}

// ─── 2. LES LIGNES À RATTACHER ────────────────────────────────────────
//
// Visé par (fournisseur, désignation EXACTE). Une désignation peut porter
// deux lignes — celle de la facture et celle du portail — et c'est voulu :
// ce sont deux relevés du même article, tous deux légitimes.
const AJOUTS = [
  ['Gineys', 'POIVRON ROUGE & VERT EN LANIERE SAC=2.5KG', 'Poivrons en lanières (kg)',
    'même produit, même sac de 2,5 kg'],
  ['Gineys', 'CAPRE FINE AU VINAIGRE 4/4', 'Câpres (kg)',
    'même conserve 4/4 — deux 4/4 se comparent au prix de la boîte'],
  ['Gineys', 'OIGNON EMINCE C=4X2.5KG', 'Oignons jaunes émincés (kg)',
    'oignon jaune émincé, même travail'],
  ['Gineys', 'COURGETTE GRILLEE LAMELLE BQT=1KG', 'Courgettes grillées (kg)',
    'barquette de 1 kg des deux côtés'],
  ['Gineys', 'CERNEAU DE NOIX DU DAUPHINE INVALIDE ARLEQUIN SAC=1KG', 'Cerneaux de noix (kg)',
    'même calibre « invalide arlequin », sac de 1 kg'],
  ['Gineys', 'SQUEEZ SAUCE BARBECUE GYMA BTL=950G', 'Sauce barbecue',
    'quatrième fournisseur sur une sauce qu\'on achète — et le plus cher'],
  ['Gineys', 'SAUCE SUPREME BURGER GYMA SEAU=4.75KG', 'Sauce burger',
    'la MÊME sauce Gyma en seau : le gros contenant est ici plus cher au kilo que le squeeze, ce qui ne se devine pas'],
  ['Gineys', 'BURRATINA POT 125G C=6', 'Burrata 125 g (pièce)',
    'pot de 125 g, comme celui de la fiche pizza'],
  ['Gineys', 'STEAK HACHE PUR BŒUF ROND FACON BOUCHERE ANGUS 15%MG 150G C=3KG', 'Steak haché de bœuf 150 g (pièce)',
    'Angus, rond, façon bouchère, 150 g — le même steak que la fiche burger'],
  ['Gineys', 'ENTRECOTE TRANCHEE MATUREE SV 250G ENV C=5KG ENV', 'Entrecôte de bœuf (kg)',
    'maturée, tranchée, sous vide, portion voisine (250 g contre 220 g)'],
  ['Félix Potin Provence', 'HACHE BOEUF EGRENE 20% HALAL UE 1K', 'Viande hachée de bœuf (kg)',
    'bœuf égrené en sac d\'un kilo, 18 % contre 20 % de MG — la certification halal est écrite sur la ligne et se lit à l\'écran'],
  // Nouvelle clé : deux fournisseurs, aucun des deux n'était comparé.
  ['Félix Potin Provence', 'BUCHE CHEVRE 23% 1K TDF', 'Bûche de chèvre (kg)',
    'bûche d\'un kilo — à ne pas confondre avec « Bûchette de chèvre », qui est la portion de 180 g'],
  ['Gineys', 'BUCHE CHEVRE COUPE 1000G C=2', 'Bûche de chèvre (kg)',
    'bûche d\'un kilo, en face de celle de Félix Potin'],
]

// ─── 3. UNE CONTENANCE QUI DÉBLOQUE UN GROUPE ─────────────────────────
//
// `contenance_valeur` / `contenance_unite` existent pour qu'un HUMAIN
// tranche ce que l'extraction refuse de deviner (0151).
const CONTENANCES = [
  ['Félix Potin Provence', 'ROSETTE LYON 2X25TR 500G X8 T&T', 0.5, 'kg',
    // ⚠️ « 500G X8 » : barquette de 500 g vendue par 8. L'extraction se tait,
    // et elle a raison — « FEUILLETE COMTE 110GX40 » a le même air et le sens
    // inverse. Mais le prix est bien celui de la BARQUETTE (unité « BA »), et
    // 5,305 € / 0,5 kg = 10,61 €/kg tombe au centime près à côté de l'autre
    // rosette Félix Potin (10,85 €/kg). Sans cette contenance, cette ligne
    // n'avait AUCUN prix de référence et rendait tout le groupe « Rosette de
    // Lyon » incomparable : deux prix justes, et aucun verdict.
    'barquette de 500 g vendue par 8 ; prix à la barquette, cohérent au centime avec l\'autre rosette T&T'],
]

// ─── 4. CE QU'ON N'A PAS RATTACHÉ, ET POURQUOI ────────────────────────
//
// La moitié la plus utile du fichier. Une liste de ce qu'on a fait ne dit
// rien de ce qu'on a écarté ; six mois plus tard on ne sait plus si c'est
// un oubli ou une décision.
const ECARTEES = [
  ['Euro-Cash — Coca Cola, Pomme Pressée, Nectar Orange, Miel de Fleurs, Serviettes, Sacs sandwich, Kit couverts',
   '⚠️ LE PIÈGE CENTRAL : « base à confirmer » ou prix absent. Sans base, `prixReference()` est nul, et une ligne sans prix de référence rend TOUT SON GROUPE incomparable — on aurait détruit les face-à-face Coca, Perrier et Serviettes en croyant les enrichir.'],
  ['Euro-Cash — « Pepsi Zéro Cola Pepsi Cola Pepsi Cherry Cola », « Pomme, Cassis Thé Pêche », « Seven Up Mojito Seven Up cherry »',
   'désignations CONCATÉNÉES : plusieurs produits recollés sur une ligne par la mise en page. Poser une clé dessus, c\'est comparer contre un produit inconnu — et c\'est exactement le « Pepsi rangé sous Coca-Cola » annulé le 28/09.'],
  ['Gineys — OLIVE NOIRE DENOYAUTEE BTE=5/1',
   'format conserve contre un groupe au kilo : aurait cassé le face-à-face à −34 % qui fonctionne.'],
  ['Gineys — SAUCE PIZZA AROMATISEE 5KG MUTTI',
   'se ramène au kilo, alors que tout le groupe « Sauce pizza » est au format 5/1.'],
  ['Gineys — CAPRE A QUEUE BTE=850G',
   'câpres à queue, pas des câpres fines — et base au kilo contre un groupe au 4/4.'],
  ['Gineys — SAUCE BARBECUE MIEL BTL=950G',
   'barbecue au miel : une autre recette.'],
  ['Gineys — DUO DE POIVRON GRILLE EN LANIERE',
   'grillé, pas nature ; et aucun prix de référence.'],
  ['Gineys — OIGNON EMINCE PREFRIT BTE=5/1',
   'préfrit, donc un autre travail — et un autre format.'],
  ['Gineys — CERNEAU MOITIE EXTRA CLAIR / CERNEAU HACHE SPECIAL PAIN',
   'autres calibres : le prix du cerneau se fait sur le calibre.'],
  ['Félix Potin — CREME FRAICHE 15% LEGERE 5L',
   'déjà écarté par la 0151 : une crème à 15 % allégée n\'est pas une 30 % épaisse.'],
  ['Gineys — BURRATINA DI BUFALA 125G / BURRATINA POT 100G',
   'lait de bufflonne pour l\'une, autre format pour l\'autre.'],
  ['Félix Potin — MAXI FLAN CRU CHOCO D270',
   'au chocolat quand le nôtre est nature, et prix à la pièce contre un prix au colis.'],
  ['Félix Potin — FILET POULET HALAL UE IQF 190+',
   'cru IQF contre notre tranché rôti : le travail diffère, donc le prix au kilo aussi (même cas que « JAMBON CUIT SUP AC 8K »).'],
  ['Gineys — ROSETTE DE LYON PCE=2.5KG',
   'pièce entière à trancher, pas une barquette de tranches.'],
  ['Gineys — les autres emmentals râpés, lardons, beurres, sauces pizza',
   'même fournisseur que des lignes déjà dans le groupe : ça n\'ajoute aucun face-à-face et ça gonfle l\'amplitude affichée.'],
]

const N = s => (s ?? '').normalize('NFC')

const lignes = await lireTout('catalogue_fournisseur?actif=eq.true&select=id,fournisseur_id,designation,prix_ht,unite,cle_comparaison,contenance_valeur,contenance_unite,nature')
const fourns = await lireTout('fournisseurs?select=id,nom')
const nomF = new Map(fourns.map(f => [f.id, f.nom]))

const maj = []      // { id, champs, avant, quoi }
const refus = []

// 1. fusions
for (const l of lignes) {
  const cible = FUSIONS[l.cle_comparaison]
  if (!cible) continue
  maj.push({ id: l.id, champs: { cle_comparaison: cible },
    quoi: `« ${l.cle_comparaison} » → « ${cible} »  ·  ${nomF.get(l.fournisseur_id)} — ${l.designation}` })
}

// 2. ajouts
for (const [f, d, cle, raison] of AJOUTS) {
  const cibles = lignes.filter(l => nomF.get(l.fournisseur_id) === f && N(l.designation) === N(d))
  if (!cibles.length) { refus.push(`introuvable : ${f} — ${d}`); continue }
  for (const l of cibles) {
    // ⚠️ LE GARDE-FOU QUI COMPTE : une ligne sans prix, ou dont la base de
    // prix n'est pas tranchée, n'a pas de prix de référence — elle rendrait
    // son groupe entier incomparable. On REFUSE, on ne devine pas.
    if (l.prix_ht === null) { refus.push(`sans prix, écartée : ${f} — ${d}`); continue }
    if (l.unite === 'base à confirmer') { refus.push(`base de prix non tranchée, écartée : ${f} — ${d}`); continue }
    if (l.cle_comparaison === cle) continue
    maj.push({ id: l.id, champs: { cle_comparaison: cle },
      quoi: `« ${cle} » ← ${f} (${l.nature}) — ${l.designation}\n        ${raison}` })
  }
}

// 3. contenances
for (const [f, d, v, u, raison] of CONTENANCES) {
  const cibles = lignes.filter(l => nomF.get(l.fournisseur_id) === f && N(l.designation) === N(d))
  if (!cibles.length) { refus.push(`introuvable : ${f} — ${d}`); continue }
  for (const l of cibles) {
    if (Number(l.contenance_valeur) === v && l.contenance_unite === u) continue
    maj.push({ id: l.id, champs: { contenance_valeur: v, contenance_unite: u },
      quoi: `contenance ${v} ${u} ← ${f} — ${l.designation}\n        ${raison}` })
  }
}

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — ${lignes.length} lignes de catalogue actives\n`)
console.log(`── ${maj.length} écriture(s) ──\n`)
for (const m of maj) console.log('  •', m.quoi, '\n')
if (refus.length) { console.log(`── ${refus.length} refus ──`); for (const r of refus) console.log('  ⚠️', r); console.log() }

console.log(`── ${ECARTEES.length} familles ÉCARTÉES, volontairement ──\n`)
for (const [quoi, pourquoi] of ECARTEES) console.log(`  ✗ ${quoi}\n      ${pourquoi}\n`)

if (!ECRIRE) { console.log('Rien écrit. Relancer avec --ecrire.'); process.exit(0) }

let n = 0
for (const m of maj) {
  const r = await fetch(`${U}/rest/v1/catalogue_fournisseur?id=eq.${m.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(m.champs) })
  if (!r.ok) { console.error('✗', m.quoi, await r.text()); continue }
  n++
}
console.log(`✅ ${n} ligne(s) mises à jour.`)
