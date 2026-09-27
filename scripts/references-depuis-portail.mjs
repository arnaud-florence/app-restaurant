#!/usr/bin/env node
// Retrouve le CODE ARTICLE de nos produits dans le portail Gineys.
//
// La colonne « Référence » du catalogue d'achat affichait « à relever » sur
// presque tout : `recettes.reference_fournisseur` est vide, et les 134
// lignes de facture déjà scannées n'en portent AUCUNE (elle n'était pas
// extraite avant la 0142). Or le portail en contient 2 885.
//
// ⚠️ LE RAPPROCHEMENT EST EXACT, PAS APPROCHANT. On exige que le
// `libelle_achat` — le texte LITTÉRAL du fournisseur, celui qui sert déjà à
// reconnaître une ligne de facture (0131) — soit identique à la désignation
// du portail, une fois casse, accents et ponctuation neutralisés. Aucune
// ressemblance, aucune racine de cinq lettres : une référence fausse passe
// AVANT le nom au rapprochement des factures (0142), donc elle se trompe en
// silence et pour toujours.
//
// ⚠️ UN VRAI CODE GINEYS EST NUMÉRIQUE. `catalogue_fournisseur.reference`
// porte aussi des LIBELLÉS, utilisés comme clé d'upsert par les lignes
// tirées des factures (0152) : les prendre pour des codes écrirait un
// paragraphe là où un commercial attend sept chiffres.
//
//   node scripts/references-depuis-portail.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
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

const N = s => String(s).toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()

const CODE = /^0?\d{4,7}$/

const ASSEMBLEES = new Set(['Sandwich', 'Panini', 'Salade', 'Formule', 'Pizzeria',
  'Burger', 'Plat', 'Planche', 'Grande salade', 'Menu', 'Formule petit-déjeuner'])

async function main() {
  const [rec, ing, cat] = await Promise.all([
    T('recettes?select=id,nom,categorie,tag_destination,nom_matiere,libelle_achat,reference_fournisseur&actif=is.true'),
    T('ingredients?select=id,nom,libelle_achat,reference_fournisseur,stocke&actif=is.true'),
    T('catalogue_fournisseur?select=reference,designation,nature&actif=is.true'),
  ])

  // ⚠️ Si DEUX désignations différentes se normalisent pareil, on ne peut
  // pas trancher : on écarte plutôt que de tirer au sort.
  const vus = new Map()
  const ambigus = new Set()
  for (const c of cat) {
    if (c.nature !== 'portail' || !CODE.test(String(c.reference ?? ''))) continue
    const k = N(c.designation)
    if (vus.has(k) && vus.get(k) !== c.reference) ambigus.add(k)
    else vus.set(k, c.reference)
  }
  for (const k of ambigus) vus.delete(k)

  const stockable = r => !(r.categorie && ASSEMBLEES.has(r.categorie))
    && !String(r.nom).startsWith('Formule —')
    && !(r.tag_destination === 'BAR' && !r.nom_matiere)

  const cibles = [
    ...rec.filter(r => stockable(r) && !r.reference_fournisseur && r.libelle_achat)
      .map(r => ({ table: 'recettes', id: r.id, nom: r.nom, libelle: r.libelle_achat })),
    ...ing.filter(i => i.stocke && !i.reference_fournisseur && i.libelle_achat)
      .map(i => ({ table: 'ingredients', id: i.id, nom: i.nom, libelle: i.libelle_achat })),
  ]

  const trouves = []
  const sans = []
  for (const c of cibles) {
    const code = vus.get(N(c.libelle))
    if (code) trouves.push({ ...c, code }); else sans.push(c)
  }

  console.log('\n══ CODES ARTICLE RETROUVÉS AU PORTAIL GINEYS ══\n')
  console.log(`${vus.size} codes numériques au portail · ${cibles.length} références sans code`)
  console.log(`${ambigus.size} désignation(s) écartée(s) — deux codes pour le même libellé\n`)
  for (const t of trouves.sort((a, b) => (a.nom < b.nom ? -1 : 1))) {
    console.log(`  ${String(t.code).padStart(8)}  ${t.nom.slice(0, 34).padEnd(35)} ${t.libelle.slice(0, 48)}`)
  }
  console.log(`\n⚠️ ${sans.length} référence(s) sans code : leur libellé d’achat ne figure`)
  console.log('   pas au portail Gineys — Promocash, France Boissons, ou un libellé')
  console.log('   de facture qui diffère de la désignation du catalogue.')

  if (!ECRIRE) {
    console.log('\n── ESSAI À BLANC — rien n’a été écrit. ──\n')
    return
  }

  console.log('\n── ÉCRITURE ──\n')
  let n = 0
  for (const t of trouves) {
    const r = await fetch(`${U}/rest/v1/${t.table}?id=eq.${t.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ reference_fournisseur: t.code }),
    })
    if (r.ok) n++; else console.log(`  ✗ ${t.nom} : ${(await r.text()).slice(0, 120)}`)
  }
  console.log(`  ✓ ${n} code(s) article posé(s) sur ${trouves.length}.`)
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
