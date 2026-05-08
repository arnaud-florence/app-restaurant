// Test RBAC — vérifie la matrice de permissions (lib + spec) et le
// middleware HTTP. Ne nécessite pas de service_role : teste seulement
// les flux non authentifiés + la conformité matrice ↔ spec produit.
//
// Pour les tests E2E avec auth (création user via admin API), voir
// test-rbac-e2e.mjs (TODO si besoin avec SUPABASE_SERVICE_ROLE_KEY).
//
// Exécution : PORT=3000 node scripts/test-rbac.mjs

import { readFileSync } from 'node:fs'

// ─── Charge la lib via le runtime TS de Node 22+ ─────────────────
let permissionsLib
try {
  // Node 22+ : import direct d'un fichier .ts via experimental-strip-types
  // (requiert flag --experimental-strip-types ou Node 24+ par défaut).
  permissionsLib = await import('../src/lib/permissions.ts')
} catch (e) {
  console.error('❌ Impossible de charger la lib /lib/permissions.ts.')
  console.error('   Lancer avec : node --experimental-strip-types scripts/test-rbac.mjs')
  console.error('   ou mettre à jour vers Node 24+.')
  console.error(`   Erreur : ${e.message}`)
  process.exit(1)
}

const { canAccess, isReadOnly, getMainRoute, getPosteFilter, getPermissions } = permissionsLib

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''

