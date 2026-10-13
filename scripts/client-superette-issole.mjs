// Compte client « La Supérette de l'Issole » (13/10/2026).
//
// Un compte client d'ENTREPRISE, pas un particulier : une supérette qui
// s'approvisionne en pain. C'est le premier de la maison, donc il pose le
// patron pour les suivants.
//
// ⚠️⚠️ ZELTY NE SAIT PAS SUPPRIMER UN CLIENT — ni bouton sur la fiche, ni
// `DELETE /customers/{id}` (404). Le seul chemin est une « Suppression
// groupée » par export/réimport Excel. Une fiche créée de travers ne se
// défait donc pas : la charge est RELUE depuis `versZelty()`, déjà éprouvée
// le 24/09/2026, et on n'écrit qu'UNE fois. La preuve de ce danger est dans
// le compte lui-même : cinq fiches « SONDE-A-SUPPRIMER » / « TEST-CLAUDE-A-
// SUPPRIMER » y traînent depuis septembre, impossibles à retirer.
//
// ⚠️ LES DEUX CÔTÉS, LIÉS DÈS LA CRÉATION (0156 — « un seul fichier client,
// deux vues »). Notre uuid part dans leur `remote_id`, leur identifiant
// revient dans notre `caisse_externe_id` : la correspondance est EXACTE, pas
// un rapprochement par le nom. Créée en caisse seulement, la fiche serait
// restée invisible du CRM, de la fidélité et de la facturation.
//
// ⚠️ AUCUN CONSENTEMENT N'EST ENVOYÉ, et `opt_in_marketing` reste à false
// chez nous : personne n'a rien accepté. Zelty pose `accept_marketing: true`
// par défaut sur toute fiche créée par l'API — ce n'est pas un consentement
// recueilli, c'est une valeur par défaut.
//
//   node scripts/client-superette-issole.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const NOM = "La Supérette de l'Issole"
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
               Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation',
               ...(o.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  await new Promise(s => setTimeout(s, 1200))
  const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
    headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
               'Content-Type': 'application/json', ...(o.headers || {}) } })
  return { s: r.status, b: await r.json().catch(() => ({})) }
}

console.log(`\n🏪 « ${NOM} »${ECRIRE ? ' — MODE ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)

// ── existe-t-il déjà, d'un côté ou de l'autre ? ───────────────────────
const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const cible = norm(NOM)
const cat = await z('customers?limit=200')
if (cat.s !== 200) throw new Error(`lecture des clients : ${cat.s}`)
const dejaZ = (cat.b.customers ?? []).find(c =>
  norm(c.name) === cible || norm(c.company) === cible || norm(c.nice_name) === cible)
console.log(`   caisse : ${(cat.b.customers ?? []).length} fiche(s) · « ${NOM} » ${dejaZ ? `EXISTE déjà #${dejaZ.id}` : 'absent'}`)

const nous = await sb(`clients?select=id,nom,caisse_externe_id&nom=eq.${encodeURIComponent(NOM)}`)
console.log(`   outil  : « ${NOM} » ${nous.length ? `EXISTE déjà ${nous[0].id}` : 'absent'}`)
if (dejaZ && nous.length) { console.log('\n   = déjà des deux côtés. Rien à faire.\n'); process.exit(0) }

// ⚠️ Pas de contact : la fiche ne portera ni email ni téléphone. C'est DIT,
// pas contourné — sans l'un des deux, aucune relance, aucune facture
// envoyable, et le pont client ne saurait la rapprocher s'il la relisait.
console.log(`\n   ⚠ aucun email ni téléphone fourni : la fiche sera MUETTE côté contact`)
console.log(`   → caisse : name="${NOM}" · company="${NOM}" · remote_id=<notre uuid>`)
console.log(`   → outil  : clients.nom="${NOM}" · opt_in_marketing=false · lien caisse`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. chez nous d'abord : il nous faut l'uuid pour leur `remote_id` ──
let id = nous[0]?.id
if (!id) {
  const [c] = await sb('clients', { method: 'POST', body: JSON.stringify([{
    nom: NOM,
    prenom: null, email: null, telephone: null,
    opt_in_marketing: false,          // personne n'a rien accepté
    notes_internes: "Compte PROFESSIONNEL (supérette). Créé le 13/10/2026 à la demande du gérant.\nÀ compléter : téléphone, email, adresse de facturation, SIRET.",
  }]) })
  id = c.id
  console.log(`   ✓ outil : créé ${id}`)
} else console.log(`   = outil : déjà là ${id}`)

// ── 2. puis la caisse, avec NOTRE identifiant dans leur remote_id ─────
let zid = dejaZ?.id
if (!zid) {
  // Charge RELUE depuis versZelty() : name + remote_id, plus `company` —
  // présent sur GET et dans notre schéma, c'est lui qui marque l'entreprise.
  const r = await z('customers', { method: 'POST',
    body: JSON.stringify({ name: NOM, company: NOM, remote_id: id }) })
  if (r.s !== 200) throw new Error(`POST /customers → ${r.s} ${JSON.stringify(r.b).slice(0, 300)}`)
  // On RELIT : on ne croit pas un code de retour sur une écriture qu'on ne
  // peut pas défaire.
  const ap = await z('customers?limit=200')
  const cree = (ap.b.customers ?? []).find(c => String(c.remote_id) === String(id))
  if (!cree) throw new Error('la caisse n\'a rendu aucune fiche portant notre remote_id')
  zid = cree.id
  console.log(`   ✓ caisse : créée #${zid} · name="${cree.name}" company="${cree.company ?? '—'}" nice="${cree.nice_name}"`)
} else console.log(`   = caisse : déjà là #${zid}`)

// ── 3. le lien retour ─────────────────────────────────────────────────
await sb(`clients?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({
  caisse_externe_systeme: 'zelty', caisse_externe_id: String(zid),
  caisse_externe_at: new Date().toISOString() }) })
console.log(`   ✓ lien : outil ${id} ↔ caisse #${zid}`)
console.log('\n✅ Compte client créé des deux côtés, liés exactement.\n')
