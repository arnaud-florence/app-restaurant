#!/usr/bin/env node
// Pose les CIBLES et les SEUILS de stock des 191 références du réassort.
//
// ⚠️ LE STOCK EST À ZÉRO ET IL N'Y A PAS D'HISTORIQUE DE VENTE POUR LES
// TROIS QUARTS DE LA CARTE. Une cible ne peut donc pas être « calculée »
// partout. Ce script distingue explicitement TROIS ORIGINES, et le dit
// pour chaque ligne — une cible dont on ignore d'où elle vient serait
// relue dans six mois comme une mesure.
//
//   MESURÉ   ventes réelles observées (Fournil, 9 jours d'août 2026)
//   DÉRIVÉ   arithmétique des fiches techniques × une hypothèse de volume
//   PLANCHER la carte promet la référence : il en faut au moins une
//
// ⚠️ Les deux hypothèses de volume (couverts au déjeuner, pizzas au soir)
// sont les SEULS nombres inventés de tout le fichier. Elles sont isolées
// en tête, réglables en ligne de commande, et le script imprime ce que
// coûte la commande à plusieurs niveaux pour que le gérant tranche sur
// des euros plutôt que sur une intuition.
//
//   node scripts/cibles-stock.mjs [--ecrire] [--couverts=25] [--pizzas=30]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.'); process.exit(1) }

const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? Number(a.split('=')[1]) : null }
const ECRIRE = process.argv.includes('--ecrire')

// ─── LES HYPOTHÈSES, ET ELLES SEULES ────────────────────────────────────
//
// ⚠️ La brasserie et la pizzeria n'ont JAMAIS servi : aucun historique
// n'existe. Ces deux nombres sont des paris, pas des mesures.
// Repère de capacité : 8 pizzas par quart d'heure × 12 créneaux (19 h-22 h)
// = 96 pizzas possibles un soir. On part au tiers.
const COUVERTS_MIDI = arg('couverts') ?? 25   // brasserie, par service
const PIZZAS_SOIR   = arg('pizzas')   ?? 30   // pizzeria, par service

// ─── LES COUVERTURES, elles, sont des FAITS de livraison ────────────────
// Gineys livre souvent (surgelé, plusieurs fois par semaine) : 3 jours,
// la même valeur que /admin/commande-fournil.
// France Boissons ne livre QUE LE JEUDI : il faut tenir la semaine pleine,
// sinon le bar est à sec le mercredi soir et la livraison est à J+1.
const COUV_FOURNIL = 3
const COUV_BAR     = 7
const COUV_RESTO   = 7

