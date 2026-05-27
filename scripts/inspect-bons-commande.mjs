// Inspecte les 285 bons de commande : par fournisseur, période, type.
// LECTURE SEULE.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

// 1. Fournisseurs
const { data: fournisseurs } = await sb.from('fournisseurs').select('id, nom').order('nom')
console.log('\n─── Fournisseurs ───')
for (const f of fournisseurs) {
  console.log(`  • ${f.id.slice(0, 8)} — ${f.nom}`)
}

// 2. Bons commande : volume par fournisseur
console.log('\n─── Bons commande par fournisseur ───')
const { data: bons, error: errB } = await sb
  .from('bons_commande')
  .select('*')
  .order('created_at', { ascending: false })
if (errB) { console.error('ERR bons :', errB.message); process.exit(1) }
console.log(`(${bons.length} bons récupérés, colonnes : ${Object.keys(bons[0] ?? {}).join(', ')})`)

const byFourn = {}
for (const b of bons) {
  const key = b.fournisseur_id ?? 'sans-fournisseur'
  byFourn[key] = byFourn[key] || []
  byFourn[key].push(b)
}
for (const [fid, list] of Object.entries(byFourn)) {
  const fName = fournisseurs.find(f => f.id === fid)?.nom ?? '(inconnu)'
  const total = list.reduce((s, x) => s + (Number(x.total_ht) || 0), 0)
  const dates = list.map(x => x.date_commande).sort()
  const min = dates[0]?.slice(0, 10)
  const max = dates[dates.length - 1]?.slice(0, 10)
  console.log(`  ${fName.padEnd(30)} : ${String(list.length).padStart(4)} bons — ${total.toFixed(0).padStart(8)}€ HT — ${min} → ${max}`)
}

// 3. Échantillon : 3 bons + leurs premières lignes
console.log('\n─── Échantillon (3 bons les plus récents avec leurs lignes) ───')
const sample = bons.slice(0, 3)
for (const b of sample) {
  const fName = fournisseurs.find(f => f.id === b.fournisseur_id)?.nom ?? '(inconnu)'
  console.log(`\n  Bon ${b.id.slice(0, 8)} — ${fName} — ${b.date_commande?.slice(0, 10)} — ${b.statut} — ${b.total_ht}€`)
  const { data: lignes } = await sb
    .from('bon_commande_lignes')
    .select('libelle, quantite, unite, prix_unitaire_ht')
    .eq('bon_commande_id', b.id)
    .limit(5)
  for (const l of lignes) {
    console.log(`    - ${l.libelle?.slice(0, 40).padEnd(40)} ${String(l.quantite).padStart(6)} ${l.unite ?? ''} × ${l.prix_unitaire_ht}€`)
  }
}

// 4. Statuts répartition
console.log('\n─── Répartition par statut ───')
const byStatut = {}
for (const b of bons) byStatut[b.statut] = (byStatut[b.statut] || 0) + 1
for (const [s, n] of Object.entries(byStatut)) {
  console.log(`  ${s.padEnd(20)} : ${n}`)
}
console.log()
