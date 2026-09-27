// Les promotions France Boissons, relevées sur Eazle.
//
//   node scripts/promos-france-boissons.mjs [--ecrire]
//
// ⚠️ RELEVÉ À LA MAIN, et il n'y a pas d'alternative : France Boissons n'a
// pas d'API. La page `eazle.france-boissons.fr/promotions` ne rend ses
// offres qu'une fois connecté — et le gérant ouvre la session lui-même.
//
// ⚠️⚠️ ON NE TOUCHE PAS AU PANIER. Le 27/09/2026 il contenait 63 articles.
// Les prix REMISÉS de France Boissons n'apparaissent qu'à la simulation du
// panier (cf. le relevé de coûts du 21/09), mais simuler suppose d'ajouter
// et de retirer des lignes : sur un panier que le gérant a préparé, c'est
// exclu. On relève donc les OFFRES telles qu'affichées, pas les prix.
//
// ⚠️ Ces offres sont CONDITIONNELLES (« 2 caisses achetées, 1 offerte ») :
// les écraser en pourcentage donnerait un prix unitaire faux pour qui
// n'atteint pas le seuil. D'où `promotions_fournisseur` (0161).

import fs from 'node:fs'
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
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

// Relevé du 27/09/2026 sur eazle.france-boissons.fr/promotions, recopié tel
// qu'affiché. ⚠️ Les dates sont CELLES DU SITE, pas une estimation.
const RELEVE_LE = '2026-09-27'
const PROMOS = [
  { libelle: 'Sprite — 2 caisses achetées, 1 caisse offerte',
    type: 'gratuite',       seuil_quantite: 2, seuil_unite: 'Caisse(s)', avantage: 1,
    date_debut: '2026-09-01', date_fin: '2026-09-30' },
  { libelle: 'Schweppes Agrumes — pour 2 caisses achetées, 8 € HT de remise immédiate',
    type: 'remise_montant', seuil_quantite: 2, seuil_unite: 'Caisse(s)', avantage: 8,
    date_debut: '2026-09-01', date_fin: '2026-09-30' },
  { libelle: 'Picon Bière — pour 1 bouteille achetée, 1,30 € HT de remise immédiate',
    type: 'remise_montant', seuil_quantite: 1, seuil_unite: 'Bouteille(s)', avantage: 1.30,
    date_debut: '2026-09-01', date_fin: '2026-09-30' },
  { libelle: 'Liqueur Menthe Pastille — pour 1 bouteille achetée, 1,50 € HT de remise immédiate',
    type: 'remise_montant', seuil_quantite: 1, seuil_unite: 'Bouteille(s)', avantage: 1.50,
    date_debut: '2026-09-01', date_fin: '2026-09-30' },
]

const fournisseurs = await sb('fournisseurs?select=id,nom')
const fb = fournisseurs.find(f => /france boissons/i.test(f.nom))
if (!fb) { console.error('✗ France Boissons introuvable.'); process.exit(1) }

const rows = PROMOS.map(p => ({
  ...p, fournisseur_id: fb.id, releve_le: RELEVE_LE,
  source: `Eazle — relevé du ${RELEVE_LE.split('-').reverse().join('/')}`,
  actif: true,
}))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · promotions France Boissons ──\n`)
for (const r of rows) {
  const jours = Math.ceil((new Date(r.date_fin + 'T00:00:00Z') - new Date(RELEVE_LE + 'T00:00:00Z')) / 86400000)
  console.log(`  · ${r.libelle}`)
  console.log(`      valable jusqu'au ${r.date_fin.split('-').reverse().join('/')} — ${jours} jour(s) au relevé`)
}
console.log(`\n  ⚠️ Toutes se terminent le 30/09. La première livraison est le JEUDI 1er OCTOBRE`)
console.log(`     (seuls jours proposés par Eazle) : à confirmer avec eux qu'une commande`)
console.log(`     passée avant le 30 en bénéficie, sinon aucune n'est utilisable.`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

await sb('promotions_fournisseur?on_conflict=fournisseur_id,libelle,releve_le', {
  method: 'POST', body: JSON.stringify(rows),
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
})
console.log(`\n✓ ${rows.length} promotion(s) enregistrée(s).\n`)
