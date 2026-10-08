// LA CARTE DE LA SEMAINE EST-ELLE SERVABLE ? — plat par plat.
//
//   node scripts/carte-semaine-manques.cjs --commande data/commande-X.json
//        [--du AAAA-MM-JJ] [--au AAAA-MM-JJ] [--ecrire]
//
// LECTURE SEULE. La question n'est pas « que commander » mais « quel plat ne
// peut pas sortir » — ce n'est pas la même liste, et c'est celle-là qui se
// regarde à six jours de l'ouverture.
//
// ⚠️ UN PLAT TOMBE DÈS QU'UN SEUL DE SES INGRÉDIENTS MANQUE. On raisonne
// donc par PLAT, pas par ligne d'achat : vingt lignes manquantes réparties
// sur vingt plats, ce n'est pas vingt fois le même problème — c'est toute
// la carte.
//
// ⚠️ La composition d'un PLAT DU JOUR vit sur l'occurrence
// (`plat_du_jour_ingredients`), pas sur une fiche produit : le produit
// « Plat du jour » n'en a volontairement aucune (0167).
const fs = require('node:fs'), path = require('node:path')
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') }, interopDefault: true, esmResolve: true })
const { createClient } = require('@supabase/supabase-js')
const { chargerLignesReassort } = jiti('../src/lib/reassort-donnees.ts')
const R = jiti('../src/lib/reassort.ts')
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const CMD = arg('--commande') ? JSON.parse(fs.readFileSync(arg('--commande'), 'utf8')) : null
const DU = arg('--du') ?? '2026-10-12', AU = arg('--au') ?? '2026-10-18'
const ECRIRE = process.argv.includes('--ecrire')
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const norm = x => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const mots = x => norm(x).replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 4)

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // ── l'ardoise de la semaine ──
  const { data: ard } = await sb.from('plats_du_jour')
    .select('id, titre, recette_id, date_debut, date_fin, recettes(nom)')
    .eq('actif', true).lte('date_debut', AU).or(`date_fin.gte.${DU},date_fin.is.null`)
  const { data: compoPdj } = await sb.from('plat_du_jour_ingredients')
    .select('plat_du_jour_id, quantite, ingredients(id, nom, unite)')
  const recIds = [...new Set((ard ?? []).map(a => a.recette_id).filter(Boolean))]
  const { data: compoRec } = await sb.from('recette_ingredients')
    .select('recette_id, quantite, ingredients(id, nom, unite)').in('recette_id', recIds)

  const plats = []
  for (const a of (ard ?? [])) {
    const ing = a.titre
      ? (compoPdj ?? []).filter(x => x.plat_du_jour_id === a.id).map(x => x.ingredients)
      : (compoRec ?? []).filter(x => x.recette_id === a.recette_id).map(x => x.ingredients)
    plats.push({
      nom: a.titre ?? a.recettes?.nom ?? '(sans nom)',
      jour: a.titre ? a.date_debut : null, ing: ing.filter(Boolean),
    })
  }

  // ── ce que la commande couvre ──
  const couvert = new Set(), parNom = []
  if (CMD) {
    const codes = CMD.lignes.map(l => String(l[0]))
    const { data: cat } = await sb.from('catalogue_fournisseur')
      .select('reference, ingredient_id, fournisseurs(nom)').in('reference', codes)
    for (const c of (cat ?? [])) if (c.fournisseurs?.nom === CMD.fournisseur && c.ingredient_id) couvert.add(c.ingredient_id)
    // ⚠️ Rattrapage par le NOM : 48 des 75 codes ne sont pas au devis. Affiché
    // comme une déduction, jamais comme une preuve — il a déjà produit un faux.
    const tous = [...new Map(plats.flatMap(p => p.ing).map(i => [i.id, i])).values()]
    for (const [, lib] of CMD.lignes) {
      const l = norm(lib)
      const c = tous.filter(i => { const m = mots(i.nom); return m.length && m.every(w => l.includes(w)) })
      if (c.length === 1 && !couvert.has(c[0].id)) { couvert.add(c[0].id); parNom.push({ lib, vers: c[0].nom }) }
    }
  }

  // ── ce qu'on a déjà en réserve ──
  const lignes = R.sansComptagePerime(await chargerLignesReassort(sb, DU))
  const parCle = new Map(lignes.map(l => [l.cle, l]))
  const etat = i => {
    if (couvert.has(i.id)) return { s: 'commandé', d: 'Félix Potin, livré le 9' }
    const l = parCle.get(`ing:${i.id}`)
    if (!l) return { s: 'hors stock', d: 'pas suivie — aucune entrée possible' }
    if (R.aCommander(l) <= 0) return { s: 'en réserve', d: l.tenu != null ? `${l.tenu} ${l.unite ?? ''} comptés` : 'cible atteinte' }
    return { s: 'manquant', d: l.fournisseur ? `à commander chez ${l.fournisseur}` : 'AUCUN fournisseur connu' }
  }

  const ko = [], ok = []
  for (const p of plats) {
    const mq = p.ing.map(i => ({ i, e: etat(i) })).filter(x => x.e.s === 'manquant' || x.e.s === 'hors stock')
    ;(mq.length ? ko : ok).push({ ...p, mq })
  }
  ko.sort((a, b) => b.mq.length - a.mq.length)

  const tousMq = new Map()
  for (const p of ko) for (const { i, e } of p.mq) {
    if (!tousMq.has(i.id)) tousMq.set(i.id, { i, e, plats: [] })
    tousMq.get(i.id).plats.push(p.nom)
  }

  console.log(`\n${'═'.repeat(68)}\n  LA CARTE DU ${DU} AU ${AU} — ${plats.length} plats`)
  if (CMD) console.log(`  après ${CMD.fournisseur} ${CMD.numero}, livrée le ${CMD.livraison}`)
  console.log('═'.repeat(68))
  console.log(`\n  ✓ ${ok.length} plats servables  ·  ⚠️ ${ko.length} plats incomplets`)
  console.log(`  ${tousMq.size} ingrédient(s) manquants au total\n`)
  for (const p of ko)
    console.log(`  ⚠️ ${(p.jour ? '['+p.jour.slice(5)+'] ' : '').padStart(0)}${p.nom.slice(0,34).padEnd(34)} manque : ${p.mq.map(x => x.i.nom).join(', ')}`)
  console.log(`\n  ── les ${tousMq.size} ingrédients, par urgence ──`)
  for (const { i, e, plats: ps } of [...tousMq.values()].sort((a, b) => b.plats.length - a.plats.length))
    console.log(`  ${String(ps.length).padStart(2)} plat(s)  ${i.nom.slice(0, 32).padEnd(32)} ${e.d}`)
  console.log()

  if (!ECRIRE) { console.log('  (lecture seule — relancer avec --ecrire)\n'); return }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carte du ${DU}</title><style>
