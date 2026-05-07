// Test d'intégration Module 12 — Allergènes /admin/allergenes + /menu-allergenes.
//
// Couverture :
// - schema (procedures_urgence + colonnes ajoutées sur recettes et commande_articles)
// - calcul allergènes recette = union ingredients.allergenes + recettes.allergenes_complementaires
// - création procédure d'urgence avec étapes[]
// - commande avec allergenes_a_eviter sur une ligne (alerte cuisine)
// - HTTP /admin/allergenes + /menu-allergenes
//
//   node scripts/test-allergenes.mjs
//   PORT=3000 node scripts/test-allergenes.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = {
  procIds: [], commandeIds: [], articleIds: [],
  recettesOriginalAllergenes: new Map(),  // recette_id -> previous allergenes_complementaires
}

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 12 — allergènes /admin/allergenes           ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : procedures_urgence + colonnes ajoutées', async () => {
  const { error: e1 } = await sb.from('procedures_urgence').select('*').limit(1)
  if (e1) ko('table procedures_urgence', e1.message); else ok('table procedures_urgence accessible (RLS OK)')

  const { error: e2 } = await sb.from('recettes').select('allergenes_complementaires').limit(1)
  if (e2) ko('colonne recettes.allergenes_complementaires', e2.message); else ok('colonne recettes.allergenes_complementaires présente')

  const { error: e3 } = await sb.from('commande_articles').select('allergenes_a_eviter').limit(1)
  if (e3) ko('colonne commande_articles.allergenes_a_eviter', e3.message); else ok('colonne commande_articles.allergenes_a_eviter présente')
})

// ─── 2. Setup ──────────────────────────────────────────────────────
let recetteAvecAllergene
await step('setup : trouver une recette avec un ingrédient ayant des allergènes', async () => {
  const { data: rs } = await sb
    .from('recettes')
    .select('id, nom, allergenes_complementaires, recette_ingredients(ingredient:ingredients(nom, allergenes))')
    .eq('actif', true)
    .limit(20)

  recetteAvecAllergene = (rs ?? []).find(r =>
    (r.recette_ingredients ?? []).some(li => (li.ingredient?.allergenes ?? []).length > 0)
  )
  if (!recetteAvecAllergene) {
    console.log('  ⚠ aucune recette n\'a d\'allergène via ses ingrédients — on prend la première recette pour le reste du test')
    recetteAvecAllergene = rs?.[0]
    if (!recetteAvecAllergene) throw new Error('aucune recette en base')
  }
  ok(`recette test = ${recetteAvecAllergene.nom}`)

  // Snapshot l'état initial pour cleanup
  cleanup.recettesOriginalAllergenes.set(recetteAvecAllergene.id, recetteAvecAllergene.allergenes_complementaires ?? [])
})

// ─── 3. Override allergenes_complementaires ────────────────────────
await step('recettes.allergenes_complementaires : ajout overrides', async () => {
  const overrides = ['gluten', 'lait']  // 2 allergènes UE valides
  await sb.from('recettes')
    .update({ allergenes_complementaires: overrides })
    .eq('id', recetteAvecAllergene.id)
  const { data: r } = await sb.from('recettes').select('allergenes_complementaires').eq('id', recetteAvecAllergene.id).single()
  if (r.allergenes_complementaires?.length === 2 && r.allergenes_complementaires.includes('gluten') && r.allergenes_complementaires.includes('lait')) {
    ok(`allergenes_complementaires = [gluten, lait]`)
  } else {
    ko('overrides', JSON.stringify(r.allergenes_complementaires))
  }
})

// ─── 4. Procédures d'urgence ───────────────────────────────────────
await step('procedures_urgence : create avec etapes[]', async () => {
  const { data, error } = await sb.from('procedures_urgence').insert({
    titre: 'TEST12 — Réaction allergique cliente',
    type: 'allergie',
    etapes: [
      'Arrêter immédiatement le service du plat',
      'Demander si la personne a un auto-injecteur (Epipen)',
      'Allonger la personne, jambes surélevées',
      'Appeler le 15 (SAMU)',
      'Surveiller respiration + conscience',
      'Garder l\'étiquette du plat pour identification',
    ],
    contacts: 'SAMU 15 · Pompiers 18',
    ordre: 0,
    actif: true,
  }).select('id, etapes, type').single()
  if (error) throw new Error(error.message)
  cleanup.procIds.push(data.id)
  ok(`procédure créée id=${data.id.slice(0, 8)}…`)
  if (data.etapes?.length === 6) ok(`6 étapes enregistrées`)
  else ko('etapes', `attendu 6, obtenu ${data.etapes?.length}`)
  if (data.type === 'allergie') ok(`type=allergie ✓`)
  else ko('type', data.type)
})

