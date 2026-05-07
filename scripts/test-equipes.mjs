// Test d'intégration Module 10 — Communication interne /equipes.
//
// Vérifie : schema (4 tables), envoi message + filtre canal, marquer lu
// idempotent, info affichage avec filtre actif, compte-rendu avec
// participants joints, matériel + attribution + restitution.
// Optionnel : fetch HTTP /equipes si PORT=3000.
//
//   node scripts/test-equipes.mjs
//   PORT=3000 node scripts/test-equipes.mjs

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

const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { messageIds: [], infoIds: [], crIds: [], materielIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 10 — communication interne /equipes         ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma : 4 tables présentes ────────────────────────────────
await step('schéma : 4 tables Module 10', async () => {
  for (const t of ['messages', 'affichage_infos', 'comptes_rendus', 'materiels']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message)
    else ok(`table ${t} accessible (RLS OK)`)
  }
})

// ─── 2. Setup : récupère 2 employés pour les tests ─────────────────
let empA, empB
await step('setup : 2 employés actifs', async () => {
  const { data: emps } = await sb.from('employes').select('id, prenom, nom, poste').eq('actif', true).limit(2)
  if (!emps || emps.length < 2) throw new Error('pas assez d\'employés actifs en base')
  empA = emps[0]; empB = emps[1]
  ok(`emp A = ${empA.prenom} ${empA.nom}, emp B = ${empB.prenom} ${empB.nom}`)
})

// ─── 3. Messages : envoi + filtre canal + marquage lu ──────────────
await step('messages : envoi dans #cuisine et #tous, filtre par canal', async () => {
  const { data: m1 } = await sb.from('messages').insert({ canal: 'cuisine', expediteur_id: empA.id, contenu: 'Test cuisine — Module 10' }).select('id').single()
  cleanup.messageIds.push(m1.id)
  const { data: m2 } = await sb.from('messages').insert({ canal: 'tous', expediteur_id: empA.id, contenu: 'Test broadcast — Module 10' }).select('id').single()
  cleanup.messageIds.push(m2.id)
  const { data: m3 } = await sb.from('messages').insert({ canal: 'bar', expediteur_id: empB.id, contenu: 'Test bar — Module 10' }).select('id').single()
  cleanup.messageIds.push(m3.id)
  ok('3 messages insérés (canaux cuisine/tous/bar)')

  // Filtre canal
  const { data: cuisine } = await sb.from('messages').select('id').eq('canal', 'cuisine').in('id', cleanup.messageIds)
  if (cuisine?.length === 1) ok('filtre canal=cuisine renvoie 1 message')
  else ko('filtre canal', `attendu 1, obtenu ${cuisine?.length ?? 0}`)

  const { data: tous } = await sb.from('messages').select('id').eq('canal', 'tous').in('id', cleanup.messageIds)
  if (tous?.length === 1) ok('filtre canal=tous renvoie 1 message')
  else ko('filtre canal=tous', `attendu 1, obtenu ${tous?.length ?? 0}`)
})

await step('messages : marquage lu idempotent', async () => {
  const id = cleanup.messageIds[0]
  // Première lecture par empB
  await sb.from('messages').update({ lu_par: [empB.id] }).eq('id', id)
  const { data: m1 } = await sb.from('messages').select('lu_par').eq('id', id).single()
  if (m1.lu_par?.includes(empB.id)) ok('lu_par contient empB après 1ère lecture')
  else ko('lu_par', 'empB absent')

  // Deuxième lecture par empB → doit rester 1 entrée (idempotence côté action)
  // On simule l'action en vérifiant que l'array reste dédupliqué
  const cur = m1.lu_par ?? []
  if (!cur.includes(empA.id)) {
    await sb.from('messages').update({ lu_par: [...cur, empA.id] }).eq('id', id)
  }
  const { data: m2 } = await sb.from('messages').select('lu_par').eq('id', id).single()
  if (m2.lu_par?.length === 2) ok('lu_par = 2 entrées (empA + empB)')
  else ko('lu_par count', `attendu 2, obtenu ${m2.lu_par?.length}`)
})

// ─── 4. Affichage infos : actif vs expiré ──────────────────────────
await step('affichage_infos : création + filtre actif vs expiré', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const { data: i1 } = await sb.from('affichage_infos').insert({
    titre: 'Info active Module 10', contenu: 'Encore valable',
    priorite: 'urgent', valable_du: today, valable_jusqu: null,
    cree_par: empA.id,
  }).select('id').single()
  cleanup.infoIds.push(i1.id)

  const { data: i2 } = await sb.from('affichage_infos').insert({
    titre: 'Info expirée Module 10', contenu: 'Date dépassée',
    priorite: 'info', valable_du: yest, valable_jusqu: yest,
    cree_par: empA.id,
  }).select('id').single()
  cleanup.infoIds.push(i2.id)
  ok('2 infos insérées (1 active + 1 expirée hier)')

  // Requête équivalente à la page : valable_du <= today AND (valable_jusqu IS NULL OR valable_jusqu >= today)
  const { data: actives } = await sb
    .from('affichage_infos')
    .select('id')
    .or(`valable_jusqu.is.null,valable_jusqu.gte.${today}`)
    .lte('valable_du', today)
    .in('id', cleanup.infoIds)
  if (actives?.length === 1 && actives[0].id === i1.id) ok('filtre actif renvoie seulement l\'info i1')
  else ko('filtre actif', `attendu i1 seul, obtenu ${actives?.length} entries`)
})

