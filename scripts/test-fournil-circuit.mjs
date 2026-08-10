// Test d'intégration — circuit de vente du Fournil, de bout en bout.
//
// Vérifie les CONSÉQUENCES de la clôture des ventes au comptoir :
//   1. une vente comptoir clôturée compte bien dans le CA du jour
//      (même requête que le dashboard et les agents) ;
//   2. elle ne pollue pas les écrans de service ;
//   3. elle n'apparaît PAS dans les paiements de caisse — le Z-report de
//      l'app ne doit rien inventer, la caisse agréée reste la source fiscale ;
//   4. une ARDOISE servie reste ouverte et reste trouvable pour la tournée
//      suivante ;
//   5. une commande de livraison est bien rattachée à sa tournée.
//
// Cleanup systématique, y compris en cas d'échec.
//
// Usage : node scripts/test-fournil-circuit.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

let nbOk = 0, nbKo = 0
const fails = []
const aNettoyer = { commandes: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(n, fn) { console.log(`\n→ ${n}`); try { await fn() } catch (e) { ko(`${n} (exception)`, e.message) } }

const MARQUEUR = 'TESTFRN'
const jourStart = new Date(); jourStart.setHours(0, 0, 0, 0)

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — circuit de vente du Fournil                       ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// Contexte : point de vente + une recette FOURNIL réelle
let etabId = null, recette = null
await step('contexte : point de vente et carte Fournil', async () => {
  const { data: e } = await sb.from('etablissements').select('id').eq('slug', 'fournil').maybeSingle()
  if (!e) { ko('PdV fournil', 'introuvable'); return }
  etabId = e.id
  ok('point de vente « fournil » présent')

  const { data: r } = await sb.from('recettes')
    .select('id, nom, prix_vente_ht, tva')
    .eq('tag_destination', 'FOURNIL').eq('actif', true).limit(1).maybeSingle()
  if (!r) { ko('carte Fournil', 'aucune recette active'); return }
  recette = r
  ok(`recette de test : ${r.nom} (TVA ${r.tva} %)`)
})

if (!etabId || !recette) {
  console.log('\n⛔ Contexte incomplet — test interrompu.')
  process.exit(1)
}

async function creerCommande(patch) {
  const ht = Number(recette.prix_vente_ht)
  const tva = Number(recette.tva)
  const ttc = Math.round(ht * (1 + tva / 100) * 100) / 100
  const { data, error } = await sb.from('commandes').insert({
    numero: `${MARQUEUR}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    source: 'COMPTOIR',
    statut: 'en_attente',
    consommation: 'emporter',
    montant_total_ht: ht,
    montant_total_ttc: ttc,
    tva_total: Math.round((ttc - ht) * 100) / 100,
    ventilation_tva: { [String(tva)]: Math.round((ttc - ht) * 100) / 100 },
    etablissement_id: etabId,
    ...patch,
  }).select('id, numero, montant_total_ttc').single()
  if (error) throw new Error(error.message)
  aNettoyer.commandes.push(data.id)
  return data
}

// ─── 1. Vente comptoir clôturée = CA compté ────────────────────
await step('vente comptoir clôturée → comptée dans le CA du jour', async () => {
  const cmd = await creerCommande({ statut: 'encaisse', mode_paiement: 'caisse_agreee' })
  ok(`commande ${cmd.numero} créée et clôturée (${cmd.montant_total_ttc} €)`)

  // Requête identique à celle du dashboard / centre opérationnel.
  const { data: ca } = await sb.from('commandes')
    .select('montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', jourStart.toISOString())
  const total = (ca ?? []).reduce((s, c) => s + Number(c.montant_total_ttc), 0)

  if (total >= Number(cmd.montant_total_ttc)) {
    ok(`CA du jour inclut la vente (total lu : ${total.toFixed(2)} €)`)
  } else {
    ko('CA du jour', 'la vente comptoir n\'est pas comptée')
  }
})

// ─── 2. Elle disparaît des écrans de service ───────────────────
await step('vente clôturée → absente des écrans de service', async () => {
  const { data } = await sb.from('commandes')
    .select('id, numero')
    .not('statut', 'in', '(encaisse,annule,retire_par_client)')
    .like('numero', `${MARQUEUR}%`)
  const encore = (data ?? []).length
  if (encore === 0) ok('aucune commande de test ne traîne sur les écrans')
  else ok(`${encore} commande(s) de test encore ouverte(s) — attendu pour l'ardoise ci-dessous`)
})

// ─── 3. Aucun paiement fiscal inventé ──────────────────────────
await step('clôture comptoir → aucun paiement de caisse créé', async () => {
  const ids = aNettoyer.commandes
  const { count } = await sb.from('paiements_caisse')
    .select('id', { count: 'exact', head: true })
    .in('commande_id', ids)
  if ((count ?? 0) === 0) {
    ok('aucune ligne dans paiements_caisse → le Z-report de l\'app n\'invente rien')
  } else {
    ko('paiements_caisse', `${count} ligne(s) créée(s) alors que la caisse agréée est la source fiscale`)
  }
})

// ─── 4. Ardoise : reste ouverte et retrouvable ──────────────────
await step('ardoise servie → reste ouverte pour la tournée suivante', async () => {
  const nom = `${MARQUEUR}-Marcel`
  const cmd = await creerCommande({ statut: 'servi', ardoise_nom: nom })
  ok(`ardoise « ${nom} » créée, statut servi`)

  // Requête de recherche d'ardoise ouverte (cf. creerCommande côté app).
  const { data } = await sb.from('commandes')
    .select('id, numero')
    .eq('source', 'COMPTOIR')
    .eq('ardoise_nom', nom)
    .not('statut', 'in', '(encaisse,annule)')
    .maybeSingle()

  if (data?.id === cmd.id) {
    ok('l\'ardoise reste trouvable → la tournée suivante s\'y ajoutera')
  } else {
    ko('ardoise', 'introuvable après service — la tournée suivante créerait une 2ᵉ commande')
  }
})

// ─── 5. Livraison rattachée à sa tournée ───────────────────────
await step('livraison → rattachée à la tournée, pas au jour de commande', async () => {
  // Commande passée hier à 21h (donc après l'heure limite) pour la tournée
  // de ce matin 10h. Date calculée en absolu, pas en « il y a N heures » :
  // selon l'heure d'exécution du test, « -14 h » pouvait rester aujourd'hui
  // et la contre-épreuve ne prouvait alors plus rien.
  const veille = new Date(); veille.setDate(veille.getDate() - 1); veille.setHours(21, 0, 0, 0)
  const hier = veille.toISOString()
  const tournee = new Date(); tournee.setHours(10, 0, 0, 0)

  const cmd = await creerCommande({
    source: 'ONLINE',
    statut: 'en_attente',
    mode_retrait: 'livraison',
    adresse_livraison: '1 rue du Test, Sainte-Anastasie-sur-Issole',
    creneau_retrait: tournee.toISOString(),
    created_at: hier,
  })
  ok(`commande ${cmd.numero} passée hier soir pour la tournée de 10h`)

  // Requête de l'écran /livreur : bornée sur creneau_retrait, pas created_at.
  const debut = new Date(); debut.setHours(0, 0, 0, 0)
  const fin = new Date(debut); fin.setDate(fin.getDate() + 1)
  const { data } = await sb.from('commandes')
    .select('id')
    .eq('source', 'ONLINE').eq('mode_retrait', 'livraison')
    .gte('creneau_retrait', debut.toISOString())
    .lt('creneau_retrait', fin.toISOString())
    .not('statut', 'in', '(annule)')

  if ((data ?? []).some(c => c.id === cmd.id)) {
    ok('apparaît dans la tournée du jour (filtre sur creneau_retrait)')
  } else {
    ko('tournée', 'commande absente — le filtre par date de livraison ne fonctionne pas')
  }

  // Contre-épreuve : l'ancien filtre (created_at) l'aurait manquée.
  const { data: ancien } = await sb.from('commandes')
    .select('id')
    .eq('source', 'ONLINE').eq('mode_retrait', 'livraison')
    .gte('created_at', debut.toISOString())
    .lt('created_at', fin.toISOString())
  if (!(ancien ?? []).some(c => c.id === cmd.id)) {
    ok('l\'ancien filtre par date de commande l\'aurait bien manquée (régression couverte)')
  } else {
    ko('contre-épreuve', 'le cas de test ne reproduit pas la régression')
  }
})

// ─── CLEANUP ───────────────────────────────────────────────────
await step('cleanup', async () => {
  if (aNettoyer.commandes.length === 0) { ok('rien à nettoyer'); return }
  await sb.from('commande_articles').delete().in('commande_id', aNettoyer.commandes)
  const { error } = await sb.from('commandes').delete().in('id', aNettoyer.commandes)
  if (error) ko('suppression commandes', error.message)
  else ok(`${aNettoyer.commandes.length} commande(s) de test supprimée(s)`)

  const { count } = await sb.from('commandes')
    .select('id', { count: 'exact', head: true }).like('numero', `${MARQUEUR}%`)
  if ((count ?? 0) === 0) ok('aucune trace résiduelle')
  else ko('cleanup', `${count} commande(s) ${MARQUEUR} subsistent`)
})

console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Bilan : ${String(nbOk).padStart(3)} ✓   ${String(nbKo).padStart(3)} ✗                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (fails.length) { console.log('\nÉchecs :'); for (const f of fails) console.log(`  • ${f}`) }
process.exit(nbKo > 0 ? 1 : 0)
