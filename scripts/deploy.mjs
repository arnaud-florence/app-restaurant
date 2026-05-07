#!/usr/bin/env node
// Helper de déploiement Vercel : lance les vérifications avant un push prod.
// Usage : node scripts/deploy.mjs [--preview|--prod]

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const isProd = process.argv.includes('--prod')
const mode = isProd ? 'PRODUCTION' : 'PREVIEW'

const log  = (m) => console.log(`\n→ ${m}`)
const ok   = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => { console.error(`  ✗ ${m}`); process.exit(1) }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Deploy script — mode ${mode.padEnd(35)}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Pré-requis fichiers ─────────────────────────────────
log('1/5  Vérification fichiers requis')
for (const f of ['vercel.json', 'next.config.mjs', 'package.json', 'public/manifest.webmanifest']) {
  if (!existsSync(f)) fail(`${f} manquant`)
  ok(f)
}

// ─── 2. .env.local existence (warn-only) ───────────────────
log('2/5  Variables d\'environnement (local)')
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf8')
  const requis = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY']
  const manquants = requis.filter(k => !env.includes(`${k}=`))
  if (manquants.length) console.warn(`  ⚠ manquantes localement : ${manquants.join(', ')}`)
  else ok('3 variables détectées dans .env.local')
} else {
  console.warn('  ⚠ .env.local absent — assure-toi que les vars sont dans Vercel')
}

// ─── 3. Type-check ──────────────────────────────────────────
log('3/5  Type-check TypeScript')
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' })
  ok('aucune erreur TS')
} catch (e) {
  console.error(e.stdout?.toString() ?? e.stderr?.toString())
  fail('erreurs TypeScript — corrige avant de déployer')
}

// ─── 4. Build prod ──────────────────────────────────────────
log('4/5  Build production')
try {
  execSync('npm run build', { stdio: 'inherit' })
  ok('build OK')
} catch {
  fail('build échoué')
}

// ─── 5. Vercel CLI ──────────────────────────────────────────
log('5/5  Déploiement Vercel')
try { execSync('vercel --version', { stdio: 'pipe' }) } catch { fail('Vercel CLI non installée — `npm i -g vercel`') }

const cmd = isProd ? 'vercel --prod' : 'vercel'
console.log(`  → exécution : ${cmd}`)
execSync(cmd, { stdio: 'inherit' })
console.log('\n🚀 Déploiement terminé.')
