// Déclarer, lister et retirer les webhooks Zelty.
//
//   node scripts/webhooks-zelty.mjs                    → état actuel
//   node scripts/webhooks-zelty.mjs --declarer         → (re)déclare order.ended
//   node scripts/webhooks-zelty.mjs --retirer <event>  → coupe un événement
//   node scripts/webhooks-zelty.mjs --nouveau-secret   → régénère la signature
//
// ⚠️ Le secret est CHOISI par nous, pas fourni par Zelty : `POST /webhooks`
// accepte `secret_key`. C'est ce qui débloque tout — inutile de leur réclamer
// une clé. Il doit être identique des deux côtés (ici et sur Vercel).
//
// ⚠️ Ne rien déclarer avant que le secret existe en PRODUCTION : notre route
// refuse un corps non signé par 401, et Zelty réessaierait en boucle.
//
// ⚠️ La version s'écrit « v2 », pas « 2 », et la signature n'existe qu'à
// partir de v2 : en v1 le corps arrive nu, donc refusé par notre propre route.
import fs from 'node:fs'
import crypto from 'node:crypto'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const Z = env.ZELTY_API_KEY
const CIBLE = (env.NEXT_PUBLIC_SITE_URL ?? 'https://app-restaurant-livid.vercel.app')
  + '/api/integrations/zelty/webhook'
const zl = async (o) => {
  const r = await fetch('https://api.zelty.fr/2.11/webhooks', o
    ? { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(o) }
    : { headers: { Authorization: `Bearer ${Z}` } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const arg = process.argv.slice(2)
if (arg.includes('--nouveau-secret')) {
  const secret = crypto.randomBytes(32).toString('hex')
  const r = await zl({ secret_key: secret })
  if (r.status !== 200) { console.log('✗', JSON.stringify(r.body)); process.exit(1) }
  const p = '.env.local'; let s = fs.readFileSync(p, 'utf8')
  s = s.includes('ZELTY_WEBHOOK_SECRET=')
    ? s.replace(/^ZELTY_WEBHOOK_SECRET=.*$/m, 'ZELTY_WEBHOOK_SECRET=' + secret)
    : s.trimEnd() + '\nZELTY_WEBHOOK_SECRET=' + secret + '\n'
  fs.writeFileSync(p, s)
  console.log(`  ✓ nouveau secret posé chez Zelty et dans .env.local (finit par ${secret.slice(-4)})`)
  console.log('  ⚠️  à reporter sur Vercel, sinon la production refusera tout')
}
const retirer = arg.indexOf('--retirer')
if (retirer >= 0 && arg[retirer + 1]) {
  const r = await zl({ webhooks: { [arg[retirer + 1]]: null } })
  console.log(`  ${r.status === 200 ? '✓' : '✗'} ${arg[retirer + 1]} retiré — HTTP ${r.status}`)
}
if (arg.includes('--declarer')) {
  const r = await zl({ webhooks: { 'order.ended': { target: CIBLE, version: 'v2' } } })
  console.log(`  ${r.status === 200 ? '✓' : '✗'} order.ended → ${CIBLE} (v2) — HTTP ${r.status}`)
  if (r.status !== 200) console.log('    ' + JSON.stringify(r.body).slice(0, 300))
}

const v = (await zl()).body
console.log('\n── Webhooks Zelty ──\n')
console.log(`  signature : ${v.secret_key ?? '—'}   (local : ${env.ZELTY_WEBHOOK_SECRET ? '…' + env.ZELTY_WEBHOOK_SECRET.slice(-4) : 'ABSENT'})`)
const actifs = Object.entries(v.webhooks ?? {}).filter(([, w]) => w)
console.log(`  actifs    : ${actifs.length} / ${Object.keys(v.webhooks ?? {}).length}\n`)
for (const [k, w] of actifs) console.log(`   ${k.padEnd(28)} ${w.version}  ${w.target}`)
if (!actifs.length) console.log('   (aucun)')
console.log()
