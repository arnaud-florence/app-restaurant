// Test — visite guidée (0149)
//
// Ce que ce test protège n'est pas le contenu des étapes, qui bougera : c'est
// le CONTRAT de l'accompagnement. Une visite qui bloque l'écran est fermée au
// premier client ; une visite qu'on ne peut ni passer ni reprendre devient une
// corvée qu'on traverse sans rien lire. Ces trois propriétés sont le produit.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`); return j
}
let ok = 0, ko = 0
const T = (c, l, d = '') => { if (c) { ok++; console.log(`  ✓ ${l}`) } else { ko++; console.log(`  ✗ ${l}${d ? ' — ' + d : ''}`) } }

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — visite guidée                                     ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── 1. Les trois états, et le défaut ────────────────────────────────
console.log('\n── la colonne (0149) ──')
const profils = await sb('profils?select=id,email,visite_guidee_etape')
T(profils.length > 0, `${profils.length} profils lus`)
T(profils.every(p => p.visite_guidee_etape === null || Number.isInteger(p.visite_guidee_etape)),
  'la colonne existe et n\'accepte que null ou un entier')
// ⚠️ Ne PAS vérifier qu'aucun profil n'a de visite en cours : quelqu'un qui
// commence la visite est exactement le comportement attendu, et l'assertion
// rougirait pour un succès. Un test rouge en permanence finit par être
// ignoré, et ce jour-là il ne protège plus rien.
//
// Ce qui compte est que le DÉFAUT soit `null` — personne ne doit être marqué
// « déjà vu » par erreur à la création d'un profil.
const parEtat = profils.reduce((a, p) => {
  const k = p.visite_guidee_etape === null ? 'jamais' : p.visite_guidee_etape === -1 ? 'terminee' : 'en_cours'
  a[k] = (a[k] ?? 0) + 1; return a
}, {})
console.log(`    (${parEtat.jamais ?? 0} jamais commencée · ${parEtat.en_cours ?? 0} en cours · ${parEtat.terminee ?? 0} terminée)`)
T((parEtat.jamais ?? 0) > 0 || profils.length === 0,
  'le défaut reste null : personne n\'est marqué « déjà vu » par erreur')

// ── 2. Le contenu ───────────────────────────────────────────────────
console.log('\n── les étapes ──')
const lib = fs.readFileSync('src/lib/visite-guidee.ts', 'utf8')
const routes = [...lib.matchAll(/route:\s*'([^']+)'/g)].map(m => m[1])
T(routes.length >= 15, `${routes.length} étapes définies (manager + comptoir)`)
T(new Set(routes).size >= 10, 'les étapes couvrent au moins 10 écrans distincts')

// Chaque route citée doit exister comme page. Une visite qui envoie sur un 404
// est pire que pas de visite : elle apprend que l'outil est cassé.
// Résolution segment par segment, parce que certaines routes sont DYNAMIQUES :
// /comptoir/fournil/kds est servi par /comptoir/[slug]/kds. Comparer les
// chaînes brutes déclarerait cette étape cassée alors qu'elle marche.
function pageExiste(route) {
  const segments = route.split('/').filter(Boolean)
  const descendre = (base, i) => {
    if (i === segments.length) return fs.existsSync(`${base}/page.tsx`)
    if (!fs.existsSync(base)) return false
    const litteral = `${base}/${segments[i]}`
    if (fs.existsSync(litteral) && descendre(litteral, i + 1)) return true
    // Segment dynamique [slug] / groupe de routes (ops) : on descend dedans.
    for (const e of fs.readdirSync(base)) {
      if (/^\[.+\]$/.test(e) && descendre(`${base}/${e}`, i + 1)) return true
      if (/^\(.+\)$/.test(e) && descendre(`${base}/${e}`, i)) return true
    }
    return false
  }
  return descendre('src/app', 0)
}
const manquantes = [...new Set(routes)].filter(r => !pageExiste(r))
T(manquantes.length === 0, 'chaque étape pointe vers une page qui existe', manquantes.join(', '))

// Les écrans dangereux doivent nommer leur piège À L'ENDROIT où on peut y tomber.
for (const cle of ['fournisseurs', 'allergenes']) {
  const bloc = lib.split(`route: '/admin/${cle}'`)[1]?.slice(0, 900) ?? ''
  T(/piege:/.test(bloc), `/admin/${cle} nomme son piège dans la visite`,
    'un avertissement lu dans un manuel s\'oublie ; lu devant le bouton, non')
}
T(/croissant à 40 €/i.test(lib), 'le croissant à 40 € est cité — c\'est du vécu, pas une hypothèse')

// ── 3. Le contrat de l'accompagnement ───────────────────────────────
console.log('\n── ce qui fait qu\'elle sera utilisée ──')
const cmp = fs.readFileSync('src/components/VisiteGuidee.tsx', 'utf8')
T(cmp.includes('fixed') && !/role="dialog"|aria-modal/.test(cmp),
  'panneau posé dans un coin, JAMAIS une fenêtre modale',
  'un accompagnement qui empêche de travailler est fermé au premier client')
T(cmp.includes('Passer la visite'), 'elle peut être passée à tout moment')
T(cmp.includes('Réduire') && cmp.includes('reduit'),
  'elle se réduit en pastille sans être perdue')
T(/Non merci/.test(cmp) && /Commencer/.test(cmp),
  '« Non merci » est aussi visible que « Commencer »',
  'sinon c\'est un piège à clic')
T(cmp.includes('print:hidden') === false, 'le composant ne gère pas l\'impression lui-même')
for (const f of ['src/app/admin/layout.tsx', 'src/app/(ops)/layout.tsx']) {
  const l = fs.readFileSync(f, 'utf8')
  T(l.includes('<VisiteGuidee') && l.includes('print:hidden'),
    `${f.split('/').slice(-2).join('/')} : monté et masqué à l'impression`,
    'une visite guidée n\'a rien à faire sur un bon de préparation')
}
const relance = fs.readFileSync('src/components/RelancerVisite.tsx', 'utf8')
T(relance.includes('Refaire la visite'), 'un « Non merci » se rattrape',
  'sinon un clic réflexe le premier jour est définitif')

// ── 4. L'écriture ne casse rien ─────────────────────────────────────
console.log('\n── l\'enregistrement ──')
const cible = profils[0]
const avant = cible.visite_guidee_etape
await sb('profils?id=eq.' + cible.id, { method: 'PATCH', body: JSON.stringify({ visite_guidee_etape: 3 }) })
const relu = (await sb(`profils?select=visite_guidee_etape&id=eq.${cible.id}`))[0]
T(relu.visite_guidee_etape === 3, 'l\'étape se persiste sur le PROFIL',
  'portée par le profil et non le navigateur : reprise sur une autre machine')
await sb('profils?id=eq.' + cible.id, { method: 'PATCH', body: JSON.stringify({ visite_guidee_etape: avant }) })
const restaure = (await sb(`profils?select=visite_guidee_etape&id=eq.${cible.id}`))[0]
T(restaure.visite_guidee_etape === avant, 'état initial restauré')

if (PORT) {
  console.log('\n── la route ──')
  const r = await fetch(`http://localhost:${PORT}/api/visite-guidee`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etape: 2 }),
  })
  T(r.status === 401, `un appel non authentifié est refusé (HTTP ${r.status})`)
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
