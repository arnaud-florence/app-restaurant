// Test — paliers de gérance
//
// Ce que ce test protège :
//  1. un palier ne s'atteint QUE si tous ses guides sont réussis ;
//  2. le palier 3 n'a pas de guide et ne doit JAMAIS s'atteindre tout seul —
//     il se constate, et le marquer atteint parce qu'il n'a rien à valider
//     serait exactement le contraire de son intention ;
//  3. la certification est idempotente : repasser un quiz ne réécrit pas une
//     date déjà acquise ;
//  4. chaque guide nommé dans un palier EXISTE réellement en base. Un titre
//     mal recopié rendrait le palier inatteignable, en silence.
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
console.log('║ Test — paliers de gérance                                ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── La règle, recopiée depuis src/lib/paliers-gerance.ts ───────────
// ⚠️ Le source est en TS : ce test RECOPIE la logique. Modifier les deux
// ensemble — comme test-commande-statut.mjs pour la règle de statut.
const src = fs.readFileSync('src/lib/paliers-gerance.ts', 'utf8')
// ⚠️ Les titres alternent guillemets simples et doubles — « Manageuse 2 »
// en porte des doubles parce qu'il contient une apostrophe. Ne lire que les
// simples faisait croire à un palier d'un seul guide, et le test passait au
// vert sur une règle fausse.
const blocs = [...src.matchAll(/cle: '([^']+)'[\s\S]*?guides: \[([\s\S]*?)\]/g)]
const PALIERS = blocs.map(m => ({
  cle: m[1],
  guides: [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map(x => x[1] ?? x[2]).filter(Boolean),
}))
const etatPaliers = (reussis) => PALIERS.map(p => ({
  cle: p.cle, total: p.guides.length,
  acquis: p.guides.filter(g => reussis.includes(g)).length,
  atteint: p.guides.length > 0 && p.guides.every(g => reussis.includes(g)),
}))

console.log(`\n── ${PALIERS.length} paliers ──`)
T(PALIERS.length === 3, '3 paliers définis')

// ── 1. Les titres de guides existent vraiment ──────────────────────
console.log('\n── les guides nommés existent ──')
const guides = await sb('guides_formation?select=titre&actif=eq.true')
const enBase = new Set(guides.map(g => g.titre.trim()))
const fantomes = PALIERS.flatMap(p => p.guides).filter(g => !enBase.has(g.trim()))
T(fantomes.length === 0,
  'chaque guide nommé dans un palier existe en base',
  fantomes.join(' | ') + ' — un titre mal recopié rend le palier inatteignable en silence')

// ── 2. Un palier ne s'atteint qu'au complet ────────────────────────
console.log('\n── la règle ──')
const p1 = PALIERS[0].guides
T(!etatPaliers([p1[0]])[0].atteint, 'un seul guide sur deux ne suffit pas au palier 1')
T(etatPaliers(p1)[0].atteint, 'les deux guides du palier 1 le font atteindre')
T(etatPaliers([])[0].acquis === 0, 'sans progression, rien n\'est acquis')

// ── 3. Le palier sans guide ne s'atteint jamais seul ───────────────
const tous = PALIERS.flatMap(p => p.guides)
const etats = etatPaliers(tous)
const sansGuide = etats.filter(e => e.total === 0)
T(sansGuide.length === 1, 'un palier n\'a volontairement aucun guide')
T(sansGuide.every(e => !e.atteint),
  'un palier sans guide n\'est JAMAIS atteint automatiquement',
  'le marquer atteint parce qu\'il n\'a rien à valider serait le contraire de son intention')
T(etats.filter(e => e.atteint).length === 2,
  'tous les guides réussis → 2 paliers sur 3')

// ── 4. La certification est idempotente ────────────────────────────
console.log('\n── certification ──')
const emp = (await sb('employes?select=id&prenom=eq.Ambre'))[0]
const cle = '__TEST__palier'
await sb('certifications?employe_id=eq.' + emp.id + '&poste=eq.' + cle, { method: 'DELETE' })
const c1 = await sb('certifications', { method: 'POST',
  body: JSON.stringify({ employe_id: emp.id, poste: cle, score_pct: 88 }) })
T(c1.length === 1, 'une certification s\'enregistre')
let refus = false
try { await sb('certifications', { method: 'POST',
  body: JSON.stringify({ employe_id: emp.id, poste: cle, score_pct: 100 }) }) }
catch { refus = true }
T(refus, 'un doublon est refusé par la base',
  'repasser un quiz ne doit pas réécrire une date déjà acquise')
const relu = await sb('certifications?select=score_pct&employe_id=eq.' + emp.id + '&poste=eq.' + cle)
T(Number(relu[0].score_pct) === 88, 'la date et le score du PREMIER passage sont conservés')
await sb('certifications?employe_id=eq.' + emp.id + '&poste=eq.' + cle, { method: 'DELETE' })
T((await sb('certifications?select=poste&employe_id=eq.' + emp.id + '&poste=eq.' + cle)).length === 0,
  'témoin supprimé')

// ── 5. Ce qui s'ouvre est cohérent avec la réalité ─────────────────
console.log('\n── cohérence avec les accès ──')
T(/\/admin\/co-gerant/.test(fs.readFileSync('src/app/admin/co-gerant/page.tsx', 'utf8')),
  'le co-gérant existe')
// ⚠️ Chercher l'ABSENCE de « requireManager() » dans le fichier ne marche
// pas : le commentaire qui explique le changement contient le mot. On teste
// donc ce qui est VRAI — la page passe par les permissions.
const pageCoGerant = fs.readFileSync('src/app/admin/co-gerant/page.tsx', 'utf8')
T(/await requireAccess\('\/admin\/co-gerant'\)/.test(pageCoGerant),
  'le co-gérant passe par les permissions, plus par le seul rôle manager',
  'aucune permission ne pouvait l\'ouvrir')
T(/readOnly=\{lectureSeule\}/.test(pageCoGerant),
  'un non-manager y entre en lecture seule')
T(fs.readFileSync('src/app/admin/co-gerant/actions.ts', 'utf8').includes('requireManager()'),
  'mais ses ACTIONS restent réservées au manager',
  'on regarde comment une décision se construit avant d\'en prendre une')

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