const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}&order=id&offset=${d}&limit=1000`,
      { headers: { apikey: K, Authorization: 'Bearer ' + K } })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300))
    out.push(...j)
    if (j.length < 1000) break
  }
  return out
}

// ⚠️ `ingredients.fournisseur_principal` est un champ LIBRE : il porte
// tantôt un fournisseur, tantôt une note de méthode (« ESTIMATION … »,
// « Gineys — colis de 36 ramené à la pièce »), tantôt un nom du jeu de
// démo. Le lire tel quel affichait « ESTIMATION 21/09/2026 » comme
// premier fournisseur de la commande d'ouverture, pour 875 €.
const DEMO = new Set(['Metro France', 'Sysco France', 'Brake France', 'Transgourmet',
  'Pomona TerreAzur', 'Ferme du Plateau', 'Boucherie Bio', 'Boulangerie Coop',
  'Maraîcher du coin', 'Marée fraîche', 'Domaine Provence', 'Crémerie Local',
  'Épicerie fine', 'Gynes'])

function lireFournisseur(brut) {
  if (!brut) return { nom: null, estime: false }
  // ⚠️ Une ESTIMATION n'est pas un prix : elle n'a pas de fournisseur, et
  // le total qu'elle alimente doit être annoncé à part.
  if (/^ESTIMATION/i.test(brut)) return { nom: null, estime: true }
  const nom = brut.split(' — ')[0].trim()
  if (DEMO.has(nom)) return { nom: null, estime: false }
  return { nom, estime: false }
}

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// ⚠️ Une cible doit être ENTIÈRE : on ne commande pas 2,4 fûts. On arrondit
// TOUJOURS au-dessus — manquer coûte une vente et la réputation d'un
// village, le surplus d'une semaine se boit la suivante.
const haut = n => Math.max(1, Math.ceil(n - 1e-9))

// Pour une matière au poids (kg, litre), l'entier n'a pas de sens : on
// garde une décimale. 0,4 kg de safran est une cible parfaitement valable.
// Deux unités concordent si elles désignent la même base. Tout le reste
// — un colis face à une pièce, un seau face à une bouteille — se tranche
// sur /admin/tarifs-fournisseurs, pas ici.
const norme = u => {
  const t = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kilo', 'kilogramme'].includes(t)) return 'kg'
  if (['l', 'litre', 'litres'].includes(t)) return 'litre'
  if (['pce', 'pièce', 'piece', 'u', 'unité', 'unite'].includes(t)) return 'pièce'
  return t || '?'
}

const AU_POIDS = new Set(['kg', 'litre', 'l', 'g'])
const arrondi = (n, unite) =>
  AU_POIDS.has(String(unite || '').toLowerCase()) ? Math.ceil(n * 10) / 10 : haut(n)

async function main() {
  const [rec, ing, ri, cmd, art, inv, etabs, cat, fourn] = await Promise.all([
    T('recettes?select=id,nom,categorie,actif,tag_destination,etablissement_id,nom_matiere,libelle_achat,unites_par_achat,cout_achat_ht,stock_minimum,stock_cible,fournisseur_id'),
    T('ingredients?select=id,nom,unite,categorie,actif,stocke,prix_achat_ht,fournisseur_principal,stock_minimum,stock_cible'),
    T('recette_ingredients?select=recette_id,ingredient_id,quantite,unite'),
    T('commandes?select=id,created_at,statut'),
    T('commande_articles?select=commande_id,recette_id,quantite'),
    T('inventaires?select=cible_id,date_inventaire,quantite'),
    T('etablissements?select=id,nom'),
    T('catalogue_fournisseur?select=id,fournisseur_id,designation,prix_ht,unite,ingredient_id,nature,actif'),
    T('fournisseurs?select=id,nom'),
  ])

  const byI = new Map(ing.map(i => [i.id, i]))
  const byR = new Map(rec.map(r => [r.id, r]))
  const nomF = new Map(fourn.map(f => [f.id, f.nom]))
  const nomE = new Map(etabs.map(e => [e.id, e.nom]))

  // ── 1. LES VENTES RÉELLES ────────────────────────────────────────────
  const encaisse = new Set(cmd.filter(c => c.statut === 'encaisse').map(c => c.id))
  const joursVente = new Set(cmd.filter(c => encaisse.has(c.id)).map(c => c.created_at.slice(0, 10)))
  const NJ = joursVente.size
  const vendu = new Map()
  for (const a of art) {
    if (!encaisse.has(a.commande_id) || !a.recette_id) continue
    vendu.set(a.recette_id, (vendu.get(a.recette_id) || 0) + Number(a.quantite || 0))
  }

  // ── 2. CE QUI NE SE STOCKE PAS ───────────────────────────────────────
  //
  // ⚠️ Un plat ASSEMBLÉ n'a pas de stock : on stocke ses composants. Le
  // congélateur contient des pâtons, pas « La Marguerite » ; la cave
  // contient du cassis et du blanc, pas des kirs. Les compter ferait
  // commander deux fois la même marchandise — une fois sous le nom du
  // plat, une fois sous celui de l'ingrédient.
  // ⚠️ RECOPIE de `CATEGORIES_ASSEMBLEES` / `estStockable()` de
  // `src/lib/reassort.ts` (la source est en TS) — modifier les deux
  // ensemble, sinon l'écran et le script ne stockent pas les mêmes choses.
  const CAT_ASSEMBLEES = new Set([
    'Sandwich', 'Panini', 'Salade', 'Formule',            // déjà exclues (0133)
    'Pizzeria', 'Burger', 'Plat', 'Planche',              // brasserie et pizzeria
    'Grande salade', 'Menu', 'Formule petit-déjeuner',
    // ⚠️ Créée le 04/10/2026 (0167) et tombée aussitôt dans la commande
    // d'ouverture, sans prix : un plat assemblé ne se stocke pas.
    'Plat du jour',
  ])
  const estAssemble = r =>
    CAT_ASSEMBLEES.has(r.categorie) || String(r.nom).startsWith('Formule —')

  // ⚠️ Au bar, un produit sans `nom_matiere` mélange deux matières (Kir,
  // Spritz, Panaché…) : le rattacher à une seule perdrait l'autre, qui
  // sortirait du stock sans que rien ne le signale. Même règle que
  // `(ops)/inventaire`.
  const composite = r => r.tag_destination === 'BAR' && !r.nom_matiere

  // ── 3. LE BESOIN DÉRIVÉ DES FICHES TECHNIQUES ────────────────────────
  //
  // Chaque fiche donne la quantité pour UNE portion. Le besoin d'une
  // matière est la somme, sur tous les plats qui l'emploient, de cette
  // quantité multipliée par le nombre de portions attendues.
  const platsAFiche = new Map()
  for (const l of ri) {
    if (!platsAFiche.has(l.recette_id)) platsAFiche.set(l.recette_id, [])
    platsAFiche.get(l.recette_id).push(l)
  }
  const nPizzas = [...platsAFiche.keys()].filter(id => byR.get(id)?.tag_destination === 'PIZZA').length
  const nBrasserie = [...platsAFiche.keys()].filter(id => byR.get(id)?.tag_destination === 'CUISINE').length

  // ⚠️ Faute d'historique, les portions se RÉPARTISSENT UNIFORMÉMENT sur
  // la carte. C'est faux — la Marguerite se vendra plus que la Signature —
  // mais c'est la seule hypothèse neutre, et l'erreur se corrige d'elle-
  // même après deux semaines de ventes réelles. Une pondération inventée
  // aurait l'air d'un savoir.
  const besoinsParJour = (couverts, pizzas) => {
    const m = new Map()   // ingredient_id → quantité consommée par jour
    for (const [rid, lignes] of platsAFiche) {
      const p = byR.get(rid)
      if (!p || !p.actif) continue
      const portions =
        p.tag_destination === 'PIZZA'   ? pizzas / Math.max(1, nPizzas)
        : p.tag_destination === 'CUISINE' ? couverts / Math.max(1, nBrasserie)
        : 0
      if (!portions) continue
      for (const l of lignes) {
        m.set(l.ingredient_id, (m.get(l.ingredient_id) || 0) + Number(l.quantite) * portions)
      }
    }
    return m
  }
  const parJour = besoinsParJour(COUVERTS_MIDI, PIZZAS_SOIR)

  // ⚠️ La part restaurant ne varie PAS proportionnellement aux hypothèses :
  // chaque cible est arrondie au-dessus, et à faible volume cet arrondi
  // domine (0,3 kg de câpres et 3 kg de câpres se commandent tous deux au
  // kilo supérieur). Une règle de trois l'aurait sous-estimée. On recalcule.
  const coutScenario = (couverts, pizzas) => {
    let t = 0
    for (const [id, q] of besoinsParJour(couverts, pizzas)) {
      const m = byI.get(id)
      if (!m || !m.actif || m.prix_achat_ht == null) continue
      t += arrondi(q * COUV_RESTO, m.unite) * Number(m.prix_achat_ht)
    }
    return t
  }

  // ── 4. LE DERNIER COMPTAGE, S'IL DÉCRIT ENCORE QUELQUE CHOSE ─────────
  //
  // ⚠️⚠️ UN COMPTAGE VIEUX N'EST PAS UN STOCK. Le dernier inventaire date
  // du 24 août et la maison a fermé depuis : ces chiffres ne décrivent
  // plus rien. Les lire comme du stock fait commander un COMPLÉMENT là où
  // il faut tout reconstituer — et huit boissons (Coca, Fanta, Ice Tea,
  // Red Bull…) sortaient effectivement de la commande d'ouverture avec
  // « 28 en stock », dans un frigo vide.
  //
  // Même seuil que `PEREMPTION_COMPTAGE_JOURS` de src/lib/reassort.ts.
  // ⚠️ RECOPIE — modifier les deux ensemble.
  const PEREMPTION_JOURS = 30
  const maintenant = Date.now()
  const dernier = new Map()
  let perimes = 0
  for (const i of [...inv].sort((a, b) => (a.date_inventaire < b.date_inventaire ? 1 : -1))) {
    if (dernier.has(i.cible_id)) continue
    const age = (maintenant - new Date(i.date_inventaire + 'T00:00:00Z').getTime()) / 86_400_000
    if (age > PEREMPTION_JOURS) { perimes++; continue }
    dernier.set(i.cible_id, { q: Number(i.quantite), le: i.date_inventaire })
  }

  // ── 5. LES LIGNES ────────────────────────────────────────────────────
  const lignes = []
  const exclus = []

  // 5a. Produits vendus, REGROUPÉS par matière achetée.
  //
  // ⚠️ Le regroupement n'est pas cosmétique : « Demi pression » et
  // « Pinte pression » sortent du MÊME fût. Deux lignes, deux cibles,
  // et on commande le fût deux fois.
  const groupes = new Map()
  for (const r of rec) {
    if (!r.actif) continue
    if (estAssemble(r)) { exclus.push({ id: r.id, nom: r.nom, cible: r.stock_cible, motif: 'plat assemblé — on stocke ses composants' }); continue }
    if (composite(r))   { exclus.push({ id: r.id, nom: r.nom, cible: r.stock_cible, motif: 'mélange deux matières — non stockable' }); continue }
    const k = r.nom_matiere ?? r.libelle_achat ?? r.nom
    if (!groupes.has(k)) groupes.set(k, [])
    groupes.get(k).push(r)
  }

  for (const [nom, rs] of groupes) {
    const chef = rs.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    const parAchat = Number(chef.unites_par_achat ?? 1) || 1
    const coutUnite = chef.cout_achat_ht == null ? null : Number(chef.cout_achat_ht) * parAchat

    // ⚠️ Les ventes des produits du groupe s'ADDITIONNENT puis se divisent
    // par les unités tirées d'une unité achetée : 10 parts de flan vendues
    // = 1 flan à racheter (règle 0131).
    const vendues = rs.reduce((s, r) => s + (vendu.get(r.id) || 0), 0)
    const achatsJour = NJ > 0 ? (vendues / parAchat) / NJ : 0

    let origine, cible, seuil, note
    if (achatsJour > 0) {
      origine = 'MESURÉ'
      cible = haut(achatsJour * COUV_FOURNIL)
      seuil = Math.max(0, Math.floor(achatsJour * 1))      // un jour de sécurité
      note = `${(achatsJour * parAchat).toFixed(1)} vendu/j sur ${NJ} j observés`
    } else if (chef.tag_destination === 'BAR') {
      origine = 'PLANCHER'
      cible = 1
      seuil = 0
      note = 'aucune vente observée — le bar n’a jamais ouvert'
    } else {
      origine = 'PLANCHER'
      cible = 1
      seuil = 0
      note = 'à la carte, jamais vendu sur la fenêtre observée'
    }

    const d = dernier.get(chef.id)
    lignes.push({
      table: 'recettes', id: chef.id, nom,
      categorie: chef.categorie, etage: nomE.get(chef.etablissement_id) ?? null,
      unite: 'unité d’achat', origine, cible, seuil, note,
      // ⚠️⚠️ `fournisseur: null` ÉTAIT ÉCRIT EN DUR ICI, et ça faussait le
      // chiffre le plus important du script. La 0164 a ajouté
      // `recettes.fournisseur_id` précisément pour qu'un PRODUIT VENDU sache
      // chez qui il s'achète ; `reassort-donnees.ts` le lit depuis, pas ce
      // script. Résultat le 04/10/2026 : la commande d'ouverture annonçait
      // « 504 € BAR · 308 € FOURNIL · 27 € CUISINE — fournisseur à désigner »
      // alors que ZÉRO produit du bar était réellement sans fournisseur.
      // 1 020 € présentés comme non commandables, soit 37 % du total.
      // ⚠️ Deux lecteurs de la même question qui répondent différemment :
      // c'est celui qu'on lit en commandant qui fait la faute.
      cout: coutUnite, fournisseur: nomF.get(chef.fournisseur_id) ?? null,
      tag: chef.tag_destination,
      tenu: d ? d.q : null,
      ancien: { seuil: chef.stock_minimum, cible: chef.stock_cible },
      produits: rs.length,
    })
  }

  // 5b. Matières premières — celles déjà suivies, plus celles des fiches.
  //
  // ⚠️ Les 52 ingrédients des fiches pizza et brasserie sont à
  // `stocke = false` : ils étaient donc INVISIBLES du réassort, alors que
  // ce sont exactement les marchandises qu'il faut commander pour ouvrir.
  // Les plats, eux, y figuraient — c'est-à-dire l'inverse de ce qu'il faut.
  const aSuivre = new Set([...ing.filter(i => i.actif && i.stocke).map(i => i.id), ...parJour.keys()])

  for (const id of aSuivre) {
    const m = byI.get(id)
    if (!m || !m.actif) continue
    const besoinJour = parJour.get(id) || 0

    let origine, cible, seuil, note
    if (besoinJour > 0) {
      origine = 'DÉRIVÉ'
      cible = arrondi(besoinJour * COUV_RESTO, m.unite)
      seuil = Math.round(besoinJour * 2 * 100) / 100     // deux jours de sécurité
      note = `${besoinJour.toFixed(3)} ${m.unite}/j d’après les fiches techniques`
    } else {
      origine = 'PLANCHER'
      cible = arrondi(1, m.unite)
      seuil = 0
      note = 'matière suivie, aucune fiche technique ne la chiffre'
    }

    const d = dernier.get(id)
    lignes.push({
      table: 'ingredients', id, nom: m.nom,
      categorie: m.categorie, etage: null,
      unite: m.unite, origine, cible, seuil, note,
      cout: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht),
      ...(f => ({ fournisseur: f.nom, estime: f.estime }))(lireFournisseur(m.fournisseur_principal)),
      tenu: d ? d.q : null,
      ancien: { seuil: m.stock_minimum, cible: m.stock_cible },
      produits: 1,
      nouvelle: !m.stocke,
    })
  }

  // ── 6. LE MOINS CHER AILLEURS ────────────────────────────────────────
  const offres = new Map()
  for (const c of cat) {
    if (c.actif === false || c.ingredient_id == null || c.prix_ht == null) continue
    if (!offres.has(c.ingredient_id)) offres.set(c.ingredient_id, [])
    offres.get(c.ingredient_id).push({ f: nomF.get(c.fournisseur_id) ?? '?', prix: Number(c.prix_ht), unite: c.unite, designation: c.designation, nature: c.nature })
  }

  // ── 7. RESTITUTION ───────────────────────────────────────────────────
  console.log('\n══ CIBLES DE STOCK — CasaTasia ══\n')
  console.log(`Historique disponible : ${NJ} jours de vente réels (Fournil uniquement).`)
  console.log(`Hypothèses de volume  : ${COUVERTS_MIDI} couverts au déjeuner, ${PIZZAS_SOIR} pizzas au soir.`)
  console.log(`Couvertures           : Fournil ${COUV_FOURNIL} j · bar ${COUV_BAR} j · restaurant ${COUV_RESTO} j.`)
  console.log(`Comptages écartés     : ${perimes} (plus de ${PEREMPTION_JOURS} jours — la maison a fermé depuis).\n`)

  const parOrigine = {}
  for (const l of lignes) parOrigine[l.origine] = (parOrigine[l.origine] || 0) + 1
  console.log('Origine des cibles :')
  for (const [o, n] of Object.entries(parOrigine).sort()) console.log(`   ${String(n).padStart(3)}  ${o}`)
  console.log(`   ${String(exclus.length).padStart(3)}  EXCLU (ne se stocke pas)\n`)

  let mesure = 0, estime = 0
  const sansPrix = []
  const parFourn = new Map()
  for (const l of lignes) {
    const manque = Math.max(0, l.cible - (l.tenu ?? 0))
    l.aCommander = manque
    if (l.cout == null) { if (manque > 0) sansPrix.push(l.nom); continue }
    // Arrondi PAR LIGNE, comme `coutReassort()` de src/lib/reassort.ts :
    // sans ça l'écran et le script annoncent deux totaux à quelques
    // centimes l'un de l'autre, et on doute des deux.
    l.montant = Math.round(manque * l.cout * 100) / 100
    if (l.estime) estime += l.montant; else mesure += l.montant
    // ⚠️ « à désigner » tout court n'est pas exploitable : on ne sait pas à
    // qui écrire. On dit au moins de quel étage vient la marchandise.
    const f = l.fournisseur
      ?? (l.estime ? '— prix estimé, fournisseur à désigner'
        : `— fournisseur à désigner (${l.tag ?? l.etage ?? 'non rattaché'})`)
    parFourn.set(f, (parFourn.get(f) || 0) + l.montant)
  }

  console.log('══ LA COMMANDE D’OUVERTURE ══\n')
  console.log(`  ${lignes.filter(l => l.aCommander > 0).length} références à commander`)
  console.log(`  ${eur(mesure + estime)} HT au total, dont :`)
  console.log(`     ${eur(mesure).padStart(12)}  sur des prix RELEVÉS (factures, relevés fournisseurs)`)
  // ⚠️ Un prix estimé se présente à part. Fondu dans le total, il ferait
  // passer une hypothèse pour un devis — et c'est sur ce total qu'on
  // engage la trésorerie d'une ouverture.
  console.log(`     ${eur(estime).padStart(12)}  sur des ESTIMATIONS — à confirmer avant d’engager`)
  if (sansPrix.length) {
    console.log(`\n  ⚠️ ${sansPrix.length} référence(s) sans prix d’achat connu — NON chiffrées, jamais estimées :`)
    console.log(`     ${sansPrix.join(' · ')}`)
  }
  console.log('\n  par fournisseur :')
  for (const [f, m] of [...parFourn].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${eur(m).padStart(12)}   ${f}`)
  }

  console.log('\n══ MOINS CHER AILLEURS ══\n')
  let economies = 0
  const pistes = []
  const aVerifier = []
  for (const l of lignes) {
    if (l.table !== 'ingredients' || !l.aCommander || l.cout == null) continue
    const o = offres.get(l.id)
    if (!o) continue
    const best = o.slice().sort((a, b) => a.prix - b.prix)[0]
    // ⚠️⚠️ ON NE COMPARE QUE DES UNITÉS QUI CONCORDENT. Notre « Serviettes »
    // est un COLIS DE 3000 à 38,10 € ; le « PQ 200 SERV BLC » de Promocash
    // est un paquet de deux cents à 1,15 €. Rapprochés à l'aveugle, ils
    // annonçaient « −97 % » — un écart qui compare deux contenants. La
    // comparaison au prix de référence vit dans /admin/tarifs-fournisseurs,
    // qui sait lire les contenances ; ici on s'abstient dès qu'il y a doute.
    if (norme(l.unite) !== norme(best.unite)) {
      aVerifier.push({ nom: l.nom, nous: `${eur(l.cout)} / ${l.unite}`, eux: `${eur(best.prix)} / ${best.unite ?? '?'} chez ${best.f}` })
      continue
    }
    if (best.prix < l.cout * 0.95) {
      const gain = (l.cout - best.prix) * l.aCommander
      economies += gain
      pistes.push({ nom: l.nom, actuel: l.cout, best, gain, pct: (1 - best.prix / l.cout) * 100 })
    }
  }
  pistes.sort((a, b) => b.gain - a.gain)
  for (const p of pistes.slice(0, 15)) {
    console.log(`  ${('−' + p.pct.toFixed(0) + ' %').padStart(6)}  ${p.nom.padEnd(30)} ${eur(p.actuel).padStart(10)} → ${eur(p.best.prix).padStart(10)} chez ${p.best.f}  (${eur(p.gain)})`)
  }
  console.log(pistes.length
    ? `\n  ${pistes.length} piste(s) à unité concordante, ${eur(economies)} sur cette commande.`
    : '  Aucune offre moins chère à unité concordante.')
  if (aVerifier.length) {
    console.log(`\n  ⚠️ ${aVerifier.length} rapprochement(s) écartés — unités différentes, à trancher`)
    console.log('     sur /admin/tarifs-fournisseurs, qui sait lire les contenances :')
    for (const v of aVerifier.slice(0, 10)) console.log(`       ${v.nom.padEnd(28)} nous ${v.nous}  ·  eux ${v.eux}`)
  }

  // ── SENSIBILITÉ ──────────────────────────────────────────────────────
  //
  // Les deux hypothèses sont les seuls nombres inventés du fichier. Plutôt
  // que de demander au gérant de valider un chiffre abstrait, on lui montre
  // ce que chaque niveau COÛTE : une décision se prend sur des euros.
  console.log('\n══ CE QUE COÛTENT LES HYPOTHÈSES ══\n')
  console.log('  Seule la part restaurant + pizzeria en dépend. Le Fournil est mesuré,')
  console.log('  le bar est un plancher de carte : ni l’un ni l’autre ne bouge.\n')
  for (const [c, z] of [[15, 20], [25, 30], [40, 50], [60, 80]]) {
    const marque = c === COUVERTS_MIDI && z === PIZZAS_SOIR ? '  ← retenu' : ''
    console.log(`     ${String(c).padStart(3)} couverts · ${String(z).padStart(3)} pizzas  →  ${eur(coutScenario(c, z)).padStart(12)}${marque}`)
  }

  console.log('\n══ CE QUI EST RETIRÉ DU RÉASSORT ══\n')
  const parMotif = {}
  for (const e of exclus) (parMotif[e.motif] = parMotif[e.motif] || []).push(e.nom)
  for (const [m, l] of Object.entries(parMotif)) {
    console.log(`  ${l.length} — ${m}`)
    console.log(`     ${l.slice(0, 8).join(' · ')}${l.length > 8 ? ' …' : ''}`)
  }

  const nouvelles = lignes.filter(l => l.nouvelle)
  if (nouvelles.length) {
    console.log(`\n══ ${nouvelles.length} MATIÈRES QUI ENTRENT AU STOCK ══`)
    console.log('  (ingrédients des fiches pizza et brasserie, jusqu’ici invisibles)\n')
    console.log('     ' + nouvelles.map(l => l.nom).slice(0, 60).join(' · '))
  }

  // ── 8. ÉCRITURE ──────────────────────────────────────────────────────
  if (!ECRIRE) {
    console.log('\n\n── ESSAI À BLANC — rien n’a été écrit. ──')
    console.log('   Relancer avec --ecrire pour poser ces cibles.')
    console.log('   Régler les hypothèses : --couverts=N --pizzas=N\n')
    return
  }

  // ⚠️ La 0163 impose `cible >= seuil`. Un seul dépassement fait échouer sa
  // ligne en 23514, et comme on écrit en boucle, la moitié du réassort
  // serait posée et l'autre pas — un état mixte qu'on ne verrait qu'à
  // l'usage. On contrôle AVANT d'écrire, et on n'écrit rien si ça ne passe pas.
  const incoherentes = lignes.filter(l => l.cible < l.seuil)
  if (incoherentes.length) {
    console.log(`\n✗ ${incoherentes.length} ligne(s) avec cible < seuil — RIEN n'est écrit :`)
    for (const l of incoherentes) console.log(`    ${l.nom} : cible ${l.cible} < seuil ${l.seuil}`)
    process.exit(1)
  }

  // ⚠️ Une exécution ANTÉRIEURE a pu poser une cible sur un produit
  // devenu non stockable (les quatre formules du matin l'ont été). Laissée
  // en place, elle ne s'affiche plus nulle part mais reste vraie en base —
  // et le premier écran qui relira `stock_cible` sans la règle d'exclusion
  // recommandera des formules. On efface.
  const aEffacer = exclus.filter(e => e.cible != null)

  console.log('\n\n── ÉCRITURE ──\n')
  if (aEffacer.length) {
    for (const e of aEffacer) {
      await fetch(`${U}/rest/v1/recettes?id=eq.${e.id}`, {
        method: 'PATCH',
        headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ stock_minimum: null, stock_cible: null }),
      })
    }
    console.log(`  ✓ ${aEffacer.length} cible(s) effacée(s) sur des références devenues non stockables.`)
  }
  let n = 0
  for (const l of lignes) {
    const corps = l.table === 'ingredients'
      ? { stock_minimum: l.seuil, stock_cible: l.cible, ...(l.nouvelle ? { stocke: true } : {}) }
      : { stock_minimum: l.seuil, stock_cible: l.cible }
    const r = await fetch(`${U}/rest/v1/${l.table}?id=eq.${l.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(corps),
    })
    if (!r.ok) { console.log(`  ✗ ${l.nom} : ${(await r.text()).slice(0, 160)}`); continue }
    n++
  }
  console.log(`  ✓ ${n} cible(s) posée(s) sur ${lignes.length}.`)
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
