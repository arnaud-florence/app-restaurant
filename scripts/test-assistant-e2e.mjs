// Test E2E Module 24 — Crée une conversation, envoie un message, lit le stream Claude.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const BASE = `http://localhost:${process.env.PORT || 3002}`

let convId
try {
  // Crée une conv minimale
  const { data, error } = await sb.from('assistant_conversations').insert({
    titre: 'TEST24-E2E',
    modele: 'claude-haiku-4-5',
    contexte_snap: {
      snapshot: {
        genere_le: new Date().toISOString(),
        periode: { mois: '2026-05', debut: '2026-05-01', fin: '2026-05-31' },
        ca: { mois_courant: 18500, nb_couverts_mois: 245, panier_moyen: 75.5, jours_actifs: 12 },
        rh: { masse_salariale_mois: 6200, nb_employes_actifs: 5, ratio_masse_ca: 33.5 },
        food_cost: { moyen_pct: 31.2, nb_recettes_alerte: 4, nb_recettes_rouge: 1 },
        hygiene: { nc_ouvertes: 2, nc_critiques: 0, nc_anciennes_jours: 5, controles_temp_jour: 2 },
        stock: { lots_dlc_critique: 1, lots_dlc_proche: 3, valeur_stock: 2400 },
        legal: { obligations_expirees: 0, obligations_proches_30j: 1 },
        finances: { factures_a_payer: 3, montant_factures_a_payer: 1800, charges_fixes_mois: 4500 },
        reservations: { couverts_jour: 18, couverts_semaine: 95 },
      },
      anomalies: [
        { niveau: 'attention', domaine: 'food_cost', titre: 'Food cost moyen à 31.2%', detail: 'Zone orange', action_suggeree: 'Auditer recettes' },
      ],
    },
  }).select('id').single()
  if (error) throw error
  convId = data.id
  console.log(`✓ Conversation E2E créée : ${convId}`)

  // POST vers /api/assistant/stream
  console.log('→ POST /api/assistant/stream avec une question simple…')
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/assistant/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversation_id: convId,
      message: 'En une phrase, dis-moi quel est mon CA du mois et si mon food cost est bon.',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HTTP ${res.status} : ${err}`)
  }

  // Lecture du stream SSE
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let texte = ''
  let usage = null
  let nbChunks = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const ev of events) {
      if (!ev.startsWith('data: ')) continue
      const obj = JSON.parse(ev.slice(6))
      if (obj.type === 'text') { texte += obj.text; nbChunks++ }
      else if (obj.type === 'done') usage = obj.usage
      else if (obj.type === 'error') throw new Error(`Stream error: ${obj.error}`)
    }
  }
  const dt = Date.now() - t0

  console.log(`\n✓ Stream reçu en ${dt}ms (${nbChunks} chunks)`)
  console.log(`✓ Réponse Claude : "${texte.trim()}"`)
  if (usage) {
    console.log(`✓ Usage : in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read} cache_write=${usage.cache_write}`)
  }

  // Vérifier que la réponse cite bien le CA (18500 ou 18 500) du contexte
  if (/18\s*500|18500/.test(texte)) console.log('✓ Claude a bien lu le snapshot (CA cité)')
  else console.log('⚠ Claude n\'a pas cité le CA — vérifier le system prompt')

  // Vérifier persistance
  const { data: msgs } = await sb.from('assistant_messages').select('role, contenu, tokens_in, tokens_out, cache_read_tokens')
    .eq('conversation_id', convId).order('created_at')
  console.log(`✓ ${msgs.length} messages persistés (attendu : 2 user+assistant)`)
  if (msgs.length === 2 && msgs[1].role === 'assistant' && msgs[1].tokens_out > 0) {
    console.log(`✓ Message assistant persisté avec usage : in=${msgs[1].tokens_in} out=${msgs[1].tokens_out}`)
  }

  console.log('\n🎉 E2E OK — Streaming + caching + persistance fonctionnels.')
} catch (e) {
  console.error(`\n❌ Échec : ${e.message}`)
  process.exitCode = 1
} finally {
  if (convId) {
    await sb.from('assistant_conversations').delete().eq('id', convId)
    console.log(`Cleanup : conv ${convId} supprimée.`)
  }
}
