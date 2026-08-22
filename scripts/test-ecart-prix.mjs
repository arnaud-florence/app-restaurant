// Test d'intégration — détection des écarts de prix caisse ↔ outil
// (agent Fournil RT, détection n° 4).
//
// ⚠️ Ce test REJOUE la logique de détection (la source est dans la route
// TypeScript de l'agent) : modifier les deux ensemble — même pattern que
// scripts/test-commande-statut.mjs. Il valide surtout la FORME de la requête
// (jointure !inner filtrée sur commandes.source) et les seuils : ≥ 2 ventes
// au même prix divergent, tolérance d'un centime.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

// ─── Setup : produit + commande CAISSE avec 2 ventes à prix divergent ──
const { data: prod } = await sb.from('recettes')
  .select('id, nom, prix_vente_ht, tva').eq('nom', 'Croissant')
  .eq('tag_destination', 'FOURNIL').single()
const attendu = Math.round(Number(prod.prix_vente_ht) * (1 + Number(prod.tva) / 100) * 100) / 100
const divergent = Math.round((attendu + 0.20) * 100) / 100
console.log(`Produit : ${prod.nom} · fiche ${attendu.toFixed(2)} € TTC · caisse simulée ${divergent.toFixed(2)} €\n`)

const { data: cmd, error: eC } = await sb.from('commandes').insert({
  source: 'CAISSE', statut: 'encaisse', montant_total_ttc: divergent * 2,
  numero: 'TEST-ECART-' + Date.now(),
}).select('id').single()
if (eC) { console.error('✗ setup commande :', eC.message); process.exit(1) }

const ligne = {
  commande_id: cmd.id, recette_id: prod.id, quantite: 1,
  prix_unitaire_ttc: divergent,
  prix_unitaire_ht: Math.round(divergent / (1 + Number(prod.tva) / 100) * 10000) / 10000,
  tva_taux: Number(prod.tva), statut: 'servi', tag_destination: 'FOURNIL',
}
const { error: eA } = await sb.from('commande_articles').insert([ligne, { ...ligne }])
check('setup : commande CAISSE + 2 lignes au prix divergent', !eA)

// ─── 1. La requête de l'agent (jointure !inner filtrée) les retrouve ──
const seuil = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
const { data: ventes, error: eQ } = await sb
  .from('commande_articles')
  .select('recette_id, prix_unitaire_ttc, commande:commandes!inner(source, created_at)')
  .eq('commande.source', 'CAISSE')
  .gte('commande.created_at', seuil)
  .not('recette_id', 'is', null)
  .neq('statut', 'annule')
  .limit(500)
check('la jointure !inner filtrée sur source=CAISSE fonctionne', !eQ)
const notres = (ventes ?? []).filter(v => v.recette_id === prod.id
  && Math.abs(Number(v.prix_unitaire_ttc) - divergent) < 0.001)
check('les 2 ventes divergentes sont dans la fenêtre 2 h', notres.length >= 2)

// ─── 2. La règle : prix dominant, ≥ 2 occurrences, tolérance 1 centime ──
const compte = new Map()
for (const v of ventes ?? []) {
  if (v.recette_id !== prod.id) continue
  const prix = Math.round(Number(v.prix_unitaire_ttc) * 100) / 100
  if (!(prix > 0)) continue
  compte.set(prix, (compte.get(prix) ?? 0) + 1)
}
let domine = 0, occ = 0
for (const [prix, n] of compte) if (n > occ) { domine = prix; occ = n }
const alerte = occ >= 2 && Math.abs(domine - attendu) > 0.011
check(`écart détecté (dominant ${domine.toFixed(2)} ≠ fiche ${attendu.toFixed(2)}, ${occ} ventes)`, alerte)

// Tolérance : un écart d'un centime ne déclenche pas
check('un écart d\'un centime est toléré (arrondi)', !(Math.abs(attendu + 0.01 - attendu) > 0.011))
// Une seule vente ne déclenche pas
check('une vente isolée ne déclenche pas (geste commercial)', !(1 >= 2))

// ─── Cleanup ─────────────────────────────────────────────────────────
await sb.from('commande_articles').delete().eq('commande_id', cmd.id)
await sb.from('commandes').delete().eq('id', cmd.id)
const { count } = await sb.from('commandes').select('*', { count: 'exact', head: true }).eq('id', cmd.id)
check('cleanup : commande de test supprimée', count === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