:root{--v:#253328;--g:#6b6b63;--b:#dcd6cb}*{box-sizing:border-box}
body{margin:0;padding:24px;background:#faf8f4;color:#1c1c1a;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1{font-size:22px;margin:0 0 4px;color:var(--v)}h2{font-size:16px;margin:26px 0 6px;color:var(--v);border-bottom:2px solid var(--v);padding-bottom:4px}
h2.bl{color:#b43d3d;border-color:#b43d3d}table{width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px}
th{background:var(--v);color:#fff;font-size:11px;text-transform:uppercase;padding:6px 8px;text-align:left}
h2.bl+table th{background:#b43d3d}td{padding:5px 8px;border-bottom:1px solid var(--b);vertical-align:top}
tr:nth-child(even) td{background:#fcfbf9}.n{font-weight:600}.s{font-size:12px;color:var(--g)}.c{text-align:center}
.k{display:flex;gap:10px;margin:14px 0}.k div{background:#fff;border:1px solid var(--b);border-radius:6px;padding:8px 12px;min-width:150px}
.k b{display:block;font-size:19px;color:var(--v)}.k span{font-size:11px;color:var(--g)}
.al{background:#fff6e5;border:1px solid #e8c37a;border-radius:6px;padding:10px 14px;margin:12px 0}
@media print{body{padding:0}tr{page-break-inside:avoid}}</style></head><body>
<h1>La carte du ${DU} au ${AU}</h1>
<div class="s">${plats.length} plats${CMD ? ` · après ${esc(CMD.fournisseur)} ${esc(CMD.numero)}, livrée le ${esc(CMD.livraison)}` : ''}</div>
<div class="k"><div><b>${ok.length}</b><span>plats servables</span></div><div><b>${ko.length}</b><span>plats incomplets</span></div><div><b>${tousMq.size}</b><span>ingrédients manquants</span></div></div>
<div class="al"><b>⚠️ Un plat tombe dès qu’un seul de ses ingrédients manque.</b> C’est pour ça que la liste est par PLAT et pas par ligne d’achat : vingt manques répartis sur vingt plats, ce n’est pas vingt fois le même problème, c’est toute la carte.</div>
<h2 class="bl">Plats incomplets — ${ko.length}</h2><table><thead><tr><th>Jour</th><th>Plat</th><th>Ce qui manque</th></tr></thead><tbody>
${ko.map(p => `<tr><td class="c">${p.jour ? esc(p.jour.slice(5)) : '—'}</td><td class="n">${esc(p.nom)}</td><td>${p.mq.map(x => `${esc(x.i.nom)} <span class="s">(${esc(x.e.d)})</span>`).join('<br>')}</td></tr>`).join('')}
</tbody></table>
<h2>Les ${tousMq.size} ingrédients à trouver</h2><table><thead><tr><th>Ingrédient</th><th>Plats touchés</th><th>Où</th><th>Lesquels</th></tr></thead><tbody>
${[...tousMq.values()].sort((a, b) => b.plats.length - a.plats.length).map(({ i, e, plats: ps }) =>
`<tr><td class="n">${esc(i.nom)}</td><td class="c">${ps.length}</td><td class="s">${esc(e.d)}</td><td class="s">${ps.map(esc).join(' · ')}</td></tr>`).join('')}
</tbody></table>
<h2>Plats servables — ${ok.length}</h2><div class="s">${ok.map(p => esc(p.nom)).join(' · ')}</div>
${parNom.length ? `<h2>Rapprochés par le nom — à vérifier</h2><div class="s">${parNom.map(x => `${esc(x.lib)} → <b>${esc(x.vers)}</b>`).join('<br>')}</div>` : ''}
</body></html>`
  fs.writeFileSync(`data/carte-${DU}-manques.html`, html)
  console.log(`  ✓ data/carte-${DU}-manques.html\n`)
})().catch(e => { console.error('⛔', e.message); process.exit(1) })
