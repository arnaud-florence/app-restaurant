import { readFileSync, writeFileSync } from 'node:fs'
const F = '/private/tmp/claude-501/-Users-admin-projets-app-restaurant/da71f21d-4b00-4628-bc9f-9010334057b0/tasks/wd299o2of.output'
const raw = JSON.parse(readFileSync(F, 'utf8'))
const data = raw.result ?? raw
const clusters = data.clusters ?? []
const all = clusters.flatMap(c => (c.findings || []).map(f => ({ ...f, _cluster: c.cluster })))
const out = []
const W = s => out.push(s)

W('### POINTS FORTS (ce qui est déjà au niveau FB/IG)')
const allForts = clusters.flatMap(c => c.points_forts || [])
// dédup approximatif
const seen = new Set()
for (const p of allForts) {
  const k = p.toLowerCase().slice(0, 40)
  if (seen.has(k)) continue
  seen.add(k)
  W('  + ' + p)
}

W('\n\n### TOUS LES MAJEURS (constat + reco)')
for (const f of all.filter(f=>f.severite==='majeur')) {
  W(`\n[${f._cluster.replace(/&amp;/g,'&')}] (${f.axe}) ${f.ecran}`)
  W('  CONSTAT: ' + f.constat)
  W('  RECO: ' + f.recommandation)
}

W('\n\n### MINEURS — répartition par axe (titres seulement)')
for (const f of all.filter(f=>f.severite==='mineur')) {
  W(`  · [${f.axe}] ${f.ecran} — ${f.constat.slice(0,90)}`)
}

writeFileSync('/tmp/audit-majeurs.txt', out.join('\n'))
console.log('écrit /tmp/audit-majeurs.txt :', out.length, 'lignes')
