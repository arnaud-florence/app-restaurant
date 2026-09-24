#!/usr/bin/env node
// Demande de tarif à Gel Var — la liste de CE QUI NOUS SERT.
//
// Gel Var a envoyé seize catalogues produits et un seul tarif (26 promos). Le
// devis est à venir. Plutôt que d'attendre un tarif de 1 619 lignes que
// personne ne lira, on lui envoie la liste de ce qu'on utilise vraiment —
// avec, en face, **le prix qu'on paie déjà ailleurs**.
//
// ⚠️ UN FOURNISSEUR QUI IGNORE CE QU'IL DOIT BATTRE propose son tarif public,
// et tout le monde y perd : lui l'affaire, nous le temps de comparer. C'est la
// leçon du tableau Euro-Cash, et elle vaut ici.
//
// ⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT. Le croisement propose, il ne
// décide pas : « Steak haché boucher Angus 150 g » et « Steak haché 15 % 120 g »
// partagent presque tous leurs mots sans être le même produit, et leurs prix
// au kilo n'ont aucune raison de se ressembler. Chaque ligne du tableau porte
// donc la désignation EXACTE du catalogue Gel Var — c'est le commercial qui
// chiffre ce qu'il lit, pas ce qu'on a deviné.
//
// Usage : node scripts/demande-tarif-gelvar.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs'

