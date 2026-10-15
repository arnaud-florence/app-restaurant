// Le menu enfant est PERMANENT : il ne suit pas l'ardoise de la semaine.
//
// ⚠️⚠️ POURQUOI IL ÉTAIT ÉTEINT, et pourquoi c'était une faute de périmètre.
// `ardoise-pause.mjs` met en pause toute la carte SALÉE hors ardoise, et sa
// liste `SALE` contient la famille « Menu ». Le menu enfant est donc tombé
// avec les 15 plats de brasserie le 04/10/2026 — alors qu'il relève de la
// même logique que les desserts et le café à table, délibérément ÉPARGNÉS
// ce jour-là : ce ne sont pas des plats qui tournent, c'est un service
// permanent. Un restaurant qui ouvre sans menu enfant refuse les familles,
// et personne ne le signale — le plat est simplement absent du comptoir.
//
// ⚠️ LA CAISSE EST ÉCRITE AVANT NOTRE BASE (0141, et la panne du 13/10 sur
// les anisés) : si elle refuse, rien n'est désynchronisé. L'inverse laisse
// le produit actif chez nous et éteint chez eux, et le miroir du catalogue
// le RE-ÉTEINT au passage de 3 h 10, sans que rien ne le dise.
import { readFileSync } from 'node:fs'
const ECRIRE = process.argv.includes('--ecrire')
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ZK = env.ZELTY_API_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${p}`, {
    ...o, headers: { Authorization: `Bearer ${ZK}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  return { s: r.status, j: (() => { try { return JSON.parse(t) } catch { return null } })(), t }
}

const NOM = 'Menu enfant'
const [p] = await sb(`recettes?nom=eq.${encodeURIComponent(NOM)}&select=id,nom,actif,prix_vente_ht,tva`)
if (!p) { console.log('✗ introuvable en base'); process.exit(1) }
const ttc = Number(p.prix_vente_ht) * (1 + Number(p.tva) / 100)
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
console.log(`   ${NOM} · ${ttc.toFixed(2)} € TTC · TVA ${p.tva} % · actif chez nous : ${p.actif}`)

// ⚠️ `show_all=true` est OBLIGATOIRE : sans lui GET /catalog/dishes OMET les
// plats désactivés — donc on ne retrouverait PAS celui qu'on veut rallumer.
const cat = await z('catalog/dishes?show_all=true&limit=0')
const plats = cat.j?.dishes ?? []
if (plats.length < 100) { console.log(`✗ la caisse rend ${plats.length} plats : lecture ratée, on n'écrit rien`); process.exit(1) }
const d = plats.find(x => x.remote_id === p.id) ?? plats.find(x => x.name === NOM)
if (!d) { console.log('✗ aucune contrepartie en caisse'); process.exit(1) }
console.log(`   caisse #${d.id} · price=${d.price} · tax=${d.tax} · disable=${d.disable}`)

if (!d.disable && p.actif) { console.log('\n   déjà actif des deux côtés — rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ⚠️ UPSERT DANGEREUX : on RECOPIE name/price/tax tels quels et on ne touche
// QUE `disable`. Un objet incomplet écrase le prix imprimé sur les tickets.
if (d.name == null || d.price == null || d.tax == null) {
  console.log('✗ la caisse ne rend pas name/price/tax : on REFUSE de construire'); process.exit(1)
}
const envoi = [{ id: d.id, name: d.name, price: d.price, tax: d.tax, disable: false }]
const w = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(envoi) })
if (w.s !== 200) { console.log(`✗ caisse ${w.s} ${w.t.slice(0, 200)} — rien écrit en base`); process.exit(1) }
console.log('   ✓ caisse : rallumé')

await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ actif: true }) })
console.log('   ✓ base   : rallumé')

const relu = (await z('catalog/dishes?show_all=true&limit=0')).j?.dishes?.find(x => x.id === d.id)
console.log(`\n   relecture caisse : disable=${relu?.disable} · price=${relu?.price} · tax=${relu?.tax}\n`)
