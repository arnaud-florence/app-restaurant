// Journal des échanges + correspondance des catalogues (migration 0137).
//
// Ce que ça protège, et c'est toute la raison d'être de la structure :
// un produit RENOMMÉ dans la caisse doit rester le MÊME produit chez nous.
// Avant, le rattachement se faisait par le libellé — « Croissant » devenu
// « Croissant beurre » créait un second produit et coupait la série
// statistique en deux, sans erreur ni alerte.
//
// Le serveur de dev doit tourner :  npm run dev
//   PORT=3000 node scripts/test-integration-correspondances.mjs
//
// Setup → assertions → cleanup complet (les tickets de test sont supprimés :
// ils créent des commandes 'encaisse' qui entreraient sinon dans le CA).

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const PORT = process.env.PORT ?? '3000'
const BASE = `http://localhost:${PORT}`

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const get = async (p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H })
  const j = await r.json()
  return Array.isArray(j) ? j : []
}
const SYS = 'zztest-caisse'
const ID_EXT = 'ZZTEST-PROD-001'
const TICKET_1 = 'ZZTEST-TK-001'
const TICKET_2 = 'ZZTEST-TK-002'

const pousser = (ticket, nomProduit, avecIdentifiant = true) => fetch(`${BASE}/api/integrations/caisse/encaissements`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_caisse: SYS,
    encaissements: [{
      ticket_externe: ticket,
      etablissement_slug: 'fournil',
      montant_ttc: 2.2,
      mode_paiement: 'especes',
      encaisse_at: new Date().toISOString(),
      produits: [{
        nom_caisse: nomProduit,
        ...(avecIdentifiant ? { identifiant_externe: ID_EXT } : {}),
        quantite: 1,
        prix_unitaire_ttc: 2.2,
        tva_taux: 5.5,
      }],
    }],
  }),
})

console.log('\n── Journal et correspondances ──\n')

if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent de .env.local'); process.exit(1) }

// ── 1. Premier ticket : le produit n'existe pas, il est créé ────────
const r1 = await pousser(TICKET_1, 'ZZTEST Croissant')
t('le connecteur accepte le ticket', r1.status === 200, `HTTP ${r1.status}`)
const b1 = await r1.json().catch(() => ({}))
t('le produit est créé à la volée', (b1.produits_crees ?? []).length === 1,
  JSON.stringify(b1).slice(0, 200))

const corr = await get(`correspondances_catalogue?systeme=eq.${SYS}&identifiant_externe=eq.${ID_EXT}`)
t('la correspondance est enregistrée', corr.length === 1)
const recetteId = corr[0]?.recette_id
t('elle pointe sur une fiche produit', Boolean(recetteId))

// ── 2. Le MÊME produit, RENOMMÉ dans la caisse ──────────────────────
const r2 = await pousser(TICKET_2, 'ZZTEST Croissant pur beurre')
t('le second ticket passe', r2.status === 200, `HTTP ${r2.status}`)
const b2 = await r2.json().catch(() => ({}))
t('AUCUN doublon créé malgré le renommage',
  (b2.produits_crees ?? []).length === 0,
  `créés : ${JSON.stringify(b2.produits_crees)}`)

const corr2 = await get(`correspondances_catalogue?systeme=eq.${SYS}&identifiant_externe=eq.${ID_EXT}`)
t('la correspondance pointe toujours sur la même fiche',
  corr2.length === 1 && corr2[0].recette_id === recetteId)

const lignes = await get(`commande_articles?select=recette_id&recette_id=eq.${recetteId}`)
t('les deux ventes sont sur la même fiche', lignes.length === 2, `${lignes.length} ligne(s)`)


// ── 3. Régression : une caisse SANS identifiant (SumUp) ─────────────
// Le rattachement par le libellé doit continuer de marcher tel quel.
const r3 = await pousser('ZZTEST-TK-003', 'ZZTEST Croissant', false)
t('un ticket sans identifiant passe encore', r3.status === 200, `HTTP ${r3.status}`)
const b3 = await r3.json().catch(() => ({}))
t('il se rattache par le nom, sans créer de doublon',
  (b3.produits_crees ?? []).length === 0, `créés : ${JSON.stringify(b3.produits_crees)}`)

// ── 4. Journal ──────────────────────────────────────────────────────
const ev = await get(`integration_evenements?systeme=eq.${SYS}&order=created_at.desc`)
t('les trois échanges sont journalisés', ev.length === 3, `${ev.length} événement(s)`)
t('le journal conserve le payload brut pour rejouer',
  ev.every(e => e.payload && e.payload.encaissements))
t('le journal note le sens et le résultat',
  ev.every(e => e.sens === 'entrant' && e.statut === 'succes' && e.resultat))
t('la durée est mesurée', ev.every(e => typeof e.duree_ms === 'number'))

// ── Cleanup ─────────────────────────────────────────────────────────
const del = async (p) => (await fetch(`${U}/rest/v1/${p}`, { method: 'DELETE', headers: H })).ok
const cmds = await get(`encaissements_externes?select=commande_id&source_caisse=eq.${SYS}`)
await del(`encaissements_externes?source_caisse=eq.${SYS}`)
for (const c of cmds) if (c.commande_id) {
  await del(`commande_articles?commande_id=eq.${c.commande_id}`)
  await del(`commandes?id=eq.${c.commande_id}`)
}
await del(`correspondances_catalogue?systeme=eq.${SYS}`)
await del(`integration_evenements?systeme=eq.${SYS}`)
if (recetteId) {
  await del(`mouvements_stock?recette_id=eq.${recetteId}`)
  await del(`recettes?id=eq.${recetteId}`)
}

const reste = [
  (await get(`recettes?select=id&nom=like.ZZTEST*`)).length,
  (await get(`correspondances_catalogue?select=id&systeme=eq.${SYS}`)).length,
  (await get(`integration_evenements?select=id&systeme=eq.${SYS}`)).length,
  (await get(`encaissements_externes?select=id&source_caisse=eq.${SYS}`)).length,
]
t('cleanup complet', reste.every(n => n === 0), `restes : ${reste.join('/')}`)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
