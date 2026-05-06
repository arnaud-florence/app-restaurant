// Test d'intégration Module 9B — Tickets imprimables.
//
// Vérifie que les routes /print/bons/[id] et /print/ticket/[id]
// disposent des données attendues, puis fetch les pages HTTP
// si un dev server est joignable sur PORT (3000 par défaut).
//
//   node scripts/test-tickets.mjs              (data-only)
//   PORT=3000 node scripts/test-tickets.mjs    (data + HTTP fetch)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('❌ env manquant'); process.exit(1) }
const sb = createClient(url, key)

const PORT = process.env.PORT || '3000'
const BASE = `http://localhost:${PORT}`

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { commandeIds: [], articleIds: [], paiementIds: [], mouvementIds: [] }
const restoreStocks = []

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 9B — tickets imprimables                    ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Setup : commande test multi-destinations ────────────────────
let cmdId
const articlesByDest = {}  // { CUISINE: [recetteId], PIZZA: [recetteId], BAR: [recetteId] }

await step('setup : commande test avec 1 article par destination', async () => {
  const { data: recettes } = await sb
    .from('recettes')
    .select('id, nom, tag_destination, prix_vente_ht')
    .eq('actif', true)
  if (!recettes || recettes.length === 0) throw new Error('aucune recette active')

  // Une recette par destination si possible
  for (const dest of ['CUISINE', 'PIZZA', 'BAR']) {
    const r = recettes.find(x => x.tag_destination === dest)
    if (r) articlesByDest[dest] = r
  }
  const dests = Object.keys(articlesByDest)
  if (dests.length === 0) throw new Error('aucune recette avec tag_destination connu')
  ok(`${dests.length} destinations couvertes : ${dests.join(', ')}`)

  // Calcule total HT
  const totalHT = Object.values(articlesByDest).reduce((s, r) => s + Number(r.prix_vente_ht ?? 0), 0)
  const totalTTC = Math.round(totalHT * 1.10 * 100) / 100

  const { data: cmd, error } = await sb.from('commandes').insert({
    numero: 'TKT9B-' + Date.now(),
    source: 'TABLE',
    numero_table: 'T9B',
    statut: 'en_attente',
    montant_total_ht: totalHT,
    montant_total_ttc: totalTTC,
    notes: 'Commande test Module 9B',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cmdId = cmd.id
  cleanup.commandeIds.push(cmdId)
  ok(`commande créée id=${cmdId.slice(0, 8)}… total=${totalTTC.toFixed(2)}€ TTC`)

  // Insère 1 article par destination (qte=2 pour tester l'affichage)
  for (const dest of Object.keys(articlesByDest)) {
    const r = articlesByDest[dest]
    const { data: art, error: aErr } = await sb.from('commande_articles').insert({
      commande_id: cmdId,
      recette_id: r.id,
      quantite: 2,
      prix_unitaire_ht: r.prix_vente_ht,
      tag_destination: dest,
      commentaire: dest === 'CUISINE' ? 'sans oignon' : null,
      statut: 'en_attente',
    }).select('id').single()
    if (aErr) throw new Error(`article ${dest} : ${aErr.message}`)
    cleanup.articleIds.push(art.id)
  }
  ok(`${Object.keys(articlesByDest).length} articles créés`)
})

// ─── 2. Données pour /print/bons/[id] (toutes destinations) ─────────
await step('données /print/bons/[id] : commande + articles regroupés', async () => {
  if (!cmdId) { ko('précondition', 'pas de commande'); return }

  const { data: cmd } = await sb
    .from('commandes')
    .select(`
      id, numero, source, numero_table, notes, created_at,
      serveur:employes!serveur_id(prenom, nom),
      commande_articles(id, quantite, tag_destination, commentaire, recette:recettes(nom))
    `)
    .eq('id', cmdId)
    .maybeSingle()
  if (!cmd) throw new Error('commande introuvable')
  ok('commande lue avec serveur joint')

  const arts = cmd.commande_articles ?? []
  if (arts.length !== Object.keys(articlesByDest).length) {
    ko('articles', `attendu ${Object.keys(articlesByDest).length}, obtenu ${arts.length}`)
  } else {
    ok(`${arts.length} articles avec recette jointe`)
  }

  // Vérifie que chaque dest est présente avec son commentaire si applicable
  for (const dest of Object.keys(articlesByDest)) {
    const a = arts.find(x => x.tag_destination === dest)
    if (!a) ko(`destination ${dest}`, 'absente')
    else if (!a.recette?.nom) ko(`recette.nom pour ${dest}`, 'manquant')
    else ok(`${dest} : ${a.recette.nom} ×${a.quantite}${a.commentaire ? ` (« ${a.commentaire} »)` : ''}`)
  }
})

// ─── 3. Données filtrage par destination (?dest=CUISINE) ────────────
await step('filtrage ?dest=CUISINE : 1 article isolé', async () => {
  if (!articlesByDest.CUISINE) { ok('cuisine non testée (recette manquante)'); return }
  const { data: arts } = await sb
    .from('commande_articles')
    .select('id, tag_destination, recette:recettes(nom)')
    .eq('commande_id', cmdId)
    .eq('tag_destination', 'CUISINE')
  if (!arts || arts.length !== 1) {
    ko('filtre cuisine', `attendu 1, obtenu ${arts?.length ?? 0}`)
  } else {
    ok(`filtre cuisine OK : ${arts[0].recette?.nom}`)
  }
})

// ─── 4. Encaissement (insertion paiements) ──────────────────────────
await step('encaissement : 2 paiements (espèces + carte avec tip)', async () => {
  if (!cmdId) { ko('précondition', 'pas de commande'); return }

  const { data: session } = await sb
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', new Date().toISOString().slice(0, 10))
    .maybeSingle()

  const { data: cmdData } = await sb.from('commandes').select('montant_total_ttc').eq('id', cmdId).single()
  const total = Number(cmdData.montant_total_ttc)
  const partEspeces = Math.min(5, Math.round(total / 2 * 100) / 100)
  const partCarte = Math.round((total - partEspeces) * 100) / 100

  const { data: pais, error } = await sb.from('paiements_caisse').insert([
    { commande_id: cmdId, session_caisse_id: session?.id ?? null, methode: 'especes', montant: partEspeces, pourboire: 0 },
    { commande_id: cmdId, session_caisse_id: session?.id ?? null, methode: 'carte',   montant: partCarte,  pourboire: 1.50, reference: 'TPE-TEST' },
  ]).select('id')
  if (error) throw new Error(error.message)
  cleanup.paiementIds = pais.map(p => p.id)
  ok(`2 paiements insérés (${partEspeces}€ esp. + ${partCarte}€ CB + 1.50€ tip)`)

  await sb.from('commandes').update({
    statut: 'encaisse',
    mode_paiement: 'especes+carte',
    pourboire_total: 1.50,
  }).eq('id', cmdId)
  ok('commande passée à encaisse')
})

// ─── 5. Données pour /print/ticket/[id] : commande + articles + paiements + parametres ───
await step('données /print/ticket/[id] : tout disponible', async () => {
  if (!cmdId) { ko('précondition', 'pas de commande'); return }

  const [cmdRes, paiRes, paramRes] = await Promise.all([
    sb.from('commandes')
      .select(`
        id, numero, source, numero_table, statut, notes, created_at,
        montant_total_ht, montant_total_ttc, pourboire_total,
        serveur:employes!serveur_id(prenom, nom),
        commande_articles(id, quantite, prix_unitaire_ht, recette:recettes(nom))
      `)
      .eq('id', cmdId)
      .maybeSingle(),
    sb.from('paiements_caisse')
      .select('id, methode, montant, pourboire, reference, encaisse_at')
      .eq('commande_id', cmdId)
      .order('encaisse_at'),
    sb.from('parametres')
      .select('cle, valeur')
      .in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_telephone', 'etablissement_siret', 'etablissement_tva_intra']),
  ])

  const cmd = cmdRes.data
  if (!cmd) { ko('commande', 'introuvable'); return }
  ok(`commande lue (statut=${cmd.statut}, ttc=${cmd.montant_total_ttc}€)`)
  if (cmd.commande_articles?.length === Object.keys(articlesByDest).length) ok(`${cmd.commande_articles.length} articles présents`)
  else ko('articles', `attendu ${Object.keys(articlesByDest).length}, obtenu ${cmd.commande_articles?.length ?? 0}`)

  const pais = paiRes.data ?? []
  if (pais.length === 2) ok(`${pais.length} paiements lus`)
  else ko('paiements', `attendu 2, obtenu ${pais.length}`)

  const totalPaye = pais.reduce((s, p) => s + Number(p.montant), 0)
  const ttc = Number(cmd.montant_total_ttc)
  if (Math.abs(totalPaye - ttc) < 0.05) ok(`total paiements = total commande (${totalPaye.toFixed(2)}€)`)
  else ko('totaux', `paiements ${totalPaye.toFixed(2)} vs ttc ${ttc.toFixed(2)}`)

  const totalTip = pais.reduce((s, p) => s + Number(p.pourboire), 0)
  if (Math.abs(totalTip - 1.50) < 0.01) ok(`pourboire total = 1.50€`)
  else ko('tip', `attendu 1.50, obtenu ${totalTip}`)

  // Vérifie présence param établissement (au moins le nom)
  const params = Object.fromEntries((paramRes.data ?? []).map(p => [p.cle, p.valeur]))
  if (params.etablissement_nom) ok(`paramètre etablissement_nom présent : "${params.etablissement_nom}"`)
  else console.log('  ⚠ etablissement_nom non défini en base — fallback "Établissement" sera affiché')
})

// ─── 6. Fetch HTTP si dev server joignable ──────────────────────────
await step(`HTTP : tentative fetch sur ${BASE} (skip si serveur off)`, async () => {
  let serverUp = false
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    serverUp = r.ok || r.status < 500
  } catch {
    console.log(`  ⚠ pas de dev server sur ${BASE} — on skip les fetch HTTP`)
    return
  }
  if (!serverUp) { console.log('  ⚠ serveur injoignable, skip'); return }
  ok(`dev server joignable sur ${BASE}`)

  // /print/bons/[id]
  const r1 = await fetch(`${BASE}/print/bons/${cmdId}`)
  if (r1.status !== 200) { ko('GET /print/bons/[id]', `HTTP ${r1.status}`); return }
  const html1 = await r1.text()
  ok(`GET /print/bons/[id] → 200 (${html1.length} bytes)`)
  // Vérifie que le HTML contient au moins une destination connue
  const dests = Object.keys(articlesByDest)
  const found = dests.filter(d => html1.includes(d))
  if (found.length === dests.length) ok(`HTML contient toutes destinations : ${found.join(', ')}`)
  else ko('contenu /bons', `manque destinations (trouvé: ${found.join(',') || 'aucune'})`)
  if (html1.includes('T9B')) ok('numéro de table T9B présent dans le bon')
  else ko('contenu /bons', 'numéro de table T9B absent')

  // /print/bons/[id]?dest=CUISINE
  if (articlesByDest.CUISINE) {
    const r2 = await fetch(`${BASE}/print/bons/${cmdId}?dest=CUISINE`)
    if (r2.status === 200) ok('GET /print/bons/[id]?dest=CUISINE → 200')
    else ko('filtre dest', `HTTP ${r2.status}`)
  }

  // /print/ticket/[id]
  const r3 = await fetch(`${BASE}/print/ticket/${cmdId}`)
  if (r3.status !== 200) { ko('GET /print/ticket/[id]', `HTTP ${r3.status}`); return }
  const html3 = await r3.text()
  ok(`GET /print/ticket/[id] → 200 (${html3.length} bytes)`)
  if (html3.includes('TOTAL TTC')) ok('ticket contient "TOTAL TTC"')
  else ko('contenu /ticket', '"TOTAL TTC" manquant')
  if (html3.toUpperCase().includes('ESPÈCES') || html3.toUpperCase().includes('ESP&#XC8;CES') || html3.includes('ESP')) ok('ticket contient mention paiement')
  else ko('contenu /ticket', 'aucun paiement listé')
})

// ─── Cleanup ─────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.paiementIds?.length > 0) {
  await sb.from('paiements_caisse').delete().in('id', cleanup.paiementIds)
  console.log(`  ✓ ${cleanup.paiementIds.length} paiements supprimés`)
}
if (cleanup.articleIds.length > 0) {
  await sb.from('commande_articles').delete().in('id', cleanup.articleIds)
  console.log(`  ✓ ${cleanup.articleIds.length} articles supprimés`)
}
if (cleanup.commandeIds.length > 0) {
  await sb.from('commandes').delete().in('id', cleanup.commandeIds)
  console.log(`  ✓ ${cleanup.commandeIds.length} commande(s) supprimée(s)`)
}

// ─── Bilan ──────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 9B — tickets imprimables OK.')
