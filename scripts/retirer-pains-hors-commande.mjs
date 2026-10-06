// Les pains que le Fournil ne vend plus — retrait des DEUX côtés.
//
// Décision du gérant (06/10/2026), sur la facture Gineys 03777865 : ce qui
// n'a pas été commandé ne fait plus partie de la carte boulangerie. Il a
// gardé la **Baguette classique**, qui reste le premier prix du pain.
//
// ⚠️⚠️ LE RETRAIT SE MÈNE DES DEUX CÔTÉS, JAMAIS D'UN SEUL.
// `recettes.actif = false` CHEZ NOUS **et** `disable` EN CAISSE. Poser
// `disable` seul ferait relire « produit inactif » par le miroir du
// catalogue, qui éteindrait notre fiche — le produit disparaîtrait sans que
// personne sache pourquoi (0141). Les deux ensemble, le miroir relit ce
// qu'il a déjà : aucune boucle.
//
// ⚠️ ON DÉSACTIVE, ON NE SUPPRIME PAS. La suppression emporterait
// l'historique de ventes — la Baguette Victoire en porte 170. Et le miroir
// caisse cherche parmi TOUS les produits, actifs ou non : un produit
// désactivé exprès doit être RETROUVÉ si un ticket arrive, pas recréé en
// double. On garde donc `nom_caisse`.
//
//   node scripts/retirer-pains-hors-commande.mjs [--ecrire] [--reprendre]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const REPRENDRE = process.argv.includes('--reprendre')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${p}`, { ...o,
    headers: { Authorization: `Bearer ${ZK}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  return { s: r.status, t, j: (() => { try { return JSON.parse(t) } catch { return null } })() }
}

// ⚠️ La Baguette classique est EXPLICITEMENT conservée — elle n'est pas sur
// la facture, mais c'est le premier prix du pain et le gérant l'a tranché.
const RETIRER = ['Baguette Victoire', 'Bâtard céréales', 'Bâtard maïs et graines',
  'Pain aux céréales', 'Pain lin-tournesol']
const GARDES = ['Baguette classique']

const tous = await sb(`recettes?select=id,nom,categorie,actif,prix_vente_ht,tva,nom_caisse&nom=in.(${
  [...RETIRER, ...GARDES].map(n => `"${n}"`).join(',')})`)
const cible = tous.filter(r => RETIRER.includes(r.nom))
const manquants = RETIRER.filter(n => !tous.some(r => r.nom === n))
if (manquants.length) { console.error(`⛔ introuvable(s) : ${manquants.join(', ')} — rien n'est écrit.`); process.exit(1) }

const liste = cible.filter(r => (REPRENDRE ? !r.actif : r.actif))
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${REPRENDRE ? 'REPRISE' : 'RETRAIT'} ──\n`)
for (const r of liste) console.log(`   ${r.categorie.padEnd(13)} ${r.nom}`)
for (const g of GARDES) console.log(`\n   ✅ CONSERVÉ : ${g} — décision du gérant, premier prix du pain`)
if (!liste.length) { console.log('\n   rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── 1. la caisse D'ABORD, parce que c'est elle qui peut refuser ──
const cat = await z('catalog/dishes?limit=0')
const plats = cat.j?.dishes ?? []
if (plats.length < 100) {
  console.error(`   ✗ la caisse rend ${plats.length} plats — LECTURE RATÉE, pas un catalogue vide. Rien n'est écrit.`)
  process.exit(1)
}
const parRemote = new Map(plats.filter(p => p.remote_id).map(p => [String(p.remote_id), p]))
const corps = [], sans = []
for (const r of liste) {
  const p = parRemote.get(r.id)
  if (!p) { sans.push(r.nom); continue }
  // ⚠️ On RECOPIE name/price/tax tels quels et on REFUSE s'il en manque un :
  // un objet incomplet écrase le prix imprimé sur les tickets.
  if (p.name == null || p.price == null || p.tax == null) { sans.push(`${r.nom} (champ obligatoire manquant)`); continue }
  corps.push({ id: p.id, name: p.name, price: p.price, tax: p.tax, disable: !REPRENDRE })
}
if (sans.length) console.log(`   ⚠️ ${sans.length} sans contrepartie exploitable : ${sans.join(', ')}`)
if (corps.length) {
  const rep = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (rep.s !== 200) { console.error(`   ✗ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`   ✓ caisse : ${corps.length} plat(s) ${REPRENDRE ? 'réactivé(s)' : 'éteint(s)'}`)
}

// ── 2. notre base ENSUITE : si la caisse a refusé, rien n'est désynchronisé ──
// ⚠️ `vendable_online` suit aussi : un produit retiré de la carte n'a rien à
// faire sur casatasia.fr, et le menu public filtre sur l'actif ET la famille.
await sb(`recettes?id=in.(${liste.map(r => r.id).join(',')})`, {
  method: 'PATCH', body: JSON.stringify({ actif: REPRENDRE, vendable_online: REPRENDRE }) })
console.log(`   ✓ base  : ${liste.length} produit(s) ${REPRENDRE ? 'repris' : 'retirés'}\n`)
