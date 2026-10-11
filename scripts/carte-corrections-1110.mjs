#!/usr/bin/env node
// Corrections de carte demandées par le gérant le 11/10/2026.
//
//   node scripts/carte-corrections-1110.mjs [--ecrire]
//
// Essai à blanc par défaut.
//
// ⚠️⚠️ LE RETRAIT SE MÈNE DES DEUX CÔTÉS, CAISSE D'ABORD. `recettes.actif =
// false` chez nous ET `disable` en caisse. Poser `disable` seul ferait relire
// « produit inactif » par le miroir du catalogue, qui éteindrait notre fiche —
// le produit disparaîtrait sans que personne sache pourquoi (0141). La caisse
// est écrite AVANT : si elle refuse, on n'a rien désynchronisé.
//
// ⚠️ ON GARDE `nom_caisse`. C'est la règle du miroir (0130) : un produit
// désactivé exprès doit être RETROUVÉ par un ticket tardif, pas recréé en
// double. On ne l'efface QUE dans une FUSION, où deux fiches rivalisent.
//
// ⚠️ `POST /catalog/dishes` est l'upsert dangereux de la 0141 : on RELIT avec
// `show_all=true`, on recopie `name`/`price`/`tax` TELS QUELS, on ne touche
// que ce qu'on veut, on REFUSE de construire s'il en manque un, et tout part
// en TABLEAU NU — enveloppé, l'API répond 400 en réclamant des champs qu'elle
// n'a pas lus.
//
// ⚠️ `show_all=true` est obligatoire : sans lui l'API OMET les plats
// désactivés (192 rendus contre 242 réels le 10/10/2026).

import fs from 'node:fs'
import crypto from 'node:crypto'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const Z = env.ZELTY_API_KEY
if (!U || !K) { console.error('✗ Supabase manquant'); process.exit(1) }
if (!Z)       { console.error('✗ ZELTY_API_KEY manquante'); process.exit(1) }

