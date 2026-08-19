// Test d'intégration — circuit de la commande en ligne du Fournil.
//
// Vérifie ce que vit vraiment une commande passée depuis casatasia.fr :
//   1. un produit commandable part et revient au PRIX DE L'AFFICHE ;
//   2. un produit non commandable (café) est REFUSÉ ;
//   3. la commande apparaît dans la liste que lit l'écran du comptoir ;
//   4. TOUS les employés actifs sont notifiés, vers le BON écran.
//
// Nécessite le serveur de dev sur PORT (défaut 3000).
// Usage : node scripts/test-commande-en-ligne.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const BASE = `http://localhost:${process.env.PORT || 3000}`
const KEY = process.env.PUBLIC_API_KEY

let ok = 0, ko = 0
const fails = []
const O = m => { console.log(`  ✓ ${m}`); ok++ }
const K = (m, e) => { console.log(`  ✗ ${m} — ${e}`); ko++; fails.push(m) }
const step = async (n, fn) => { console.log(`\n→ ${n}`); try { await fn() } catch (e) { K(`${n} (exception)`, e.message) } }

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — commande en ligne du Fournil                      ║')
console.log('╚══════════════════════════════════════════════════════════╝')

let baguette = null, cafe = null, commandeId = null

await step('contexte : produits de la carte', async () => {
  const { data: b } = await sb.from('recettes')
    .select('id,nom,prix_vente_ht,tva,vendable_online')
    .eq('nom', 'Baguette classique').eq('tag_destination', 'FOURNIL').maybeSingle()
  const { data: c } = await sb.from('recettes')
    .select('id,nom,vendable_online')
    .eq('nom', 'Café expresso').eq('tag_destination', 'FOURNIL').maybeSingle()
  if (!b || !c) return K('produits de test', 'introuvables')
  baguette = b; cafe = c
  b.vendable_online ? O('« Baguette classique » est commandable en ligne')
                    : K('baguette commandable', 'vendable_online = false')
  !c.vendable_online ? O('« Café expresso » est bien retiré de la vente en ligne')
                     : K('café retiré', 'encore vendable_online = true')
})

const creneau = (() => { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); return d.toISOString() })()

await step('le café est refusé', async () => {
  const r = await fetch(`${BASE}/api/public/commande`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ client_nom: 'TEST-EN-LIGNE', creneau_retrait: creneau, articles: [{ recette_id: cafe.id, quantite: 1 }] }),
  })
  const j = await r.json().catch(() => ({}))
  r.status === 400 ? O(`refusé (400) : ${j.error}`) : K('refus du café', `statut ${r.status} au lieu de 400`)
})

await step('la baguette passe, au prix de l’affiche', async () => {
  const r = await fetch(`${BASE}/api/public/commande`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ client_nom: 'TEST-EN-LIGNE', creneau_retrait: creneau, articles: [{ recette_id: baguette.id, quantite: 2 }] }),
  })
  const j = await r.json().catch(() => ({}))
  if (r.status !== 200) return K('commande acceptée', `statut ${r.status} — ${JSON.stringify(j).slice(0,200)}`)
  commandeId = j.id
  O(`commande ${j.numero} créée`)
  const attendu = 2 * 1.20
  Math.abs(Number(j.total_ttc) - attendu) < 0.005
    ? O(`total ${Number(j.total_ttc).toFixed(2)} € = 2 × 1,20 € de l’affiche`)
    : K('total TTC', `${j.total_ttc} € au lieu de ${attendu.toFixed(2)} €`)
})

await step('la commande arrive sur l’écran du comptoir', async () => {
  if (!commandeId) return K('écran comptoir', 'pas de commande')
  const { data } = await sb.from('commandes')
    .select('id,numero,source,statut,montant_total_ttc,commande_articles(tag_destination,tva_taux,prix_unitaire_ttc)')
    .eq('id', commandeId).maybeSingle()
  if (!data) return K('commande en base', 'introuvable')
  data.source === 'ONLINE' ? O('source = ONLINE') : K('source', data.source)
  !['encaisse','annule','retire_par_client'].includes(data.statut)
    ? O(`statut « ${data.statut} » → visible dans listCommandesActives()`)
    : K('visibilité', `statut ${data.statut} exclu de la liste`)
  const a = data.commande_articles?.[0]
  a?.tag_destination === 'FOURNIL' ? O('routée vers le poste FOURNIL') : K('tag', a?.tag_destination)
  Number(a?.tva_taux) === 5.5 ? O('TVA 5,5 % appliquée (pain)') : K('TVA', `${a?.tva_taux} %`)
})

await step('l’équipe est prévenue, vers le bon écran', async () => {
  if (!commandeId) return K('notifications', 'pas de commande')
  const { data: emps } = await sb.from('employes').select('id').eq('actif', true)
  const { data: notifs } = await sb.from('notifications')
    .select('destinataire_employe_id,titre,message,url_action')
    .eq('type', 'commande_online_recue')
    .order('created_at', { ascending: false }).limit(20)
  const recentes = (notifs ?? []).filter(n => n.message?.includes('Baguette'))
  recentes.length >= (emps?.length ?? 0) && recentes.length > 0
    ? O(`${recentes.length} notification(s) pour ${emps.length} employé(s) actif(s)`)
    : K('destinataires', `${recentes.length} notif(s) pour ${emps?.length} employé(s)`)
  const n = recentes[0]
  n?.url_action === '/comptoir/fournil'
    ? O('lien → /comptoir/fournil (écran réellement ouvert)')
    : K('url_action', `${n?.url_action} — mène à un écran en veille`)
  n?.message?.includes('2× Baguette classique')
    ? O(`contenu lisible sans ouvrir l’écran : « ${n.message} »`)
    : K('message', n?.message)
})

await step('nettoyage', async () => {
  if (commandeId) {
    await sb.from('commande_articles').delete().eq('commande_id', commandeId)
    await sb.from('commandes').delete().eq('id', commandeId)
  }
  await sb.from('notifications').delete().eq('type', 'commande_online_recue').like('message', '%Baguette classique%')
  O('commande et notifications de test supprimées')
})

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
if (ko) console.log('  ' + fails.join('\n  '))
console.log('══════════════════════════════════════════════════════════')
process.exit(ko ? 1 : 0)
