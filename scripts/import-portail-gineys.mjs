// Le catalogue du portail Gineys entre dans l'outil.
//
//   node scripts/import-portail-gineys.mjs [--ecrire]
//
// Source : `commande.gineys.com` (Infologic « Copilote »), relevé à la main
// depuis le compte CASATASIA — 92 « Mes articles », 2 892 références au
// catalogue, 265 en promotion. Les fichiers vivent dans `data/gineys/`,
// GITIGNORÉ : ce sont des conditions négociées et le dépôt est public.
//
// ⚠️ CES PRIX SONT NOS PRIX NÉGOCIÉS, ET C'EST VÉRIFIÉ. Les 92 « Mes
// articles » ont été confrontés un par un aux prix réellement facturés :
// 47 des 64 rapprochements concordent AU CENTIME. Le portail est donc plus
// FRAIS que nos factures d'août — mais il reste un tarif affiché, pas une
// preuve de paiement, d'où `nature = 'portail'`.
//
// ⚠️ ON N'AFFIRME PAS « NON REMISÉ ». Pour les 2 800 articles qu'on n'achète
// pas, on ignore si le prix porte notre remise. `tarif_negocie` reste NULL —
// et c'est NULL qui déclenchera la demande de remise au fournisseur. Même
// discipline que « rien déclaré » ≠ « aucun allergène » (0138).
//
// ⚠️ UN PRIX « N.C. » RESTE NULL, JAMAIS 0. Vingt-cinq articles sont à prix
// sur demande. Un zéro les ferait remonter en tête du comparateur comme les
// moins chers du catalogue — la faute de `statutFoodCost(0)` (0150).
//
// ⚠️ Rien n'est écrit dans `ingredients.prix_achat_ht` : un tarif n'est pas
// un prix payé (0151). Cette règle tient même ici, où le tarif s'est révélé
// exact — parce que la prochaine fois, il pourrait ne plus l'être.

