// Rapprochement quotidien caisse ↔ outil (migration 0139).
//
// Un contrôle qui ne dit jamais « écart » ne prouve rien. Ce test fabrique
// donc une anomalie et vérifie qu'elle est VUE : un ticket poussé par la
// caisse qui n'a donné aucune commande dans l'outil.
//
// Le serveur de dev doit tourner :  npm run dev
//   PORT=3000 node scripts/test-rapprochement.mjs
//
// Source de test dédiée (`zztest-rappr`) pour ne jamais toucher aux
// rapprochements réels de SumUp. Cleanup complet en fin de course.

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`
const SOURCE = 'zztest-rappr'

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const get = async (p) => {
  const j = await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json()
  return Array.isArray(j) ? j : []
}
const del = (p) => fetch(`${U}/rest/v1/${p}`, { method: 'DELETE', headers: H })

console.log('\n── Rapprochement caisse ↔ outil ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent de .env.local'); process.exit(1) }

// Hier en heure de Paris — la journée en cours n'est jamais rapprochée.
const hier = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() - 86_400_000))

// ── Setup : un ticket reçu qui n'a produit aucune commande ──────────
const r = await fetch(`${U}/rest/v1/encaissements_externes`, {
  method: 'POST', headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify({
    source_caisse: SOURCE,
    ticket_externe: 'ZZTEST-ORPHELIN',
    montant_ttc: 12.34,
    ventilation_tva: { '5.5': 0.64 },
    encaisse_at: `${hier}T10:00:00+02:00`,
    statut_rapprochement: 'sans_commande',
  }),
})
t('ticket orphelin créé pour le test', r.status === 201, `HTTP ${r.status}`)

// ── Le rapprochement doit le voir ───────────────────────────────────
const rep = await fetch(`${BASE}/api/cron/caisse/rapprochement?jours=2&source=${SOURCE}`, {
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
})
t('la route répond', rep.status === 200, `HTTP ${rep.status}`)
const bilan = await rep.json().catch(() => ({}))
t('elle signale une anomalie', bilan.ok === false, JSON.stringify(bilan).slice(0, 200))

const lignes = await get(`rapprochements_caisse?source_caisse=eq.${SOURCE}&date_jour=eq.${hier}`)
t('un rapprochement est écrit pour ce jour', lignes.length === 1)
const l = lignes[0] ?? {}
t('le ticket reçu est compté', Number(l.tickets_recus) === 1, `${l.tickets_recus}`)
t('aucune commande liée', Number(l.commandes_liees) === 0, `${l.commandes_liees}`)
t("l'écart de montant vaut le ticket perdu",
  Math.abs(Number(l.montant_recu) - 12.34) < 0.001 && Math.abs(Number(l.ecart_montant) - 12.34) < 0.001,
  `reçu ${l.montant_recu} · écart ${l.ecart_montant}`)
t('le statut est « ecart », pas « ok »', l.statut === 'ecart', String(l.statut))
t('le ticket fautif est nommé dans le détail',
  (l.detail?.tickets_sans_commande ?? []).includes('ZZTEST-ORPHELIN'),
  JSON.stringify(l.detail).slice(0, 150))
t("l'écart de TVA est relevé",
  (l.detail?.ecarts_tva ?? []).some(e => e.taux === '5.5'),
  JSON.stringify(l.detail?.ecarts_tva))

// ── Rejouable : recalculer ne doit pas doublonner ───────────────────
await fetch(`${BASE}/api/cron/caisse/rapprochement?jours=2&source=${SOURCE}`,
  { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })
const apres = await get(`rapprochements_caisse?source_caisse=eq.${SOURCE}&date_jour=eq.${hier}`)
t('recalculer ne crée pas de doublon', apres.length === 1, `${apres.length} ligne(s)`)

// ── Journal ─────────────────────────────────────────────────────────
const ev = await get(`integration_evenements?type=eq.rapprochement&order=created_at.desc&limit=5`)
t('le rapprochement est journalisé', ev.length > 0)

// ── Une journée sans ticket ne produit pas de ligne vide ────────────
const vide = await get(`rapprochements_caisse?source_caisse=eq.${SOURCE}&tickets_recus=eq.0`)
t('aucune ligne pour une journée sans ticket', vide.length === 0, `${vide.length}`)

// ── Cleanup ─────────────────────────────────────────────────────────
await del(`encaissements_externes?source_caisse=eq.${SOURCE}`)
await del(`rapprochements_caisse?source_caisse=eq.${SOURCE}`)
await del(`integration_evenements?systeme=eq.${SOURCE}`)
const reste = [
  (await get(`encaissements_externes?select=id&source_caisse=eq.${SOURCE}`)).length,
  (await get(`rapprochements_caisse?select=id&source_caisse=eq.${SOURCE}`)).length,
]
t('cleanup complet', reste.every(n => n === 0), reste.join('/'))

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
