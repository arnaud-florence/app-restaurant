// Test d'intégration : exécute la même logique que les server actions
// du wizard, vérifie que tout est bien persisté en DB, puis nettoie.
//
//   node scripts/test-setup-save.mjs
//
// L'idée : reproduire le chemin saveEtablissement / saveHoraires /
// saveZonesTables / saveTVA / saveLivraison / saveEmployes /
// finaliserSetup, en se branchant sur la base réelle. Au moindre
// échec on log l'erreur et on sort en code 1.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Charge .env.local
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / ANON_KEY manquants')
  process.exit(1)
}

const sb = createClient(url, key)
let nbOk = 0, nbKo = 0
const fails = []

function ok(msg) { console.log(`  ✓ ${msg}`); nbOk++ }
function ko(msg, err) { console.log(`  ✗ ${msg} — ${err}`); nbKo++; fails.push(`${msg}: ${err}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message); }
}

// Helpers : reproduisent les server actions
async function setParams(entries) {
  const rows = Object.entries(entries).map(([cle, valeur]) => ({
    cle, valeur, updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('parametres').upsert(rows, { onConflict: 'cle' })
  if (error) throw new Error(error.message)
}

async function getParam(cle) {
  const { data, error } = await sb.from('parametres').select('valeur').eq('cle', cle).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.valeur ?? null
}

// ─── Préfixe pour identifier nos données de test (et nettoyer après) ───
const TAG = `__test_${Date.now().toString(36)}__`
const cleanupKeys = []
const cleanupTableIds = []
const cleanupEmployeIds = []

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test wizard setup — tag : ${TAG}            ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── Section 1 : Établissement ───────────────────────────────────────
await step('saveEtablissement', async () => {
  const data = {
    nom: TAG + ' Restaurant',
    adresse: '12 Rue Test, 31000 Toulouse',
    telephone: '0512345678',
    email: 'test@test.fr',
    site_web: 'https://test.fr',
    siret: '12345678900012',
    tva_intra: 'FR12345678901',
    logo_url: 'https://exemple.com/logo.png',
  }
  const keys = {
    etablissement_nom:       data.nom,
    etablissement_adresse:   data.adresse,
    etablissement_telephone: data.telephone,
    etablissement_email:     data.email,
    etablissement_site_web:  data.site_web,
    etablissement_siret:     data.siret,
    etablissement_tva_intra: data.tva_intra,
    etablissement_logo_url:  data.logo_url,
  }
  cleanupKeys.push(...Object.keys(keys))
  await setParams(keys)
  // Vérif read-back
  for (const [k, v] of Object.entries(keys)) {
    const got = await getParam(k)
    if (got === v) ok(`${k} = "${v}"`)
    else ko(`${k}`, `attendu "${v}", reçu "${got}"`)
  }
})

// ─── Section 2 : Horaires + exceptions ───────────────────────────────
await step('saveHoraires + exceptions', async () => {
  const horaires = {
    lundi:    { ouvert: true,  ouverture: '12:00', fermeture: '14:30' },
    mardi:    { ouvert: true,  ouverture: '12:00', fermeture: '14:30' },
    mercredi: { ouvert: true,  ouverture: '12:00', fermeture: '14:30' },
    jeudi:    { ouvert: true,  ouverture: '12:00', fermeture: '14:30' },
    vendredi: { ouvert: true,  ouverture: '12:00', fermeture: '14:30' },
    samedi:   { ouvert: true,  ouverture: '12:00', fermeture: '23:00' },
    dimanche: { ouvert: false, ouverture: '00:00', fermeture: '00:00' },
  }
  const exceptions = [
    { id: 'x1', date_debut: '2026-08-01', date_fin: '2026-08-15', motif: 'Congés ' + TAG },
  ]
  cleanupKeys.push('horaires', 'horaires_exceptions')
  await setParams({
    horaires: JSON.stringify(horaires),
    horaires_exceptions: JSON.stringify(exceptions),
  })
  const h = JSON.parse(await getParam('horaires'))
  if (h.dimanche.ouvert === false && h.samedi.fermeture === '23:00') ok('horaires JSON round-trip')
  else ko('horaires JSON round-trip', JSON.stringify(h))
  const ex = JSON.parse(await getParam('horaires_exceptions'))
  if (ex.length === 1 && ex[0].motif.includes(TAG)) ok('exceptions JSON round-trip')
  else ko('exceptions', JSON.stringify(ex))
})

// ─── Section 3 : Zones + tables ──────────────────────────────────────
await step('saveZonesTables', async () => {
  const zones = ['Salle', 'Terrasse', 'Bar']
  cleanupKeys.push('zones')
  await setParams({ zones: JSON.stringify(zones) })

  const numerosTags = [`${TAG}-T1`, `${TAG}-T2`, `${TAG}-B1`]
  const { data: ins, error } = await sb.from('tables_restaurant')
    .insert([
      { numero: numerosTags[0], capacite: 4, zone: 'Salle' },
      { numero: numerosTags[1], capacite: 2, zone: 'Terrasse' },
      { numero: numerosTags[2], capacite: 3, zone: 'Bar' },
    ])
    .select('id, numero, capacite, zone')
  if (error) throw new Error(error.message)
  cleanupTableIds.push(...ins.map(t => t.id))
  ok(`3 tables insérées (${ins.map(t => t.numero).join(', ')})`)

  // Update : passer T1 à 6 places
  const t1 = ins.find(t => t.numero === numerosTags[0])
  const { error: uErr } = await sb.from('tables_restaurant')
    .update({ capacite: 6 })
    .eq('id', t1.id)
  if (uErr) throw new Error(uErr.message)
  const { data: t1Read } = await sb.from('tables_restaurant').select('capacite').eq('id', t1.id).single()
  if (Number(t1Read.capacite) === 6) ok('table update (capacite 4 → 6)')
  else ko('table update', `attendu 6, reçu ${t1Read.capacite}`)

  // Delete : supprimer la table Bar
  const tB1 = ins.find(t => t.numero === numerosTags[2])
  const { error: dErr } = await sb.from('tables_restaurant').delete().eq('id', tB1.id)
  if (dErr) throw new Error(dErr.message)
  cleanupTableIds.splice(cleanupTableIds.indexOf(tB1.id), 1) // déjà supprimée
  const { data: deleted } = await sb.from('tables_restaurant').select('id').eq('id', tB1.id).maybeSingle()
  if (!deleted) ok('table delete (B1)')
  else ko('table delete', 'la table existe encore')

  // Read-back zones
  const z = JSON.parse(await getParam('zones'))
  if (z.includes('Terrasse')) ok('zones JSON round-trip')
  else ko('zones', JSON.stringify(z))
})

// ─── Section 4 : TVA ─────────────────────────────────────────────────
await step('saveTVA', async () => {
  cleanupKeys.push('tva_sur_place', 'tva_emporter', 'tva_alcool')
  await setParams({
    tva_sur_place: '10',
    tva_emporter:  '5.5',
    tva_alcool:    '20',
  })
  if (await getParam('tva_sur_place') === '10')   ok('tva_sur_place = 10')   ; else ko('tva_sur_place', 'mismatch')
  if (await getParam('tva_emporter')  === '5.5')  ok('tva_emporter = 5.5')   ; else ko('tva_emporter', 'mismatch')
  if (await getParam('tva_alcool')    === '20')   ok('tva_alcool = 20')      ; else ko('tva_alcool', 'mismatch')
})

// ─── Section 5 : Livraison ───────────────────────────────────────────
await step('saveLivraison', async () => {
  const livraison = {
    active: true, rayon_km: 7, minimum: 20, delai_min: 35,
    zones: [
      { id: 'z1', rayon_max_km: 3, frais: 2 },
      { id: 'z2', rayon_max_km: 7, frais: 4 },
    ],
  }
  cleanupKeys.push('livraison_active', 'livraison_rayon_km', 'livraison_minimum', 'livraison_delai_min', 'livraison_frais_zones')
  await setParams({
    livraison_active:      String(livraison.active),
    livraison_rayon_km:    String(livraison.rayon_km),
    livraison_minimum:     String(livraison.minimum),
    livraison_delai_min:   String(livraison.delai_min),
    livraison_frais_zones: JSON.stringify(livraison.zones),
  })
  if (await getParam('livraison_active') === 'true') ok('livraison_active = true')
  else ko('livraison_active', 'mismatch')
  const z = JSON.parse(await getParam('livraison_frais_zones'))
  if (z.length === 2 && z[1].frais === 4) ok('livraison_frais_zones JSON round-trip')
  else ko('livraison_frais_zones', JSON.stringify(z))
})

// ─── Section 6 : Employés ────────────────────────────────────────────
await step('saveEmployes', async () => {
  const { data: ins, error } = await sb.from('employes')
    .insert([
      { prenom: 'Marie',    nom: TAG + 'Dupont',    email: TAG + '.marie@test.fr',  poste: 'gerant',    actif: true },
      { prenom: 'Pierre',   nom: TAG + 'Martin',    email: TAG + '.pierre@test.fr', poste: 'cuisinier', actif: true },
      { prenom: 'Sophie',   nom: TAG + 'Bernard',   email: TAG + '.sophie@test.fr', poste: 'serveur',   actif: true },
    ])
    .select('id, prenom, nom, poste')
  if (error) throw new Error(error.message)
  cleanupEmployeIds.push(...ins.map(e => e.id))
  ok(`3 employés insérés (${ins.map(e => `${e.prenom}/${e.poste}`).join(', ')})`)

  // Update : changer le poste de Sophie → barman
  const sophie = ins.find(e => e.prenom === 'Sophie')
  const { error: uErr } = await sb.from('employes').update({ poste: 'barman' }).eq('id', sophie.id)
  if (uErr) throw new Error(uErr.message)
  const { data: read } = await sb.from('employes').select('poste').eq('id', sophie.id).single()
  if (read.poste === 'barman') ok('employe update (poste serveur → barman)')
  else ko('employe update', `attendu barman, reçu ${read.poste}`)

  // Delete : supprimer Pierre
  const pierre = ins.find(e => e.prenom === 'Pierre')
  const { error: dErr } = await sb.from('employes').delete().eq('id', pierre.id)
  if (dErr) throw new Error(dErr.message)
  cleanupEmployeIds.splice(cleanupEmployeIds.indexOf(pierre.id), 1)
  const { data: gone } = await sb.from('employes').select('id').eq('id', pierre.id).maybeSingle()
  if (!gone) ok('employe delete')
  else ko('employe delete', 'existe encore')
})

// ─── Finalisation ────────────────────────────────────────────────────
await step('finaliserSetup', async () => {
  cleanupKeys.push('setup_completed', 'setup_completed_at')
  await setParams({
    setup_completed:    'true',
    setup_completed_at: new Date().toISOString(),
  })
  if (await getParam('setup_completed') === 'true') ok('setup_completed = true')
  else ko('setup_completed', 'mismatch')
  const ts = await getParam('setup_completed_at')
  if (ts && !isNaN(new Date(ts).getTime())) ok(`setup_completed_at = ${ts}`)
  else ko('setup_completed_at', 'invalide')
})

// ─── Cleanup ─────────────────────────────────────────────────────────
console.log('\n→ Nettoyage des données de test…')
if (cleanupKeys.length > 0) {
  const { error } = await sb.from('parametres').delete().in('cle', cleanupKeys)
  if (error) console.log(`  ⚠ cleanup parametres: ${error.message}`)
  else console.log(`  ✓ ${cleanupKeys.length} clés parametres supprimées`)
}
if (cleanupTableIds.length > 0) {
  const { error } = await sb.from('tables_restaurant').delete().in('id', cleanupTableIds)
  if (error) console.log(`  ⚠ cleanup tables: ${error.message}`)
  else console.log(`  ✓ ${cleanupTableIds.length} tables supprimées`)
}
if (cleanupEmployeIds.length > 0) {
  const { error } = await sb.from('employes').delete().in('id', cleanupEmployeIds)
  if (error) console.log(`  ⚠ cleanup employes: ${error.message}`)
  else console.log(`  ✓ ${cleanupEmployeIds.length} employés supprimés`)
}

// ─── Bilan ───────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs détaillés :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Toutes les sections persistent correctement.')
