// Miroir du catalogue Zelty → outil.
//
// Joué sur des plats FICTIFS, conformes au schéma `Dish` de docs.zelty.fr,
// à travers le banc d'essai /api/integrations/zelty/verifier : aucun compte,
// aucune clé, aucun réseau vers Zelty. C'est le vrai code qui est éprouvé.
//
// Ce qu'on protège :
//   · la TVA arrive en MILLIÈMES (1000 = 10 %) — la prendre pour un
//     pourcentage facturerait une TVA à 1000 % ;
//   · les prix arrivent en centimes ;
//   · un plat « caisse seulement » ne doit JAMAIS être publié sur le site ;
//   · le rapprochement va du plus sûr au plus faible, et un plat inconnu est
//     REMONTÉ, jamais inventé — créer à l'aveugle doublonnerait nos fiches.
//
//   PORT=3000 node scripts/test-zelty-catalogue.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const verifier = async (plats, locaux = [], correspondances = {}) => {
  const r = await fetch(`${BASE}/api/integrations/zelty/verifier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plats, locaux, correspondances }),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('\n── Miroir du catalogue Zelty ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent'); process.exit(1) }

// ── 1. Un croissant : centimes et millièmes ─────────────────────────
const croissant = {
  id: 1974, remote_id: null, name: 'Croissant',
  description: 'Pur beurre',
  price: 130, price_togo: 120,          // centimes
  tax: 1000, tax_takeaway: 550,          // millièmes : 10 % et 5,5 %
  disable: false, zc_only: false, fab_name: 'Fournil',
}
let r = await verifier([croissant])
t('la route répond', r.status === 200, `HTTP ${r.status}`)
let p = r.body.apercu?.[0] ?? {}
t('le prix à emporter est retenu, en euros', p.prixTtc === 1.20, `${p.prixTtc}`)
t('le prix sur place est conservé à part', p.prixSurPlaceTtc === 1.30, `${p.prixSurPlaceTtc}`)
t('la TVA en millièmes devient un pourcentage', p.tva === 5.5, `${p.tva}`)
t('le poste de production est repris', p.posteProduction === 'Fournil', p.posteProduction)
t('le plat est vendable en ligne', p.vendableEnLigne === true)

// ── 1 bis. Les champs NULS de Zelty ─────────────────────────────────
// Zelty renvoie `null` — et non l'absence — pour tout prix ou taxe non
// renseigné. `.optional()` accepte `undefined` mais rejette `null` : le
// 28/08/2026, 84 plats réels ont été reçus et 84 rejetés en « illisible »,
// et le miroir se croyait vide sans qu'aucune erreur ne remonte.
r = await verifier([{
  ...croissant, id: 1975,
  price_delivery: null, cost_price: null, tax_delivery: null,
  sku: null, description: null, fab_name: null, image: null,
  id_fabrication_place: null,
}])
const illisibles = Array.isArray(r.body.illisibles) ? r.body.illisibles.length : (r.body.illisibles ?? 0)
t('un plat aux champs nuls reste lisible', illisibles === 0,
  `illisibles=${JSON.stringify(r.body.illisibles)}`)
t('et il est bien normalisé', (r.body.apercu?.[0] ?? {}).prixTtc === 1.20,
  `${(r.body.apercu?.[0] ?? {}).prixTtc}`)

// ── 2. « Caisse seulement » ne va JAMAIS sur le site ─────────────────
r = await verifier([{ ...croissant, id: 2000, name: 'Café offert', zc_only: true }])
t('un plat « caisse seulement » reste actif', r.body.apercu?.[0]?.actif === true)
t("mais n'est PAS publiable en ligne", r.body.apercu?.[0]?.vendableEnLigne === false)

// ── 3. Emporter désactivé ───────────────────────────────────────────
r = await verifier([{ ...croissant, id: 2001, disable_takeaway: true }])
t("l'emporter coupé retire le plat du site",
  r.body.apercu?.[0]?.vendableEnLigne === false)

// ── 4. Plat désactivé ───────────────────────────────────────────────
r = await verifier([{ ...croissant, id: 2002, disable: true }])
t('un plat désactivé est inactif', r.body.apercu?.[0]?.actif === false)

// ── 5. Rapprochement : du plus sûr au plus faible ───────────────────
const locaux = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', nom: 'Croissant', nom_caisse: null },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', nom: 'Panuozzi', nom_caisse: 'PANUOZZI' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', nom: 'Pain de campagne', nom_caisse: null },
]

r = await verifier(
  [{ ...croissant, remote_id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Croissant renommé' }],
  locaux,
)
t('remote_id gagne, même si le nom a changé',
  r.body.apparies?.[0]?.par === 'remote_id' &&
  r.body.apparies?.[0]?.recetteId === 'aaaaaaaa-0000-0000-0000-000000000001',
  JSON.stringify(r.body.apparies))

r = await verifier([{ ...croissant, id: 5555, name: 'Autre nom' }], locaux,
  { '5555': 'aaaaaaaa-0000-0000-0000-000000000003' })
t('une correspondance déjà enregistrée est respectée',
  r.body.apparies?.[0]?.par === 'correspondance', JSON.stringify(r.body.apparies))

r = await verifier([{ ...croissant, id: 6666, name: 'panuozzi' }], locaux)
t('le nom rapproche en dernier recours, insensible à la casse',
  r.body.apparies?.[0]?.par === 'nom' &&
  r.body.apparies?.[0]?.recetteId === 'aaaaaaaa-0000-0000-0000-000000000002',
  JSON.stringify(r.body.apparies))

// ── 6. Un plat inconnu est REMONTÉ, jamais inventé ──────────────────
r = await verifier([{ ...croissant, id: 7777, name: 'Chausson aux pommes' }], locaux)
t('un plat inconnu ne crée rien', (r.body.apparies ?? []).length === 0)
t('il est signalé pour décision humaine',
  (r.body.sans_correspondance ?? []).some(x => x.nom === 'Chausson aux pommes'),
  JSON.stringify(r.body.sans_correspondance))

// ── 7. Un plat illisible ne fait pas tomber le lot ──────────────────
r = await verifier([croissant, { id: 8888 }], locaux)   // sans `name`
t('un plat illisible est écarté sans casser le reste',
  r.body.lisibles === 1 && (r.body.illisibles ?? []).length === 1,
  JSON.stringify({ lisibles: r.body.lisibles, illisibles: r.body.illisibles }))

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