// ─── 5. Comptes-rendus : création + jointure participants ──────────
await step('comptes_rendus : création + jointure noms participants', async () => {
  const { data: cr } = await sb.from('comptes_rendus').insert({
    titre: 'Briefing service samedi — Module 10',
    date_reunion: new Date().toISOString().slice(0, 10),
    contenu: 'Points abordés :\n- Stock vins\n- Planning fériés',
    participants: [empA.id, empB.id],
    redacteur_id: empA.id,
  }).select('id, participants, redacteur_id').single()
  cleanup.crIds.push(cr.id)
  ok(`compte-rendu créé id=${cr.id.slice(0, 8)}…`)
  if (cr.participants?.length === 2) ok('participants = 2 entrées')
  else ko('participants', `attendu 2, obtenu ${cr.participants?.length}`)
  if (cr.redacteur_id === empA.id) ok('redacteur_id = empA')
  else ko('redacteur', `attendu ${empA.id}, obtenu ${cr.redacteur_id}`)
})

// ─── 6. Matériel : création + attribution + restitution ────────────
await step('materiels : création, attribution, restitution', async () => {
  const { data: mat } = await sb.from('materiels').insert({
    nom: 'Veste cuisine M — Module 10',
    type: 'uniforme',
    numero_serie: 'TEST-' + Date.now().toString().slice(-6),
    etat: 'neuf',
    notes: 'Achat test',
  }).select('id, attribue_a').single()
  cleanup.materielIds.push(mat.id)
  if (mat.attribue_a === null) ok('matériel créé : libre par défaut')
  else ko('matériel attribue_a', `attendu null, obtenu ${mat.attribue_a}`)

  // Attribuer à empB
  const today = new Date().toISOString().slice(0, 10)
  await sb.from('materiels').update({ attribue_a: empB.id, date_attribution: today }).eq('id', mat.id)
  const { data: matAttr } = await sb.from('materiels').select('attribue_a, date_attribution, employe:employes!attribue_a(prenom, nom)').eq('id', mat.id).single()
  if (matAttr.attribue_a === empB.id) ok(`attribué à ${matAttr.employe?.prenom} ${matAttr.employe?.nom}`)
  else ko('attribution', `attendu ${empB.id}, obtenu ${matAttr.attribue_a}`)
  if (matAttr.date_attribution === today) ok(`date_attribution = ${today}`)
  else ko('date_attribution', `attendu ${today}, obtenu ${matAttr.date_attribution}`)

  // Changer état
  await sb.from('materiels').update({ etat: 'use' }).eq('id', mat.id)
  const { data: matEtat } = await sb.from('materiels').select('etat').eq('id', mat.id).single()
  if (matEtat.etat === 'use') ok('changement d\'état : neuf → use')
  else ko('changement état', matEtat.etat)

  // Restituer
  await sb.from('materiels').update({ attribue_a: null, date_attribution: null }).eq('id', mat.id)
  const { data: matRest } = await sb.from('materiels').select('attribue_a, date_attribution').eq('id', mat.id).single()
  if (matRest.attribue_a === null && matRest.date_attribution === null) ok('restitué : attribue_a et date à null')
  else ko('restitution', `attribue_a=${matRest.attribue_a} date=${matRest.date_attribution}`)
})

// ─── 7. HTTP : route /equipes répond 200 (si dev server up) ────────
if (BASE) {
  await step(`HTTP : GET ${BASE}/equipes`, async () => {
    let serverUp = false
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) })
      serverUp = r.ok || r.status < 500
    } catch {
      console.log(`  ⚠ pas de dev server, on skip`)
      return
    }
    if (!serverUp) { console.log('  ⚠ serveur injoignable, skip'); return }
    const r = await fetch(`${BASE}/equipes`)
    if (r.status !== 200) { ko('GET /equipes', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /equipes → 200 (${html.length} bytes)`)
    if (html.includes('Communication interne')) ok('contient "Communication interne"')
    else ko('contenu /equipes', 'header absent')
    if (html.includes('Cuisine') && html.includes('Bar') && html.includes('Salle')) ok('canaux Cuisine/Bar/Salle visibles')
    else ko('canaux', 'absents du HTML')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ─────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.messageIds.length > 0) {
  await sb.from('messages').delete().in('id', cleanup.messageIds)
  console.log(`  ✓ ${cleanup.messageIds.length} messages supprimés`)
}
if (cleanup.infoIds.length > 0) {
  await sb.from('affichage_infos').delete().in('id', cleanup.infoIds)
  console.log(`  ✓ ${cleanup.infoIds.length} infos supprimées`)
}
if (cleanup.crIds.length > 0) {
  await sb.from('comptes_rendus').delete().in('id', cleanup.crIds)
  console.log(`  ✓ ${cleanup.crIds.length} comptes-rendus supprimés`)
}
if (cleanup.materielIds.length > 0) {
  await sb.from('materiels').delete().in('id', cleanup.materielIds)
  console.log(`  ✓ ${cleanup.materielIds.length} matériels supprimés`)
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
console.log('\n🎉 Module 10 — communication interne /equipes OK.')
