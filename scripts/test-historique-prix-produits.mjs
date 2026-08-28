// Le trigger qui trace l'économie d'un produit.
//
// Sans lui, aucune lecture causale n'est possible : on ne peut pas expliquer
// un mouvement de marge si on ignore ce que valait le produit la semaine
// d'avant. Et il DOIT être un trigger : le 28/08/2026, les prix ont été
// modifiés depuis cinq scripts, la propagation des factures et le miroir de
// la caisse. Du code applicatif en aurait manqué l'essentiel, en silence.
//
//   node scripts/test-historique-prix-produits.mjs
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); return t ? JSON.parse(t) : null
}
let ok = 0, ko = 0
const t = (n, c, d = '') => { if (c) { console.log(`  ✓ ${n}`); ok++ } else { console.log(`  ✗ ${n} — ${d}`); ko++ } }
const nb = async id => (await sb(`historique_prix_produits?select=id&recette_id=eq.${id}`)).length

console.log('\n── Historique économique des produits ──\n')

const tous = await sb('recettes?select=id&actif=eq.true')
const traces = await sb('historique_prix_produits?select=recette_id')
const couverts = new Set(traces.map(x => x.recette_id))
t('chaque produit actif a un point de départ',
  tous.every(r => couverts.has(r.id)), `${tous.filter(r => !couverts.has(r.id)).length} sans reprise`)

// ── Produit jetable, pour ne toucher à rien de réel ─────────────────
const [p] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
  nom: `ZZ test historique ${Date.now()}`, categorie: 'À classer',
  prix_vente_ht: 1.0, tva: 10, actif: false, tag_destination: 'FOURNIL',
}]) })
try {
  t('la création laisse une trace', await nb(p.id) === 1, `${await nb(p.id)}`)

  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ description: 'photo, pas un prix' }) })
  t('un champ NON économique ne trace rien', await nb(p.id) === 1,
    `${await nb(p.id)} — sinon le bruit rend l’historique illisible`)

  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: 1.5 }) })
  t('un changement de prix de vente trace', await nb(p.id) === 2, `${await nb(p.id)}`)

  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ cout_achat_ht: 0.4 }) })
  t('un changement de coût d’achat trace', await nb(p.id) === 3, `${await nb(p.id)}`)

  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ tva: 20 }) })
  t('un changement de TVA trace', await nb(p.id) === 4, `${await nb(p.id)}`)

  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: 1.5 }) })
  t('réécrire la MÊME valeur ne trace pas', await nb(p.id) === 4, `${await nb(p.id)}`)

  const h = await sb(`historique_prix_produits?select=prix_vente_ht,cout_achat_ht,tva,source&recette_id=eq.${p.id}&order=created_at`)
  t('la première ligne est marquée « creation »', h[0]?.source === 'creation', h[0]?.source)
  t('on peut relire l’ancien prix', Number(h[0]?.prix_vente_ht) === 1, `${h[0]?.prix_vente_ht}`)
  t('et le nouveau', Number(h.at(-1)?.tva) === 20, `${h.at(-1)?.tva}`)
} finally {
  await sb(`historique_prix_produits?recette_id=eq.${p.id}`, { method: 'DELETE' })
  await sb(`recettes?id=eq.${p.id}`, { method: 'DELETE' })
  const reste = await sb(`recettes?select=id&id=eq.${p.id}`)
  t('cleanup complet', reste.length === 0)
}

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko ? 1 : 0)
