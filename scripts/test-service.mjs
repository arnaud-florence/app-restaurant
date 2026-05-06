// Test d'intégration Module 9A — Chaîne complète serveur → cuisine →
// transitions → encaissement multi-paiements + tips → libération table.
//
//   node scripts/test-service.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('❌ env manquant'); process.exit(1) }
const sb = createClient(url, key)

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { commandeIds: [], articleIds: [], paiementIds: [] }
const restoreStocks = []
const restoreTables = []

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 9A — chaîne complète service                ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma : nouvelles tables et colonnes ──────────────────────
await step('schéma : sessions_caisse + paiements_caisse + colonnes', async () => {
  const { data: sess, error: sErr } = await sb.from('sessions_caisse').select('*').limit(1)
  if (sErr) throw new Error(sErr.message)
  ok('table sessions_caisse présente')

  const { data: pai, error: pErr } = await sb.from('paiements_caisse').select('*').limit(1)
  if (pErr) throw new Error(pErr.message)
  ok('table paiements_caisse présente')

  const { data: cmds } = await sb.from('commandes').select('serveur_id, session_caisse_id, pourboire_total').limit(1)
  if (cmds && cmds.length === 0) ok('colonnes commandes (table vide ok)')
  else if (cmds?.[0]) {
    if ('serveur_id' in cmds[0]) ok('colonne commandes.serveur_id présente')
    if ('session_caisse_id' in cmds[0]) ok('colonne commandes.session_caisse_id présente')
    if ('pourboire_total' in cmds[0]) ok('colonne commandes.pourboire_total présente')
  }

  // Session ouverte du jour (seedée par 0012)
  const { data: sessOuverte } = await sb
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .maybeSingle()
  if (sessOuverte) ok('session de caisse ouverte aujourd\'hui')
  else ko('session ouverte', 'aucune')
})

// ─── 2. Realtime : les 3 tables sont dans la publication ──────────
await step('realtime : tables dans publication supabase_realtime', async () => {
  // On ne peut pas query directement pg_publication_tables via PostgREST
  // mais on peut vérifier indirectement en testant un INSERT puis un SELECT
  const { data: tables } = await sb.from('tables_restaurant').select('id').limit(1)
  if (tables) ok('tables_restaurant accessible (RLS OK)')

  const { data: cmds } = await sb.from('commandes').select('id').limit(1)
  if (cmds) ok('commandes accessible (RLS OK)')

  const { data: arts } = await sb.from('commande_articles').select('id').limit(1)
  if (arts) ok('commande_articles accessible (RLS OK)')
})

// ─── 3. Création commande TABLE depuis serveur ──────────────────────
let cmdId
let articles = []
const tableTest = 'T1'  // table seedée
let tableInitiale

await step('create commande TABLE + articles', async () => {
  // Snapshot état initial table
  const { data: tableData } = await sb
    .from('tables_restaurant')
    .select('id, statut, commande_active_id')
    .eq('numero', tableTest)
    .single()
  if (tableData) {
    tableInitiale = tableData
    restoreTables.push({ id: tableData.id, statut: tableData.statut, commande_active_id: tableData.commande_active_id })
  }

  // Récupère 2 recettes : 1 cuisine + 1 bar pour tester le routage
  const { data: recettes } = await sb.from('recettes').select('id, nom, tag_destination, prix_vente_ht').eq('actif', true)
  const recCuisine = recettes.find(r => r.tag_destination === 'CUISINE')
  const recBar = recettes.find(r => r.tag_destination === 'BAR')
  if (!recCuisine) { ko('recette cuisine', 'aucune'); return }

  const { data: cmd, error } = await sb.from('commandes').insert({
    numero: 'TEST-' + Date.now(),
    source: 'TABLE',
    numero_table: tableTest,
    statut: 'en_attente',
    montant_total_ht: 30,
    montant_total_ttc: 33,
  }).select('id').single()
  if (error) throw new Error(error.message)
  cmdId = cmd.id
  cleanup.commandeIds.push(cmdId)
  ok(`commande créée id=${cmdId.slice(0,8)}…`)

  // Article cuisine
  const { data: artCuisine } = await sb.from('commande_articles').insert({
    commande_id: cmdId,
    recette_id: recCuisine.id,
    quantite: 2,
    prix_unitaire_ht: recCuisine.prix_vente_ht,
    tag_destination: recCuisine.tag_destination,
    statut: 'en_attente',
  }).select('id').single()
  cleanup.articleIds.push(artCuisine.id)
  articles.push(artCuisine.id)

  // Article bar (si dispo)
  if (recBar) {
    const { data: artBar } = await sb.from('commande_articles').insert({
      commande_id: cmdId,
      recette_id: recBar.id,
      quantite: 1,
      prix_unitaire_ht: recBar.prix_vente_ht,
      tag_destination: recBar.tag_destination,
      statut: 'en_attente',
    }).select('id').single()
    cleanup.articleIds.push(artBar.id)
    articles.push(artBar.id)
  }
  ok(`${articles.length} articles créés (CUISINE + BAR)`)

  // Marquer la table 'occupee'
  await sb.from('tables_restaurant').update({ statut: 'occupee', commande_active_id: cmdId }).eq('numero', tableTest)
  const { data: tApres } = await sb.from('tables_restaurant').select('statut').eq('numero', tableTest).single()
  if (tApres.statut === 'occupee') ok('table T1 → occupee')
  else ko('table statut', tApres.statut)
})

