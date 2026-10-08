// LA LISTE DES COURSES — tous les postes, en tableaux, au moins cher.
//
//   node scripts/courses-du-jour.cjs [--pour AAAA-MM-JJ] [--habituel]
//                                    [--avec-glaces] [--avec-promocash] [--ecrire]
//
// LECTURE SEULE : aucun bon créé, aucun message envoyé, rien écrit en base.
// `--ecrire` ne sort que des fichiers à copier dans data/.
//
// ⚠️ AUCUN SECOND CALCUL. Le stock vient de `chargerLignesReassort()`, les
// quantités de `aCommander()`, le choix du fournisseur de
// `fournisseurRetenu()` — exactement ce que lisent `/admin/reassort` et
// l'agent Stock. Une troisième implémentation finirait par annoncer une
// quantité que l'écran ne montre pas, et c'est l'écran qu'on croit.
const fs = require('node:fs'), path = require('node:path')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  interopDefault: true, esmResolve: true,
})
const { createClient } = require('@supabase/supabase-js')
const { chargerLignesReassort } = jiti('../src/lib/reassort-donnees.ts')
const R = jiti('../src/lib/reassort.ts')

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const POUR = arg('--pour') ?? new Date().toISOString().slice(0, 10)
const MOINS_CHER = !process.argv.includes('--habituel')
const ECRIRE = process.argv.includes('--ecrire')

// ⚠️ FOURNISSEURS ÉCARTÉS — décision du gérant, 08/10/2026 : on ne commande
// plus chez Promocash. Leurs lignes ne DISPARAISSENT pas, elles sont
// réaiguillées vers l'offre la moins chère des AUTRES ; celles qui n'en ont
// aucune tombent dans « sans interlocuteur », jamais dans le silence.
const ECARTES = new Set(process.argv.includes('--avec-promocash') ? [] : ['Promocash'])

// ⚠️ LES GLACES SORTENT POUR L'HIVER — décision du gérant, 08/10/2026.
// Elles restent VENDABLES au comptoir : on arrête d'en commander, on ne
// retire rien de la carte. `--avec-glaces` les fait revenir au printemps.
const SANS_GLACE = !process.argv.includes('--avec-glaces')

// ⚠️ PRODUITS ASSEMBLÉS — on achète leurs COMPOSANTS, jamais eux. Un café
// gourmand, c'est un café et trois mignardises ; le commander n'a aucun
// sens, et le voir dans une liste de courses fait douter de tout le reste.
//
// ⚠️ La liste est EXPLICITE, avec son motif, plutôt qu'une catégorie entière
// ajoutée à `CATEGORIES_ASSEMBLEES` : cette règle est partagée par le
// réassort, l'agent Stock et la commande d'ouverture, et exclure « Boisson
// chaude » en bloc arrêterait aussi les dosettes de thé, qui s'achètent
// vraiment. Une exclusion trop large ne se signale pas — elle cesse
// simplement de commander.
const ASSEMBLES = new Map([
  ['Café gourmand', 'un café + 3 mignardises : on achète les composants'],
  ['Café servi à table', 'c’est le café en grains qu’on commande'],
  ['Cappuccino ou chocolat chaud', 'composant de formule, pas un achat'],
  ['Coupe de glace (salle)', 'assemblée à partir des bacs'],
])

