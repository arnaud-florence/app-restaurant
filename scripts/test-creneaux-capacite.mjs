// La capacité d'un créneau se compte en ARTICLES, et par POSTE.
//
//   PORT=3000 node scripts/test-creneaux-capacite.mjs
//
// ⚠️ Ce test crée des commandes de contrôle et les SUPPRIME. Elles portent le
// nom « TEST-CAPACITE » et un créneau volontairement lointain pour ne jamais
// se mêler au service ; depuis le 22/08/2026 une commande ONLINE oubliée en
// base est du travail réel pour l'équipe.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT ?? '3000'
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
const api = async (chemin) => {
  const r = await fetch(`http://localhost:${PORT}/api/public/${chemin}`,
    { headers: { 'x-api-key': env.PUBLIC_API_KEY } })
  return r.json()
}

let ok = 0, ko = 0
const T = (n, c, d = '') => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { ko++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`) } }

console.log('\n═══ Capacité des créneaux ═══\n')

// ── Le réglage ───────────────────────────────────────────────
const cfg = await sb('capacite_cuisine_par_creneau?select=tag_destination,jour_semaine,heure_debut,heure_fin,max_articles,duree_creneau_min&actif=eq.true')
const pizza = cfg.filter(c => c.tag_destination === 'PIZZA')
T('la pizzeria a 7 plages actives', pizza.length === 7, `${pizza.length}`)
T('toutes le soir, 19h–22h', pizza.every(c => c.heure_debut.startsWith('19') && c.heure_fin.startsWith('22')))
T('capacité 8 articles par créneau', pizza.every(c => c.max_articles === 8),
  [...new Set(pizza.map(c => c.max_articles))].join(', '))
T('créneaux de 15 minutes', pizza.every(c => c.duree_creneau_min === 15))
// Le midi appartient à la brasserie, qui ne se commande pas en ligne.
T('aucune plage pizzeria le midi', !pizza.some(c => c.heure_debut < '15:00'))

// ── Ce que l'API rend ────────────────────────────────────────
// Un samedi bien après l'ouverture : aucune commande réelle ne s'y trouve.
const jour = '2026-12-05'
const c = await api(`creneaux-retrait?date=${jour}&tag=PIZZA`)
T('12 créneaux de 19h à 21h45', c.count === 12, `${c.count}`)
T('chaque créneau dit ce qu’il lui reste', (c.items ?? []).every(i => typeof i.restant === 'number'))
T('un créneau vide a 8 places', (c.items ?? [])[0]?.restant === 8, JSON.stringify(c.items?.[0]))

// ── La durée occupée suit la taille de la commande ───────────
//
// ⚠️ Le seuil de 8 est un CHOIX documenté dans creneaux-duree.ts : la
// consigne disait « entre 4 et 8 → 15 min » et « à partir de 8 → 30 min »,
// les deux se recouvrant sur 8. Retenu : 8 tient en un créneau.
for (const [q, attendu] of [[1, 1], [8, 1], [9, 2], [15, 2], [16, 3], [40, 3]]) {
  const r = await api(`creneaux-retrait?date=${jour}&tag=PIZZA&articles=${q}`)
  T(`${q} pizza(s) occupent ${attendu} créneau(x)`, r.creneauxOccupes === attendu, `${r.creneauxOccupes}`)
}
// Une commande de 45 minutes ne peut pas commencer à 21h45 : le service
// ferme à 22 h, les créneaux nécessaires n'existent pas.
const gros = await api(`creneaux-retrait?date=${jour}&tag=PIZZA&articles=16`)
const ouverts = (gros.items ?? []).filter(i => i.disponible)
T('une commande de 45 min ne démarre pas après 21h15', ouverts.at(-1)?.heure === '21:15',
  ouverts.at(-1)?.heure)
T('… et les deux derniers horaires sont barrés', ouverts.length === 10, `${ouverts.length}`)

// ── La place se consomme en ARTICLES ─────────────────────────
// C'est tout l'objet du correctif : compter les COMMANDES laissait passer
// quatre clients de trois pizzas, soit douze pizzas dans le même quart d'heure.
const [p] = await sb('recettes?select=id,prix_vente_ht,tva&tag_destination=eq.PIZZA&actif=eq.true&limit=1')
const creneau = c.items?.[0]?.iso
let cmdId = null
if (p && creneau) {
  const [cmd] = await sb('commandes', { method: 'POST', body: JSON.stringify({
    numero: 'TEST-CAPACITE', source: 'ONLINE', statut: 'en_attente',
    consommation: 'emporter', creneau_retrait: creneau,
    client_nom: 'TEST-CAPACITE', montant_total_ttc: 0,
  }) })
  cmdId = cmd.id
  await sb('commande_articles', { method: 'POST', body: JSON.stringify([{
    commande_id: cmdId, recette_id: p.id, quantite: 3,
    prix_unitaire_ht: p.prix_vente_ht, tag_destination: 'PIZZA', statut: 'en_attente',
  }]) })

  const c2 = await api(`creneaux-retrait?date=${jour}&tag=PIZZA`)
  const slot = (c2.items ?? []).find(i => i.iso === creneau)
  T('UNE commande de 3 pizzas consomme 3 places', slot?.restant === 5, JSON.stringify(slot))
  T('… le créneau reste ouvert pour une pizza', slot?.disponible === true)

  // ⚠️ Le filtre par poste : une commande FOURNIL sur le même horaire ne doit
  // pas manger la place du four. Les heures rondes du fournil et les quarts
  // d'heure de la pizzeria se croisent tous les soirs.
  const [pain] = await sb('recettes?select=id,prix_vente_ht&tag_destination=eq.FOURNIL&actif=eq.true&limit=1')
  if (pain) {
    const [cmd2] = await sb('commandes', { method: 'POST', body: JSON.stringify({
      numero: 'TEST-CAPACITE-2', source: 'ONLINE', statut: 'en_attente',
      consommation: 'emporter', creneau_retrait: creneau,
      client_nom: 'TEST-CAPACITE', montant_total_ttc: 0,
    }) })
    await sb('commande_articles', { method: 'POST', body: JSON.stringify([{
      commande_id: cmd2.id, recette_id: pain.id, quantite: 5,
      prix_unitaire_ht: pain.prix_vente_ht, tag_destination: 'FOURNIL', statut: 'en_attente',
    }]) })
    const c3 = await api(`creneaux-retrait?date=${jour}&tag=PIZZA`)
    const slot3 = (c3.items ?? []).find(i => i.iso === creneau)
    T('cinq baguettes ne prennent pas la place du four', slot3?.restant === 5, JSON.stringify(slot3))
    await sb('commande_articles?commande_id=eq.' + cmd2.id, { method: 'DELETE' })
    await sb('commandes?id=eq.' + cmd2.id, { method: 'DELETE' })
  }

  await sb('commande_articles?commande_id=eq.' + cmdId, { method: 'DELETE' })
  await sb('commandes?id=eq.' + cmdId, { method: 'DELETE' })
}

const reste = await sb('commandes?select=id&client_nom=eq.TEST-CAPACITE')
T('aucune commande de contrôle ne survit', reste.length === 0, `${reste.length}`)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