import fs from 'node:fs'
import { UNITE, REFERENCE, conditionnement, contenance, norme } from './_tarifs-communs.mjs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=minimal', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const DOSSIER = 'data/gineys'
const lire = f => {
  const p = `${DOSSIER}/${f}`
  if (!fs.existsSync(p)) {
    console.error(`\n✗ ${p} absent. Le relevé du portail est gitignoré : il doit être refait sur le poste.\n`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const mesArticles = lire('gineys-mes-articles.json')
const catalogue   = lire('gineys-catalogue-v2.json')
const achetes = new Set(mesArticles.map(a => a.code))

// Le catalogue contient TOUT, « Mes articles » compris : on part de lui et
// on complète avec ce que seul le relevé « Mes articles » aurait vu.
const parCode = new Map(catalogue.map(a => [a.code, a]))
for (const a of mesArticles) if (!parCode.has(a.code)) parCode.set(a.code, a)

/**
 * Le multiplicateur du prix vers le COLIS.
 *
 * ⚠️ Il ne vaut PAS toujours le nombre lu dans le colisage. « 27.410 € / Col »
 * avec « 30 PI / Col » : le colis coûte déjà 27,41 €, le multiplier par 30
 * afficherait un carton de pain à 822 €. On ne multiplie que si l'unité
 * INTERNE du colisage est celle du prix — et on ne conclut rien sinon.
 */
const ALIAS = { PI: 'PCE', PCE: 'PCE', PIECE: 'PCE', RLX: 'ROULEAU', BID: 'BIDON',
  PLT: 'PLATEAU', BTL: 'BOUTEIL', BOUTEIL: 'BOUTEIL', BQT: 'BQT', SEAU: 'SEAU',
  SAC: 'SAC', BTE: 'BTE', COL: 'COL', BAC: 'BAC', POCHE: 'POCHE' }
const cle = s => ALIAS[norme(String(s ?? ''))] ?? norme(String(s ?? ''))

function colisQuantite(uniteNorm, unitePrixBrute, colisage) {
  if (uniteNorm === 'colis') return 1
  if (!colisage) return null
  const m = colisage.match(/^([\d.,]+)\s+(\S+)\s*\/\s*\S+$/)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return cle(m[2]) === cle(unitePrixBrute) ? n : null
}

const AUJOURDHUI = new Date().toISOString().slice(0, 10)

const fournisseurs = await sb('fournisseurs?select=id,nom')
const gineys = fournisseurs.find(f => /gineys/i.test(f.nom))
if (!gineys) { console.error('✗ Fournisseur Gineys introuvable.'); process.exit(1) }

// Les rattachements DÉJÀ posés sur les lignes Gineys tirées des factures.
// ⚠️ Repris uniquement sur une égalité EXACTE du libellé normalisé complet,
// chez LE MÊME fournisseur — pas sur une ressemblance. Un rapprochement
// approximatif désignerait un « moins cher » qui compare deux produits (0151).
const ancien = await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&nature=eq.facture&select=designation,cle_comparaison,ingredient_id,recette_id`,
  { headers: { Prefer: 'return=representation' } })
const rattachements = new Map()
for (const l of ancien) {
  if (!l.ingredient_id && !l.recette_id) continue
  rattachements.set(norme(l.designation), l)
}

const rows = []
let sansPrix = 0, repris = 0, sansColis = 0
for (const a of parCode.values()) {
  const uniteBrute = a.prix_unite ?? ''
  const unite = UNITE[uniteBrute] ?? 'contenant'
  const designation = a.article.replace(/\s+/g, ' ').trim()

  let cv = null, cu = null
  if (unite === 'colis') {
    const n = conditionnement(designation)
    if (n) { cv = n; cu = 'piece' } else sansColis++
  } else if (!REFERENCE.has(unite)) {
    const c = contenance(designation)
    if (c) { cv = c.valeur; cu = c.unite }
  }

  const prix = a.prix == null ? null : Number(a.prix)
  if (prix == null) sansPrix++

  const lien = rattachements.get(norme(designation))
  if (lien) repris++

  rows.push({
    fournisseur_id: gineys.id,
    reference: a.code,
    designation,
    famille: null,
    unite,
    prix_ht: prix,
    colis_quantite: colisQuantite(unite, uniteBrute, a.colisage),
    colis_libelle: uniteBrute || null,
    contenance_valeur: cv,
    contenance_unite: cu,
    cle_comparaison: lien?.cle_comparaison ?? null,
    ingredient_id: lien?.ingredient_id ?? null,
    recette_id: lien?.recette_id ?? null,
    date_tarif: AUJOURDHUI,
    source: `Portail Gineys du ${AUJOURDHUI.split('-').reverse().join('/')}`,
    nature: 'portail',
    remise_pct: a.remise_pct ?? null,
    // ⚠️ `tarif_negocie` n'est PAS dans cet objet, et c'est délibéré : un
    // upsert écrase les colonnes qu'il porte, donc relancer l'import
    // effacerait une remise confirmée à la main entre-temps. Elle est posée
    // juste après, et seulement sur ce qu'on achète.
    achete: achetes.has(a.code),
    actif: true,
  })
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · portail Gineys ──\n`)
console.log(`  ${rows.length} référence(s)`)
console.log(`  · ${rows.filter(r => r.achete).length} que nous achetons (tarif négocié confirmé)`)
console.log(`  · ${rows.filter(r => r.remise_pct).length} en promotion`)
console.log(`  · ${sansPrix} à prix sur demande (prix_ht NULL, jamais 0)`)
console.log(`  · ${repris} rattachement(s) repris des factures (libellé identique)`)
console.log(`  · ${rows.filter(r => r.contenance_valeur).length} avec contenance lisible`)
console.log(`  · ${sansColis} au colis sans C=N — aucune contenance déduite`)

const u = {}; rows.forEach(r => { u[r.unite] = (u[r.unite] || 0) + 1 })
console.log(`\n  unités de facturation : ${Object.entries(u).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

if (!ECRIRE) {
  console.log('\n  Exemples :')
  for (const r of rows.filter(x => x.achete).slice(0, 5)) {
    console.log(`   · ${r.reference} ${r.designation.slice(0, 44).padEnd(44)} ${String(r.prix_ht).padStart(8)} €/${r.unite}`)
  }
  console.log('\n  (rien écrit — relancer avec --ecrire)\n')
  process.exit(0)
}

// La clé d'upsert est (fournisseur, référence, date) : relancer le même jour
// corrige, un relevé d'un autre jour s'ajoute et l'ancien survit — c'est lui
// qui rendra une hausse lisible.
let ecrits = 0
for (let i = 0; i < rows.length; i += 200) {
  const lot = rows.slice(i, i + 200)
  await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
    method: 'POST', body: JSON.stringify(lot),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  ecrits += lot.length
  process.stdout.write(`\r  écrit ${ecrits}/${rows.length}`)
}
console.log('')

// ⚠️ Posé APRÈS l'upsert, et seulement sur ce qu'on achète : ces 92 prix ont
// été confrontés un par un à nos factures. Le reste garde ce qu'il avait —
// NULL au premier import, et la confirmation d'un humain si elle est venue
// depuis. Écrire NULL ici l'effacerait sans que rien ne le signale.
const codesAchetes = [...achetes]
for (let i = 0; i < codesAchetes.length; i += 100) {
  const lot = codesAchetes.slice(i, i + 100)
  await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&date_tarif=eq.${AUJOURDHUI}&reference=in.(${lot.join(',')})`, {
    method: 'PATCH', body: JSON.stringify({ tarif_negocie: true }),
  })
}

console.log(`✓ ${ecrits} référence(s) Gineys au catalogue tarifaire.`)
console.log(`✓ ${codesAchetes.length} marquée(s) « tarif négocié confirmé ».\n`)
