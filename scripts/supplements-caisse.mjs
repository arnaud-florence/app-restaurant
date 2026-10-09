#!/usr/bin/env node
// Les SUPPLÉMENTS d'ingrédients, poussés dans la caisse Zelty.
//
//   node scripts/supplements-caisse.mjs [--ecrire]
//
// Essai à blanc par défaut : il affiche la grille, les coûts et le food cost
// de chaque supplément, et ne touche à rien.
//
// ─── CE QUI SE JOUE ICI ──────────────────────────────────────────────────
//
// Un supplément est une VENTE À MARGE PURE : le client le demande, personne
// ne l'a prévu, et il s'ajoute à un ticket déjà payé. Mais il n'existe que
// si la caisse sait le taper — sinon le serveur l'offre, ou pire, le refuse.
//
// ⚠️⚠️ ON NE PROPOSE QUE CE QU'ON A EN RÉSERVE. Chaque supplément est adossé
// à une ligne d'`ingredients` portant `stocke = true` : le script REFUSE de
// construire une valeur dont la matière n'existe pas ou n'est pas suivie.
// Un supplément sans matière, c'est un client à qui on dit non après l'avoir
// encaissé — et une sortie de stock que le réassort ne verra jamais venir.
//
// ⚠️ Les ROQUEFORT et CHANTILLY demandés par le gérant sont dans A_COMMANDER,
// PAS dans la grille : aucun des deux n'est en stock aujourd'hui. Ils sont
// chiffrés avec leur fournisseur, et basculeront dans la grille le jour de la
// livraison — une ligne à déplacer, rien de plus.
//
// ─── LE DANGER, ET IL EST CONNU ──────────────────────────────────────────
//
// Rattacher une option à un plat passe par `POST /catalog/dishes`, qui est un
// UPSERT exigeant `name`, `price` et `tax` (0141). Un objet incomplet écrase
// le prix imprimé sur les tickets. Donc, exactement comme
// `zelty/disponibilite.ts` : on RELIT le catalogue à l'instant, on RECOPIE
// ces trois champs tels quels, on ne touche QUE `options`, et on REFUSE de
// construire s'il en manque un. On n'invente jamais un prix.
//
// ⚠️ `POST /catalog/options` et `POST /catalog/dishes` prennent un TABLEAU NU,
// jamais `{options: [...]}` — l'API répond alors 400 en réclamant des champs
// qu'on a pourtant envoyés, et on cherche le mauvais problème (vécu le 25/09).
// Tout part en UN SEUL appel par endpoint : Zelty plafonne son débit et rend
// 429 au cinquième appel à la file.
//
// ⚠️ Une relecture rendant moins de 100 plats est une LECTURE RATÉE, pas un
// catalogue vide : on s'arrête sans rien écrire.
//
// ─── LES PRIX ────────────────────────────────────────────────────────────
//
// Prix en CENTIMES TTC, comme les plats. Tous les plats concernés sont à
// 10 %, donc aucun écueil de taux ici.
//
// Les prix sont des PALIERS ronds (1,00 / 1,50 / 2,00 / 2,50 / 3,00 / 4,00),
// pas un coût × coefficient : un supplément à 1,37 € ne se lit pas sur une
// ardoise et ne se rend pas en monnaie. Le script affiche le food cost de
// chacun pour que le palier se vérifie — aucun n'est au-dessus de 32 %.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ZKEY = env.ZELTY_API_KEY
if (!U || !K)  { console.error('✗ Supabase manquant dans .env.local'); process.exit(1) }
if (!ZKEY)     { console.error('✗ ZELTY_API_KEY manquante'); process.exit(1) }

const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`,
      { headers: { apikey: K, Authorization: 'Bearer ' + K } })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error(p + ' → ' + JSON.stringify(j).slice(0, 200))
    out.push(...j); if (j.length < 1000) break
  }
  return out
}

const zelty = async (path, init = {}) => {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://api.zelty.fr/2.11' + path, {
      ...init,
      headers: { Authorization: `Bearer ${ZKEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (t + 1))); continue }
    const txt = await r.text()
    let body; try { body = JSON.parse(txt) } catch { body = txt }
    return { status: r.status, body }
  }
  throw new Error('Zelty injoignable : ' + path)
}

