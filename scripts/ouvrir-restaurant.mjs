#!/usr/bin/env node
/**
 * Ouvre le restaurant — brasserie, bar, pizzeria.
 *
 * ⚠️⚠️ N'UTILISE PAS LA BASCULE GROUPÉE. `basculerActivite({activite:
 * 'restaurant'})` fait un `.eq('activite','restaurant')`, donc il allume les
 * SEPT modules du groupe — dont trois qui ne doivent pas l'être :
 *
 *   snack_emporter  éteint SCIEMMENT le 25/09/2026 (« pas encore de vrai
 *                   snacking dans notre concept »), et son tag SNACKING n'a
 *                   aucun produit : le site annoncerait un service inexistant ;
 *   chambres        le site ouvrirait l'onglet « Une chambre » de /reserver sur
 *                   un calendrier VIDE — on ferait réserver ce qui n'existe pas ;
 *   evenementiel    teasé au 12/10 mais hors de la demande : à trancher à part.
 *
 * ⚠️ LES POINTS DE VENTE SUIVENT, et c'est VITAL : /api/public/menu filtre sur
 * `etablissements.actif`. Allumer les modules sans eux servirait une carte VIDE
 * le jour de l'ouverture — le défaut corrigé le 22/09/2026 dans PDV_PAR_MODULE.
 * La brasserie ET la pizzeria partagent « le-relais-des-saveurs ».
 *
 * ⚠️ Le `teaser` n'est PAS touché : le site l'ignore dès que `actif = true`
 * (voir ModuleActivation dans activation/config.ts). Reproduire le geste de
 * l'application à la lettre vaut mieux qu'inventer un comportement de plus.
 *
 *   node scripts/ouvrir-restaurant.mjs            # essai à blanc
 *   node scripts/ouvrir-restaurant.mjs --ecrire
 */
import { readFileSync } from 'fs'

const ECRIRE = process.argv.includes('--ecrire')
const MODULES = ['restaurant_salle', 'bar', 'pizzeria']
const PDV = ['le-relais-des-saveurs', 'bar']   // PDV_PAR_MODULE, dédoublonné

const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!U?.startsWith('https://') || !K) { console.error('✗ .env.local illisible'); process.exit(1) }
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H, ...init })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t}`)   // un 4xx ne se réessaie pas
  return t ? JSON.parse(t) : []
}

// ⚠️ CONTRÔLE D'ABORD : la table doit compter 14 lignes. En dessous, l'appli
// tourne sur REPLI_FOURNIL_SEUL — et la bascule mettrait à jour zéro ligne en
// renvoyant un succès (matinée perdue le 28/08/2026).
const tous = await sb('activites_modules?select=cle,actif,activite')
if (tous.length !== 14) { console.error(`✗ ${tous.length} modules au lieu de 14 — configuration incomplète, on n'ouvre pas`); process.exit(1) }

const avant = tous.filter(m => MODULES.includes(m.cle))
if (avant.length !== MODULES.length) { console.error('✗ un module visé est absent de la base'); process.exit(1) }
const pdvAvant = await sb(`etablissements?select=slug,actif&slug=in.(${PDV.join(',')})`)

console.log('— avant —')
for (const m of avant) console.log(`   ${m.cle.padEnd(18)} actif=${m.actif}`)
for (const e of pdvAvant) console.log(`   PdV ${e.slug.padEnd(22)} actif=${e.actif}`)
console.log('\n— intacts, délibérément —')
console.log('   snack_emporter  abandonné le 25/09, aucun produit sous le tag')
console.log('   chambres        aucune disponibilité à proposer')
console.log('   evenementiel    hors demande, à trancher à part')

if (!ECRIRE) { console.log('\nRelancer avec --ecrire'); process.exit(0) }

await sb(`activites_modules?cle=in.(${MODULES.join(',')})`, {
  method: 'PATCH',
  body: JSON.stringify({ actif: true, updated_at: new Date().toISOString() }),
})
await sb(`etablissements?slug=in.(${PDV.join(',')})`, { method: 'PATCH', body: JSON.stringify({ actif: true }) })

// ⚠️ relecture : un PATCH qui répond 200 n'a pas prouvé son effet.
const apres = (await sb('activites_modules?select=cle,actif')).filter(m => MODULES.includes(m.cle))
const pdvApres = await sb(`etablissements?select=slug,actif&slug=in.(${PDV.join(',')})`)
const intacts = (await sb('activites_modules?select=cle,actif')).filter(m => ['snack_emporter', 'chambres', 'evenementiel'].includes(m.cle))

console.log('\n— après —')
for (const m of apres) console.log(`   ${m.cle.padEnd(18)} actif=${m.actif}`)
for (const e of pdvApres) console.log(`   PdV ${e.slug.padEnd(22)} actif=${e.actif}`)
console.log('— contrôle : rien d\'autre n\'a bougé —')
for (const m of intacts) console.log(`   ${m.cle.padEnd(18)} actif=${m.actif}  ${m.actif ? '✗ NE DEVRAIT PAS ÊTRE ALLUMÉ' : '✓'}`)

const ok = apres.every(m => m.actif) && pdvApres.every(e => e.actif) && intacts.every(m => !m.actif)
console.log(ok ? '\n✓ restaurant ouvert' : '\n✗ état inattendu')
process.exit(ok ? 0 : 1)