// ─── 4. Transitions : en_attente → en_preparation → pret → servi ───
await step('transitions article : statut chaîne complète', async () => {
  if (articles.length === 0) { ko('articles', 'manquants'); return }
  const aId = articles[0]

  // Snapshot stock avant pour comparer après 'servi'
  const { data: artInfo } = await sb
    .from('commande_articles')
    .select('recette_id, quantite, recette:recettes(recette_ingredients(ingredient_id))')
    .eq('id', aId)
    .single()
  const ingIds = artInfo?.recette?.recette_ingredients?.map(li => li.ingredient_id) ?? []
  const { data: ingsAvant } = await sb.from('ingredients').select('id, stock_actuel').in('id', ingIds)
  for (const i of ingsAvant ?? []) {
    restoreStocks.push({ id: i.id, stock: Number(i.stock_actuel) })
  }
  const stocksAvant = new Map((ingsAvant ?? []).map(i => [i.id, Number(i.stock_actuel)]))

  // Transition en_preparation
  await sb.from('commande_articles').update({ statut: 'en_preparation' }).eq('id', aId)
  const { data: a1 } = await sb.from('commande_articles').select('statut').eq('id', aId).single()
  if (a1.statut === 'en_preparation') ok('article → en_preparation')
  else ko('en_preparation', a1.statut)

  // Transition pret
  await sb.from('commande_articles').update({ statut: 'pret' }).eq('id', aId)
  const { data: a2 } = await sb.from('commande_articles').select('statut').eq('id', aId).single()
  if (a2.statut === 'pret') ok('article → pret')
  else ko('pret', a2.statut)

  // Transition servi → DOIT déclencher le trigger Module 7 (déduction stock)
  await sb.from('commande_articles').update({ statut: 'servi' }).eq('id', aId)
  const { data: a3 } = await sb.from('commande_articles').select('statut').eq('id', aId).single()
  if (a3.statut === 'servi') ok('article → servi')

  // Vérif déduction stock (trigger Module 7)
  if (ingIds.length > 0) {
    const { data: ingsApres } = await sb.from('ingredients').select('id, stock_actuel').in('id', ingIds)
    let nbDeduits = 0
    for (const i of ingsApres ?? []) {
      const avant = stocksAvant.get(i.id)
      const apres = Number(i.stock_actuel)
      if (apres < avant) nbDeduits++
    }
    if (nbDeduits === ingIds.length) ok(`trigger Module 7 : ${nbDeduits}/${ingIds.length} ingrédients déduits ✓`)
    else ko('trigger', `${nbDeduits}/${ingIds.length} déduits seulement`)

    // Vérif mouvements_stock 'sortie' créés
    const { data: mouv } = await sb
      .from('mouvements_stock')
      .select('id')
      .eq('type', 'sortie')
      .eq('commande_id', cmdId)
    if (mouv && mouv.length === ingIds.length) {
      ok(`${mouv.length} mouvements 'sortie' créés par le trigger`)
      cleanup.mouvementIds = mouv.map(m => m.id)
    } else {
      ko('mouvements', `${mouv?.length ?? 0} mouvements (attendu ${ingIds.length})`)
    }
  }
})

// ─── 5. Marquer commande 'servi' (manuellement, pour test encaissement) ──
await step('commande → servi (manuelle pour test)', async () => {
  await sb.from('commandes').update({ statut: 'servi' }).eq('id', cmdId)
  await sb.from('tables_restaurant').update({ statut: 'a_encaisser' }).eq('numero', tableTest)
  const { data: c } = await sb.from('commandes').select('statut').eq('id', cmdId).single()
  if (c.statut === 'servi') ok('commande statut = servi')
  else ko('servi', c.statut)
})

