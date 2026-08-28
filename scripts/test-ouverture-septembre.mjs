// Répétition générale de l'ouverture de septembre.
//
// Le 30 septembre, quelqu'un cliquera « Ouvrir le restaurant » à 6 h 20. Ce
// script joue le geste en entier — bascule, vérifications, restauration — pour
// que ce jour-là ne soit pas le premier essai. Il RESTAURE toujours l'état
// initial, même en cas d'échec.
//
//   PORT=3000 node scripts/test-ouverture-septembre.mjs
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT, API = env.PUBLIC_API_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); return t ? JSON.parse(t) : null
}
let ok = 0, ko = 0
const t = (n, c, d = '') => { if (c) { console.log(`  ✓ ${n}`); ok++ } else { console.log(`  ✗ ${n} — ${d}`); ko++ } }
const etape = n => console.log(`\n→ ${n}`)

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║ Répétition générale — ouverture de septembre             ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── État initial, à restaurer quoi qu'il arrive ─────────────────────
const initial = await sb('activites_modules?select=cle,actif')
if (!Array.isArray(initial) || initial.length === 0) {
  console.error('\n  ✗ activites_modules est VIDE — rejouer la migration 0110 avant tout.')
  process.exit(1)
}
const restaurer = async () => {
  for (const m of initial) await sb(`activites_modules?cle=eq.${encodeURIComponent(m.cle)}`,
    { method: 'PATCH', body: JSON.stringify({ actif: m.actif }) })
}

try {
  etape('avant l’ouverture')
  t(`les 14 interrupteurs sont en base`, initial.length === 14, `${initial.length} trouvé(s)`)
  const avant = initial.filter(m => m.actif).length
  t('seul le Fournil est allumé', avant === 3, `${avant} module(s) actif(s)`)

  const cartes = await sb('recettes?select=tag_destination,actif&actif=eq.true')
  const parDest = {}
  for (const r of cartes) parDest[r.tag_destination ?? '—'] = (parDest[r.tag_destination ?? '—'] ?? 0) + 1
  t('la carte du bar existe', (parDest.BAR ?? 0) >= 30, `BAR : ${parDest.BAR ?? 0}`)
  t('la carte du Fournil existe', (parDest.FOURNIL ?? 0) >= 80, `FOURNIL : ${parDest.FOURNIL ?? 0}`)
  console.log(`    (répartition : ${Object.entries(parDest).map(([k, v]) => `${k} ${v}`).join(' · ')})`)

  etape('LE GESTE — allumer le groupe restaurant')
  const groupe = await sb('activites_modules?select=cle&activite=eq.restaurant')
  t('le groupe restaurant contient bien 7 modules', groupe.length === 7, `${groupe.length}`)
  const maj = await sb('activites_modules?activite=eq.restaurant',
    { method: 'PATCH', body: JSON.stringify({ actif: true, updated_at: new Date().toISOString() }) })
  t('la bascule met à jour des lignes', Array.isArray(maj) && maj.length === 7,
    `${Array.isArray(maj) ? maj.length : 0} ligne(s) — sur une table vide ce serait 0, et le bouton mentirait`)

  etape('ce que le public voit alors')
  const apres = await sb('activites_modules?select=cle,actif&actif=eq.true')
  t('10 modules allumés', apres.length === 10, `${apres.length}`)
  for (const c of ['bar', 'restaurant_salle', 'pizzeria']) {
    t(`« ${c} » est allumé`, apres.some(m => m.cle === c))
  }

  if (PORT && API) {
    const j = await (await fetch(`http://localhost:${PORT}/api/public/activation`, { headers: { 'x-api-key': API } })).json()
    const etat = j.etat ?? {}
    t('l’API publique sert bien le bar comme ouvert', etat.bar === true, JSON.stringify(etat.bar))
    t('et ne laisse plus de teaser « prochainement » sur le bar',
      !(j.teasers ?? []).some(x => x.cle === 'bar'))
  } else {
    console.log('    (API publique ignorée — PORT et/ou PUBLIC_API_KEY absents)')
  }

  if (PORT && API) {
    // Ce que le CLIENT verrait le 30 septembre au matin. C'est la question qui
    // compte : allumer un module ne crée pas une carte.
    const m = await (await fetch(`http://localhost:${PORT}/api/public/menu`, { headers: { 'x-api-key': API } })).json()
    const items = m.items ?? []
    const parCat = {}
    for (const x of items) parCat[x.categorie ?? '—'] = (parCat[x.categorie ?? '—'] ?? 0) + 1
    console.log(`    le site servirait ${items.length} produit(s)`)
    t('le site a bien une carte à montrer', items.length > 0, `${items.length}`)
    // L'alcool ne doit JAMAIS passer en ligne : pas de contrôle d'âge.
    const alc = await sb('recettes?select=nom&actif=eq.true&contient_alcool=eq.true&vendable_online=eq.true')
    t('aucun alcool vendable en ligne, même bar ouvert', (alc ?? []).length === 0,
      (alc ?? []).map(x => x.nom).join(', '))
    // Les activités ouvertes qui n'ont AUCUN produit à vendre.
    const carteParDest = {}
    for (const r of cartes) carteParDest[r.tag_destination ?? '—'] = true
    const vides = ['CUISINE', 'PIZZA'].filter(d => !carteParDest[d])
    t('toute activité ouverte a une carte', vides.length === 0,
      `aucun produit pour : ${vides.join(', ')} — le module s'allume, la carte reste vide`)
  }

  etape('cohérence caisse ↔ base après ouverture')
  const zelty = env.ZELTY_API_KEY
  if (zelty) {
    const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
      { headers: { Authorization: `Bearer ${zelty}` } })).json()).dishes ?? []
    t('la caisse contient autant de plats que la base a de produits',
      plats.length === cartes.length, `caisse ${plats.length} / base ${cartes.length}`)
    t('aucun plat sans famille en caisse', plats.every(p => (p.tags ?? []).length > 0),
      `${plats.filter(p => !(p.tags ?? []).length).length} sans famille`)
  } else console.log('    (caisse ignorée — ZELTY_API_KEY absente)')
} finally {
  etape('restauration')
  await restaurer()
  const fin = await sb('activites_modules?select=cle,actif&actif=eq.true')
  t('état initial rétabli', fin.length === initial.filter(m => m.actif).length,
    `${fin.length} actif(s), attendu ${initial.filter(m => m.actif).length}`)
}

console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Bilan : ${String(ok).padStart(3)} ✓   ${String(ko).padStart(3)} ✗                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════╝\n`)
process.exit(ko ? 1 : 0)