// ═══════════════════════════════════════════════════════════════════════
//  LA GRILLE
//
//  matiere  : le `nom` EXACT dans `ingredients` (le script refuse sinon)
//  portion  : exprimée dans l'UNITÉ DE LA MATIÈRE — la même convention que
//             `recette_ingredients`, donc aucune conversion, donc aucune
//             erreur de facteur mille (leçon du « SEL FIN SAC=25G »).
//  prix     : TTC en euros, palier rond.
//
//  Les portions sont celles des fiches techniques existantes, en général
//  ramenées à la portion de garniture d'un plat. Elles se corrigent à la
//  balance au premier service.
// ═══════════════════════════════════════════════════════════════════════

const PIZZA = [
  // fromages
  ['Mozzarella râpée',      'Mélange râpé mozzarella 60 % / emmental 40 %', 0.05,  1.50],
  ['Mozzarella cerise',     'Mozzarella cerise',                            0.05,  2.00],
  ['Parmesan',              'Parmesan (kg)',                                0.015, 1.50],
  ['Gorgonzola',            'Gorgonzola (kg)',                              0.04,  2.00],
  ['Chèvre',                'Bûchette de chèvre',                           0.33,  2.50],
  ['Feta',                  'Feta en dés',                                  0.04,  2.00],
  ['Reblochon',             'Reblochon (kg)',                               0.06,  3.00],
  ['Burrata',               'Burrata 125 g (pièce)',                        1,     4.50],
  ['Crème fraîche',         'Crème fraîche épaisse',                        0.05,  1.00],
  // charcuterie & viandes
  ['Jambon blanc',          'Jambon blanc tranché',                         0.04,  1.50],
  ['Jambon cru',            'Jambon cru tranché (kg)',                      0.03,  2.00],
  ['Coppa',                 'Coppa tranchée (kg)',                          0.03,  2.00],
  ['Chorizo',               'Chorizo tranché (kg)',                         0.04,  2.00],
  ['Lardons fumés',         'Lardons fumés (kg)',                           0.05,  1.50],
  ['Poulet rôti',           'Filet de poulet rôti',                         0.05,  2.00],
  ['Viande hachée',         'Viande hachée de bœuf (kg)',                   0.07,  2.50],
  ['Œuf',                   'Œuf (pièce)',                                  1,     1.50],
  // mer
  ['Saumon fumé',           'Saumon fumé tranché',                          0.04,  3.00],
  ['Crevettes',             'Crevettes décortiquées (kg)',                  0.04,  2.50],
  ['Thon',                  'Thon listao',                                  0.05,  1.50],
  ['Anchois — câpres',      'Câpres (kg)',                                  0.01,  1.00],
  // légumes & herbes
  ['Champignons frais',     'Champignons de Paris frais (kg)',              0.05,  1.00],
  ['Oignons rouges',        'Oignons rouges émincés (kg)',                  0.03,  1.00],
  ['Oignons confits',       'Oignons confits (kg)',                         0.03,  1.00],
  ['Poivrons',              'Poivrons en lanières (kg)',                    0.04,  1.00],
  ['Aubergines grillées',   'Aubergines grillées (kg)',                     0.04,  1.00],
  ['Courgettes grillées',   'Courgettes grillées (kg)',                     0.04,  1.50],
  ['Olives noires',         'Olives noires',                                0.02,  1.00],
  ['Tomates cerises',       'Tomates cerises (kg)',                         0.04,  1.00],
  ['Roquette',              'Roquette (kg)',                                0.02,  1.00],
  ['Cerneaux de noix',      'Cerneaux de noix (kg)',                        0.02,  1.00],
  ['Pesto',                 'Pesto alla genovese',                          0.015, 1.00],
  ['Miel',                  'Miel liquide',                                 0.015, 1.00],
  ['Huile pimentée',        'Huile pimentée (litre)',                       0.01,  0.50],
]

