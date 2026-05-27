// Phase E — Test des permissions RBAC pour les nouveaux postes snack + livreur.

// Node 24+ supporte l'import direct de .ts
const { canAccess, getMainRoute } = await import('../src/lib/permissions.ts')

const tests = []
let passed = 0
let failed = 0

function check(name, expected, actual) {
  tests.push({ name, expected, actual, ok: expected === actual })
  if (expected === actual) passed++
  else failed++
}

// ── SNACK ──
check('snack → main route', '/emporter', getMainRoute('snack'))
check('snack accès /emporter', true, canAccess('snack', '/emporter'))
check('snack accès /caisse', true, canAccess('snack', '/caisse'))
check('snack accès /bar', true, canAccess('snack', '/bar'))
check('snack accès /cuisine', true, canAccess('snack', '/cuisine'))
check('snack accès /admin/borne', true, canAccess('snack', '/admin/borne'))
check('snack accès /admin/clients', true, canAccess('snack', '/admin/clients'))
check('snack accès /admin/hygiene', true, canAccess('snack', '/admin/hygiene'))
check('snack accès /admin/dechets', true, canAccess('snack', '/admin/dechets'))
check('snack accès /formation', true, canAccess('snack', '/formation'))
check('snack REFUSÉ /admin/finances', false, canAccess('snack', '/admin/finances'))
check('snack REFUSÉ /admin/rh', false, canAccess('snack', '/admin/rh'))
check('snack REFUSÉ /admin/securite', false, canAccess('snack', '/admin/securite'))
check('snack REFUSÉ /admin/recettes', false, canAccess('snack', '/admin/recettes'))

// ── LIVREUR ──
check('livreur → main route', '/livreur', getMainRoute('livreur'))
check('livreur accès /livreur', true, canAccess('livreur', '/livreur'))
check('livreur accès /admin/clients', true, canAccess('livreur', '/admin/clients'))
check('livreur accès /admin/hygiene', true, canAccess('livreur', '/admin/hygiene'))
check('livreur accès /equipes', true, canAccess('livreur', '/equipes'))
check('livreur accès /formation', true, canAccess('livreur', '/formation'))
check('livreur REFUSÉ /serveur', false, canAccess('livreur', '/serveur'))
check('livreur REFUSÉ /cuisine', false, canAccess('livreur', '/cuisine'))
check('livreur REFUSÉ /caisse', false, canAccess('livreur', '/caisse'))
check('livreur REFUSÉ /admin/finances', false, canAccess('livreur', '/admin/finances'))
check('livreur REFUSÉ /admin/recettes', false, canAccess('livreur', '/admin/recettes'))

// ── Vérifications collatérales (pas de régression) ──
check('manager accès tout', true, canAccess('manager', '/admin/finances'))
check('serveur accès /serveur', true, canAccess('serveur', '/serveur'))
check('cuisinier accès /cuisine', true, canAccess('cuisinier', '/cuisine'))
check('plonge REFUSÉ /cuisine', false, canAccess('plonge', '/cuisine'))

// ── Rapport ──
console.log(`\nTests RBAC snack/livreur : ${passed}/${tests.length} ✓\n`)
for (const t of tests) {
  const icon = t.ok ? '✓' : '✗'
  const det = t.ok ? '' : ` (attendu=${t.expected} reçu=${t.actual})`
  console.log(`  ${icon} ${t.name}${det}`)
}

if (failed > 0) {
  console.log(`\n❌ ${failed} échecs`)
  process.exit(1)
}
console.log(`\n✅ Tous les tests passent.`)
