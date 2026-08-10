// Test d'intégration — Co-gérant Phase 1.1 (socle de la boucle `propositions`).
// Vérifie : créer → lire → discuter → accepter → faire (mémoire) + contexte resto.
// Lit .env.local à la main, parle à Supabase REST (anon key), cleanup systématique.

import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const SB_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

let ok = 0, ko = 0
const check = (cond, label) => { if (cond) { ok++; console.log('  ✓', label) } else { ko++; console.log('  ✗', label) } }
const rest = async (path, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const txt = await r.text()
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: r.status, json }
}

let propId = null
let ctxBackup = undefined

try {
  console.log('— Co-gérant 1.1 : socle de la boucle —')

  // 1. Créer une proposition
  const ins = await rest('propositions', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      domaine: 'carte', type: 'completer',
      titre: '[TEST] Ajouter le plat Margherita',
      resume: 'Plat manquant à la carte', details: 'Classique incontournable.',
      options: [{ id: 'a', titre: '7,90 €' }, { id: 'b', titre: '8,50 €' }],
      action_type: 'create_recette', action_payload: { nom: 'Margherita' },
      urgence: 'jaune', cible_url: '/admin/recettes',
    }),
  })
  check(ins.status === 201 && ins.json?.[0]?.id, '1. créer une proposition')
  propId = ins.json?.[0]?.id

  // 2. Lire (statut par défaut = proposee)
  const read = await rest(`propositions?id=eq.${propId}&select=*`)
  check(read.json?.[0]?.statut === 'proposee', '2. lue, statut = proposee')
  check(Array.isArray(read.json?.[0]?.options) && read.json[0].options.length === 2, '   options bien stockées (jsonb)')

  // 3. Peaufinage : ajouter un échange + passer en_discussion
  const cur = read.json[0].echanges ?? []
  cur.push({ role: 'gerant', texte: 'ok mais pas trop cher', at: new Date().toISOString() })
  const disc = await rest(`propositions?id=eq.${propId}`, {
    method: 'PATCH', body: JSON.stringify({ echanges: cur, statut: 'en_discussion' }),
  })
  check(disc.status === 204 || disc.status === 200, '3. échange ajouté (peaufinage)')

  // 4. Accepter
  const acc = await rest(`propositions?id=eq.${propId}`, {
    method: 'PATCH', body: JSON.stringify({ statut: 'acceptee', validee_par: 'test', validee_at: new Date().toISOString() }),
  })
  check(acc.status === 204 || acc.status === 200, '4. acceptée')

  // 5. Faite + résultat (la mémoire)
  const done = await rest(`propositions?id=eq.${propId}`, {
    method: 'PATCH', body: JSON.stringify({ statut: 'faite', resultat: 'Plat ajouté à 8,50 €', faite_at: new Date().toISOString() }),
  })
  check(done.status === 204 || done.status === 200, '5. faite + résultat noté')
  const final = await rest(`propositions?id=eq.${propId}&select=statut,resultat`)
  check(final.json?.[0]?.statut === 'faite' && final.json?.[0]?.resultat?.includes('8,50'), '   mémoire relue OK')

  // 6. Contexte resto (parametres)
  const before = await rest('parametres?cle=eq.cg_concept&select=valeur')
  check(before.status === 200 && Array.isArray(before.json), '6. clé contexte cg_concept présente')
  ctxBackup = before.json?.[0]?.valeur ?? null
  await rest('parametres?cle=eq.cg_concept', { method: 'PATCH', body: JSON.stringify({ valeur: 'pizzeria-trattoria (test)' }) })
  const after = await rest('parametres?cle=eq.cg_concept&select=valeur')
  check(after.json?.[0]?.valeur === 'pizzeria-trattoria (test)', '   contexte écrit + relu')

} catch (e) {
  ko++; console.log('  ✗ exception:', e.message)
} finally {
  // Cleanup
  if (propId) await rest(`propositions?id=eq.${propId}`, { method: 'DELETE' })
  if (ctxBackup !== undefined) await rest('parametres?cle=eq.cg_concept', { method: 'PATCH', body: JSON.stringify({ valeur: ctxBackup }) })
  console.log(`\nBilan : ${ok} ✓ / ${ko} ✗`)
  process.exit(ko === 0 ? 0 : 1)
}