const PLAT = [
  ['Œuf au plat',           'Œuf (pièce)',                                  1,     1.50],
  ['Cheddar',               'Cheddar en tranches (kg)',                     0.03,  1.00],
  ['Emmental',              'Emmental en tranches',                         0.04,  1.00],
  ['Chèvre',                'Bûchette de chèvre',                           0.33,  2.50],
  ['Gorgonzola',            'Gorgonzola (kg)',                              0.04,  2.00],
  ['Reblochon',             'Reblochon (kg)',                               0.06,  3.00],
  ['Parmesan',              'Parmesan (kg)',                                0.015, 1.50],
  ['Bacon (lard fumé)',     'Lard fumé en tranches (kg)',                   0.03,  1.50],
  ['Lardons fumés',         'Lardons fumés (kg)',                           0.05,  1.50],
  ['Jambon cru',            'Jambon cru tranché (kg)',                      0.03,  2.00],
  ['Steak haché 150 g',     'Steak haché de bœuf 150 g (pièce)',            1,     4.50],
  ['Poulet rôti',           'Filet de poulet rôti',                         0.05,  2.00],
  ['Champignons poêlés',    'Champignons de Paris frais (kg)',              0.05,  1.00],
  ['Oignons confits',       'Oignons confits (kg)',                         0.03,  1.00],
  ['Roquette',              'Roquette (kg)',                                0.02,  1.00],
  ['Tomates cerises',       'Tomates cerises (kg)',                         0.04,  1.00],
  ['Portion de frites',     'Frites belges 12×12 (kg)',                     0.18,  2.50],
  // sauces — mêmes valeurs, même fenêtre : deux pop-ups par burger seraient
  // deux fois trop pour un comptoir en service.
  ['Sauce ketchup',         'Sauce ketchup',                                0.03,  0.50],
  ['Sauce mayonnaise',      'Sauce mayonnaise',                             0.03,  0.50],
  ['Sauce barbecue',        'Sauce barbecue',                               0.03,  0.50],
  ['Sauce burger',          'Sauce burger',                                 0.03,  0.50],
  ['Sauce moutarde',        'Sauce moutarde',                               0.03,  0.50],
  ['Sauce kebab',           'Sauce kebab',                                  0.03,  0.50],
  ['Aïoli',                 'Aïoli (kg)',                                   0.025, 0.50],
]

const DESSERT = [
  ['Boule de glace',        'Glace (boule)',                                1,     1.50],
  ['Nutella',               'Nutella (kg)',                                 0.03,  1.00],
  ['Cerneaux de noix',      'Cerneaux de noix (kg)',                        0.02,  1.00],
  ['Noix de coco râpée',    'Noix de coco râpée',                           0.01,  0.50],
  ['Miel',                  'Miel liquide',                                 0.015, 0.50],
  ['Coulis (sirop)',        'Sirop (litre)',                                0.02,  0.50],
  ['Banane',                'Banane (pièce)',                               1,     1.50],
  ['Crème de balsamique',   'Crème de balsamique (litre)',                  0.01,  0.50],
]

// ⚠️ DEMANDÉS PAR LE GÉRANT, PAS EN STOCK. Chiffrés, pas poussés.
const A_COMMANDER = [
  ['Roquefort',  'entrecôte, burger, salade', 'Félix Potin Provence',
   'ROQUEFORT AOP 31% LC BREBIS 1/2 1K35', '13,68 €/kg — soit 0,55 € les 40 g, à vendre 2,00 €'],
  ['Chantilly',  'coulant au chocolat, desserts', 'Félix Potin Provence',
   'CREME SUCREE S/PRESSION UHT AERO 32% 700ML DEBIC',
   '7,39 € la bombe de 700 ml — ~25 doses, soit 0,30 € la dose, à vendre 1,00 €'],
]

