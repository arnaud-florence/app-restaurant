// Test — registre des obligations légales d'ouverture (0147)
//
// Ce que ce test protège : une obligation qui BLOQUE l'exploitation et
// n'a AUCUNE date était invisible de bout en bout. L'agent HACCP filtrait
// sur `date_echeance not null`, l'écran ne la distinguait de rien, et le
// registre donnait donc l'impression rassurante d'être « à jour » alors
// que six lignes pouvaient empêcher d'ouvrir.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
let ok = 0, ko = 0
const T = (c, l, d = '') => { if (c) { ok++; console.log(`  ✓ ${l}`) } else { ko++; console.log(`  ✗ ${l}${d ? ' — ' + d : ''}`) } }

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — obligations légales d\'ouverture                   ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── 1. La colonne existe et son défaut est SÛR ─────────────────────
console.log('\n── la colonne bloquant (0147) ──')
const temoin = (await sb('obligations_legales', {
  method: 'POST',
  body: JSON.stringify({ titre: '__TEST__ obligation témoin', categorie: 'autre', statut: 'a_faire' }),
}))[0]
T(temoin.bloquant === false,
  'une obligation créée sans précision n\'est PAS bloquante',
  'un défaut à true crierait sur tout le registre et serait ignoré au bout d\'une semaine')

// ── 2. Une bloquante SANS date est retrouvée par la requête de l'agent ──
console.log('\n── ce que l\'agent voit ──')
await sb('obligations_legales?id=eq.' + temoin.id, { method: 'PATCH', body: JSON.stringify({ bloquant: true, date_echeance: null }) })
const vues = await sb('obligations_legales?select=id,titre&bloquant=eq.true&statut=neq.fait&date_echeance=is.null')
T(vues.some(o => o.id === temoin.id),
  'une bloquante sans date remonte dans la requête de l\'agent HACCP',
  'c\'est le cas que le filtre `date_echeance not null` laissait passer')

// ── 3. Satisfaite ⇒ silence ────────────────────────────────────────
await sb('obligations_legales?id=eq.' + temoin.id, { method: 'PATCH', body: JSON.stringify({ statut: 'fait' }) })
const apres = await sb('obligations_legales?select=id&bloquant=eq.true&statut=neq.fait&date_echeance=is.null')
T(!apres.some(o => o.id === temoin.id), 'une bloquante marquée « fait » cesse d\'alerter')

// ── 4. L'agent lit bien les deux passages ──────────────────────────
const agent = fs.readFileSync('src/app/api/cron/agents/haccp/route.ts', 'utf8')
T(/\.eq\('bloquant', true\)[\s\S]{0,200}\.is\('date_echeance', null\)/.test(agent),
  'l\'agent fait un second passage sur les bloquantes sans date')
T(agent.includes("findingDejaActif(ctx, 'echeance_legale'"),
  'le second passage passe par la déduplication, comme le premier',
  'sinon une alerte rouge reviendrait à chaque exécution horaire')

// ── 5. L'écran les met en tête et les marque ───────────────────────
console.log('\n── ce que l\'écran montre ──')
const cli = fs.readFileSync('src/app/admin/legal/LegalClient.tsx', 'utf8')
T(cli.includes("BLOQUE L&apos;OUVERTURE"), 'une bloquante porte un badge explicite')
T(cli.includes('aucune date — pas engagée'),
  'l\'absence de date est dite comme un symptôme, pas comme un vide')
T(/bloquantDabord/.test(cli), 'les bloquantes sont triées en tête de liste')
T(cli.includes('{o.notes'), 'les notes s\'affichent — c\'est là que vit le « pourquoi »')

// ── 6. Le registre réel ────────────────────────────────────────────
console.log('\n── le registre en base ──')
const reg = await sb('obligations_legales?select=titre,bloquant,date_echeance,statut&titre=not.like.__TEST__*')
T(reg.length >= 20, `${reg.length} obligations enregistrées`)
const bloq = reg.filter(o => o.bloquant && o.statut !== 'fait')
T(bloq.length > 0, `${bloq.length} bloquante(s) pour l'ouverture`)
T(reg.every(o => o.date_echeance === null || /^\d{4}-\d{2}-\d{2}$/.test(o.date_echeance)),
  'aucune date fantaisiste')
const licence = reg.find(o => /licence iv/i.test(o.titre))
T(licence?.bloquant === true, 'la licence IV est marquée bloquante',
  'sans elle, 7 produits de la carte bar ne peuvent pas être servis')

// ── cleanup ────────────────────────────────────────────────────────
await sb('obligations_legales?id=eq.' + temoin.id, { method: 'DELETE' })
const reste = await sb('obligations_legales?select=id&titre=like.__TEST__*')
T(reste.length === 0, 'témoin supprimé')

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
