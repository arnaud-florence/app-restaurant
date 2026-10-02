// AUDIT n°2 — une vente encaissée redescend-elle, sort-elle du stock, et
// nourrit-elle la marge ? (02/10/2026)
//
// Le chemin : caisse → `encaissements_externes` → `commandes` +
// `commande_articles` → sorties de stock → marge et food cost.
//
// ⚠️ LA MOITIÉ AMONT (caisse → nous) NE PEUT PAS ÊTRE ÉPROUVÉE AUJOURD'HUI :
// l'établissement Zelty est en mode école et aucune vente réelle n'y a été
// faite. Ce qui se vérifie, c'est que le tuyau est en place et qu'il TOURNE —
// et l'historique SumUp (426 tickets d'août) éprouve toute la moitié aval sur
// de vraies données.
//
//   node scripts/audit-chaine-vente.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const sb = async p => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`)
  return JSON.parse(t)
}
const compte = async p => {
  const r = await fetch(`${U}/rest/v1/${p}&select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
}
let ok = 0, ko = 0
const P = m => { ok++; console.log(`   ✓ ${m}`) }
const E = m => { ko++; console.log(`   ✗ ${m}`) }

console.log('\n══ AUDIT n°2 — de la vente encaissée à la marge ══\n')

// ── 1. le tuyau tourne-t-il ? ────────────────────────────────────────
console.log('── 1. Le tuyau descendant')
const depuis = new Date(Date.now() - 24 * 3600e3).toISOString()
const runs = await sb(`integration_evenements?systeme=eq.zelty&type=eq.tickets&traite_at=gte.${depuis}&select=statut,resultat&order=traite_at.desc`)
runs.length >= 12 ? P(`${runs.length} passages du sondage en 24 h (prévu : 1/h)`) : E(`${runs.length} passages en 24 h — le cron ne tourne pas à l'heure`)
const url = String(runs[0]?.resultat?.url_appelee ?? '')
const avecItems = url.includes('expand%5B%5D=items') || url.includes('expand[]=items')
avecItems
  ? P('`expand[]=items` présent — sans lui les lignes reviennent VIDES et le CA serait juste pendant que stock et marges resteraient aveugles')
  : E('`expand[]=items` ABSENT de l’appel : le piège principal de cette API')
runs.every(r => r.statut === 'succes') ? P('aucun passage en échec') : E(`${runs.filter(r => r.statut !== 'succes').length} passage(s) en échec`)

// ── 2. le débit : ce qui empêche le reste de passer ──────────────────
console.log('\n── 2. Le plafond de débit')
const tous = await sb(`integration_evenements?systeme=eq.zelty&traite_at=gte.${depuis}&select=type,statut,erreur&limit=1000`)
const r429 = tous.filter(e => /429/.test(e.erreur ?? ''))
const pct = tous.length ? r429.length / tous.length * 100 : 0
pct < 5
  ? P(`${r429.length} refus pour débit sur ${tous.length} appels (${pct.toFixed(0)} %)`)
  : E(`${r429.length} refus pour débit sur ${tous.length} appels — ${pct.toFixed(0)} % ⚠️ la poussée des RUPTURES en souffre, et elle tourne pendant le service`)
const parType = {}
for (const e of r429) parType[e.type] = (parType[e.type] ?? 0) + 1
for (const [t, n] of Object.entries(parType).sort((a, b) => b[1] - a[1])) console.log(`        · ${t} : ${n}`)

// ── 3. ce qui est descendu porte-t-il ses LIGNES ? ───────────────────
console.log('\n── 3. Les lignes, sans lesquelles stock et marges sont aveugles')
const tickets = await compte('encaissements_externes?id=not.is.null')
const cmds = await compte('commandes?statut=eq.encaisse')
const arts = await compte('commande_articles?id=not.is.null')
const artsOk = await compte('commande_articles?recette_id=not.is.null')
console.log(`     ${tickets} tickets reçus · ${cmds} commandes encaissées · ${arts} lignes`)
arts > 0 && artsOk === arts
  ? P(`les ${arts} lignes pointent toutes un produit — le stock et la marge peuvent les lire`)
  : E(`${arts - artsOk} ligne(s) sans produit : leur CA compte, leur coût non`)
const sansLigne = await sb('encaissements_externes?select=id,ticket_externe,source_caisse,montant_ttc,commande_id&limit=1000')
const idsAvec = new Set((await sb('commande_articles?select=commande_id&limit=5000')).map(a => a.commande_id))
const muets = sansLigne.filter(t => t.commande_id && !idsAvec.has(t.commande_id))
// ⚠️ DEUX TICKETS SONT CONNUS ET DOCUMENTÉS : les paiements à montant libre
// tapés sur le terminal le 17 août à 6 h 02 et 6 h 29, avant que la carte
// SumUp ne soit prête. Les compter en ÉCHEC rendrait cette ligne rouge pour
// toujours — et un contrôle qui crie en permanence finit par être ignoré,
// exactement comme test-rh.mjs et test-rbac-snack-livreur.mjs l'ont été.
const CONNUS = new Set(['TAAA4T4XGZE', 'TAAA4T4ZM79'])
const nouveaux = muets.filter(t => !CONNUS.has(String(t.ticket_externe)))
const connus = muets.filter(t => CONNUS.has(String(t.ticket_externe)))
nouveaux.length === 0
  ? P(`aucun ticket muet nouveau${connus.length ? ` (${connus.length} connus du 17/08, ${connus.reduce((s, t) => s + Number(t.montant_ttc), 0).toFixed(2)} € — montant libre tapé à l'ouverture)` : ''}`)
  : E(`${nouveaux.length} ticket(s) dont on connaît le MONTANT mais pas le contenu — ${nouveaux.reduce((s, t) => s + Number(t.montant_ttc), 0).toFixed(2)} € hors stock et hors food cost`)
for (const t of nouveaux.slice(0, 5)) console.log(`        · ${t.source_caisse} ticket ${t.ticket_externe} · ${t.montant_ttc} €`)

// ── 4. la correspondance de catalogue ────────────────────────────────
console.log('\n── 4. La correspondance de catalogue')
const corr = await compte('correspondances_catalogue?id=not.is.null')
const actifs = await compte('recettes?actif=is.true')
corr >= actifs
  ? P(`${corr} correspondances pour ${actifs} produits actifs — le rattachement se fait par identifiant, pas par libellé`)
  : E(`${corr} correspondances pour ${actifs} produits : ${actifs - corr} se rattacheront par le LIBELLÉ, qui casse au premier renommage`)

// ── 5. le contrôle quotidien ─────────────────────────────────────────
console.log('\n── 5. Le rapprochement, témoin indépendant')
const rap = await sb('rapprochements_caisse?select=date_jour,source_caisse,statut&order=date_jour.desc&limit=5')
rap.length > 0 ? P(`${rap.length} journée(s) rapprochée(s), dernière le ${rap[0].date_jour}`) : E('aucun rapprochement : une ingestion qui perd 3 % des lignes ne se verrait nulle part')
const ecarts = rap.filter(r => r.statut !== 'ok')
ecarts.length === 0 ? P('aucun écart sur les dernières journées') : console.log(`   ⚠️ ${ecarts.length} journée(s) en écart : ${ecarts.map(r => r.date_jour + ' ' + r.statut).join(', ')}`)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══`)
console.log('\n  ⚠️ CE QUE CET AUDIT NE PEUT PAS PROUVER : aucune vente RÉELLE n’a')
console.log('     encore traversé le pont Zelty — l’établissement est en mode école.')
console.log('     La moitié aval est éprouvée sur les 426 tickets SumUp d’août ;')
console.log('     la moitié amont est vérifiée en place et en marche, pas en charge.\n')
process.exit(ko ? 1 : 0)
