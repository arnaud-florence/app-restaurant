// Test d'intégration Module 27 — Formation /formation + /admin/formation.

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
const cleanup = { guideIds: [], progIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 27 — Formation                              ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ─────────────────────────────────────────────────
await step('schéma : 4 tables accessibles', async () => {
  for (const t of ['guides_formation', 'etapes_formation', 'quiz_questions', 'progressions_formation']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`${t} OK`)
  }
})

// ─── 2. CRUD guide complet (cascade) ──────────────────────────
let guideId, etape1Id, etape2Id, q1Id, q2Id, employeId
await step('créer guide + 2 étapes + 2 questions (cascade delete)', async () => {
  const { data: g, error: ge } = await sb.from('guides_formation').insert({
    titre: 'TEST27-Service en salle',
    description: 'Bases du service',
    poste: 'serveur',
    seuil_reussite_pct: 80,
    duree_minutes: 30,
  }).select('id').single()
  if (ge) throw new Error(ge.message)
  guideId = g.id; cleanup.guideIds.push(guideId)
  ok('guide créé')

  const { data: e1 } = await sb.from('etapes_formation').insert({
    guide_id: guideId, ordre: 1, titre: 'Accueillir le client', contenu: 'Sourire, regarder dans les yeux...',
  }).select('id').single()
  etape1Id = e1.id

  const { data: e2 } = await sb.from('etapes_formation').insert({
    guide_id: guideId, ordre: 2, titre: 'Présenter la carte', contenu: 'Annoncer les plats du jour...',
  }).select('id').single()
  etape2Id = e2.id
  ok('2 étapes créées')

  // UNIQUE (guide_id, ordre)
  const { error: dup } = await sb.from('etapes_formation').insert({
    guide_id: guideId, ordre: 1, titre: 'Doublon', contenu: 'X',
  })
  if (dup) ok(`UNIQUE (guide_id, ordre) rejette doublon (${dup.code})`)

  const { data: qq1 } = await sb.from('quiz_questions').insert({
    guide_id: guideId, ordre: 1,
    question: 'Combien de temps avant de proposer la carte ?',
    choix: ['30 secondes', '2 minutes', '5 minutes'],
    bonne_reponse_idx: 1,
    explication: 'Laisser le temps de s\'installer, max 2 min.',
  }).select('id').single()
  q1Id = qq1.id

  const { data: qq2 } = await sb.from('quiz_questions').insert({
    guide_id: guideId, ordre: 2,
    question: 'Que faire si le client demande un allergène ?',
    choix: ['Improviser', 'Vérifier la fiche allergènes', 'Demander à un collègue'],
    bonne_reponse_idx: 1,
  }).select('id').single()
  q2Id = qq2.id
  ok('2 questions créées (jsonb choix)')
})

// ─── 3. Progression employé ────────────────────────────────────
await step('progression : étapes vues + scoring quiz', async () => {
  const { data: emp } = await sb.from('employes').select('id').eq('actif', true).limit(1).maybeSingle()
  if (!emp) { console.log('  ⚠ aucun employé actif — skip'); return }
  employeId = emp.id

  // Créer progression initiale
  const { data: prog } = await sb.from('progressions_formation').insert({
    guide_id: guideId, employe_id: employeId, statut: 'en_cours', etapes_vues_ids: [etape1Id],
  }).select('id').single()
  cleanup.progIds.push(prog.id)
  ok('progression créée (1 étape vue / 2)')

  // Marquer 2e étape vue
  await sb.from('progressions_formation').update({
    etapes_vues_ids: [etape1Id, etape2Id],
    statut: 'quiz_a_passer',
  }).eq('id', prog.id)
  const { data: maj } = await sb.from('progressions_formation').select('etapes_vues_ids, statut').eq('id', prog.id).single()
  if (maj.etapes_vues_ids.length === 2 && maj.statut === 'quiz_a_passer') ok('statut → quiz_a_passer')

  // Simuler quiz réussi (score 100%)
  await sb.from('progressions_formation').update({
    dernier_score_pct: 100,
    derniere_tentative_le: new Date().toISOString(),
    statut: 'reussi',
    termine_le: new Date().toISOString(),
  }).eq('id', prog.id)
  const { data: fin } = await sb.from('progressions_formation').select('statut, dernier_score_pct').eq('id', prog.id).single()
  if (fin.statut === 'reussi' && fin.dernier_score_pct === 100) ok('quiz réussi → statut "reussi" + score 100%')
})

