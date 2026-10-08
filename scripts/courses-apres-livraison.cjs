// CE QUI MANQUE APRÈS UNE LIVRAISON — et chez qui peut encore livrer.
//
//   node scripts/courses-apres-livraison.cjs --commande data/commande-X.json \
//        [--pour AAAA-MM-JJ] [--jours N] [--livreurs "A,B,C"]
//        [--recu "D,E"] [--ecrire]
//
// ⚠️ `--recu` sort de la liste ce qu'un fournisseur a DÉJÀ livré sans qu'on
// ait son document. C'est un pansement d'affichage, et il faut le dire : le
// STOCK, lui, continue d'ignorer cette marchandise, donc elle reviendra à
// la prochaine liste. Seule une facture ou un BL enregistré la fait entrer
// pour de bon (0166).
//
// LECTURE SEULE : aucun bon créé, aucun message envoyé, rien en base.
//
// ⚠️ LE RAPPROCHEMENT SE FAIT PAR CODE ARTICLE, jamais par le libellé. Le
// code du bon de commande est le même que celui du devis importé dans
// `catalogue_fournisseur` : il ne souffre ni des accents ni des
// abréviations, et il ne confond pas deux produits proches (0142).
//
// ⚠️ ON MARQUE « COUVERT », ON NE SOUSTRAIT PAS LES QUANTITÉS. La commande
// est dans l'unité du FOURNISSEUR (sachet de 250 g, barquette, colis), nos
// cibles dans la nôtre. Convertir de tête donnerait un reste faux — et un
// reste faux fait manquer de marchandise un samedi soir. On affiche les
// deux côte à côte et c'est l'œil qui tranche.
//
// ⚠️⚠️ ET LE CODE NE SUFFIT PAS : une commande dépasse toujours le devis.
// 48 des 75 codes de EX216893 n'étaient pas dans les 184 lignes chiffrées
// en septembre — produits d'entretien, films, fromages, saucisse. Sans
// second filet, la liste annonçait « 102 bloquées » alors qu'une bonne
// partie arrivait le lendemain. Une liste qui crie sur ce qui est déjà
// livré finit par ne plus être lue.
//
// D'où un RATTRAPAGE PAR LE NOM, en second seulement : tous les mots
// significatifs de NOTRE libellé doivent se retrouver dans le leur. Il est
// AFFICHÉ comme tel — c'est une déduction, pas une preuve, et c'est l'œil
// qui tranche. Il ne sert qu'à dire « ne le recommande pas », jamais à
// écrire un prix.
const fs = require('node:fs'), path = require('node:path')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') }, interopDefault: true, esmResolve: true,
})
const { createClient } = require('@supabase/supabase-js')
const { chargerLignesReassort } = jiti('../src/lib/reassort-donnees.ts')
const R = jiti('../src/lib/reassort.ts')

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const CMD = JSON.parse(fs.readFileSync(arg('--commande'), 'utf8'))
const POUR = arg('--pour') ?? new Date().toISOString().slice(0, 10)
const JOURS = Math.max(1, Number(arg('--jours') ?? 7))
const LIVREURS = (arg('--livreurs') ?? '').split(',').map(s => s.trim()).filter(Boolean)
const RECU = (arg('--recu') ?? '').split(',').map(s => s.trim()).filter(Boolean)
const ECRIRE = process.argv.includes('--ecrire')
const f = (n, d = 2) => n.toFixed(d).replace('.', ',')
const q = n => (Number.isInteger(n) ? String(n) : f(n, 3))
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // ── 1. ce que la commande couvre, par CODE ARTICLE ──
  const codes = CMD.lignes.map(l => l[0])
  const { data: cat } = await sb.from('catalogue_fournisseur')
    .select('reference, designation, ingredient_id, recette_id, fournisseurs(nom)')
    .in('reference', codes)
  const parCode = new Map()
  for (const c of (cat ?? [])) {
    if (c.fournisseurs?.nom !== CMD.fournisseur) continue
    parCode.set(String(c.reference), c)
  }
  const couvert = new Map()        // cle de réassort → ligne commandée
  const sansCible = [], inconnus = [], parNom = []
  const norm = x => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const mots = x => norm(x).replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/)
    .filter(w => w.length >= 4 && !['pour','avec','sans','type','pour'].includes(w))
  for (const [code, lib, qte, unite, pu] of CMD.lignes) {
    const c = parCode.get(String(code))
    if (!c) { inconnus.push({ code, lib, qte, unite }); continue }
    const cle = c.ingredient_id ? `ing:${c.ingredient_id}` : c.recette_id
    if (!cle) { sansCible.push({ code, lib, qte, unite, designation: c.designation }); continue }
    couvert.set(cle, { code, lib, qte, unite, pu })
  }

  // ── 1 bis. rattrapage par le NOM, pour les codes hors devis ──
  const nosRefs = [
    ...(await sb.from('ingredients').select('id, nom').eq('actif', true).eq('stocke', true)).data
        ?.map(x => ({ cle: `ing:${x.id}`, nom: x.nom })) ?? [],
    ...(await sb.from('recettes').select('id, nom').eq('actif', true)).data
        ?.map(x => ({ cle: x.id, nom: x.nom })) ?? [],
  ]
  for (const inc of inconnus) {
    const l = norm(inc.lib)
    // ⚠️ TOUS les mots de NOTRE libellé doivent y être, et au moins deux :
    // un seul mot commun rapproche « Tomate » et « Tartinade de tomate ».
    const cands = nosRefs.filter(r => {
      const m = mots(r.nom); if (m.length < 1) return false
      if (m.length === 1 && m[0].length < 6) return false
      return m.every(w => l.includes(w))
    })
    // ⚠️ Plusieurs cibles pour un libellé : on ne tire pas au sort.
    if (cands.length !== 1) continue
    if (couvert.has(cands[0].cle)) continue
    couvert.set(cands[0].cle, { ...inc, parNom: true })
    parNom.push({ ...inc, vers: cands[0].nom })
  }

  // ── 2. le besoin de la période ──
  const d0 = new Date(POUR + 'T12:00:00Z')
  const jours = Array.from({ length: JOURS }, (_, i) =>
    new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10))
  const parCle = new Map()
  for (const j of jours)
    for (const l of R.sansComptagePerime(await chargerLignesReassort(sb, j))) {
      const a = parCle.get(l.cle)
      if (!a || (l.cible ?? 0) > (a.cible ?? 0)) parCle.set(l.cle, l)
    }
  const { prets } = R.lignesCommandables([...parCle.values()], true)

  // ── 3. qui peut encore livrer ──
  const peut = n => !LIVREURS.length || LIVREURS.includes(n)
  const reste = [], servis = [], bloques = [], dejaRecu = []
  for (const l of prets) {
    const c = couvert.get(l.cle)
    if (c) { servis.push({ l, c }); continue }
    // ⚠️ Déjà livré par un fournisseur dont on n'a pas le document : sorti
    // de la liste, mais le stock l'ignore toujours.
    if (RECU.includes(l.retenu.nom)) { dejaRecu.push(l); continue }
    if (peut(l.retenu.nom)) { reste.push({ ...l, par: l.retenu.nom, via: 'fournisseur retenu' }); continue }
    // ⚠️ On cherche une offre chez ceux qui PEUVENT livrer. Sans prix repris :
    // le prix du concurrent est celui de SON conditionnement.
    const o = (l.offres ?? []).find(x => peut(x.fournisseur))
    if (o) { reste.push({ ...l, par: o.fournisseur, via: `repris de ${l.retenu.nom}`, offre: o, prix: null }) }
    else bloques.push({ ...l, chez: l.retenu.nom })
  }

  const groupe = (arr, k) => arr.reduce((m, x) => ((m[k(x)] ??= []).push(x), m), {})
  const poste = l => l.etablissement ?? l.categorie ?? 'non rattaché'

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  APRÈS ${CMD.fournisseur} ${CMD.numero} — livrée le ${CMD.livraison}`)
  console.log(`  ${CMD.lignes.length} lignes commandées · ${f(CMD.total_ht)} € HT`)
  console.log(`  période du besoin : ${jours[0]} → ${jours[jours.length - 1]}`)
  if (LIVREURS.length) console.log(`  peuvent livrer : ${LIVREURS.join(', ')}`)
  console.log('═'.repeat(70))
  console.log(`\n  ✓ ${servis.length} référence(s) couvertes par la livraison`)
  console.log(`  → ${reste.length} à commander chez ceux qui peuvent livrer`)
  if (dejaRecu.length) console.log(`  ✓ ${dejaRecu.length} déjà livrée(s) par ${RECU.join(', ')} — ⚠️ mais le STOCK l'ignore`)
  console.log(`  ⚠️ ${bloques.length} bloquée(s) — personne parmi eux ne les a`)
  console.log(`  ℹ ${parNom.length} ligne(s) rattrapées par le NOM (à vérifier) · ${inconnus.length - parNom.length} sans aucune correspondance`)
  if (sansCible.length) console.log(`  ⚠️ ${sansCible.length} ligne(s) au catalogue mais rattachées à aucune fiche`)

  const gr = groupe(reste, x => x.par)
  for (const [fo, ls] of Object.entries(gr).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n┌─ ${fo.toUpperCase()} — ${ls.length} ligne(s)`)
    for (const l of ls.sort((a, b) => poste(a).localeCompare(poste(b)) || a.nom.localeCompare(b.nom)))
      console.log(`│  ${q(l.quantite).padStart(7)} ${String(l.unite ?? '').padEnd(13)} ${l.nom.slice(0, 32).padEnd(32)} ${poste(l).slice(0, 14).padEnd(14)} ${l.via === 'fournisseur retenu' ? '' : '⇄ ' + l.via}`)
    console.log('└─')
  }
  if (bloques.length) {
    console.log(`\n┌─ ⚠️ BLOQUÉES — ${bloques.length} ligne(s), fournisseur indisponible`)
    for (const l of bloques.sort((a, b) => String(a.chez).localeCompare(String(b.chez))))
      console.log(`│  ${q(l.quantite).padStart(7)} ${String(l.unite ?? '').padEnd(13)} ${l.nom.slice(0, 32).padEnd(32)} chez ${l.chez}`)
    console.log('└─')
  }
  if (parNom.length) {
    console.log(`\n┌─ ℹ ${parNom.length} rattrapée(s) par le NOM — à vérifier à l'œil`)
    for (const x of parNom) console.log(`│  ${String(x.code).padEnd(10)} ${x.lib.slice(0, 44).padEnd(44)} → ${x.vers}`)
    console.log('└─')
  }
  console.log()

  if (!ECRIRE) { console.log('  (lecture seule — relancer avec --ecrire)\n'); return }
  const dir = `data/manque-${POUR}`
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  for (const [fo, ls] of Object.entries(gr))
    fs.writeFileSync(path.join(dir, fo.replace(/[^\w-]+/g, '-') + '.txt'),
      `COMMANDE ${fo} — besoin du ${jours[0]} au ${jours[jours.length - 1]}\n`
      + `CASATASIA, Parking des Ferrages, 83136 Sainte-Anastasie-sur-Issole\n\n`
      + ls.map(l => `  ${q(l.quantite)} ${l.unite ?? ''} — ${l.nom}`).join('\n') + '\n')
  const tbl = (titre, rows, cls = '') => `<h2 class="${cls}">${esc(titre)}</h2><table><thead><tr>
<th>Poste</th><th>Produit</th><th>À commander</th><th>Unité</th><th>Origine</th></tr></thead><tbody>${rows}</tbody></table>`
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ce qui manque — ${POUR}</title><style>
:root{--v:#253328;--g:#6b6b63;--b:#dcd6cb}*{box-sizing:border-box}
body{margin:0;padding:24px;background:#faf8f4;color:#1c1c1a;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1{font-size:22px;margin:0 0 4px;color:var(--v)}h2{font-size:16px;margin:26px 0 6px;color:var(--v);border-bottom:2px solid var(--v);padding-bottom:4px}
h2.bl{color:#b43d3d;border-color:#b43d3d}table{width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px}
th{background:var(--v);color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px;text-align:left}
h2.bl+table th{background:#b43d3d}td{padding:5px 8px;border-bottom:1px solid var(--b)}tr:nth-child(even) td{background:#fcfbf9}
.c{text-align:center}.b{font-weight:700}.n{font-weight:600}.s{font-size:12px;color:var(--g)}
.k{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.k div{background:#fff;border:1px solid var(--b);border-radius:6px;padding:8px 12px;min-width:150px}
.k b{display:block;font-size:19px;color:var(--v)}.k span{font-size:11px;color:var(--g)}
.al{background:#fff6e5;border:1px solid #e8c37a;border-radius:6px;padding:10px 14px;margin:12px 0}
@media print{body{padding:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>
<h1>Ce qui manque — besoin du ${jours[0]} au ${jours[jours.length - 1]}</h1>
<div class="s">Après ${esc(CMD.fournisseur)} ${esc(CMD.numero)}, livrée le ${esc(CMD.livraison)} · ${f(CMD.total_ht)} € HT${LIVREURS.length ? ` · peuvent livrer : ${esc(LIVREURS.join(', '))}` : ''}</div>
<div class="k"><div><b>${servis.length}</b><span>couvertes par la livraison</span></div>
<div><b>${reste.length}</b><span>à commander</span></div>
${dejaRecu.length ? `<div><b>${dejaRecu.length}</b><span>déjà livrées (${esc(RECU.join(', '))})</span></div>` : ''}
<div><b>${bloques.length}</b><span>bloquées</span></div></div>
${dejaRecu.length ? `<div class="al"><b>⚠️ ${dejaRecu.length} référence(s) sorties de la liste parce que ${esc(RECU.join(', '))} a déjà livré</b> — mais sans sa facture ni son bon de livraison enregistré, le STOCK ne le sait pas : elles reviendront à la prochaine liste, et le réassort continuera de croire la réserve vide. Il faut scanner le document.</div>` : ''}
<div class="al"><b>⚠️ Les quantités livrées ne sont PAS déduites</b> — la commande est dans l’unité du fournisseur (sachet, barquette, colis), nos cibles dans la nôtre. Une conversion faite de tête donnerait un reste faux, et un reste faux fait manquer de marchandise un samedi soir. Une référence livrée est marquée <b>couverte</b>, point.</div>
${Object.entries(gr).sort((a, b) => b[1].length - a[1].length).map(([fo, ls]) => tbl(`${fo} — ${ls.length} ligne(s)`,
  ls.sort((a, b) => poste(a).localeCompare(poste(b)) || a.nom.localeCompare(b.nom)).map(l =>
  `<tr><td>${esc(poste(l))}</td><td class="n">${esc(l.nom)}</td><td class="c b">${q(l.quantite)}</td><td>${esc(l.unite ?? '')}</td><td class="s">${l.via === 'fournisseur retenu' ? '' : '⇄ ' + esc(l.via)}</td></tr>`).join(''))).join('')}
${bloques.length ? tbl(`Bloquées — ${bloques.length} ligne(s), le fournisseur ne peut pas livrer`,
  bloques.map(l => `<tr><td>${esc(poste(l))}</td><td class="n">${esc(l.nom)}</td><td class="c b">${q(l.quantite)}</td><td>${esc(l.unite ?? '')}</td><td class="s">chez ${esc(l.chez)}</td></tr>`).join(''), 'bl') : ''}
</body></html>`
  fs.writeFileSync(`data/manque-${POUR}.html`, html)
  console.log(`  ✓ data/manque-${POUR}.html + ${Object.keys(gr).length} bons dans ${dir}/\n`)
})().catch(e => { console.error('⛔', e.message); process.exit(1) })
