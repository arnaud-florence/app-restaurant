// Campagne E2E — crawl authentifié de TOUTES les routes en navigateur réel (Playwright/Chromium headless) contre la PROD.
// Pour chaque route : login manager, navigate, capture erreurs console JS, réponses HTTP >=400,
// texte d'erreur visible, et screenshot. Produit un rapport JSON + console.
//
//   node scripts/e2e-crawl.mjs
//
// Compte manager test requis (scripts/create-manager-test.mjs).

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'https://app-restaurant-livid.vercel.app'
const EMAIL = 'qa-test-manager@casatasia.local'
const PASSWORD = 'QaTest2026!'

const ADMIN_ROUTES = [
  '/admin/cat', '/admin/affichage', '/admin/allergenes', '/admin/assistant', '/admin/boissons',
  '/admin/borne', '/admin/borne-pin', '/admin/capacite-cuisine', '/admin/cartes-cadeaux',
  '/admin/challenges', '/admin/chambres', '/admin/clients', '/admin/clients/fidelite',
  '/admin/codes-promo', '/admin/dechets', '/admin/economie', '/admin/energie', '/admin/finances',
  '/admin/finances/bilan-mensuel', '/admin/finances/pourboires', '/admin/formation',
  '/admin/formation/docs', '/admin/fournisseurs', '/admin/groupes', '/admin/hygiene',
  '/admin/ingredients', '/admin/journal', '/admin/legal', '/admin/maintenance', '/admin/marketing',
  '/admin/pilotage', '/admin/plats-du-jour', '/admin/previsionnel', '/admin/promotions',
  '/admin/recettes', '/admin/recettes/engineering', '/admin/reputation', '/admin/reservations',
  '/admin/rh', '/admin/securite', '/admin/setup', '/admin/stock',
]
const OPS_ROUTES = ['/serveur', '/cuisine', '/pizza', '/bar', '/caisse', '/emporter', '/livreur', '/reception']
const PUBLIC_ROUTES = ['/borne', '/affichage/tv', '/formation']
// Docs formation imprimables
const DOC_ROUTES = ['/admin/formation/docs/bienvenue-employe', '/admin/formation/docs/09-snack', '/admin/formation/docs/10-livreur']

mkdirSync('e2e-results/screens', { recursive: true })

const IGNORE_CONSOLE = [
  /favicon/i, /manifest/i, /Download the React DevTools/i, /\[Fast Refresh\]/i,
  /font/i, /preload/i, /service worker/i, /sw\.js/i,
]

const results = []

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })
const page = await ctx.newPage()

// ── LOGIN ──
console.log('→ Login manager test…')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', PASSWORD)
await page.click('button[type=submit]')
try {
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 })
  console.log(`  ✓ connecté, redirigé vers ${new URL(page.url()).pathname}`)
} catch {
  console.log(`  ⚠ toujours sur /login après submit — vérifier credentials. URL=${page.url()}`)
}

async function crawl(route, group) {
  const consoleErrors = []
  const netErrors = []
  const onConsole = msg => {
    if (msg.type() === 'error') {
      const t = msg.text()
      if (!IGNORE_CONSOLE.some(re => re.test(t))) consoleErrors.push(t.slice(0, 200))
    }
  }
  const onResponse = resp => {
    const s = resp.status()
    const url = resp.url()
    if (s >= 400 && !IGNORE_CONSOLE.some(re => re.test(url))) {
      netErrors.push(`${s} ${url.replace(BASE, '').slice(0, 120)}`)
    }
  }
  page.on('console', onConsole)
  page.on('response', onResponse)

  let httpStatus = 0
  let visibleError = null
  try {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
    httpStatus = resp?.status() ?? 0
    await page.waitForTimeout(800)
    // Cherche un texte d'erreur visible
    const body = await page.evaluate(() => document.body.innerText.slice(0, 3000))
    const errPatterns = [/Oups/i, /une erreur/i, /Application error/i, /something went wrong/i, /Unhandled/i, /500\b/, /Internal Server Error/i, /Cannot read propert/i]
    const found = errPatterns.find(re => re.test(body))
    if (found) {
      // Évite faux positifs : "erreur" peut apparaître dans un libellé légitime
      const m = body.match(new RegExp('.{0,40}' + found.source + '.{0,40}', 'i'))
      visibleError = m ? m[0].replace(/\s+/g, ' ').trim() : found.source
    }
  } catch (e) {
    visibleError = `NAV_FAIL: ${e.message.slice(0, 120)}`
  }

  // Screenshot
  const safe = route.replace(/\//g, '_').replace(/^_/, '') || 'root'
  const shot = `e2e-results/screens/${group}_${safe}.jpg`
  try { await page.screenshot({ path: shot, type: 'jpeg', quality: 50, fullPage: false }) } catch {}

  page.off('console', onConsole)
  page.off('response', onResponse)

  const ok = httpStatus < 400 && !visibleError && consoleErrors.length === 0 && netErrors.length === 0
  const status = ok ? '✅' : (httpStatus >= 400 || visibleError?.startsWith('NAV_FAIL') ? '❌' : '🟡')
  results.push({ route, group, httpStatus, visibleError, consoleErrors, netErrors, status })
  let line = `  ${status} ${route.padEnd(38)} HTTP ${httpStatus}`
  if (visibleError) line += `  ⚠ "${visibleError.slice(0, 50)}"`
  if (consoleErrors.length) line += `  ${consoleErrors.length} console-err`
  if (netErrors.length) line += `  ${netErrors.length} net-err`
  console.log(line)
}

console.log('\n═══ ADMIN (authentifié manager) ═══')
for (const r of ADMIN_ROUTES) await crawl(r, 'admin')
console.log('\n═══ DOCS FORMATION ═══')
for (const r of DOC_ROUTES) await crawl(r, 'docs')
console.log('\n═══ OPS ═══')
for (const r of OPS_ROUTES) await crawl(r, 'ops')
console.log('\n═══ PUBLIC ═══')
for (const r of PUBLIC_ROUTES) await crawl(r, 'public')

await browser.close()

// ── Rapport ──
const green = results.filter(r => r.status === '✅').length
const yellow = results.filter(r => r.status === '🟡').length
const red = results.filter(r => r.status === '❌').length

console.log(`\n${'═'.repeat(64)}`)
console.log(`  CRAWL E2E : ✅ ${green}   🟡 ${yellow}   ❌ ${red}   (sur ${results.length} routes)`)
console.log(`${'═'.repeat(64)}`)
if (red > 0) {
  console.log(`\n❌ Routes en erreur :`)
  results.filter(r => r.status === '❌').forEach(r => console.log(`  • ${r.route} — HTTP ${r.httpStatus} ${r.visibleError ?? ''} ${r.netErrors.join('; ')}`))
}
if (yellow > 0) {
  console.log(`\n🟡 Routes avec warnings (console/réseau) :`)
  results.filter(r => r.status === '🟡').forEach(r => console.log(`  • ${r.route} — ${[...r.consoleErrors, ...r.netErrors].slice(0,2).join(' | ').slice(0,140)}`))
}
writeFileSync('e2e-results/crawl-report.json', JSON.stringify(results, null, 2))
console.log(`\n📄 Rapport détaillé : e2e-results/crawl-report.json`)
console.log(`🖼  Screenshots : e2e-results/screens/`)