// Les groupes, et à quels plats ils se rattachent.
const GROUPES = [
  { cle: 'supp-pizza',   nom: 'Suppléments pizza',   valeurs: PIZZA,
    cible: r => r.tag_destination === 'PIZZA'   && r.categorie === 'Pizzeria' },
  { cle: 'supp-plat',    nom: 'Suppléments',         valeurs: PLAT,
    cible: r => r.tag_destination === 'CUISINE' &&
                ['Burger', 'Plat', 'Grande salade', 'Planche'].includes(r.categorie) },
  { cle: 'supp-dessert', nom: 'Suppléments dessert', valeurs: DESSERT,
    cible: r => r.tag_destination === 'CUISINE' && r.categorie === 'Dessert' },
]

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const pct = n => (n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'

async function main() {
  // ─── 1. les matières, et le refus de ce qui n'existe pas ──────────────
  const ings = await T('ingredients?select=id,nom,unite,prix_achat_ht,prix_estime,stocke,actif&actif=eq.true')
  const parNom = new Map(ings.map(i => [i.nom, i]))

  const refus = []
  let coutInconnu = 0
  const construit = []

  for (const g of GROUPES) {
    const valeurs = []
    for (const [nom, matiere, portion, prix] of g.valeurs) {
      const i = parNom.get(matiere)
      if (!i)        { refus.push(`${g.cle} / ${nom} : matière « ${matiere} » absente du catalogue`); continue }
      if (!i.stocke) { refus.push(`${g.cle} / ${nom} : « ${matiere} » n'est pas suivie en stock`);    continue }
      const cout = i.prix_achat_ht == null ? null : Number(i.prix_achat_ht) * portion
      if (cout == null) coutInconnu++
      valeurs.push({ nom, matiere, portion, unite: i.unite, prix, cout, estime: i.prix_estime !== false })
    }
    construit.push({ ...g, valeurs })
  }

  // ─── 2. la grille, à l'écran ──────────────────────────────────────────
  console.log('\n╔══ SUPPLÉMENTS — grille proposée ' + '═'.repeat(44))
  for (const g of construit) {
    console.log(`\n  ▸ ${g.nom}  (${g.valeurs.length} suppléments)`)
    console.log('    ' + 'supplément'.padEnd(22) + 'portion'.padStart(10) + '  ' +
                'unité'.padEnd(20) + 'coût'.padStart(8) + 'prix'.padStart(8) + '  f.cost')
    for (const v of g.valeurs) {
      const fc = v.cout == null ? '   —  ' : pct(v.cout / (v.prix / 1.10)).padStart(7)
      console.log('    ' + v.nom.padEnd(22) +
        String(v.portion).padStart(10) + '  ' + String(v.unite || '').padEnd(20) +
        (v.cout == null ? '     —' : eur(v.cout).padStart(8)) +
        eur(v.prix).padStart(8) + '  ' + fc + (v.estime ? '  (coût estimé)' : ''))
    }
  }

  if (refus.length) {
    console.log('\n  ⚠ ÉCARTÉS — la matière manque, donc le supplément n’existe pas :')
    for (const r of refus) console.log('    · ' + r)
  }

  console.log('\n  ⚠ DEMANDÉS MAIS PAS EN STOCK — chiffrés, PAS poussés en caisse :')
  for (const [nom, usage, fourn, ref, note] of A_COMMANDER)
    console.log(`    · ${nom} (${usage})\n      ${fourn} — ${ref}\n      ${note}`)

  // ─── 3. les plats visés ───────────────────────────────────────────────
  const recs = await T('recettes?select=id,nom,categorie,tag_destination,actif')
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const idCaisse = new Map(corr.map(c => [c.recette_id, String(c.identifiant_externe)]))

  console.log('\n╔══ PLATS VISÉS ' + '═'.repeat(62))
  const cibles = []            // { zeltyId, groupeCle, nomPlat }
  const sansLien = []
  for (const g of construit) {
    const plats = recs.filter(g.cible)
    const actifs = plats.filter(p => p.actif).length
    console.log(`\n  ▸ ${g.nom} → ${plats.length} plats (${actifs} actifs, ${plats.length - actifs} en pause)`)
    for (const p of plats) {
      const zid = idCaisse.get(p.id)
      if (!zid) { sansLien.push(`${p.nom} (${p.categorie})`); continue }
      cibles.push({ zeltyId: Number(zid), groupe: g.cle, nom: p.nom, actif: p.actif })
    }
    console.log('    ' + plats.map(p => p.nom + (p.actif ? '' : ' ⏸')).join(' · '))
  }
  if (sansLien.length) {
    console.log('\n  ⚠ Sans correspondance caisse — non rattachés (ils n’existent pas chez Zelty) :')
    for (const s of sansLien) console.log('    · ' + s)
  }

  if (!ECRIRE) {
    console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n')
    return
  }

  // ─── 4. les options, chez Zelty ───────────────────────────────────────
  console.log('\n╔══ ÉCRITURE ' + '═'.repeat(65))

  const avant = await zelty('/catalog/options?limit=0')
  if (avant.status !== 200) { console.error('✗ lecture des options : ' + avant.status); process.exit(1) }
  const dejaLa = new Map((avant.body.options || []).map(o => [o.remote_id, o]))
  console.log(`  options déjà en caisse : ${(avant.body.options || []).length}`)

  const charge = construit.map(g => {
    const existant = dejaLa.get(g.cle)
    const valeursEx = new Map(((existant?.values) || []).map(v => [v.remote_id, v]))
    return {
      ...(existant ? { id: existant.id } : {}),
      remote_id: g.cle,
      name: g.nom,
      min_choices: 0,                    // un supplément ne s'impose jamais
      max_choices: 6,
      pick_same_value: true,             // deux œufs, c'est deux œufs
      values: g.valeurs.map(v => {
        const cle = g.cle + '::' + v.nom
        const ex = valeursEx.get(cle)
        return {
          ...(ex ? { id: ex.id } : {}),
          remote_id: cle,
          name: v.nom,
          price: Math.round(v.prix * 100),   // centimes TTC
        }
      }),
    }
  })

  const po = await zelty('/catalog/options', { method: 'POST', body: JSON.stringify(charge) })
  if (po.status !== 200) {
    console.error('✗ POST /catalog/options → ' + po.status)
    console.error(JSON.stringify(po.body, null, 1).slice(0, 1500))
    process.exit(1)
  }
  console.log('  ✓ options écrites')

  const apres = await zelty('/catalog/options?limit=0')
  const idGroupe = new Map((apres.body.options || []).map(o => [o.remote_id, o.id]))
  for (const g of construit) {
    const id = idGroupe.get(g.cle)
    console.log(`    ${g.nom} → #${id ?? '???'} (${(apres.body.options || []).find(o => o.remote_id === g.cle)?.values?.length ?? 0} valeurs)`)
    if (!id) { console.error('✗ groupe « ' + g.cle + ' » introuvable après écriture — on s’arrête.'); process.exit(1) }
  }

  // ─── 5. rattachement aux plats, à la règle de la 0141 ─────────────────
  // ⚠️⚠️ `show_all=true` : sans lui l'API OMET les plats désactivés (192
  // contre 242 le 10/10/2026). Les 13 plats de brasserie en pause pour
  // l'ardoise n'auraient jamais reçu leurs suppléments — et personne ne
  // l'aurait vu, puisqu'ils ne sont pas à la carte cette semaine. Ils
  // seraient revenus sans suppléments, en silence.
  const gd = await zelty('/catalog/dishes?show_all=true&limit=0')
  const plats = gd.body.dishes || []
  if (plats.length < 100) {
    console.error(`✗ la caisse ne rend que ${plats.length} plats : c’est une LECTURE RATÉE, pas un catalogue vide. Rien n’est écrit.`)
    process.exit(1)
  }
  console.log(`\n  catalogue relu : ${plats.length} plats`)

  const parId = new Map(plats.map(p => [Number(p.id), p]))
  const majs = [], refusMaj = [], inchanges = []

  // un plat peut viser plusieurs groupes ; on agrège d'abord
  const voulu = new Map()
  for (const c of cibles) {
    const gid = idGroupe.get(c.groupe)
    if (!voulu.has(c.zeltyId)) voulu.set(c.zeltyId, { nom: c.nom, ids: new Set() })
    voulu.get(c.zeltyId).ids.add(gid)
  }

  for (const [zid, v] of voulu) {
    const p = parId.get(zid)
    if (!p) { refusMaj.push(`${v.nom} : #${zid} inconnu de la caisse`); continue }
    // Les trois champs obligatoires : recopiés, jamais inventés.
    if (!p.name || typeof p.name !== 'string')      { refusMaj.push(`${v.nom} : nom absent — refus`);  continue }
    if (p.price == null || !Number.isFinite(Number(p.price))) { refusMaj.push(`${v.nom} : prix absent — refus, un upsert l’écraserait`); continue }
    if (p.tax == null || !Number.isFinite(Number(p.tax)))     { refusMaj.push(`${v.nom} : TVA absente — refus`); continue }

    const actuelles = (p.options || []).map(o => Number(typeof o === 'object' ? o?.id : o)).filter(Number.isFinite)
    const cible = [...new Set([...actuelles, ...v.ids])]
    if (cible.length === actuelles.length && v.ids.size && [...v.ids].every(i => actuelles.includes(i))) {
      inchanges.push(v.nom); continue
    }
    majs.push({ id: Number(p.id), name: p.name, price: Number(p.price), tax: Number(p.tax), options: cible })
  }

  console.log(`  à rattacher : ${majs.length} · déjà bons : ${inchanges.length} · refusés : ${refusMaj.length}`)
  for (const r of refusMaj) console.log('    ⚠ ' + r)

  if (majs.length) {
    const pd = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(majs) })
    if (pd.status !== 200) {
      console.error('✗ POST /catalog/dishes → ' + pd.status)
      console.error(JSON.stringify(pd.body, null, 1).slice(0, 1500))
      process.exit(1)
    }
    console.log('  ✓ plats rattachés')
  }

  // ─── 6. contrôle ──────────────────────────────────────────────────────
  const verif = await zelty('/catalog/dishes?show_all=true&limit=0')
  const vp = verif.body.dishes || []
  let ok = 0, ko = []
  for (const [zid, v] of voulu) {
    const p = vp.find(x => Number(x.id) === zid)
    const has = (p?.options || []).map(o => Number(typeof o === 'object' ? o?.id : o))
    if ([...v.ids].every(i => has.includes(i))) ok++; else ko.push(v.nom)
  }
  console.log(`\n  CONTRÔLE : ${ok}/${voulu.size} plats portent bien leurs suppléments`)
  if (ko.length) console.log('    ✗ ' + ko.join(' · '))
  console.log('')
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