const RACINE = new URL('..', import.meta.url).pathname
const DOSSIER = `${RACINE}data/gelvar`
const env = Object.fromEntries(
  readFileSync(`${RACINE}.env.local`, 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const q = (p) => fetch(`${U}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } }).then(r => r.json())

// ─── 1. Le catalogue Gel Var ───────────────────────────────────────────────
//
// Format observé : « Désignation Colisage Référence ÉTAT », l'état valant
// SURGELÉ, FRAIS ou SEC.
//
// ⚠️ ON DÉCOUPE SUR LA FIN D'ARTICLE, ON NE CHERCHE PAS UN MOTIF GLOBAL.
// Une première version cherchait « désignation + colisage + référence + état »
// d'un seul tenant : la partie « désignation » absorbait alors la FIN de
// l'article précédent, référence comprise. Résultat, des lignes comme
// « Cheddar jeune rouge Bloc de 2,5kg 3105022 FRAIS Bacon rôti en tranches »
// portant la référence d'un troisième produit. Envoyé tel quel au commercial,
// il aurait chiffré autre chose que ce qu'on lit — et une référence fausse
// est pire qu'une référence absente, parce qu'on la croit.
//
// Le repère fiable est la FIN d'un article : « référence puis état ». On
// coupe là, et ce qui précède appartient à l'article courant.
const FIN_ARTICLE = /(\d{7,9})\s+(SURGELÉ|SURGELE|FRAIS|SEC)\b/g
const COLISAGE = /((?:Carton|Barquette|Sac|Boîte|Boite|Paquet|Sachet|Plaque|Poche|Pot|Bouteille|Seau|Colis|Filet|Bidon|Blister|Caisse|Bloc|La pièce|Pièce)[^0-9]{0,14}(?:de\s+)?[\d,.]+\s*(?:kg|g|L|ml|cl|unités?|pièces?|tranches?)?(?:\s*x\s*[\d,.]+\s*(?:kg|g|unités?|sachets?)?)?)\s*$/i

const NETTOYER = /(Photos? non contractuelles?\.?|Suggestions? de présentation\.?|LES PLUS|Collection)/gi

/** Le pied de page et les titres de rubrique ne sont pas des produits.
 *
 *  ⚠️ Le pied de page de Gel Var est composé en lettres ESPACÉES
 *  (« S I È G E  G E L V A R »), ce qui le rend méconnaissable pour un filtre
 *  par mot : il s'est retrouvé en désignation du premier article. Et les
 *  titres de rubrique en capitales (« CHARCUTERIES ESPAGNOLES ») se collent
 *  devant le nom du produit, parfois deux fois. */
function decor(texte) {
  const lettresSeules = (texte.match(/\b[A-Za-zÀ-ÿ]\b/g) || []).length
  const motsTotal = texte.split(/\s+/).length
  if (motsTotal > 8 && lettresSeules / motsTotal > 0.4) return true
  return /gelvar|avenue de madrid|standard 04|@gelvar/i.test(texte)
}

/** Retire les titres de rubrique et les phrases marketing collés devant la
 *  désignation : « CHARCUTERIES ESPAGNOLES Jambon cru Serrano », « SACS Sac
 *  croissant kraft », « Disponible en différentes dimensions Beurre doux ». */
const AMORCES = /^(Disponible en [^,;]{0,45}?(?=[A-ZÀ-Ÿ][a-zà-ÿ])|Existe en [^,;]{0,45}?(?=[A-ZÀ-Ÿ][a-zà-ÿ])|NOUVEAU\s+|NOUVEAUTÉ\s+)/i
function sansTitre(texte) {
  let t = texte.replace(AMORCES, '').trim()
  // Un titre de rubrique peut être répété deux fois de suite.
  t = t.replace(/^([A-ZÀ-Ÿ][A-ZÀ-Ÿ'’\s-]{5,40}?)\s+\1\s+/, '').trim()
  for (let i = 0; i < 4; i++) {
    const m = /^([A-ZÀ-Ÿ][A-ZÀ-Ÿ'’\s-]{2,40}?)\s+(?=[A-ZÀ-Ÿ][a-zà-ÿ])/.exec(t)
    if (!m) break
    t = t.slice(m[0].length).trim()
  }
  return t || texte
}

const articles = new Map()   // référence → { designation, colisage, etat, collection }
for (const f of readdirSync(DOSSIER).filter(x => x.endsWith('.pdf')).sort()) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(`${DOSSIER}/${f}`)), useSystemFonts: true }).promise
  let t = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    t += ' ' + tc.items.map(i => i.str).join(' ')
  }
  t = t.replace(NETTOYER, ' ').replace(/\s+/g, ' ').trim()
  const collection = f.replace('.pdf', '').replace(/^collection-/, '').replace(/-/g, ' ')

  let curseur = 0
  for (const m of t.matchAll(FIN_ARTICLE)) {
    const avant = t.slice(curseur, m.index).trim()
    curseur = m.index + m[0].length
    const ref = m[1]
    if (articles.has(ref) || !avant) continue

    const c = COLISAGE.exec(avant)
    if (!c) continue                      // sans colisage, on ne sait pas quoi chiffrer
    const designation = sansTitre(avant.slice(0, c.index).trim())
    // ⚠️ Une désignation qui contient encore une référence ou un état est un
    // résidu de l'article précédent : on l'écarte plutôt que de l'envoyer.
    if (!designation || designation.length < 4 || designation.length > 80) continue
    if (decor(designation)) continue
    if (/\d{7,9}/.test(designation) || /(SURGELÉ|SURGELE|FRAIS|SEC)\b/.test(designation)) continue

    articles.set(ref, {
      designation, colisage: c[1].trim(),
      etat: m[2].replace('SURGELE', 'SURGELÉ'), collection,
    })
  }
}
console.log(`catalogue Gel Var : ${articles.size} articles lisibles`)

// ─── 2. Ce que NOUS utilisons ──────────────────────────────────────────────
//
// Deux sources : les matières premières (`ingredients` — ce qui entre dans
// les fiches techniques) et les produits achetés-revendus (`recettes` avec un
// coût d'achat). Les deux disent ce qu'on commande vraiment.
// ⚠️ `ingredients` n'a pas de colonne `famille` mais `categorie`, et seules
// les matières ACTIVES nous intéressent : la table porte encore une centaine
// de lignes de démo du modèle restaurant.
const brutes = await q('ingredients?select=id,nom,unite,prix_achat_ht,categorie,stocke&actif=is.true&order=nom')
const liens = await q('recette_ingredients?select=ingredient_id&limit=10000')
const enFiche = new Set(liens.map(x => x.ingredient_id))

// ⚠️ `ingredients` porte encore une centaine de LIGNES DE DÉMO du modèle
// restaurant — « Tagliatelle / Metro France », « Œufs plein air / Ferme du
// Plateau », « Dioxyde de carbone ». Les envoyer à un fournisseur lui ferait
// chiffrer des produits qu'on n'achète pas, et nous ferait passer pour des
// gens qui ne savent pas ce qu'ils consomment.
//
// Le critère de VÉRITÉ : une matière est un vrai besoin si elle entre dans une
// fiche technique, ou si on la compte à l'inventaire. Les deux se lisent, ils
// ne se déclarent pas.
const ingredients = brutes.filter(i => enFiche.has(i.id) || i.stocke)

// ⚠️ Deux exclusions côté produits revendus : les ALCOOLS (Gel Var est un
// fournisseur de surgelés et d'épicerie, pas un caviste) et les libellés de
// FACTURE, qui ne veulent rien dire pour un autre fournisseur — « BAGUETTE
// CAMPESTRE MULTICEREALE 51CM 295G ARTIPAT C=25 » est le texte de Gineys, pas
// un besoin exprimable.
const ALCOOL = /whisky|vodka|gin\b|rhum|pastis|ricard|martini|suze|picon|porto|muscat|cognac|amaretto|baileys|limoncello|cointreau|tequila|biere|bière|vin\b|cremant|crémant|prosecco|spritz|kir|get 27|negrita|smirnoff|bacardi|gordon|lawson|jack daniel|alcool/i
const LIBELLE_FACTURE = /C=\d|ARTIPAT|\bPCE\b|\bCOL\b|[A-Z]{6,}\s+[A-Z]{4,}/

const tousRevendus = await q('recettes?select=nom,nom_matiere,libelle_achat,cout_achat_ht,categorie'
  + '&actif=is.true&cout_achat_ht=not.is.null&order=nom')
const revendus = tousRevendus.filter(r => {
  const l = r.nom_matiere || r.libelle_achat || r.nom
  return !ALCOOL.test(`${l} ${r.categorie ?? ''}`) && !LIBELLE_FACTURE.test(l)
})

console.log(`nos besoins : ${ingredients.length} matières réellement utilisées `
  + `(sur ${brutes.length} en base), ${revendus.length} produits achetés `
  + `(sur ${tousRevendus.length})`)

const MOTS_VIDES = new Set(['de','du','des','la','le','les','en','et','au','aux','pour','avec','sans','a','à','x','kg','g','l','ml','cl','cm','environ','env','unite','unites','unité','unités','piece','pieces','pièce','pièces','tranche','tranches'])
/** Mots significatifs, ramenés à une RACINE de 5 lettres.
 *
 *  ⚠️ Sans ça, « Emmental en tranches » et « Emmental tranché » n'ont qu'un
 *  mot commun et le rapprochement est rejeté — alors que c'est le même
 *  fromage. Le français décline trop (pluriels, participes, accords) pour
 *  qu'une comparaison mot à mot fonctionne. Cinq lettres suffisent à
 *  distinguer « tranche » de « truffe » sans confondre « tranché » et
 *  « tranches ». */
const mots = (s) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
  .filter(m => m.length > 2 && !MOTS_VIDES.has(m))
  .map(m => m.slice(0, 5))

/** Score de proximité : la COUVERTURE des mots de notre besoin, pas le simple
 *  nombre de mots communs. Même règle que /admin/correspondances — « Pain au
 *  chocolat » et « Cappuccino ou chocolat chaud » partagent autant de mots
 *  avec une ligne « PAIN AU CHOCOLAT » sans être le même produit. */
function score(besoin, candidat) {
  const a = mots(besoin), b = new Set(mots(candidat))
  if (a.length === 0) return 0
  const communs = a.filter(m => b.has(m)).length
  // ⚠️ UN SEUL MOT COMMUN NE SUFFIT PAS, même s'il couvre tout le besoin.
  // « Tomate » est couvert à 100 % par « Tartinade de tomate olive », et
  // « Bœuf pour carpaccio » par « Truffe été carpaccio PLANTIN » — deux
  // rapprochements ridicules qu'on aurait envoyés au commercial. Un besoin
  // d'un seul mot est trop court pour décider : on le laisse sans
  // correspondance, il ressortira dans la liste des questions.
  if (communs < 2) return 0
  return communs / a.length
}

// ─── 3. Le croisement ──────────────────────────────────────────────────────
const besoins = [
  ...ingredients.map(i => ({
    libelle: i.nom, famille: i.categorie ?? '', unite: i.unite,
    notrePrix: i.prix_achat_ht, origine: 'matière première',
  })),
  ...revendus.map(r => ({
    libelle: r.nom_matiere || r.libelle_achat || r.nom, famille: r.categorie ?? '',
    unite: 'unité vendue', notrePrix: r.cout_achat_ht, origine: 'produit revendu',
  })),
]

const retenus = new Map()   // référence → ligne du tableau
const sansEquivalent = []

for (const b of besoins) {
  let meilleur = null
  for (const [ref, a] of articles) {
    const s = score(b.libelle, `${a.designation} ${a.collection}`)
    if (s >= 0.6 && (!meilleur || s > meilleur.s)) meilleur = { ref, a, s }
  }
  if (!meilleur) { sansEquivalent.push(b); continue }
  const deja = retenus.get(meilleur.ref)
  // Un même article peut répondre à deux besoins : on garde le mieux noté et
  // on note les deux libellés, plutôt que d'écraser en silence.
  if (deja) { deja.pourquoi.add(b.libelle); continue }
  retenus.set(meilleur.ref, {
    ...meilleur.a, reference: meilleur.ref,
    pourquoi: new Set([b.libelle]),
    notrePrix: b.notrePrix, notreUnite: b.unite, origine: b.origine,
  })
}

console.log(`\n${retenus.size} article(s) Gel Var correspondent à un besoin identifié`)
console.log(`${sansEquivalent.length} besoin(s) sans équivalent au catalogue`)

// ─── 4. Le tableau ─────────────────────────────────────────────────────────
const csv = [
  ['Référence Gel Var', 'Désignation (catalogue Gel Var)', 'Colisage', 'État',
   'Collection', 'Pourquoi cet article nous intéresse', 'Ce que nous payons aujourd’hui',
   'Unité de notre prix', 'PRIX HT DEMANDÉ', 'Colisage proposé', 'Remarques Gel Var'],
]
for (const l of [...retenus.values()].sort((a, b) => a.collection.localeCompare(b.collection) || a.designation.localeCompare(b.designation))) {
  csv.push([
    l.reference, l.designation, l.colisage, l.etat, l.collection,
    [...l.pourquoi].join(' / '),
    // ⚠️ On n'écrit un prix QUE si on l'a vraiment. Une case vide dit « on
    // n'achète pas encore ça » ; un zéro dirait « gratuit ».
    l.notrePrix != null ? String(l.notrePrix).replace('.', ',') : '',
    l.notrePrix != null ? l.notreUnite : '',
    '', '', '',
  ])
}

// Ce qu'on achète et qu'on n'a pas trouvé : une QUESTION, pas un blanc. Sans
// cette liste, le commercial ignore que le besoin existe.
csv.push([])
csv.push(['— PRODUITS QUE NOUS ACHETONS ET QUE NOUS N’AVONS PAS TROUVÉS À VOTRE CATALOGUE —'])
csv.push(['Notre libellé', 'Ce que nous payons', 'Unité', 'Origine', '', '', '', '', 'AVEZ-VOUS L’ÉQUIVALENT ?'])
for (const b of sansEquivalent.filter(x => x.notrePrix != null).sort((a, b) => a.libelle.localeCompare(b.libelle))) {
  csv.push([b.libelle, String(b.notrePrix).replace('.', ','), b.unite, b.origine, '', '', '', '', ''])
}

const echapper = (v) => {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const sortie = `${RACINE}data/demande-tarif-gelvar-2026-09-24.csv`
writeFileSync(sortie, '﻿' + csv.map(l => l.map(echapper).join(';')).join('\n'), 'utf8')
console.log(`\n→ ${sortie}`)

console.log('\nRépartition par collection :')
const parCol = {}
for (const l of retenus.values()) parCol[l.collection] = (parCol[l.collection] ?? 0) + 1
Object.entries(parCol).sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log(`   ${String(n).padStart(3)}  ${c}`))
