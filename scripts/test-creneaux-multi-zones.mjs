// Test d'intégration : créneaux séparés par zone (SNACKING / PIZZA) sur une
// commande COMPTOIR. Valide la migration 0081 (commandes.creneaux_par_tag JSONB)
// et la logique de propagation vers /cuisine, /emporter, /bar.
//
//   node scripts/test-creneaux-multi-zones.mjs
//
// Note : ne teste pas la server action `creerCommande` (server-only) mais
// valide directement le schéma DB + la cohérence des valeurs stockées.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  const v = m[2].replace(/^['"]|['"]$/g, '').trim()
  // Skip vide (.env.local peut avoir des doublons vides qui écraseraient la vraie valeur)
  if (!v) continue
  process.env[m[1]] = v
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('❌ env manquant'); process.exit(1) }
const sb = createClient(url, key)

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { commandeIds: [], articleIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test : créneaux séparés par zone (snack/pizza)          ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma : colonne creneaux_par_tag présente sur commandes ───
let migrationOk = false
await step('schéma : commandes.creneaux_par_tag JSONB', async () => {
  const { data, error } = await sb.from('commandes')
    .select('id, creneau_retrait, creneaux_par_tag')
    .limit(1)
  if (error) {
    throw new Error(`migration 0081 non appliquée ? ${error.message}`)
  }
  migrationOk = true
  ok('colonne creneaux_par_tag accessible (migration 0081 OK)')
  if (data && data[0]) {
    const cpt = data[0].creneaux_par_tag
    if (cpt === null || typeof cpt === 'object') ok(`type JSONB OK (val: ${JSON.stringify(cpt)})`)
    else ko('type JSONB', `attendu object|null, reçu ${typeof cpt}`)
  } else {
    ok('table vide — vérification type différée')
  }
})

if (!migrationOk) {
  console.log('\n⚠️  Migration 0081 manquante — applique-la dans Supabase SQL Editor :')
  console.log('    supabase/migrations/0081_creneaux_par_tag.sql')
  console.log('Puis relance le test.\n')
  process.exit(1)
}

// ─── 2. INSERT commande COMPTOIR multi-zones (snack + pizza) ───
let cmdId
const slotSnack = new Date(Date.now() + 60 * 60_000).toISOString()  // +1h
const slotPizza = new Date(Date.now() + 75 * 60_000).toISOString()  // +1h15

await step('INSERT commande COMPTOIR avec creneaux_par_tag', async () => {
  const { data: cmd, error } = await sb.from('commandes').insert({
    numero: 'TEST-MULTI-' + Date.now(),
    source: 'COMPTOIR',
    numero_table: null,
    statut: 'en_attente',
    montant_total_ht: 20,
    montant_total_ttc: 22,
    creneau_retrait: slotPizza,   // max des 2 = pizza
    creneaux_par_tag: { SNACKING: slotSnack, PIZZA: slotPizza },
  }).select('id, creneau_retrait, creneaux_par_tag').single()
  if (error) throw new Error(error.message)
  cmdId = cmd.id
  cleanup.commandeIds.push(cmdId)
  ok(`commande créée id=${cmdId.slice(0,8)}…`)

  // Vérifie que les créneaux sont bien stockés
  const cpt = cmd.creneaux_par_tag
  if (cpt && cpt.SNACKING === slotSnack && cpt.PIZZA === slotPizza) {
    ok('creneaux_par_tag stockés correctement (snack ≠ pizza)')
  } else {
    ko('creneaux_par_tag stockage', `attendu {SNACKING, PIZZA}, reçu ${JSON.stringify(cpt)}`)
  }

  // Vérifie que creneau_retrait global = max (comparaison par timestamp,
  // pas par string : Postgres renvoie +00:00, JS produit Z, mais c'est le même instant)
  if (cmd.creneau_retrait && new Date(cmd.creneau_retrait).getTime() === new Date(slotPizza).getTime()) {
    ok('creneau_retrait global = max(snack, pizza) = pizza')
  } else {
    ko('creneau_retrait global', `attendu ${slotPizza}, reçu ${cmd.creneau_retrait}`)
  }
})

// ─── 3. Articles snack + pizza rattachés ───
await step('INSERT 2 articles (1 snack + 1 pizza)', async () => {
  // Récupère une recette snack + une recette pizza
  const { data: recs } = await sb.from('recettes')
    .select('id, nom, tag_destination, prix_vente_ht')
    .eq('actif', true)
    .in('tag_destination', ['SNACKING', 'PIZZA'])
  const recSnack = recs?.find(r => r.tag_destination === 'SNACKING')
  const recPizza = recs?.find(r => r.tag_destination === 'PIZZA')
  if (!recSnack || !recPizza) {
    ko('recettes test', 'manque une recette SNACKING ou PIZZA active')
    return
  }
  ok(`recettes trouvées : "${recSnack.nom}" + "${recPizza.nom}"`)

  const { data: artSnack, error: e1 } = await sb.from('commande_articles').insert({
    commande_id: cmdId,
    recette_id: recSnack.id,
    quantite: 1,
    prix_unitaire_ht: recSnack.prix_vente_ht,
    tag_destination: 'SNACKING',
    statut: 'en_attente',
  }).select('id').single()
  if (e1) throw new Error(e1.message)
  cleanup.articleIds.push(artSnack.id)

  const { data: artPizza, error: e2 } = await sb.from('commande_articles').insert({
    commande_id: cmdId,
    recette_id: recPizza.id,
    quantite: 1,
    prix_unitaire_ht: recPizza.prix_vente_ht,
    tag_destination: 'PIZZA',
    statut: 'en_attente',
  }).select('id').single()
  if (e2) throw new Error(e2.message)
  cleanup.articleIds.push(artPizza.id)
  ok('2 articles insérés (SNACKING + PIZZA)')
})

// ─── 4. SELECT comme le ferait listCommandesActives ───
await step('SELECT propage creneaux_par_tag', async () => {
  const { data, error } = await sb.from('commandes')
    .select(`
      id, source, statut, creneau_retrait, creneaux_par_tag,
      commande_articles(id, tag_destination)
    `)
    .eq('id', cmdId)
    .single()
  if (error) throw new Error(error.message)

  const cpt = data.creneaux_par_tag
  if (cpt?.SNACKING && cpt?.PIZZA) ok('creneaux_par_tag présent dans SELECT')
  else ko('SELECT creneaux_par_tag', `manquant : ${JSON.stringify(cpt)}`)

  // Simule la logique cuisine : ticket pizza utilise creneaux_par_tag.PIZZA
  const articlesPizza = data.commande_articles.filter(a => a.tag_destination === 'PIZZA')
  if (articlesPizza.length > 0) {
    const tagDuTicket = articlesPizza[0].tag_destination
    const creneauTicket = cpt[tagDuTicket]
    if (creneauTicket === slotPizza) ok('logique /cuisine : ticket PIZZA → créneau pizza (pas global)')
    else ko('logique /cuisine pizza', `attendu ${slotPizza}, reçu ${creneauTicket}`)
  }
})

// ─── 5. Requête JSONB : filtrer par valeur dans creneaux_par_tag ───
await step('Query JSONB : filtre sur creneaux_par_tag->>SNACKING', async () => {
  const { data, error } = await sb.from('commandes')
    .select('id, creneaux_par_tag')
    .eq('id', cmdId)
    .gte('creneaux_par_tag->>SNACKING', new Date(Date.now() + 30 * 60_000).toISOString())
  if (error) throw new Error(error.message)
  if (data && data.length === 1) ok('filtre JSONB ->>SNACKING fonctionne')
  else ko('filtre JSONB', `attendu 1 ligne, reçu ${data?.length ?? 0}`)
})

// ─── Cleanup ───
console.log('\n→ Cleanup')
try {
  for (const aid of cleanup.articleIds) {
    await sb.from('commande_articles').delete().eq('id', aid)
  }
  for (const cid of cleanup.commandeIds) {
    await sb.from('commandes').delete().eq('id', cid)
  }
  ok('cleanup commandes + articles')
} catch (e) {
  ko('cleanup', e.message)
}

// ─── Bilan ───
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Bilan : ${nbOk} ✓  /  ${nbKo} ✗                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (fails.length > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  - ${f}`)
}
process.exit(nbKo > 0 ? 1 : 0)