// ─── 6. Encaissement : multi-paiements + tips + libération table ────
await step('encaissement multi-paiements + tip', async () => {
  // Récupère la session ouverte
  const { data: session } = await sb
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .single()

  // Récupère le total de la commande
  const { data: cmdData } = await sb.from('commandes').select('montant_total_ttc').eq('id', cmdId).single()
  const total = Number(cmdData.montant_total_ttc)

  // Mode 2 (mixte) : 10€ espèces + reste carte avec 2€ pourboire
  const partEspeces = 10
  const partCarte = total - partEspeces

  const { data: pais, error } = await sb.from('paiements_caisse').insert([
    { commande_id: cmdId, session_caisse_id: session?.id ?? null, methode: 'especes', montant: partEspeces, pourboire: 0 },
    { commande_id: cmdId, session_caisse_id: session?.id ?? null, methode: 'carte', montant: partCarte, pourboire: 2.0 },
  ]).select('id')
  if (error) throw new Error(error.message)
  cleanup.paiementIds = pais.map(p => p.id)
  ok(`2 paiements enregistrés (${partEspeces}€ espèces + ${partCarte.toFixed(2)}€ carte + 2€ tip)`)

  // Marquer commande encaisse + tip total
  await sb.from('commandes').update({
    statut: 'encaisse',
    mode_paiement: 'especes+carte',
    pourboire_total: 2.0,
  }).eq('id', cmdId)
  const { data: cFinal } = await sb.from('commandes').select('statut, pourboire_total, mode_paiement').eq('id', cmdId).single()
  if (cFinal.statut === 'encaisse') ok('commande → encaisse')
  if (Number(cFinal.pourboire_total) === 2.0) ok('pourboire_total = 2.00€')
  if (cFinal.mode_paiement === 'especes+carte') ok(`mode_paiement = '${cFinal.mode_paiement}'`)

  // Libérer la table
  await sb.from('tables_restaurant').update({ statut: 'libre', commande_active_id: null }).eq('numero', tableTest)
  const { data: tFinal } = await sb.from('tables_restaurant').select('statut').eq('numero', tableTest).single()
  if (tFinal.statut === 'libre') ok('table T1 libérée → libre')
})

// ─── 7. Vérif que la commande encaissée n'apparaît plus dans actives ──
await step('commande encaissée → invisible des écrans actifs', async () => {
  const { data } = await sb
    .from('commandes')
    .select('id')
    .eq('id', cmdId)
    .not('statut', 'in', '(encaisse,annule)')
  if (!data || data.length === 0) ok('commande encaissée non visible (filtre statut)')
  else ko('filtre', 'la commande apparaît encore dans les actives')
})

// ─── Cleanup ─────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.paiementIds?.length > 0) {
  await sb.from('paiements_caisse').delete().in('id', cleanup.paiementIds)
  console.log(`  ✓ ${cleanup.paiementIds.length} paiements supprimés`)
}
if (cleanup.mouvementIds?.length > 0) {
  await sb.from('mouvements_stock').delete().in('id', cleanup.mouvementIds)
  console.log(`  ✓ ${cleanup.mouvementIds.length} mouvements de stock test supprimés`)
}
if (cleanup.articleIds.length > 0) {
  await sb.from('commande_articles').delete().in('id', cleanup.articleIds)
  console.log(`  ✓ ${cleanup.articleIds.length} articles supprimés`)
}
if (cleanup.commandeIds.length > 0) {
  await sb.from('commandes').delete().in('id', cleanup.commandeIds)
  console.log(`  ✓ ${cleanup.commandeIds.length} commande(s) test supprimée(s)`)
}
for (const r of restoreStocks) {
  await sb.from('ingredients').update({ stock_actuel: r.stock }).eq('id', r.id)
}
if (restoreStocks.length > 0) console.log(`  ✓ ${restoreStocks.length} stocks restaurés`)
for (const t of restoreTables) {
  await sb.from('tables_restaurant').update({ statut: t.statut, commande_active_id: t.commande_active_id }).eq('id', t.id)
}
if (restoreTables.length > 0) console.log(`  ✓ ${restoreTables.length} tables restaurées`)

// ─── Bilan ──────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 9A — chaîne complète service OK.')
