#!/usr/bin/env node
// Les jus Euro-Cash manquants à la caisse. Demande du gérant, 12/10/2026 :
// « tous les jus de Euro-Cash ne sont pas rentrés dans la caisse, jus ACE,
// jus de fraise etc, ajoute les ».
//
//   node scripts/jus-eurocash-1210.mjs [--ecrire]
//
// Essai à blanc par défaut.
//
// ⚠️⚠️ LE CATALOGUE EURO-CASH NE POUVAIT PAS SERVIR DE SOURCE. Ses 99 lignes
// « jus » sont des désignations TRONQUÉES par l'import : « Ace », « Fraise »,
// « Abricot Pêche » — sans marque, sans format, et « Fraise » apparaît SIX
// fois sous six références à six prix. Créer des boutons de caisse là-dessus
// aurait produit des produits que personne ne sait identifier au comptoir.
//
// ⚠️ ET AUCUN DOCUMENT EURO-CASH N'EST ENREGISTRÉ — ni facture ni BL, alors
// que la commande a été reçue. On ne sait donc pas FACTUELLEMENT quels
// parfums sont en réserve. C'est la vraie correction à faire : scanner ce
// bon de livraison remplirait le stock ET les coûts d'un coup.
//
// D'où le choix retenu : on CLONE la fiche « Jus d'orange 33 cl », qui porte
// déjà Euro-Cash comme fournisseur, le bon format, le bon prix et la bonne
// TVA. On ne recopie pas de mémoire ce qu'une fiche existante dit déjà.
//
// ⚠️ AUCUN COÛT D'ACHAT n'est posé. Le jus d'orange coûte 0,90 € et il serait
// tentant de le reporter : ce serait inventer un chiffre qui ressemblerait à
// un relevé. `recettes` n'a pas de drapeau `prix_estime` (0165) pour dire le
// contraire. Ils sortent en « coût inconnu » (0150), gris, et la première
// facture Euro-Cash les remplira.
//
// ⚠️ `POST /catalog/dishes` est l'upsert de la 0141 : on relit, on recopie,
// tableau NU, un seul appel. Aucun `id` envoyé sur une création — notre uuid
// part dans `remote_id`, ce qui rend la correspondance exacte dès le départ.

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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init,
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + t.slice(0, 250))
  try { return JSON.parse(t) } catch { return t }
}
const T = async p => { const o = []; for (let d = 0; d < 60_000; d += 1000) {
  const j = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`); o.push(...j); if (j.length < 1000) break } return o }
// ⚠️ UNE AIDE QUI AVALE LE CODE DE RETOUR REND LE DIAGNOSTIC IMPOSSIBLE.
// La première version levait « Zelty injoignable » après quatre essais, sans
// jamais dire si c'était un 429, un 500 ou une coupure réseau — alors que
// l'API répondait 200 en lecture à la même seconde. Elle DIT désormais ce
// qu'elle a vu à chaque tour, et l'attente croît vraiment (Zelty plafonne
// son débit, et la documentation ne le dit nulle part).
const zelty = async (path, init = {}) => {
  const vus = []
  for (let t = 0; t < 5; t++) {
    let r
    try { r = await fetch('https://api.zelty.fr/2.11' + path, { ...init,
      headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }) }
    catch (e) { vus.push('réseau: ' + e.message); await new Promise(s => setTimeout(s, 3000 * (t + 1))); continue }
    if (r.status === 429 || r.status >= 500) {
      const corps = (await r.text()).slice(0, 150)
      vus.push(r.status + (corps ? ' ' + corps : ''))
      const attente = 3000 * (t + 1) * (r.status === 429 ? 2 : 1)
      console.log(`    … ${init.method ?? 'GET'} ${path} → ${r.status}, nouvel essai dans ${attente / 1000} s`)
      await new Promise(s => setTimeout(s, attente)); continue
    }
    const txt = await r.text(); let b; try { b = JSON.parse(txt) } catch { b = txt }
    return { status: r.status, body: b }
  }
  throw new Error(`Zelty a refusé ${init.method ?? 'GET'} ${path} cinq fois — ` + vus.join(' | '))
}

// ═══════════════════════════════════════════════════════════════════════
const GABARIT = "Jus d'orange 33 cl"
// Les parfums nommés par le gérant (ACE, fraise) plus la gamme courante d'un
// cash & carry au même format. À corriger d'une ligne : c'est une liste, pas
// une déduction.
const PARFUMS = ['ACE', 'fraise', 'abricot', 'ananas', 'multifruits', 'pêche']
// ⚠️ L'ordre des cas compte, et une première version l'avait inversé :
// « ACE » commence par une voyelle, donc l'élision passait AVANT et sortait
// « Jus d'ACE ». Et « multifruits » s'accole sans article. Un nom de bouton
// se lit au comptoir, il ne se devine pas.
const SANS_ARTICLE = new Set(['ACE', 'multifruits'])
const nomDe = p => SANS_ARTICLE.has(p)        ? `Jus ${p} 33 cl`
                 : /^[aeiouéèh]/i.test(p)     ? `Jus d'${p} 33 cl`
                 :                              `Jus de ${p} 33 cl`
// ═══════════════════════════════════════════════════════════════════════

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

async function main() {
  const recs = await T('recettes?select=id,nom,categorie,tag_destination,etablissement_id,prix_vente_ht,prix_sur_place_ttc,tva,vendable_online,cout_achat_ht,fournisseur_id,actif')
  const g = recs.find(r => r.nom === GABARIT)
  if (!g) { console.error('✗ gabarit « ' + GABARIT + ' » introuvable'); process.exit(1) }

  const fournisseurs = Object.fromEntries((await T('fournisseurs?select=id,nom')).map(x => [x.id, x.nom]))
  const ttcEmporter = Number(g.prix_vente_ht) * (1 + Number(g.tva) / 100)

  console.log('\n╔══ GABARIT ' + '═'.repeat(60))
  console.log(`  ${g.nom} — ${eur(ttcEmporter)} à emporter · ${eur(Number(g.prix_sur_place_ttc))} sur place`)
  console.log(`  TVA ${g.tva} % · ${g.categorie} · ${g.tag_destination} · fournisseur ${fournisseurs[g.fournisseur_id] ?? '—'}`)
  console.log(`  en ligne : ${g.vendable_online ? 'oui' : 'non'}`)

  // ⚠️ UN PRODUIT PEUT EXISTER CHEZ NOUS SANS EXISTER EN CAISSE, et c'est
  // arrivé au premier passage : la base a été écrite, puis le réseau a lâché
  // avant le POST vers Zelty. Un script qui ne regarde que « le nom existe-
  // t-il ? » ne repassera jamais sur ces six-là, et ils resteraient
  // invisibles du comptoir sans que rien ne le signale. On regarde donc la
  // CORRESPONDANCE, pas seulement l'existence.
  const liensExistants = new Set((await T('correspondances_catalogue?select=recette_id&systeme=eq.zelty')).map(c => c.recette_id))
  const aCreer = [], aRattacher = [], deja = []
  for (const p of PARFUMS) {
    const nom = nomDe(p)
    const ex = recs.find(r => r.nom.toLowerCase() === nom.toLowerCase())
    if (!ex) { aCreer.push({ id: crypto.randomUUID(), nom, neuf: true }); continue }
    if (!liensExistants.has(ex.id)) { aRattacher.push({ id: ex.id, nom, neuf: false }); continue }
    deja.push(nom + (ex.actif ? ' (déjà en caisse)' : ' (en caisse mais DÉSACTIVÉ chez nous)'))
  }

  console.log('\n╔══ À CRÉER ' + '═'.repeat(60))
  for (const c of aCreer) console.log('  + ' + c.nom.padEnd(28) + eur(ttcEmporter) + ' à emporter · ' + eur(Number(g.prix_sur_place_ttc)) + ' sur place')
  for (const c of aRattacher) console.log('  ↻ ' + c.nom.padEnd(28) + 'existe chez nous, ABSENT de la caisse — à y pousser')
  if (deja.length) { console.log('\n  déjà au catalogue :'); for (const d of deja) console.log('    · ' + d) }
  console.log('\n  ⚠ aucun coût d’achat : ils sortiront en « coût inconnu », pas à zéro.')
  console.log('    La première facture Euro-Cash scannée les remplira.')

  if (!aCreer.length && !aRattacher.length) { console.log('\n  rien à faire.\n'); return }
  if (!ECRIRE) { console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n'); return }

  // ─── base ─────────────────────────────────────────────────────────────
  const lignes = [...aCreer, ...aRattacher]
  const neuves = aCreer.map(c => ({
    id: c.id, nom: c.nom, nom_caisse: c.nom,
    categorie: g.categorie, tag_destination: g.tag_destination,
    etablissement_id: g.etablissement_id,
    prix_vente_ht: Number(g.prix_vente_ht),
    prix_sur_place_ttc: g.prix_sur_place_ttc,
    tva: g.tva,
    vendable_online: g.vendable_online,
    fournisseur_id: g.fournisseur_id,     // Euro-Cash, lu sur le gabarit
    image_url: null,                      // plaque d’attente posée ensuite
    actif: true, type_revenu: 'vente', unites_par_achat: 1,
    allergenes_complementaires: [],
  }))
  if (neuves.length) {
    await sb('recettes', { method: 'POST', body: JSON.stringify(neuves) })
    console.log(`\n  ✓ base : ${neuves.length} produit(s) créé(s)`)
  }
  if (aRattacher.length) console.log(`  ↻ ${aRattacher.length} produit(s) déjà en base, à pousser en caisse`)

  // ─── caisse : on CLONE la fiche Zelty du gabarit ──────────────────────
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const zidG = Number((corr.find(c => c.recette_id === g.id) || {}).identifiant_externe)
  const plats = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
  if (plats.length < 100) { console.error(`✗ la caisse ne rend que ${plats.length} plats : LECTURE RATÉE.`); process.exit(1) }
  const modele = plats.find(p => Number(p.id) === zidG)
  if (!modele) { console.error('✗ le gabarit n’a pas de contrepartie en caisse — on s’arrête'); process.exit(1) }
  // ⚠️ `tax` (sur place) et `tax_takeaway` (emporter) sont RECOPIÉS du
  // gabarit, jamais recalculés : le taux sur place suit la LOI et pas le
  // panneau, et se tromper sous-déclare une boisson bue à table.
  for (const champ of ['name', 'price', 'tax']) if (modele[champ] == null) { console.error('✗ gabarit incomplet en caisse (' + champ + ') — refus'); process.exit(1) }
  console.log(`  gabarit en caisse #${modele.id} : price ${modele.price} · togo ${modele.price_togo} · tax ${modele.tax} · togo ${modele.tax_takeaway} · tags ${JSON.stringify(modele.tags)}`)

  const nouveaux = lignes.map(l => ({
    remote_id: l.id, name: l.nom,
    price: modele.price, price_togo: modele.price_togo,
    tax: modele.tax, tax_takeaway: modele.tax_takeaway,
    tags: modele.tags ?? [],
    // ⚠️ PAS de `id_fabrication_place` : envoyé sur une CRÉATION, Zelty
    // répond 500 « Erreur interne » — cinq fois de suite, charge identique.
    // Les deux pâtisseries créées une heure plus tôt sans ce champ sont
    // passées du premier coup. Le poste par défaut (0, le comptoir) est de
    // toute façon celui du Fournil ; il se pose après coup par
    // postes-production-zelty.mjs si besoin.
  }))
  const rep = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(nouveaux) })
  if (rep.status !== 200) { console.error('✗ caisse : ' + rep.status + ' ' + JSON.stringify(rep.body).slice(0, 400)); process.exit(1) }

  // ⚠️ les identifiants rendus sont enregistrés IMMÉDIATEMENT : sans ça un
  // second lancement recréerait toute la gamme en double.
  const apres = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
  const liens = []
  for (const l of lignes) {
    const p = apres.find(x => String(x.remote_id) === l.id)
    if (!p) { console.log('  ⚠ ' + l.nom + ' : aucun identifiant rendu par la caisse'); continue }
    liens.push({ systeme: 'zelty', identifiant_externe: String(p.id), recette_id: l.id, libelle_externe: l.nom })
  }
  if (liens.length) await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify(liens) })
  console.log(`  ✓ caisse : ${nouveaux.length} plat(s) créé(s), ${liens.length} lien(s) enregistré(s)\n`)
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
