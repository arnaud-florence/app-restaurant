// E2E parcours service COMPLET — création commande via UI serveur → envoi cuisine
// → vérification en base → vérification affichage cuisine. Bout-en-bout réel.
//
//   node scripts/e2e-parcours-service.mjs
//
// Nettoyage : node scripts/reset-transactionnel.mjs --execute

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'https://app-restaurant-livid.vercel.app'
const EMAIL = 'qa-test-manager@casatasia.local'
const PASSWORD = 'QaTest2026!'
mkdirSync('e2e-results/parcours', { recursive: true })

const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 150)))
function step(n, m) { console.log(`\n[${n}] ${m}`) }
async function shot(n) { await p.screenshot({ path: `e2e-results/parcours/${n}.jpg`, type: 'jpeg', quality: 55 }) }

let cmdId = null
try {
  step(1, 'Login manager')
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type=email]', EMAIL)
  await p.fill('input[type=password]', PASSWORD)
  await p.click('button[type=submit]')
  await p.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 })
  console.log('  ✓ connecté')

  step(2, 'Ouvrir /serveur + cliquer table T8')
  await p.goto(`${BASE}/serveur`, { waitUntil: 'networkidle', timeout: 30000 })
  await p.waitForTimeout(1200)
  await p.locator('text=/^T8$/').first().click({ timeout: 8000 })
  await p.waitForTimeout(1200)
  console.log('  ✓ catalogue ouvert')

  step(3, 'Ajouter "Plat du Jour" au panier')
  await p.locator('text=Plat du Jour').first().click({ timeout: 8000 })
  await p.waitForTimeout(1000)
  await shot('03-panier-1-article')
  const panierTxt = await p.evaluate(() => document.body.innerText)
  console.log('  panier contient "Plat du Jour" ?', panierTxt.includes('Plat du Jour') ? '✓' : '✗')

  step(4, 'Envoyer en cuisine')
  // Bouton d'envoi : cherche par texte (Envoyer / cuisine)
  const envoyer = p.locator('button:has-text("Envoyer"), button:has-text("Valider"), button:has-text("cuisine")').first()
  const nbEnv = await envoyer.count()
  console.log('  bouton envoi trouvé ?', nbEnv ? '✓' : '✗ (inspection)')
  if (nbEnv) {
    await envoyer.click({ timeout: 8000 })
    await p.waitForTimeout(2500)
    await shot('04-apres-envoi')
    console.log('  ✓ commande envoyée')
  } else {
    // Inspecte les boutons disponibles
    const btns = await p.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 20))
    console.log('  boutons visibles :', JSON.stringify(btns))
  }

  step(5, 'Vérifier la commande en base (Realtime/persistance)')
  await new Promise(r => setTimeout(r, 1500))
  const { data: cmds } = await sb.from('commandes')
    .select('id, numero, source, numero_table, statut, montant_total_ttc, created_at, commande_articles(recette:recettes(nom), statut, tag_destination)')
    .eq('source', 'TABLE')
    .order('created_at', { ascending: false })
    .limit(3)
  const recente = (cmds ?? []).find(c => {
    const age = Date.now() - new Date(c.created_at).getTime()
    return age < 120000 // créée dans les 2 dernières min
  })
  if (recente) {
    cmdId = recente.id
    console.log(`  ✓ Commande créée : #${recente.numero} table=${recente.numero_table} statut=${recente.statut} ${recente.montant_total_ttc}€`)
    const arts = recente.commande_articles ?? []
    console.log(`    articles : ${arts.map(a => `${a.recette?.nom} [${a.tag_destination}/${a.statut}]`).join(', ')}`)
  } else {
    console.log('  ✗ Aucune commande TABLE récente trouvée en base')
  }

  step(6, 'Vérifier affichage en /cuisine')
  await p.goto(`${BASE}/cuisine`, { waitUntil: 'networkidle', timeout: 30000 })
  await p.waitForTimeout(2000)
  await shot('05-cuisine')
  const cuisineTxt = await p.evaluate(() => document.body.innerText)
  console.log('  "Plat du Jour" visible en cuisine ?', cuisineTxt.includes('Plat du Jour') ? '✓' : '✗')
  console.log('  "T8" visible en cuisine ?', /T8\b/.test(cuisineTxt) ? '✓' : '✗')

} catch (e) {
  console.log(`\n❌ ÉCHEC : ${e.message.slice(0, 200)}`)
  await shot('99-erreur')
}

console.log(`\n── Erreurs JS (${errs.length}) ──`)
errs.slice(0, 5).forEach(e => console.log('  •', e))
console.log(cmdId ? `\n📝 Commande test créée : ${cmdId} (sera nettoyée par reset-transactionnel)` : '')
await b.close()
