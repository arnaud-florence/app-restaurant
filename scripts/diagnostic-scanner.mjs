// Pourquoi le scan a échoué — 02/10/2026.
//
// Chaque tentative laisse désormais une trace dans `integration_evenements`
// (systeme = 'scanner') : pages, poids, durée, issue. Sans ce journal, un
// « Load failed » côté iPad ne laissait RIEN derrière lui — ni erreur
// serveur, ni ligne de log — et il n'y avait aucun moyen de savoir où ça
// cassait. C'est le journal qui a résolu l'en-tête inconnu du webhook Zelty.
//
//   node scripts/diagnostic-scanner.mjs [--jours=7]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const jours = Number((process.argv.find(a => a.startsWith('--jours=')) ?? '--jours=7').split('=')[1])
const depuis = new Date(Date.now() - jours * 864e5).toISOString()
const ev = await (await fetch(
  `${U}/rest/v1/integration_evenements?systeme=eq.scanner&traite_at=gte.${depuis}` +
  `&select=type,statut,duree_ms,resultat,traite_at&order=traite_at.desc&limit=200`, { headers: H })).json()

console.log(`\n── tentatives de scan sur ${jours} jours : ${ev.length} ──\n`)
if (!ev.length) {
  console.log('  Aucune trace. Deux lectures possibles, et il faut les distinguer :')
  console.log('   • personne n’a scanné depuis la mise en place du journal (02/10) ;')
  console.log('   • ou la requête n’atteint toujours pas le serveur — et dans ce cas')
  console.log('     c’est le réseau ou la taille du corps, pas le code de la route.\n')
  process.exit(0)
}
console.log('  quand              issue        durée    détail')
for (const e of ev) {
  const r = e.resultat ?? {}
  const d = [r.pages && `${r.pages} p.`, r.ko && `${r.ko} Ko`, r.lignes != null && `${r.lignes} lignes`,
    r.numero, r.pourquoi, r.erreur].filter(Boolean).join(' · ')
  console.log(`  ${e.traite_at.slice(0, 16).replace('T', ' ')}  ${String(e.type.replace('scan.', '')).padEnd(10)} `
    + `${String(e.duree_ms ?? '—').padStart(6)}ms  ${d}`)
}
const echecs = ev.filter(e => e.statut === 'echec')
console.log(`\n  ${ev.filter(e => e.type === 'scan.ok').length} réussis · ${echecs.length} échoués`)
if (echecs.length) {
  const par = {}
  for (const e of echecs) { const k = e.resultat?.pourquoi ?? 'extraction'; par[k] = (par[k] ?? 0) + 1 }
  console.log('  causes :', Object.entries(par).map(([k, v]) => `${k} (${v})`).join(' · '))
}
console.log('')
