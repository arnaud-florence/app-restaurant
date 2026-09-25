// La tournée de livraison ne transporte que du pain.
//
//   PORT=3000 node scripts/test-commande-livraison.mjs
//
// ⚠️ Ce test n'envoie QUE des commandes destinées à être REFUSÉES. Depuis le
// 22/08/2026 toute commande ONLINE acceptée est réelle et doit être préparée :
// vérifier le chemin qui passe créerait du travail à l'équipe.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT ?? '3000'
const CLE = env.PUBLIC_API_KEY
const sb = async p => (await fetch(U + '/rest/v1/' + p,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json()

let ok = 0, ko = 0
const T = (nom, cond, d = '') => { if (cond) { ok++; console.log(`  ✓ ${nom}`) } else { ko++; console.log(`  ✗ ${nom}${d ? ' — ' + d : ''}`) } }

const poster = async body => {
  const r = await fetch(`http://localhost:${PORT}/api/public/commande`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CLE },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

console.log('\n═══ Livraison : seulement le pain ═══\n')

const [pizza] = await sb('recettes?select=id,nom&tag_destination=eq.PIZZA&actif=eq.true&limit=1')
const [pain]  = await sb('recettes?select=id,nom&tag_destination=eq.FOURNIL&actif=eq.true&vendable_online=eq.true&limit=1')
T('un produit pizzeria existe', Boolean(pizza))
T('un produit fournil vendable en ligne existe', Boolean(pain))

const client = {
  client_nom: 'TEST', client_prenom: 'Refus', client_email: 'test@example.invalid',
  client_telephone: '0000000000',
  mode_retrait: 'livraison',
  adresse_livraison: '1 rue des Essais',
  commune_livraison: 'Sainte-Anastasie-sur-Issole',
}

// Le cas qui motivait le correctif : une pizza en livraison était acceptée et
// programmée sur la tournée du lendemain MATIN, avant l'ouverture de la
// pizzeria — le contrôle de précommande portant sur le créneau demandé, lequel
// était ensuite écrasé par la tournée.
if (pizza) {
  const r = await poster({ ...client, creneau_retrait: '2026-10-03T19:30:00.000Z',
    articles: [{ recette_id: pizza.id, quantite: 1 }] })
  T('une pizza en livraison est refusée', r.status === 400, `HTTP ${r.status}`)
  // ⚠️ La RAISON a changé le 25/09/2026, et c'est un progrès : la tournée du
  // soir existe désormais (src/lib/livraison-soir.ts). Une pizza livrée n'est
  // plus refusée « parce que la livraison ne concerne que la boulangerie »,
  // mais parce que la PIZZERIA n'a pas encore ouvert — elle ouvre le
  // 3 octobre. Le jour où le module s'allume, cette commande passera.
  //
  // L'assertion vérifie donc le refus ET sa cause : laisser l'ancienne aurait
  // gardé le test rouge sur un comportement correct, et un test rouge en
  // permanence finit par être ignoré.
  T('… et le motif est l\'ouverture, plus la nature du produit',
    /soir|ouvert/i.test(r.json.error ?? ''), r.json.error)
}

// Un panier MIXTE doit être refusé lui aussi : la tournée partirait avec le
// pain et laisserait la pizza derrière, sans que rien ne le signale.
if (pizza && pain) {
  const r = await poster({ ...client, creneau_retrait: '2026-10-03T19:30:00.000Z',
    articles: [{ recette_id: pain.id, quantite: 1 }, { recette_id: pizza.id, quantite: 1 }] })
  T('un panier pain + pizza en livraison est refusé', r.status === 400, `HTTP ${r.status}`)
}

// Une commune hors zone reste refusée — le correctif ne doit pas court-circuiter
// les contrôles existants.
if (pain) {
  const r = await poster({ ...client, commune_livraison: 'Paris',
    creneau_retrait: new Date(Date.now() + 864e5).toISOString(),
    articles: [{ recette_id: pain.id, quantite: 1 }] })
  T('une commune hors zone reste refusée', r.status === 400, `HTTP ${r.status}`)
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
