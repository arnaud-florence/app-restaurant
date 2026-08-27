// Vérifie la ventilation du CA par point de vente et par activité.
//
// La règle testée : le rattachement se fait sur la LIGNE (produit vendu),
// avec repli sur l'établissement de la commande. C'est ce qui permet de
// lire « boulangerie 2 100 € / pizzeria 1 400 € » même quand la caisse ne
// donne pas le point de vente du ticket — la limite annoncée par Zelty.
//
// Lecture seule : aucune donnée créée, donc aucun cleanup.
//
//   node scripts/test-ventilation-activite.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const q = async (p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(`${p} → ${JSON.stringify(j).slice(0, 200)}`)
  return j
}

// ⚠️ RECOPIE de ACTIVITE_PAR_SLUG (src/lib/activites.ts) : la source est en TS.
// Modifier les deux ensemble.
const ACTIVITE_PAR_SLUG = {
  'le-relais-des-saveurs': 'restaurant', 'bar': 'restaurant', 'snack-emporter': 'restaurant',
  'fournil': 'fournil', 'fdj': 'fournil', 'tabac': 'fournil', 'relais-colis': 'fournil',
}

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const eur = n => `${n.toFixed(2).replace('.', ',')} €`

console.log('\n── Ventilation du CA par activité ──\n')

const ets = await q('etablissements?select=id,slug,nom')
const posParId = new Map(ets.map(e => [e.id, e]))

t('les 7 points de vente existent', ets.length >= 7, `${ets.length} trouvés`)
t('chaque point de vente est rattaché à une activité',
  ets.every(e => ACTIVITE_PAR_SLUG[e.slug]),
  ets.filter(e => !ACTIVITE_PAR_SLUG[e.slug]).map(e => e.slug).join(', '))

const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString()
const cmds = await q(`commandes?select=id,etablissement_id,montant_total_ttc&statut=eq.encaisse&created_at=gte.${depuis}`)
t('des ventes encaissées sur 30 jours', cmds.length > 0, `${cmds.length} commandes`)

const posDeCommande = new Map(cmds.map(c => [c.id, c.etablissement_id]))
const ids = cmds.map(c => c.id)

const lignes = []
for (let i = 0; i < ids.length; i += 100) {
  const lot = ids.slice(i, i + 100).join(',')
  lignes.push(...await q(
    `commande_articles?select=commande_id,quantite,prix_unitaire_ttc,tva_taux,` +
    `recette:recettes(nom,cout_achat_ht,tva,etablissement_id)&commande_id=in.(${lot})`))
}
t('des lignes de vente rattachées', lignes.length > 0, `${lignes.length} lignes`)

// Ventilation — même logique que getVentesStats()
const posMap = new Map()
let caLignes = 0, orphelines = 0
for (const a of lignes) {
  const r = a.recette
  const qte = Number(a.quantite ?? 0)
  const ca = qte * Number(a.prix_unitaire_ttc ?? 0)
  const taux = Number(a.tva_taux ?? r?.tva ?? 5.5)
  const caHT = ca / (1 + taux / 100)
  const coutU = r?.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
  const couvert = coutU != null && coutU > 0
  caLignes += ca

  const posId = r?.etablissement_id ?? posDeCommande.get(a.commande_id) ?? null
  const cle = posId != null && posParId.has(posId) ? posId : '—'
  if (cle === '—') orphelines++
  const pv = posMap.get(cle) ?? { q: 0, ca: 0, caHT: 0, caHTCouvert: 0, cout: 0, couvert: false }
  pv.q += qte; pv.ca += ca; pv.caHT += caHT
  if (couvert) { pv.caHTCouvert += caHT; pv.cout += qte * coutU; pv.couvert = true }
  posMap.set(cle, pv)
}

const total = [...posMap.values()].reduce((s, v) => s + v.ca, 0)
t('aucun euro perdu dans la ventilation',
  Math.abs(total - caLignes) < 0.01, `écart ${eur(Math.abs(total - caLignes))}`)
t('aucune ligne non rattachée', orphelines === 0, `${orphelines} lignes sans point de vente`)

console.log('\n  Par point de vente')
for (const [id, v] of [...posMap.entries()].sort((a, b) => b[1].ca - a[1].ca)) {
  const e = posParId.get(id)
  const nom = e?.nom ?? 'Non rattaché'
  const act = e ? ACTIVITE_PAR_SLUG[e.slug] : '—'
  const f = v.couvert && v.caHTCouvert > 0 ? `${(v.cout / v.caHTCouvert * 100).toFixed(1).replace('.', ',')} %` : '—'
  const couv = v.caHT > 0 ? `${Math.round(v.caHTCouvert / v.caHT * 100)} %` : '—'
  console.log(`    ${nom.padEnd(22)} ${eur(v.ca).padStart(11)}  ${String(v.q).padStart(5)} u.  food cost ${f.padStart(7)} sur ${couv.padStart(5)} du CA  [${act}]`)
}

const actMap = new Map()
for (const [id, v] of posMap) {
  const cle = posParId.has(id) ? ACTIVITE_PAR_SLUG[posParId.get(id).slug] : '—'
  const cur = actMap.get(cle) ?? { ca: 0, caHT: 0, caHTCouvert: 0, cout: 0, couvert: false }
  cur.ca += v.ca; cur.caHT += v.caHT; cur.caHTCouvert += v.caHTCouvert
  if (v.couvert) { cur.cout += v.cout; cur.couvert = true }
  actMap.set(cle, cur)
}
console.log('\n  Par activité')
for (const [cle, v] of [...actMap.entries()].sort((a, b) => b[1].ca - a[1].ca)) {
  const f = v.couvert && v.caHTCouvert > 0 ? `${(v.cout / v.caHTCouvert * 100).toFixed(1).replace('.', ',')} %` : '—'
  const couv = v.caHT > 0 ? `${Math.round(v.caHTCouvert / v.caHT * 100)} %` : '—'
  console.log(`    ${cle.padEnd(22)} ${eur(v.ca).padStart(11)}  HT ${eur(v.caHT).padStart(11)}  food cost ${f.padStart(7)} sur ${couv.padStart(5)} du CA`)
}

t('la somme des activités égale celle des points de vente',
  Math.abs([...actMap.values()].reduce((s, v) => s + v.ca, 0) - total) < 0.01)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
