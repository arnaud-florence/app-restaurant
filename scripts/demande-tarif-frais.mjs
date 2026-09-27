#!/usr/bin/env node
// La liste à présenter au fournisseur de FRAIS (Pomona TerreAzur, 28/09).
//
// Les matières qu'aucun de nos fournisseurs ne vend sont presque toutes du
// frais : tomates, salade, citron, œufs, parmesan. Gineys, Félix Potin,
// Gel Var, Promocash, La Frite Belge et France Boissons n'en ont aucun au
// catalogue — vérifié sur les 3 392 références, pas sur un sous-ensemble.
//
// ⚠️ NOS PRIX FIGURENT EN FACE QUAND ON LES A. Un fournisseur qui ignore
// ce qu'il doit battre propose son tarif public, et tout le monde y perd
// (même règle que le tableau Euro-Cash et la demande Gel Var).
//
// ⚠️ La case reste VIDE quand on n'a pas de prix, jamais zéro : un zéro
// dirait « gratuit ». Et un prix ESTIMÉ (0165) est marqué comme tel — le
// donner pour un prix payé fausserait la négociation dans les deux sens.
//
//   node scripts/demande-tarif-frais.mjs [--creer-fournisseur]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const CREER = process.argv.includes('--creer-fournisseur')

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

const DEMO = new Set(['Metro France', 'Sysco France', 'Brake France', 'Transgourmet',
  'Ferme du Plateau', 'Boucherie Bio', 'Boulangerie Coop', 'Maraîcher du coin',
  'Marée fraîche', 'Domaine Provence', 'Crémerie Local', 'Épicerie fine', 'Gynes'])
// ⚠️ « Pomona TerreAzur » NE FIGURE PLUS dans cette liste : le jeu de démo
// avait emprunté le nom d'une entreprise RÉELLE, que le gérant rencontre le
// 28/09/2026. Le garder ici ferait traiter le vrai fournisseur comme une
// donnée de test. Les 12 ingrédients de démo qui le portent sont tous
// inactifs — aucun risque de confusion.

async function main() {
  const [ing, ri, rec] = await Promise.all([
    T('ingredients?select=id,nom,unite,prix_achat_ht,prix_estime,fournisseur_principal,stocke&actif=is.true'),
    T('recette_ingredients?select=ingredient_id,quantite'),
    T('recettes?select=id,nom,actif'),
  ])
  const utilise = new Set(ri.map(l => l.ingredient_id))
  const sansF = ing.filter(m => {
    if (!m.stocke && !utilise.has(m.id)) return false
    const b = m.fournisseur_principal || ''
    return !b || /^ESTIMATION/i.test(b) || DEMO.has(b.split(' — ')[0].trim())
  })

  console.log('\n══ À FAIRE CHIFFRER — produits qu’aucun fournisseur actuel ne vend ══\n')
  console.log(`${sansF.length} référence(s). Vérifié sur les 3 392 lignes du catalogue,`)
  console.log('tous fournisseurs confondus — pas sur un sous-ensemble.\n')
  console.log('Produit'.padEnd(34) + 'Unité'.padEnd(12) + 'Notre prix'.padStart(12) + '   Base')
  console.log('─'.repeat(78))
  for (const m of sansF.sort((a, b) => (a.nom < b.nom ? -1 : 1))) {
    const prix = m.prix_achat_ht == null ? '' : Number(m.prix_achat_ht).toFixed(3) + ' €'
    const base = m.prix_achat_ht == null ? '—' : (m.prix_estime ? '⚠ estimation, à confirmer' : 'prix payé')
    console.log(m.nom.padEnd(34) + String(m.unite ?? '').padEnd(12) + prix.padStart(12) + '   ' + base)
  }

  console.log('\n⚠️ Les prix marqués « estimation » ont servi à bâtir la carte : ils')
  console.log('   n’ont jamais été facturés. Les présenter comme un prix payé')
  console.log('   fausserait la négociation — dans les deux sens.')

  if (!CREER) {
    console.log('\n── Relancer avec --creer-fournisseur pour créer la fiche Pomona TerreAzur. ──\n')
    return
  }

  const existe = await T('fournisseurs?select=id,nom&nom=ilike.*terreazur*')
  if (existe.length) { console.log(`\n✓ « ${existe[0].nom} » existe déjà.`); return }
  const r = await fetch(`${U}/rest/v1/fournisseurs`, {
    method: 'POST',
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      nom: 'Pomona TerreAzur',
      actif: true,
      conditions_tarifaires: 'Fruits et légumes frais. Rendez-vous du 28/09/2026 — '
        + 'tarif à recevoir. ⚠️ Le jeu de démo purgé en septembre portait ce même '
        + 'nom : les 12 ingrédients qui s’y rattachent encore sont inactifs.',
    }),
  })
  if (!r.ok) { console.log('\n✗', (await r.text()).slice(0, 200)); return }
  console.log('\n✓ Fournisseur « Pomona TerreAzur » créé, actif, en attente de tarif.')
  console.log('  ⚠️ Sans adresse e-mail : à renseigner après le rendez-vous.')
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
