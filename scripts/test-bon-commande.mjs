// Le bon de commande qui part vraiment.
//
//   PORT=3000 node scripts/test-bon-commande.mjs
//
// ⚠️ Il RECOPIE les règles de `src/lib/bon-commande.ts` (la source est en
// TS) : modifier les deux ensemble. L'essentiel porte sur ce que l'envoi
// REFUSE — un bon de commande engage de l'argent, et les quatre refus
// correspondent chacun à une façon de payer deux fois.
//
// ⛔ Il n'ENVOIE aucun e-mail : la règle testée est pure, et un vrai envoi
// écrirait à un vrai fournisseur.

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
let ok = 0, ko = 0
const t = (nom, cond) => { if (cond) { ok++; console.log(`  ✓ ${nom}`) } else { ko++; console.log(`  ✗ ${nom}`) } }
const titre = s => console.log(`\n── ${s} ──`)

// ─── Règles recopiées ─────────────────────────────────────────────
function verifierEnvoi({ lignes, email, dejaEnvoyeLe, forcer }) {
  if (!lignes.length) return { ok: false, raison: 'sans_ligne' }
  if (lignes.some(l => !(l.quantite > 0))) return { ok: false, raison: 'quantite_invalide' }
  if (!email) return { ok: false, raison: 'sans_destinataire' }
  if (dejaEnvoyeLe && !forcer) return { ok: false, raison: 'deja_envoye' }
  return { ok: true }
}
function totaux(lignes) {
  let ht = 0, sansPrix = 0
  for (const l of lignes) {
    if (l.prix_unitaire_ht == null) sansPrix++
    else ht += l.prix_unitaire_ht * l.quantite
  }
  return { ht: Number(ht.toFixed(2)), sansPrix }
}

const L = (q = 2, p = 10) => [{ libelle: 'Croissant', quantite: q, unite: 'colis', prix_unitaire_ht: p, reference: 'X' }]

titre('Ce que l’envoi REFUSE')
t('un bon sans ligne',            verifierEnvoi({ lignes: [], email: 'a@b.c', dejaEnvoyeLe: null }).raison === 'sans_ligne')
t('une quantité nulle',           verifierEnvoi({ lignes: L(0), email: 'a@b.c', dejaEnvoyeLe: null }).raison === 'quantite_invalide')
t('une quantité négative',        verifierEnvoi({ lignes: L(-3), email: 'a@b.c', dejaEnvoyeLe: null }).raison === 'quantite_invalide')
t('un fournisseur sans adresse',  verifierEnvoi({ lignes: L(), email: null, dejaEnvoyeLe: null }).raison === 'sans_destinataire')
t('⚠️ un bon DÉJÀ envoyé (2ᵉ livraison)', verifierEnvoi({ lignes: L(), email: 'a@b.c', dejaEnvoyeLe: '2026-09-20T08:00:00Z' }).raison === 'deja_envoye')
t('…sauf renvoi assumé',          verifierEnvoi({ lignes: L(), email: 'a@b.c', dejaEnvoyeLe: '2026-09-20T08:00:00Z', forcer: true }).ok === true)
t('un bon complet passe',         verifierEnvoi({ lignes: L(), email: 'a@b.c', dejaEnvoyeLe: null }).ok === true)

titre('Le total annoncé')
t('somme des lignes chiffrées', totaux(L(3, 10)).ht === 30)
t('⚠️ un prix inconnu n’est pas 0 : il est COMPTÉ À PART',
  (() => { const r = totaux([...L(3, 10), { libelle: 'X', quantite: 5, unite: null, prix_unitaire_ht: null, reference: null }])
    return r.ht === 30 && r.sansPrix === 1 })())

titre('Le schéma sait porter un PRODUIT VENDU')
const cols = await sb("rpc/exec_sql", { method: 'POST', body: JSON.stringify({ query:
  "select 1 from information_schema.columns where table_name='bon_commande_lignes' and column_name in ('recette_id','libelle','unite')" }) })
t('bon_commande_lignes porte recette_id, libelle et unite', cols?.rows_affected === 3)
const env2 = await sb("rpc/exec_sql", { method: 'POST', body: JSON.stringify({ query:
  "select 1 from information_schema.columns where table_name='bons_commande' and column_name in ('envoye_le','envoye_a','reference')" }) })
t('bons_commande porte envoye_le, envoye_a et reference', env2?.rows_affected === 3)

titre('Une ligne doit être identifiée')
const c = await sb("rpc/exec_sql", { method: 'POST', body: JSON.stringify({ query:
  "select 1 from pg_constraint where conname='bon_commande_lignes_identifiee'" }) })
t('⚠️ une ligne sans ingrédient, sans produit ET sans libellé est refusée', c?.rows_affected === 1)

titre('Rien n’est marqué « envoyé » sans être parti')
const bons = await sb('bons_commande?select=statut,envoye_le,envoye_a')
t('aucun bon « envoyé » sans horodatage d’envoi',
  bons.every(b => b.statut !== 'envoye' || b.envoye_le))
t('aucun horodatage d’envoi sans destinataire',
  bons.every(b => !b.envoye_le || b.envoye_a))

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