let nbOk = 0, nbKo = 0
const fails = []
function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
function step(name, fn) { console.log(`\n→ ${name}`); try { fn() } catch (e) { ko(`${name} (exception)`, e.message) } }
function assert(cond, label, expected, actual) {
  if (cond) ok(label)
  else ko(label, `attendu ${expected}, reçu ${actual}`)
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test RBAC — matrice + middleware                        ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Manager : passe-droit absolu ──────────────────────────────
step('manager : accès et écriture sur tout', () => {
  for (const path of ['/admin/finances', '/admin/recettes', '/admin/securite', '/admin/setup']) {
    assert(canAccess('manager', path), `manager → ${path} = autorisé`, true, false)
    assert(!isReadOnly('manager', path), `manager → ${path} pas en lecture seule`, true, false)
  }
  assert(getMainRoute('manager') === '/admin/pilotage', 'manager.main = /admin/pilotage',
    '/admin/pilotage', getMainRoute('manager'))
})

// ─── 2. Cuisinier : matrice de la spec ────────────────────────────
step('cuisinier : 7 modules autorisés + 3 en lecture seule', () => {
  const cuisinier_allowed = [
    '/cuisine', '/admin/recettes', '/admin/ingredients', '/admin/stock',
    '/admin/hygiene', '/admin/allergenes', '/admin/dechets',
  ]
  const cuisinier_denied = [
    '/admin/finances', '/admin/rh', '/admin/securite', '/admin/setup',
    '/admin/boissons', '/admin/reservations', '/serveur', '/bar',
  ]
  const cuisinier_readonly = ['/admin/recettes', '/admin/ingredients', '/admin/allergenes']

  for (const p of cuisinier_allowed) {
    assert(canAccess('cuisine', p), `cuisinier → ${p} autorisé`, true, false)
  }
  for (const p of cuisinier_denied) {
    assert(!canAccess('cuisine', p), `cuisinier → ${p} refusé`, false, true)
  }
  for (const p of cuisinier_readonly) {
    assert(isReadOnly('cuisine', p), `cuisinier → ${p} lecture seule`, true, false)
  }
  // /admin/stock NOT readonly pour cuisinier (déduction tablette)
  assert(!isReadOnly('cuisine', '/admin/stock'), 'cuisinier → /admin/stock pas en lecture seule', false, true)
})

// ─── 3. Pizzaiolo : filtre contenu PIZZA ──────────────────────────
step('pizzaiolo : filtre tag PIZZA + lecture seule recettes', () => {
  const filter = getPosteFilter('pizzaiolo')
  assert(JSON.stringify(filter.recetteTags) === '["PIZZA"]',
    'pizzaiolo filterTags = [PIZZA]', '["PIZZA"]', JSON.stringify(filter.recetteTags))
  assert(canAccess('pizzaiolo', '/admin/recettes'), 'pizzaiolo accède à /admin/recettes', true, false)
  assert(!canAccess('pizzaiolo', '/admin/finances'), 'pizzaiolo bloqué sur /admin/finances', false, true)
  assert(isReadOnly('pizzaiolo', '/admin/recettes'), 'pizzaiolo /admin/recettes en lecture seule', true, false)
  assert(getMainRoute('pizzaiolo') === '/cuisine?role=pizzaiolo',
    'pizzaiolo.main = /cuisine?role=pizzaiolo', '/cuisine?role=pizzaiolo', getMainRoute('pizzaiolo'))
})

// ─── 4. Serveur : 4 lectures seules + accès /serveur /caisse ──────
step('serveur : matrice service salle', () => {
  const allowed = ['/serveur', '/caisse', '/admin/clients', '/admin/allergenes',
                   '/admin/boissons', '/admin/reservations', '/admin/hygiene']
  const denied = ['/cuisine', '/bar', '/admin/finances', '/admin/recettes', '/admin/ingredients']
  const readonly = ['/admin/allergenes', '/admin/boissons', '/admin/reservations', '/admin/evenements']

  for (const p of allowed)  assert(canAccess('serveur', p),  `serveur → ${p} autorisé`, true, false)
  for (const p of denied)   assert(!canAccess('serveur', p), `serveur → ${p} refusé`, false, true)
  for (const p of readonly) assert(isReadOnly('serveur', p), `serveur → ${p} lecture seule`, true, false)

  // L'alias 'salle' = serveur
  assert(canAccess('salle', '/serveur'), 'alias salle ≡ serveur', true, false)
})

// ─── 5. Barman : filtre contenu BAR ───────────────────────────────
step('barman : filtre tag BAR + écriture boissons', () => {
  const filter = getPosteFilter('barman')
  assert(JSON.stringify(filter.recetteTags) === '["BAR"]',
    'barman filterTags = [BAR]', '["BAR"]', JSON.stringify(filter.recetteTags))
  assert(canAccess('barman', '/admin/boissons'), 'barman accède /admin/boissons', true, false)
  assert(!isReadOnly('barman', '/admin/boissons'), 'barman /admin/boissons en écriture', false, true)
  assert(canAccess('barman', '/bar'), 'barman accède /bar', true, false)
  assert(!canAccess('barman', '/serveur'), 'barman bloqué sur /serveur', false, true)
  // Alias 'bar' = barman
  assert(canAccess('bar', '/bar'), 'alias bar ≡ barman', true, false)
})

// ─── 6. Réceptionniste : 1 lecture seule ──────────────────────────
step('réceptionniste : reservations/evenements/clients en écriture, allergenes lecture seule', () => {
  for (const p of ['/admin/reservations', '/admin/evenements', '/admin/clients', '/admin/groupes']) {
    assert(canAccess('receptionniste', p), `réceptionniste → ${p} autorisé`, true, false)
    assert(!isReadOnly('receptionniste', p), `réceptionniste → ${p} pas en lecture seule`, false, true)
  }
  assert(isReadOnly('receptionniste', '/admin/allergenes'),
    'réceptionniste → /admin/allergenes lecture seule', true, false)
  assert(!canAccess('receptionniste', '/cuisine'), 'réceptionniste bloqué /cuisine', false, true)
})

// ─── 7. Plonge / extra : 2 modules seulement ──────────────────────
step('plonge : hygiene + dechets uniquement', () => {
  assert(canAccess('plonge', '/admin/hygiene'), 'plonge → /admin/hygiene', true, false)
  assert(canAccess('plonge', '/admin/dechets'), 'plonge → /admin/dechets', true, false)
  assert(!canAccess('plonge', '/admin/recettes'), 'plonge bloqué /admin/recettes', false, true)
  assert(getMainRoute('plonge') === '/admin/hygiene', 'plonge.main = /admin/hygiene',
    '/admin/hygiene', getMainRoute('plonge'))
  // Alias 'extra'
  assert(canAccess('extra', '/admin/hygiene'), 'alias extra ≡ plonge', true, false)
})

// ─── 8. Second / Chef : tous les modules cuisine en écriture ─────
step('second : 13 modules cuisine en écriture', () => {
  const allowed = ['/cuisine', '/admin/recettes', '/admin/recettes/engineering',
                   '/admin/ingredients', '/admin/stock', '/admin/fournisseurs',
                   '/admin/boissons', '/admin/hygiene', '/admin/allergenes',
                   '/admin/dechets', '/admin/previsionnel', '/admin/journal']
  for (const p of allowed) {
    assert(canAccess('second', p),  `second → ${p} autorisé`, true, false)
    assert(!isReadOnly('second', p), `second → ${p} en écriture`, false, true)
  }
  assert(!canAccess('second', '/admin/finances'), 'second bloqué /admin/finances', false, true)
  assert(!canAccess('second', '/admin/securite'), 'second bloqué /admin/securite', false, true)
})

// ─── 9. Custom permissions (overrides) ────────────────────────────
step('overrides : denied/allowed/readonly/writable surchargent la matrice', () => {
  const cuisinier = 'cuisine'

  // Denied lève un accès matrice
  assert(!canAccess(cuisinier, '/admin/recettes', { denied: ['/admin/recettes'] }),
    'override denied bloque', false, true)

  // Allowed accorde une route normalement refusée
  assert(canAccess(cuisinier, '/admin/finances', { allowed: ['/admin/finances'] }),
    'override allowed accorde', true, false)

  // Writable lève le readonly de la matrice
  assert(!isReadOnly(cuisinier, '/admin/recettes', { writable: ['/admin/recettes'] }),
    'override writable lève readonly', false, true)

  // Readonly force un readonly sur une route normalement en écriture
  assert(isReadOnly(cuisinier, '/admin/dechets', { readonly: ['/admin/dechets'] }),
    'override readonly impose', true, false)

  // Manager n'est jamais en lecture seule (override n'a pas d'effet)
  assert(!isReadOnly('manager', '/admin/recettes', { readonly: ['/admin/recettes'] }),
    'manager : readonly override sans effet', false, true)
})

// ─── 10. HTTP smoke (middleware) ──────────────────────────────────
if (BASE) {
  console.log('\n→ HTTP : middleware redirige /admin/* sans cookie')
  let serverUp = false
  try { const r = await fetch(BASE, { signal: AbortSignal.timeout(3000) }); serverUp = r.ok || r.status < 500 }
  catch { console.log('  ⚠ pas de dev server'); }

  if (serverUp) {
    for (const path of ['/admin/pilotage', '/admin/finances', '/admin/recettes', '/admin/securite']) {
      const r = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const loc = r.headers.get('location') ?? ''
      if (r.status === 307 && loc.includes('/login')) ok(`${path} → 307 /login (middleware)`)
      else ko(path, `HTTP ${r.status} → ${loc}`)
    }
    for (const path of ['/serveur', '/cuisine', '/bar', '/caisse']) {
      const r = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      if (r.status === 200) ok(`${path} → 200 (kiosk libre)`)
      else ko(path, `HTTP ${r.status}`)
    }
  }
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Bilan ────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Test RBAC OK.')
