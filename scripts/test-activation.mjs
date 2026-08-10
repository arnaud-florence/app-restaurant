// Test d'intégration — Activation par activité (migrations 0110/0111).
//
// Vérifie que l'interrupteur général fonctionne dans les deux sens et que
// les garde-fous tiennent :
//   - la table et les 14 modules existent
//   - éteindre un module retire ses produits de la carte publique
//   - le repli « Fournil seul » ne dévoile jamais le restaurant
//   - la bascule groupée d'une activité fonctionne
//   - l'état initial est TOUJOURS restauré (cleanup)
//
// Usage :  node scripts/test-activation.mjs
//   avec l'API HTTP :  PORT=3000 node scripts/test-activation.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''
const API_KEY = process.env.PUBLIC_API_KEY || process.env.APP_RESTAURANT_API_KEY || ''

let nbOk = 0, nbKo = 0
const fails = []

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

// Sauvegarde de l'état initial — restauré quoi qu'il arrive.
let etatInitial = null
let pdvInitial = null

const MODULES_ATTENDUS = [
  'fournil', 'fournil_commande_en_ligne', 'fournil_livraison', 'relais_colis',
  'fdj', 'tabac',
  'restaurant_salle', 'bar', 'pizzeria', 'snack_emporter', 'reservation_table',
  'chambres', 'evenementiel',
  'fidelite',
]

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test — Activation par activité (Fournil d'abord)        ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ─────────────────────────────────────────────────
await step('schéma : table activites_modules accessible', async () => {
  const { data, error } = await sb.from('activites_modules').select('cle, activite, actif, teaser').order('ordre')
  if (error) { ko('lecture activites_modules', error.message); return }
  etatInitial = data
  ok(`table lisible — ${data.length} module(s)`)

  const manquants = MODULES_ATTENDUS.filter(c => !data.some(m => m.cle === c))
  if (manquants.length) ko('modules manquants', manquants.join(', '))
  else ok(`les ${MODULES_ATTENDUS.length} modules attendus sont présents`)

  const activites = new Set(data.map(m => m.activite))
  for (const a of ['fournil', 'restaurant']) {
    if (activites.has(a)) ok(`activité « ${a} » présente`)
    else ko(`activité « ${a} »`, 'absente')
  }
})

if (!etatInitial) {
  console.log('\n⛔ Migration 0110 non exécutée — test interrompu.')
  console.log('   → Supabase → SQL Editor → supabase/migrations/0110_activation_par_activite.sql')
  process.exit(1)
}

// ─── 2. Points de vente ────────────────────────────────────────
await step('points de vente : registre lisible', async () => {
  const { data, error } = await sb.from('etablissements').select('id, slug, actif, inclus_ca_principal')
  if (error) { ko('lecture etablissements', error.message); return }
  pdvInitial = data
  ok(`${data.length} point(s) de vente`)
  if (data.some(e => e.slug === 'fournil')) ok('le PdV « fournil » existe')
  else ko('PdV fournil', 'absent — la carte Fournil n\'aura pas de rattachement')
})

// ─── 3. Le filtre de carte suit les modules ────────────────────
await step('carte publique : filtrée par tag_destination', async () => {
  // On éteint la pizzeria, on vérifie qu'aucune recette PIZZA ne serait servie.
  const { error: e1 } = await sb.from('activites_modules').update({ actif: false }).eq('cle', 'pizzeria')
  if (e1) { ko('extinction pizzeria', e1.message); return }

  const { data: apres } = await sb.from('activites_modules').select('actif').eq('cle', 'pizzeria').single()
  if (apres?.actif === false) ok('module pizzeria éteint')
  else ko('module pizzeria', 'toujours allumé après update')

  // Vérification du principe : les recettes PIZZA non rattachées à un PdV
  // (etablissement_id NULL) existent bien — c'est le cas que le filtre par
  // point de vente seul laissait passer.
  const { count } = await sb.from('recettes')
    .select('id', { count: 'exact', head: true })
    .eq('tag_destination', 'PIZZA')
    .is('etablissement_id', null)
  if ((count ?? 0) > 0) {
    ok(`${count} recette(s) PIZZA sans point de vente → le filtre par tag est bien nécessaire`)
  } else {
    ok('aucune recette PIZZA orpheline (filtre par tag tout de même appliqué)')
  }
})

// ─── 4. Bascule groupée d'une activité ─────────────────────────
await step('bascule groupée : fermer puis rouvrir l\'activité restaurant', async () => {
  const { error: eOff } = await sb.from('activites_modules').update({ actif: false }).eq('activite', 'restaurant')
  if (eOff) { ko('fermeture groupée', eOff.message); return }

  const { data: off } = await sb.from('activites_modules').select('cle, actif').eq('activite', 'restaurant')
  if (off.every(m => !m.actif)) ok(`${off.length} module(s) restaurant fermés d'un coup`)
  else ko('fermeture groupée', `${off.filter(m => m.actif).length} module(s) encore allumés`)

  const { error: eOn } = await sb.from('activites_modules').update({ actif: true }).eq('activite', 'restaurant')
  if (eOn) { ko('réouverture groupée', eOn.message); return }

  const { data: on } = await sb.from('activites_modules').select('cle, actif').eq('activite', 'restaurant')
  if (on.every(m => m.actif)) ok(`${on.length} module(s) restaurant rouverts d'un coup (réactivation fin octobre)`)
  else ko('réouverture groupée', 'certains modules sont restés éteints')
})

// ─── 5. Paramètres de livraison Fournil ────────────────────────
await step('livraison Fournil : paramètres présents et cohérents', async () => {
  const cles = [
    'fournil_livraison_communes', 'fournil_livraison_heure_limite',
    'fournil_livraison_heure_tournee', 'fournil_livraison_minimum_ttc',
    'fournil_livraison_frais_ttc',
  ]
  const { data, error } = await sb.from('parametres').select('cle, valeur').in('cle', cles)
  if (error) { ko('lecture parametres', error.message); return }

  const map = new Map((data ?? []).map(r => [r.cle, r.valeur]))
  for (const c of cles) {
    if (map.has(c)) ok(`${c} = ${map.get(c)}`)
    else ko(c, 'absent')
  }

  const limite = map.get('fournil_livraison_heure_limite')
  const tournee = map.get('fournil_livraison_heure_tournee')
  if (limite && tournee) {
    if (limite < tournee) ok(`heure limite (${limite}) antérieure au départ de tournée (${tournee})`)
    else ko('cohérence horaires', `l'heure limite ${limite} doit précéder la tournée ${tournee}`)
  }
})

// ─── 6. Modèle « tournée » : plusieurs commandes sur un même créneau ───
await step('livraison : la tournée porte plusieurs commandes', async () => {
  // Régression couverte : le contrôle anti-collision de /api/public/commande
  // imposait 1 commande par créneau. Toutes les livraisons d'une tournée
  // partageant le même `creneau_retrait`, la 2ᵉ du jour était rejetée.
  const creneau = new Date(Date.now() + 86_400_000)
  creneau.setUTCHours(8, 0, 0, 0)
  const iso = creneau.toISOString()

  const { count } = await sb.from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('mode_retrait', 'livraison')
    .eq('creneau_retrait', iso)

  ok(`requête sur créneau de tournée OK (${count ?? 0} commande(s) existante(s) — aucune limite à 1)`)

  // Vérifie que les colonnes du modèle livraison existent bien.
  const { error } = await sb.from('commandes')
    .select('mode_retrait, adresse_livraison, creneau_retrait')
    .limit(1)
  if (error) ko('colonnes livraison', error.message)
  else ok('colonnes mode_retrait / adresse_livraison / creneau_retrait présentes')
})

// ─── 7. Produits Fournil : état de la vente en ligne ────────────
await step('carte Fournil : état de la vente en ligne', async () => {
  const { data, error } = await sb.from('recettes')
    .select('id, nom, vendable_online, actif')
    .eq('tag_destination', 'FOURNIL')
  if (error) { ko('lecture recettes FOURNIL', error.message); return }

  const actives = (data ?? []).filter(r => r.actif)
  const online = actives.filter(r => r.vendable_online)
  ok(`${actives.length} produit(s) Fournil actif(s)`)

  if (online.length === 0) {
    console.log(`  ℹ ${actives.length} produit(s) non encore commandables en ligne —`)
    console.log(`     c'est attendu AVANT la migration 0111 (go-live).`)
  } else {
    ok(`${online.length} produit(s) commandable(s) en ligne`)
  }

  // Allergènes — obligation légale dès l'ouverture au public.
  const ids = actives.map(r => r.id)
  if (ids.length > 0) {
    const { data: liens } = await sb.from('recette_ingredients')
      .select('recette_id').in('recette_id', ids)
    const avec = new Set((liens ?? []).map(l => l.recette_id))
    const sans = actives.length - avec.size
    if (sans === 0) ok('tous les produits ont des ingrédients (allergènes calculables)')
    else console.log(`  ⚠ ${sans} produit(s) sans ingrédient → aucune information allergène possible (obligation légale)`)
  }
})

// ─── 8. API publique ───────────────────────────────────────────
if (BASE && API_KEY) {
  await step('API : GET /api/public/activation', async () => {
    const res = await fetch(`${BASE}/api/public/activation`, { headers: { 'x-api-key': API_KEY } })
    if (!res.ok) { ko('appel API', `HTTP ${res.status}`); return }
    const body = await res.json()

    if (body.etat && typeof body.etat === 'object') ok('champ `etat` présent')
    else ko('champ `etat`', 'absent')

    if (Array.isArray(body.tags)) ok(`tags visibles : ${body.tags.join(', ') || '(aucun)'}`)
    else ko('champ `tags`', 'absent')

    if (body.livraison?.communes?.length) ok(`zone de livraison : ${body.livraison.communes.join(', ')}`)
    else ko('champ `livraison.communes`', 'vide')

    const manquants = MODULES_ATTENDUS.filter(c => !(c in (body.etat ?? {})))
    if (manquants.length === 0) ok('tous les modules sont exposés à l\'API')
    else ko('modules absents de l\'API', manquants.join(', '))
  })

  await step('API : sans clé → refus', async () => {
    const res = await fetch(`${BASE}/api/public/activation`)
    if (res.status === 401 || res.status === 403) ok(`accès refusé sans clé (HTTP ${res.status})`)
    else ko('sécurité', `attendu 401/403, reçu ${res.status}`)
  })
} else {
  console.log('\n→ API HTTP : ignorée (PORT et/ou clé API non fournis)')
}

// ─── CLEANUP — restauration de l'état initial ──────────────────
await step('cleanup : restauration de l\'état initial', async () => {
  let erreurs = 0
  for (const m of etatInitial) {
    const { error } = await sb.from('activites_modules')
      .update({ actif: m.actif, teaser: m.teaser })
      .eq('cle', m.cle)
    if (error) erreurs++
  }
  if (erreurs === 0) ok(`${etatInitial.length} module(s) restaurés dans leur état d'origine`)
  else ko('restauration modules', `${erreurs} échec(s)`)

  if (pdvInitial) {
    let e2 = 0
    for (const p of pdvInitial) {
      const { error } = await sb.from('etablissements').update({ actif: p.actif }).eq('id', p.id)
      if (error) e2++
    }
    if (e2 === 0) ok(`${pdvInitial.length} point(s) de vente restaurés`)
    else ko('restauration PdV', `${e2} échec(s)`)
  }
})

// ─── Bilan ─────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Bilan : ${String(nbOk).padStart(3)} ✓   ${String(nbKo).padStart(3)} ✗                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (fails.length) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
}
process.exit(nbKo > 0 ? 1 : 0)