const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...(init?.headers || {}) },
  })
  const t = await r.text()
  let j; try { j = JSON.parse(t) } catch { j = t }
  if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + String(t).slice(0, 300))
  return j
}
const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const j = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`)
    out.push(...j); if (j.length < 1000) break
  }
  return out
}
const zelty = async (path, init = {}) => {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://api.zelty.fr/2.11' + path, {
      ...init, headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (t + 1))); continue }
    const txt = await r.text()
    let body; try { body = JSON.parse(txt) } catch { body = txt }
    return { status: r.status, body }
  }
  throw new Error('Zelty injoignable : ' + path)
}

// ═══════════════════════════════════════════════════════════════════════
//  CE QUI EST DEMANDÉ
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ Chaque retrait porte sa RAISON : dans six mois, « pourquoi la madeleine
// n'est plus là » ne se retrouve nulle part ailleurs.
const RETRAITS = [
  ['Cappuccino ou chocolat chaud',                 'doublonne Cappuccino et Chocolat chaud, tous deux à 2,50 €'],
  ['Tarte aux pommes',                             'retirée de la carte'],
  ['Madeleine chocolat-noisette',                  'retirée de la carte'],
  ['Muffin chocolat-noisette',                     'retiré de la carte'],
  ['Muffin citron',                                'retiré de la carte'],
  ['Sacristain',                                   'retiré de la carte'],
  ['Cône vanille',                                 'glaces retirées'],
  ['Fusée',                                        'glaces retirées'],
  ['Mario',                                        'glaces retirées'],
  ['Sunroll',                                      'glaces retirées'],
  ['Coupe de glace (salle)',                       'glaces retirées'],
  ['Pizza à la plaque Margherita',                 'pizzas à la plaque retirées'],
  ['Pizza à la plaque jambon-fromage',             'pizzas à la plaque retirées'],
  ['Red Bull Ice',                                 'retiré de la carte'],
  ['Formule Tartine',                              'formules retirées'],
  ['Formule Petit-déjeuner complet',               'formules retirées'],
  ['Formule salade + boisson',                     'formules retirées'],
  ['Formule salade + boisson + dessert',           'formules retirées'],
  ['Formule sandwich ou panini + boisson',         'formules retirées'],
  ['Formule sandwich ou panini + boisson + dessert', 'formules retirées'],
  ['Formule — boisson',                            'composant de formule : plus de formule, plus de composant'],
  ['Formule — dessert',                            'composant de formule : plus de formule, plus de composant'],
  ['Formule — sandwich ou panini',                 'composant de formule : plus de formule, plus de composant'],
]

const PRIX = [
  ['Panuozzi', 5.90, 'décision du gérant, 11/10/2026'],
]

// ⚠️ LES DEUX PRIX SONT ANCRÉS SUR UN PRODUIT EXISTANT, pas inventés :
// l'éclair au café est le même produit que l'éclair au chocolat dans un autre
// parfum ; 3,80 € est le palier de la famille Pâtisserie (tropézienne,
// tartelette citron, flan, fondant y sont tous). À confirmer par le gérant.
//
// ⚠️ AUCUN COÛT D'ACHAT : ils n'ont jamais été facturés. Ils s'afficheront en
// « coût inconnu » (0150) — gris, pas vert. Un zéro se lirait « gratuit ».
const CREATIONS = [
  { nom: 'Éclair au café',              prixTtc: 3.60, allergenes: ['gluten'],
    pourquoi: 'aligné sur l’éclair au chocolat, même format' },
  { nom: 'Gâteau fraise fromage blanc', prixTtc: 3.80, allergenes: ['gluten', 'lait'],
    pourquoi: 'palier de la famille Pâtisserie' },
]

// ⚠️ NON APPLIQUÉ, ET C'EST DÉLIBÉRÉ. « Mettre la demi Affligem au même prix
// que la Poretti » : aucune Poretti n'existe — ni en produit, ni en matière,
// ni dans les 4 888 références des sept catalogues fournisseurs. La seule
// pression de la maison est le fût MORETTI, vendu « Demi pression » 2,80 €.
// À 2,80 €, le demi Affligem (fût à 1,483 €/demi, 60 % plus cher que le
// Moretti) tomberait à 0,85 € de marge et 64 % de food cost — sous le
// plancher du bar, qui est le coût de service (1,15 € à 15 consos/heure).
// Le bar paierait pour servir cette bière. À trancher par le gérant.
const EN_ATTENTE = 'Demi Affligem'

const MODELE = 'Éclair au chocolat'   // gabarit des créations
const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

async function main() {
  const recs = await T('recettes?select=id,nom,nom_caisse,categorie,tag_destination,etablissement_id,prix_vente_ht,prix_sur_place_ttc,tva,actif,vendable_online,image_url,cout_achat_ht')
  const parNom = new Map(recs.map(r => [r.nom, r]))
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const zid = new Map(corr.map(c => [c.recette_id, Number(c.identifiant_externe)]))
  const ttc = r => Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)

  // ─── 1. ce qui part ───────────────────────────────────────────────────
  const partent = [], introuvables = []
  for (const [nom, raison] of RETRAITS) {
    const r = parNom.get(nom)
    if (!r)       { introuvables.push(nom); continue }
    if (!r.actif) { continue }            // déjà retiré, rien à faire
    partent.push({ r, raison })
  }

  console.log('\n╔══ RETRAITS ' + '═'.repeat(64))
  for (const { r, raison } of partent)
    console.log('  − ' + r.nom.padEnd(42) + eur(ttc(r)).padStart(9) + '  ' + (r.categorie || '?').padEnd(24) + raison)
  if (introuvables.length) console.log('  ⚠ introuvables : ' + introuvables.join(' · '))

  // ─── 2. les prix ──────────────────────────────────────────────────────
  const majPrix = []
  console.log('\n╔══ PRIX ' + '═'.repeat(68))
  for (const [nom, cible, pourquoi] of PRIX) {
    const r = parNom.get(nom)
    if (!r) { console.log('  ⚠ ' + nom + ' introuvable'); continue }
    const ht = cible / (1 + Number(r.tva) / 100)
    console.log('  ' + nom.padEnd(42) + eur(ttc(r)) + ' → ' + eur(cible) + '   (' + pourquoi + ')')
    majPrix.push({ r, ttcCible: cible, ht })
  }

  // ─── 3. les créations ─────────────────────────────────────────────────
  const modele = parNom.get(MODELE)
  if (!modele) { console.error('✗ gabarit « ' + MODELE + ' » introuvable'); process.exit(1) }
  const aCreer = CREATIONS.filter(c => !parNom.has(c.nom))
  console.log('\n╔══ CRÉATIONS ' + '═'.repeat(63))
  for (const c of CREATIONS) {
    if (parNom.has(c.nom)) { console.log('  = ' + c.nom + ' existe déjà — rien à faire'); continue }
    console.log('  + ' + c.nom.padEnd(42) + eur(c.prixTtc).padStart(9) +
                '  Pâtisserie · TVA 5,5 %   (' + c.pourquoi + ')')
    console.log('      allergènes par définition : ' + c.allergenes.join(', ') +
                ' — NON validés, personne n’a lu l’emballage')
    console.log('      aucun coût d’achat : jamais facturés → « coût inconnu », pas zéro')
  }

  // ─── 4. ce qui n'est PAS fait ─────────────────────────────────────────
  const aff = parNom.get(EN_ATTENTE)
  console.log('\n╔══ NON APPLIQUÉ ' + '═'.repeat(60))
  console.log('  ' + EN_ATTENTE + ' — « au même prix que la Poretti »')
  console.log('    aucune Poretti en base, ni au catalogue d’aucun fournisseur.')
  if (aff) {
    // ⚠️ LA BIÈRE EST À 20 %, PAS À 10 %. Une première version divisait par
    // 1,10 et annonçait 1,06 € de marge au lieu de 0,85 € — l'écart décidait
    // dans l'autre sens. Le taux se LIT sur la fiche, il ne se suppose pas.
    const pression = parNom.get('Demi pression')
    const c = Number(aff.cout_achat_ht ?? 0)
    const tva = 1 + Number(aff.tva) / 100
    const ht = t => t / tva
    const margeP = pression ? Number(pression.prix_vente_ht) - Number(pression.cout_achat_ht ?? 0) : null
    console.log(`    TVA ${Number(aff.tva)} % (bière) · coût ${eur(c)} le demi — le fût Affligem coûte 60 % de plus que le Moretti`)
    console.log(`    aujourd’hui ${eur(ttc(aff))} : marge ${eur(Number(aff.prix_vente_ht) - c)}, food cost ${(c / Number(aff.prix_vente_ht) * 100).toFixed(0)} %`)
    console.log(`    à 2,80 € (le prix du demi pression) : marge ${eur(ht(2.80) - c)}, food cost ${(c / ht(2.80) * 100).toFixed(0)} %  ⚠ sous le coût de service (1,15 €)`)
    if (margeP != null) {
      const egale = Math.ceil((margeP + c) * tva * 20) / 20   // arrondi au 5 centimes supérieur
      console.log(`    à ${eur(egale)} : marge ${eur(ht(egale) - c)} — la MÊME qu’un demi pression, food cost ${(c / ht(egale) * 100).toFixed(0)} %`)
    }
  }

  // ─── 5. les conséquences, dites avant d'écrire ────────────────────────
  const restants = recs.filter(r => r.actif && !partent.some(p => p.r.id === r.id))
  const vides = {}
  for (const { r } of partent) {
    const k = r.tag_destination + ' / ' + r.categorie
    if (!restants.some(x => x.tag_destination + ' / ' + x.categorie === k)) vides[k] = true
  }
  console.log('\n╔══ CE QUE ÇA ENTRAÎNE ' + '═'.repeat(54))
  console.log('  familles VIDÉES (groupes de boutons sans rien dedans en caisse) :')
  for (const k of Object.keys(vides)) console.log('    · ' + k)
  console.log('  « PLAQUE PIZZA CRUE » n’est plus portée par aucun produit actif')
  console.log('    → la matière sort du réassort, ce qui est juste : on ne la vend plus')
  console.log('  le supplément dessert « Boule de glace » n’a plus de produit derrière')
  console.log('    → à retirer de scripts/supplements-caisse.mjs')
  console.log('  `AFFICHES` de test-carte-fournil.mjs porte le Panuozzi à 4,50 €')
  console.log('    → à mettre à jour EN MÊME TEMPS que le prix, jamais après coup')
  console.log(`\n  catalogue actif : ${recs.filter(r => r.actif).length} → ${restants.length + aCreer.length}`)

  if (!ECRIRE) { console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n'); return }

  // ═══════════════════════════════════════════════════════════════════
  //  ÉCRITURE — la caisse d'abord
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n╔══ ÉCRITURE ' + '═'.repeat(64))

  const gd = await zelty('/catalog/dishes?show_all=true&limit=0')
  const plats = gd.body.dishes || []
  if (plats.length < 100) {
    console.error(`✗ la caisse ne rend que ${plats.length} plats : LECTURE RATÉE, pas un catalogue vide. Rien n’est écrit.`)
    process.exit(1)
  }
  console.log(`  catalogue relu : ${plats.length} plats`)
  const parZid = new Map(plats.map(p => [Number(p.id), p]))

  // recopie des champs obligatoires — jamais inventés
  const obligatoires = (p, quoi) => {
    if (!p.name || typeof p.name !== 'string') throw new Error(quoi + ' : nom absent — refus')
    if (p.price == null || !Number.isFinite(Number(p.price))) throw new Error(quoi + ' : prix absent — refus, un upsert l’écraserait')
    if (p.tax == null || !Number.isFinite(Number(p.tax))) throw new Error(quoi + ' : TVA absente — refus')
    return { id: Number(p.id), name: p.name, price: Number(p.price), tax: Number(p.tax) }
  }

  const charge = []
  const sansCaisse = []
  for (const { r } of partent) {
    const p = parZid.get(zid.get(r.id))
    if (!p) { sansCaisse.push(r.nom); continue }
    if (p.disable === true) continue
    charge.push({ ...obligatoires(p, r.nom), disable: true })
  }
  for (const { r, ttcCible } of majPrix) {
    const p = parZid.get(zid.get(r.id))
    if (!p) { sansCaisse.push(r.nom); continue }
    const base = obligatoires(p, r.nom)
    // price = sur place, price_togo = emporter. Le Fournil vend à emporter :
    // les deux bougent, sinon le ticket du comptoir garderait l’ancien prix.
    charge.push({ ...base, price: Math.round(ttcCible * 100), price_togo: Math.round(ttcCible * 100) })
  }
  if (sansCaisse.length) console.log('  ⚠ sans contrepartie caisse : ' + sansCaisse.join(' · '))

  if (charge.length) {
    const rep = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(charge) })
    if (rep.status !== 200) { console.error('✗ caisse : ' + rep.status + ' ' + JSON.stringify(rep.body).slice(0, 400)); process.exit(1) }
    console.log(`  ✓ caisse : ${charge.length} plat(s) mis à jour`)
  }

  // ─── notre base ───────────────────────────────────────────────────────
  for (const { r } of partent) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ actif: false }) })
  console.log(`  ✓ base : ${partent.length} produit(s) désactivé(s)`)
  for (const { r, ht } of majPrix) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: Number(ht.toFixed(4)) }) })
  if (majPrix.length) console.log(`  ✓ base : ${majPrix.length} prix mis à jour`)

  // ─── les créations ────────────────────────────────────────────────────
  if (aCreer.length) {
    const tagsZ = (await zelty('/catalog/tags?limit=0')).body.tags || []
    const tagPatisserie = tagsZ.find(t => t.name === 'Pâtisserie' || t.remote_id === 'Pâtisserie')
    if (!tagPatisserie) { console.error('✗ famille « Pâtisserie » introuvable en caisse — on s’arrête'); process.exit(1) }

    const lignes = aCreer.map(c => ({
      id: crypto.randomUUID(),
      nom: c.nom,
      nom_caisse: c.nom,
      categorie: 'Pâtisserie',
      tag_destination: 'FOURNIL',
      etablissement_id: modele.etablissement_id,
      prix_vente_ht: Number((c.prixTtc / 1.055).toFixed(4)),
      tva: 5.5,
      vendable_online: true,
      // ⚠️ pas d’image → invisible du site (il exige famille ET photo).
      // Une plaque typographique sera posée par generer-visuels-sans-photo.
      image_url: null,
      actif: true,
      type_revenu: 'vente',
      allergenes_complementaires: c.allergenes,  // ⚠️ NON validés : voir 0138
      unites_par_achat: 1,
    }))
    await sb('recettes', { method: 'POST', body: JSON.stringify(lignes) })
    console.log(`  ✓ base : ${lignes.length} produit(s) créé(s)`)

    // ⚠️ AUCUN `id` n’est envoyé à Zelty : un id inconnu fait échouer l’appel,
    // un id réutilisé écrase un plat existant. Notre uuid part dans
    // `remote_id` — c’est ce qui rend la correspondance exacte dès le premier
    // jour, sans jamais rapprocher par le nom.
    const nouveaux = lignes.map(l => ({
      remote_id: l.id,
      name: l.nom,
      price: Math.round(l.prix_vente_ht * 1.055 * 100),       // TTC centimes
      price_togo: Math.round(l.prix_vente_ht * 1.055 * 100),
      tax: 1000,            // ⚠️ MILLIÈMES. Sur place : la LOI dit 10 %,
      tax_takeaway: 550,    // à emporter : 5,5 %. Recopier 5,5 % des deux
      tags: [tagPatisserie.id],   // côtés sous-déclarerait un gâteau mangé à table.
    }))
    const rc = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(nouveaux) })
    if (rc.status !== 200) { console.error('✗ caisse (créations) : ' + rc.status + ' ' + JSON.stringify(rc.body).slice(0, 400)); process.exit(1) }

    // ⚠️ Les identifiants rendus par Zelty sont enregistrés IMMÉDIATEMENT :
    // sans ça un second lancement recréerait les produits en double.
    const apres = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
    const liens = []
    for (const l of lignes) {
      const p = apres.find(x => String(x.remote_id) === l.id)
      if (!p) { console.log('  ⚠ ' + l.nom + ' : pas d’identifiant rendu par la caisse'); continue }
      liens.push({ systeme: 'zelty', identifiant_externe: String(p.id), recette_id: l.id, libelle_externe: l.nom })
    }
    if (liens.length) {
      await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify(liens) })
      console.log(`  ✓ caisse : ${liens.length} plat(s) créé(s), ${liens.length} lien(s) enregistré(s)`)
    }
  }
  console.log('')
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