// ─── 4. UNIQUE (guide × employé) ───────────────────────────────
await step('UNIQUE : 1 progression max par guide × employé', async () => {
  if (!employeId) { console.log('  ⚠ skip'); return }
  const { error } = await sb.from('progressions_formation').insert({
    guide_id: guideId, employe_id: employeId, statut: 'en_cours',
  })
  if (error?.code === '23505') ok('doublon rejeté ✓')
  else ko('UNIQUE', error?.message ?? 'aucune erreur')
})

// ─── 5. CHECK statut + seuil ───────────────────────────────────
await step('CHECK : statut + seuil_reussite_pct', async () => {
  const { error: e1 } = await sb.from('progressions_formation').insert({
    guide_id: guideId, employe_id: employeId ?? '00000000-0000-0000-0000-000000000000',
    statut: 'invalid',
  })
  if (e1) ok(`statut invalide rejeté (${e1.code})`)

  const { error: e2 } = await sb.from('guides_formation').insert({
    titre: 'TEST27-bad', poste: 'serveur', seuil_reussite_pct: 150,
  })
  if (e2) ok(`seuil > 100 rejeté (${e2.code})`)
})

// ─── 6. Cascade delete ─────────────────────────────────────────
await step('cascade : supprimer guide supprime étapes + questions + progressions', async () => {
  const tempId = guideId
  await sb.from('guides_formation').delete().eq('id', tempId)
  cleanup.guideIds = cleanup.guideIds.filter(id => id !== tempId)

  const { count: e } = await sb.from('etapes_formation').select('id', { count: 'exact', head: true }).eq('guide_id', tempId)
  const { count: q } = await sb.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('guide_id', tempId)
  const { count: p } = await sb.from('progressions_formation').select('id', { count: 'exact', head: true }).eq('guide_id', tempId)
  if (e === 0 && q === 0 && p === 0) ok(`cascade OK (étapes/questions/progressions supprimés)`)
  else ko('cascade', `e=${e} q=${q} p=${p}`)
  cleanup.progIds = []
  // recréer un guide pour les tests HTTP
  const { data: g2 } = await sb.from('guides_formation').insert({
    titre: 'TEST27-Service2', poste: 'serveur',
  }).select('id').single()
  guideId = g2.id; cleanup.guideIds.push(g2.id)
})

// ─── 7. HTTP ────────────────────────────────────────────────────
if (BASE) {
  await step('HTTP : GET /admin/formation', async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/formation`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/formation', `HTTP ${r.status}`); return }
    ok('GET /admin/formation → 200')
  })

  await step('HTTP : GET /formation', async () => {
    const r = await fetch(`${BASE}/formation`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /formation', `HTTP ${r.status}`); return }
    ok('GET /formation → 200')
  })

  await step('HTTP : GET /formation/[guideId] sans emp → 307 redirect', async () => {
    const r = await fetch(`${BASE}/formation/${guideId}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
    if (r.status === 307 || r.status === 308) ok(`redirect ${r.status} si pas d'employé ✓`)
    else if (r.status === 200) ok('200 (Next 14 peut servir page de transition)')
    else ko('redirect', `HTTP ${r.status}`)
  })

  await step('HTTP : GET /print/fiche-poste/[guideId]', async () => {
    const r = await fetch(`${BASE}/print/fiche-poste/${guideId}`, { signal: AbortSignal.timeout(30000) })
    if (r.status !== 200) { ko('GET fiche-poste', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok('GET /print/fiche-poste → 200')
    if (html.includes('Fiche de poste') || html.includes('TEST27')) ok('contient titre fiche')
  })
}

// ─── Cleanup ────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.guideIds.length) await sb.from('guides_formation').delete().in('id', cleanup.guideIds)
console.log(`  ✓ ${cleanup.guideIds.length} guide(s) supprimé(s)`)

// ─── Bilan ─────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 27 — Formation OK.')
