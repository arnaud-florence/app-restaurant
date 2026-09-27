#!/usr/bin/env node
// Chez QUI chaque produit vendu s'achète (0164).
//
// Le pendant de `fournisseur-des-matieres.mjs`, pour les produits. Sans
// lui, 85 lignes du réassort sur 193 ne pouvaient entrer dans aucun bon de
// commande : l'écran disait quoi acheter, jamais à qui l'écrire.
//
// ⚠️⚠️ ON NE DEVINE JAMAIS. Un bon parti chez le mauvais interlocuteur se
// découvre à la livraison, et une commande de fûts arrivée chez le
// boulanger ne se rattrape pas un samedi. Trois sources, toutes
// FACTUELLES, par ordre de force décroissante — et ce qui ne relève
// d'aucune reste VIDE.
//
//   node scripts/fournisseur-des-produits.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('✗ identifiants Supabase manquants.'); process.exit(1) }
const ECRIRE = process.argv.includes('--ecrire')

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

async function main() {
  const [rec, lignes, factures, catalogue, fournisseurs] = await Promise.all([
    T('recettes?select=id,nom,actif,tag_destination,reference_fournisseur,fournisseur_id'),
    T('facture_lignes?select=recette_id,facture_id&recette_id=not.is.null'),
    T('factures_fournisseurs?select=id,fournisseur_id,type_document,date_emission'),
    T('catalogue_fournisseur?select=reference,fournisseur_id,recette_id,actif'),
    T('fournisseurs?select=id,nom,actif'),
  ])

  const nomF = new Map(fournisseurs.map(f => [f.id, f.nom]))
  const parIdFacture = new Map(factures.map(f => [f.id, f]))
  const franceBoissons = fournisseurs.find(f => f.nom === 'France Boissons')?.id ?? null

  // ── SOURCE 1 — une LIGNE DE FACTURE. C'est une preuve de paiement : on a
  // déjà acheté ce produit là-bas. La plus RÉCENTE gagne.
  // ⚠️ Un AVOIR est écarté : c'est de la marchandise RENDUE, pas un achat.
  const parFacture = new Map()
  const dateVue = new Map()
  for (const l of lignes) {
    const f = parIdFacture.get(l.facture_id)
    if (!f || f.type_document === 'avoir') continue
    const d = f.date_emission ?? ''
    if ((dateVue.get(l.recette_id) ?? '') > d) continue
    dateVue.set(l.recette_id, d)
    parFacture.set(l.recette_id, f.fournisseur_id)
  }

  // ── SOURCE 2 — le produit est rattaché à une ligne de CATALOGUE, ou sa
  // RÉFÉRENCE y est retrouvée. Une référence est un identifiant : elle ne
  // souffre ni des accents ni des abréviations (0142).
  const parRecetteCat = new Map()
  const parReference = new Map()
  for (const c of catalogue) {
    if (c.actif === false) continue
    if (c.recette_id && !parRecetteCat.has(c.recette_id)) parRecetteCat.set(c.recette_id, c.fournisseur_id)
    if (c.reference && !parReference.has(String(c.reference))) parReference.set(String(c.reference), c.fournisseur_id)
  }

  // ── SOURCE 3 — LE BAR. Toute référence portée par un produit du bar
  // vient d'un relevé Eazle : `couts-france-boissons.mjs` (21/09),
  // `complements-bar.mjs` et `bieres-artisanales.mjs` lisent tous les trois
  // le même relevé France Boissons. Les bières La Rade en font partie —
  // La Rade est la MARQUE, France Boissons le distributeur, exactement
  // comme Lavazza et comme Pauwels chez La Frite Belge.
  //
  // ⚠️ Et c'est l'ABSENCE de référence qui porte l'autre moitié du sens :
  // le vin tranquille (Coteaux Varois, les trois BIB) n'en a
  // délibérément AUCUNE, parce qu'il vient d'un vignoble ou d'un caviste
  // et PAS de France Boissons (`VIN_HORS_FB`). Il reste donc sans
  // fournisseur, ce qui est la vérité.
  //
  // ⚠️ Cette règle est bornée au BAR. Un produit du Fournil porte une
  // référence GINEYS : l'appliquer partout enverrait les croissants chez
  // le marchand de boissons.

  const decisions = []
  for (const r of rec) {
    if (!r.actif) continue
    let fid = null, source = null
    if (parFacture.has(r.id)) { fid = parFacture.get(r.id); source = 'facture' }
    else if (parRecetteCat.has(r.id)) { fid = parRecetteCat.get(r.id); source = 'catalogue' }
    else if (r.reference_fournisseur && parReference.has(String(r.reference_fournisseur))) {
      fid = parReference.get(String(r.reference_fournisseur)); source = 'référence'
    } else if (r.tag_destination === 'BAR' && r.reference_fournisseur && franceBoissons) {
      fid = franceBoissons; source = 'relevé bar'
    }
    if (!fid) continue
    if (r.fournisseur_id === fid) continue          // déjà posé, rien à faire
    decisions.push({ id: r.id, nom: r.nom, tag: r.tag_destination, fid, nom_f: nomF.get(fid), source })
  }

  const parSource = {}
  const parFournisseurNom = {}
  for (const d of decisions) {
    parSource[d.source] = (parSource[d.source] ?? 0) + 1
    parFournisseurNom[d.nom_f] = (parFournisseurNom[d.nom_f] ?? 0) + 1
  }

  const actifs = rec.filter(r => r.actif)
  const dejaPose = actifs.filter(r => r.fournisseur_id).length

  console.log('\n══ CHEZ QUI S’ACHÈTE CHAQUE PRODUIT ══\n')
  console.log(`produits actifs        : ${actifs.length}`)
  console.log(`déjà rattachés         : ${dejaPose}`)
  console.log(`à rattacher maintenant : ${decisions.length}\n`)
  console.log('par source (la plus forte d’abord) :')
  for (const s of ['facture', 'catalogue', 'référence', 'relevé bar']) {
    if (parSource[s]) console.log(`   ${String(parSource[s]).padStart(3)}  ${s}`)
  }
  console.log('\npar fournisseur :')
  for (const [n, c] of Object.entries(parFournisseurNom).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(c).padStart(3)}  ${n}`)
  }

  const orphelins = actifs.filter(r =>
    !r.fournisseur_id && !decisions.some(d => d.id === r.id))
  console.log(`\n⚠️ ${orphelins.length} produit(s) restent SANS fournisseur — aucune trace d’achat.`)
  console.log('   Ils sont écartés des bons de commande, et comptés à l’écran.')
  const parTag = {}
  for (const o of orphelins) (parTag[o.tag_destination ?? '?'] ??= []).push(o.nom)
  for (const [t, l] of Object.entries(parTag)) {
    console.log(`   ${t} (${l.length}) : ${l.slice(0, 12).join(' · ')}${l.length > 12 ? ' …' : ''}`)
  }

  if (!ECRIRE) {
    console.log('\n\n── ESSAI À BLANC — rien n’a été écrit. ──')
    console.log('   Relancer avec --ecrire.\n')
    return
  }

  console.log('\n\n── ÉCRITURE ──\n')
  let n = 0
  for (const d of decisions) {
    const r = await fetch(`${U}/rest/v1/recettes?id=eq.${d.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ fournisseur_id: d.fid }),
    })
    if (!r.ok) { console.log(`  ✗ ${d.nom} : ${(await r.text()).slice(0, 140)}`); continue }
    n++
  }
  console.log(`  ✓ ${n} produit(s) rattaché(s) sur ${decisions.length}.`)
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
