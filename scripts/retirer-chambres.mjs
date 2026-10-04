// Retirer les chambres d'hôtes — décision du gérant, 04/10/2026.
//
// ⚠️⚠️ ON ÉTEINT, ON NE SUPPRIME PAS, et c'est la règle du projet depuis le
// snacking (25/09) : « la ligne RESTE en base. Le jour où ça entre au concept,
// on rallume au lieu de recréer — et `activites_modules` doit toujours compter
// 14. » Le contrôle d'avant-ouverture vérifie ce 14 : supprimer la ligne
// ferait basculer toute l'application sur son repli `REPLI_FOURNIL_SEUL`, en
// silence, et le repli est une SÉCURITÉ, pas un état normal.
//
// ⚠️ Les 6 chambres sont DÉSACTIVÉES, pas effacées. Il n'y a aucune
// réservation à perdre aujourd'hui — mais une suppression ne se défait pas,
// et elle emporterait les descriptions, les équipements et les photos qu'il
// faudrait ressaisir. `actif = false` suffit à les faire disparaître de
// partout.
//
// ⚠️ Le CODE n'est pas touché : `/admin/chambres`, les trois routes publiques
// et `ROUTES_PAR_MODULE` restent en place. Ils ne servent plus rien tant que
// le module est éteint — `gardeModule()` les ferme — et les retirer serait un
// chantier à refaire le jour où le gérant change d'avis. C'est le contraire du
// cas de la BORNE, retirée parce qu'elle RÉPONDAIT en production sans
// authentification.
//
//   node scripts/retirer-chambres.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — retirer les chambres d'hôtes ──\n`)

// ⚠️ Une réservation en cours interdirait de couper : on vérifie AVANT.
const resas = await sb('reservations_chambres?select=id,date_arrivee,statut')
const vivantes = resas.filter(r => !['annulee', 'terminee'].includes(String(r.statut)))
console.log(`   ${resas.length} réservation(s) de chambre, dont ${vivantes.length} non close(s)`)
if (vivantes.length) {
  console.log(`   ✗ des réservations sont en cours — on ne coupe PAS. À traiter d'abord :`)
  for (const r of vivantes) console.log(`      ${r.date_arrivee} · ${r.statut}`)
  process.exit(1)
}

const [m] = await sb('activites_modules?cle=eq.chambres&select=cle,actif,teaser,teaser_texte,date_ouverture_prevue')
console.log(`\n   module  actif=${m.actif} teaser=${m.teaser} « ${m.teaser_texte ?? '—'} »`)
const ch = await sb('chambres?select=id,nom,actif&order=nom')
console.log(`   ${ch.length} chambre(s), dont ${ch.filter(c => c.actif).length} active(s) :`)
for (const c of ch) console.log(`      ${c.actif ? '●' : '○'} ${c.nom}`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
// Le teaser est ce que le site AFFICHE : c'est lui qui doit disparaître.
await sb('activites_modules?cle=eq.chambres', { method: 'PATCH', body: JSON.stringify({
  actif: false, teaser: false, teaser_texte: null, date_ouverture_prevue: null }) })
for (const c of ch.filter(c => c.actif))
  await sb(`chambres?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ actif: false }) })
console.log(`\n   ✓ module éteint et retiré du teaser · ${ch.filter(c => c.actif).length} chambre(s) désactivée(s)`)

// ⚠️ LE CONTRÔLE QUI COMPTE : la ligne doit RESTER. 14, toujours.
const total = (await sb('activites_modules?select=cle')).length
console.log(total === 14
  ? `   ✓ activites_modules compte toujours 14 lignes — pas de bascule sur le repli`
  : `   ✗ activites_modules compte ${total} lignes au lieu de 14 — l'application va basculer sur son REPLI`)
const restants = await sb('activites_modules?teaser=is.true&select=cle,teaser_texte&order=cle')
console.log(`   ✓ ${restants.length} teaser(s) restant(s) sur le site : ${restants.map(r => r.cle).join(', ')}`)