const f = (n, d = 2) => n.toFixed(d).replace('.', ',')
const q = n => (Number.isInteger(n) ? String(n) : f(n, 3))
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const brut = await chargerLignesReassort(sb, POUR)
  // ⚠️ Un comptage de plus de 30 jours N'EST PAS UN STOCK : ramené à
  // « inconnu », sinon on complète une réserve qui n'existe plus.
  let lignes = R.sansComptagePerime(brut)

  const retires = { assembles: [], glaces: [] }
  lignes = lignes.filter(l => {
    if (ASSEMBLES.has(l.nom)) { retires.assembles.push(l); return false }
    if (SANS_GLACE && (l.categorie === 'Glace' || /glace|sorbet/i.test(l.nom))) { retires.glaces.push(l); return false }
    return true
  })

  const ouverture = R.stockAReconstituer(lignes)
  const { prets, sansFournisseur, bascules } = R.lignesCommandables(lignes, MOINS_CHER)

  // ── réaiguillage des fournisseurs écartés ──
  const manque = [...sansFournisseur.map(l => ({ l, pourquoi: 'aucun fournisseur connu' }))]
  const gardes = []
  for (const l of prets) {
    if (!ECARTES.has(l.retenu.nom)) { gardes.push(l); continue }
    // ⚠️ On cherche la MEILLEURE offre d'un AUTRE fournisseur. Sans prix
    // repris : le prix du concurrent est celui de SON conditionnement, et le
    // convertir de tête écrirait un faux prix sur un document qui engage de
    // l'argent.
    const o = (l.offres ?? []).find(x => !ECARTES.has(x.fournisseur))
    if (!o) { manque.push({ l, pourquoi: `écarté de ${l.retenu.nom}, aucune autre offre` }); continue }
    gardes.push({ ...l, retenu: { id: o.fournisseur_id, nom: o.fournisseur, bascule: true },
      prix: null, reaiguille: l.retenu.nom, ecartRea: o.ecartPct })
  }

  const parFourn = new Map()
  for (const l of gardes) {
    if (!parFourn.has(l.retenu.nom)) parFourn.set(l.retenu.nom, [])
    parFourn.get(l.retenu.nom).push(l)
  }
  const ordre = [...parFourn.entries()].sort((a, b) => b[1].length - a[1].length)

  // ── sortie ──
  let totalRel = 0, totalEst = 0, nSansPrix = 0
  const csv = ['Fournisseur;Poste;Produit;Stock;Livre depuis;Deja commande;A commander;Unite;PU HT;Total HT;Nature prix;Note']
  const blocs = [], fichiers = new Map()
  const poste = l => l.etablissement ?? (l.categorie ? l.categorie : 'non rattaché')

  for (const [fourn, ls] of ordre) {
    let sRel = 0, sEst = 0, sans = 0
    const tr = [], txt = []
    for (const l of ls.sort((a, b) => poste(a).localeCompare(poste(b)) || a.nom.localeCompare(b.nom))) {
      const tot = l.prix == null ? null : Math.round(l.quantite * l.prix * 100) / 100
      if (tot == null) { sans++; nSansPrix++ }
      else if (l.estime) { sEst += tot; totalEst += tot }
      else { sRel += tot; totalRel += tot }
      const note = l.reaiguille ? `⇄ repris de ${l.reaiguille} (−${Math.abs(l.ecartRea ?? 0).toFixed(0)} %) · tarif à confirmer`
        : l.retenu.bascule ? `⇄ moins cher que ${l.fournisseur ?? 'ailleurs'} (−${Math.abs(l.ailleurs?.ecartPct ?? 0).toFixed(0)} %) · tarif à confirmer`
        : l.estime ? 'prix estimé' : ''
      // ⚠️ CE QUI EST DÉJÀ LÀ OU DÉJÀ PARTI EST DIT, colonne par colonne :
      // sans ça on recommande ce qu'on vient de commander, et on ne s'en
      // aperçoit qu'au déchargement.
      tr.push(`<tr><td>${esc(poste(l))}</td><td class="n">${esc(l.nom)}</td>`
        + `<td class="c">${l.tenu == null ? '<i>jamais compté</i>' : q(l.tenu)}</td>`
        + `<td class="c${l.entrees ? ' ok' : ''}">${l.entrees ? '📦 ' + q(l.entrees) : '—'}</td>`
        + `<td class="c${l.enCommande ? ' ok' : ''}">${l.enCommande ? '🚚 ' + q(l.enCommande) : '—'}</td>`
        + `<td class="c b">${q(l.quantite)}</td><td>${esc(l.unite ?? '')}</td>`
        + `<td class="c">${tot == null ? '<i>à confirmer</i>' : f(tot) + ' €'}</td>`
        + `<td class="s">${esc(note)}</td></tr>`)
      txt.push(`  ${q(l.quantite)} ${l.unite ?? ''} — ${l.nom}${note ? `   [${note}]` : ''}`)
      csv.push([fourn, poste(l), l.nom, l.tenu ?? '', l.entrees || '', l.enCommande || '', q(l.quantite),
        l.unite ?? '', l.prix == null ? '' : f(l.prix, 4), tot == null ? '' : f(tot),
        l.prix == null ? 'inconnu' : l.estime ? 'estime' : 'releve', note].join(';'))
    }
    const bilan = [sRel ? `${f(sRel)} € relevés` : null, sEst ? `${f(sEst)} € estimés` : null,
      sans ? `${sans} sans prix` : null].filter(Boolean).join(' · ') || 'aucun prix connu'
    blocs.push(`<h2>${esc(fourn)} <small>${ls.length} ligne(s) · ${esc(bilan)}</small></h2>
<table><thead><tr><th>Poste</th><th>Produit</th><th>Stock</th><th>Livré</th><th>Commandé</th>
<th>À commander</th><th>Unité</th><th>Total HT</th><th>Note</th></tr></thead><tbody>${tr.join('')}</tbody></table>`)
    fichiers.set(fourn, `COMMANDE ${fourn} — ${POUR}\nCASATASIA, Parking des Ferrages, 83136 Sainte-Anastasie-sur-Issole\n\n${txt.join('\n')}\n\n${bilan}\n`)
    console.log(`  ${fourn.padEnd(24)} ${String(ls.length).padStart(3)} ligne(s)   ${bilan}`)
  }

  // ── ce qui manque : la liste des fournisseurs à trouver ──
  const trMq = manque.sort((a, b) => poste(a.l).localeCompare(poste(b.l)) || a.l.nom.localeCompare(b.l.nom))
    .map(({ l, pourquoi }) => `<tr><td>${esc(poste(l))}</td><td class="n">${esc(l.nom)}</td>`
      + `<td class="c b">${q(R.aCommander(l))}</td><td>${esc(l.unite ?? '')}</td>`
      + `<td class="s">${esc(pourquoi)}</td></tr>`).join('')
  for (const { l, pourquoi } of manque)
    csv.push(['(SANS FOURNISSEUR)', poste(l), l.nom, l.tenu ?? '', l.entrees || '', l.enCommande || '',
      q(R.aCommander(l)), l.unite ?? '', '', '', 'inconnu', pourquoi].join(';'))

  const eco = R.economieEstimee(gardes)
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Courses du ${POUR}</title><style>
:root{--v:#253328;--g:#6b6b63;--b:#dcd6cb;--w:#faf8f4}
*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--w);color:#1c1c1a;
font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
h1{font-size:22px;margin:0 0 4px;color:var(--v)}
h2{font-size:16px;margin:28px 0 6px;color:var(--v);border-bottom:2px solid var(--v);padding-bottom:4px}
h2 small{float:right;font-weight:400;color:var(--g);font-size:12px;padding-top:4px}
table{width:100%;border-collapse:collapse;margin-bottom:8px;background:#fff}
th{background:var(--v);color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.04em;
padding:6px 8px;text-align:left}
td{padding:5px 8px;border-bottom:1px solid var(--b);vertical-align:top}
tr:nth-child(even) td{background:#fcfbf9}
.c{text-align:center;white-space:nowrap}.b{font-weight:700}.n{font-weight:600}
.s{font-size:12px;color:var(--g)}.ok{color:#0a7d42;font-weight:600}
i{color:var(--g);font-style:italic}
.k{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px}
.k div{background:#fff;border:1px solid var(--b);border-radius:6px;padding:8px 12px;min-width:150px}
.k b{display:block;font-size:19px;color:var(--v)}.k span{font-size:11px;color:var(--g)}
.al{background:#fff6e5;border:1px solid #e8c37a;border-radius:6px;padding:10px 14px;margin:14px 0}
.mq h2{border-color:#b43d3d;color:#b43d3d}.mq th{background:#b43d3d}
footer{margin-top:30px;color:var(--g);font-size:12px;border-top:1px solid var(--b);padding-top:10px}
@media print{body{padding:0;background:#fff}h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}
</style></head><body>
<h1>Liste des courses — ${POUR}</h1>
<div class="s">CASATASIA · ${MOINS_CHER ? 'fournisseur le moins cher' : 'fournisseur habituel'}${ECARTES.size ? ` · sans ${[...ECARTES].join(', ')}` : ''}${SANS_GLACE ? ' · sans les glaces (hiver)' : ''}</div>
<div class="k">
<div><b>${gardes.length}</b><span>lignes à commander</span></div>
<div><b>${parFourn.size}</b><span>fournisseurs</span></div>
<div><b>${f(totalRel)} €</b><span>sur des prix relevés</span></div>
<div><b>${f(totalEst)} €</b><span>sur des estimations</span></div>
<div><b>${nSansPrix}</b><span>lignes sans prix connu</span></div>
<div><b>${manque.length}</b><span>sans interlocuteur</span></div>
</div>
${ouverture ? '<div class="al"><b>⚠️ Aucun comptage récent</b> — c’est une commande d’OUVERTURE, pas un réassort : les quantités valent la cible entière.</div>' : ''}
<div class="al"><b>📦 Livré</b> = entré depuis le dernier comptage &nbsp;·&nbsp; <b>🚚 Commandé</b> = déjà parti, pas encore reçu — ces deux colonnes sont <b>déjà déduites</b> de « à commander ».<br>
Une ligne <b>« tarif à confirmer »</b> change de fournisseur : son prix est celui de NOTRE conditionnement, pas du sien. On ne le convertit pas — un faux prix ne se signale pas, il se découvre à la facture.</div>
${blocs.join('\n')}
<div class="mq"><h2>Ce qui manque — ${manque.length} ligne(s) sans interlocuteur <small>la commande n’est PAS complète</small></h2>
<table><thead><tr><th>Poste</th><th>Produit</th><th>À commander</th><th>Unité</th><th>Pourquoi</th></tr></thead><tbody>${trMq}</tbody></table></div>
<footer>
${bascules.length ? `${bascules.length} ligne(s) changent de fournisseur · ≈ ${f(eco)} € économisés (estimation catalogue, pas un prix négocié).<br>` : ''}
${retires.assembles.length ? `Écartés — produits assemblés (on achète leurs composants) : ${retires.assembles.map(l => esc(l.nom)).join(', ')}.<br>` : ''}
${retires.glaces.length ? `Écartés — glaces, saison d’hiver : ${retires.glaces.map(l => esc(l.nom)).join(', ')}. Elles restent vendables au comptoir.<br>` : ''}
Les prix ESTIMÉS n’ont jamais été facturés : à confirmer avant d’engager. Les lignes sans prix ne sont pas chiffrées — un zéro se lirait « gratuit ».
</footer></body></html>`

  console.log(`\n  ${gardes.length} lignes · ${parFourn.size} fournisseurs · ${f(totalRel)} € relevés + ${f(totalEst)} € estimés`)
  console.log(`  ${nSansPrix} sans prix · ${manque.length} sans interlocuteur`)
  console.log(`  écartés : ${retires.assembles.length} assemblé(s), ${retires.glaces.length} glace(s)`)
  if (!ECRIRE) { console.log('\n  (lecture seule — relancer avec --ecrire)\n'); return }
  const dir = `data/courses-${POUR}`
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  for (const [fourn, t] of fichiers) fs.writeFileSync(path.join(dir, fourn.replace(/[^\w-]+/g, '-') + '.txt'), t)
  fs.writeFileSync(`${dir}/tout.csv`, csv.join('\n'))
  fs.writeFileSync(`data/courses-${POUR}.html`, html)
  console.log(`\n  ✓ data/courses-${POUR}.html  +  ${fichiers.size} bons + tout.csv dans ${dir}/\n`)
})().catch(e => { console.error('⛔', e.message); process.exit(1) })