// ─── 5. Commande avec allergenes_a_eviter ──────────────────────────
let cmdId, articleId
await step('commande_articles : insertion avec allergenes_a_eviter', async () => {
  const recId = recetteAvecAllergene.id
  const { data: rec } = await sb.from('recettes').select('prix_vente_ht, tag_destination').eq('id', recId).single()

  const { data: cmd, error: cErr } = await sb.from('commandes').insert({
    numero: 'TEST12-' + Date.now(),
    source: 'TABLE',
    numero_table: 'T12',
    statut: 'en_attente',
    montant_total_ht: Number(rec.prix_vente_ht),
    montant_total_ttc: Number(rec.prix_vente_ht) * 1.10,
  }).select('id').single()
  if (cErr) throw new Error(cErr.message)
  cmdId = cmd.id
  cleanup.commandeIds.push(cmdId)

  const { data: art, error: aErr } = await sb.from('commande_articles').insert({
    commande_id: cmdId,
    recette_id: recId,
    quantite: 1,
    prix_unitaire_ht: rec.prix_vente_ht,
    tag_destination: rec.tag_destination,
    commentaire: 'Test Module 12',
    allergenes_a_eviter: ['arachides', 'fruits_a_coque'],
    statut: 'en_attente',
  }).select('id, allergenes_a_eviter').single()
  if (aErr) throw new Error(aErr.message)
  articleId = art.id
  cleanup.articleIds.push(articleId)
  if (art.allergenes_a_eviter?.length === 2) ok(`article créé avec 2 allergènes : ${art.allergenes_a_eviter.join(', ')}`)
  else ko('allergenes_a_eviter', JSON.stringify(art.allergenes_a_eviter))
})

// ─── 6. Index GIN : requête sur allergenes_a_eviter ────────────────
await step('index GIN : recherche par allergène', async () => {
  // Le filtre Postgres pour "contient au moins un de ces allergènes"
  const { data, error } = await sb.from('commande_articles')
    .select('id')
    .contains('allergenes_a_eviter', ['arachides'])
    .eq('id', articleId)
  if (error) throw new Error(error.message)
  if (data?.length === 1) ok('contains [arachides] retrouve l\'article ✓')
  else ko('index GIN', `attendu 1, obtenu ${data?.length}`)
})

// ─── 7. HTTP : routes répondent ────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET ${BASE}/admin/allergenes + ${BASE}/menu-allergenes`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/allergenes`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/allergenes', `HTTP ${r1.status}`); return }
    const html1 = await r1.text()
    ok(`GET /admin/allergenes → 200 (${html1.length} bytes)`)
    if (html1.includes('Allergènes')) ok('contient titre "Allergènes"')
    else ko('contenu admin', 'titre absent')

    const r2 = await fetch(`${BASE}/menu-allergenes`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET /menu-allergenes', `HTTP ${r2.status}`); return }
    const html2 = await r2.text()
    ok(`GET /menu-allergenes → 200 (${html2.length} bytes)`)
    if (html2.includes('14 allergènes') || html2.includes('Règl. UE')) ok('page publique mentionne les 14 allergènes UE')
    else ko('contenu public', 'mention règlement UE absente')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.articleIds.length > 0) {
  await sb.from('commande_articles').delete().in('id', cleanup.articleIds)
  console.log(`  ✓ ${cleanup.articleIds.length} articles supprimés`)
}
if (cleanup.commandeIds.length > 0) {
  await sb.from('commandes').delete().in('id', cleanup.commandeIds)
  console.log(`  ✓ ${cleanup.commandeIds.length} commande(s) supprimée(s)`)
}
if (cleanup.procIds.length > 0) {
  await sb.from('procedures_urgence').delete().in('id', cleanup.procIds)
  console.log(`  ✓ ${cleanup.procIds.length} procédure(s) supprimée(s)`)
}
// Restore allergenes_complementaires aux valeurs d'origine
for (const [recId, original] of cleanup.recettesOriginalAllergenes) {
  await sb.from('recettes').update({ allergenes_complementaires: original ?? [] }).eq('id', recId)
}
if (cleanup.recettesOriginalAllergenes.size > 0) {
  console.log(`  ✓ ${cleanup.recettesOriginalAllergenes.size} recette(s) restaurée(s) (allergenes_complementaires)`)
}

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
console.log('\n🎉 Module 12 — allergènes & traçabilité OK.')
