// Traduction Zelty → connecteur caisse.
//
// Tout est joué sur des commandes FICTIVES, à travers le banc d'essai
// /api/integrations/zelty/verifier : aucun compte Zelty, aucune clé, aucun
// réseau vers eux. C'est le vrai mapper qui est éprouvé, pas une copie.
//
// Ce qu'on protège, et chaque cas vient d'une erreur classique de connecteur :
//   · un total manquant ne doit JAMAIS donner un ticket à 0 € ;
//   · une commande annulée ne doit pas entrer dans le CA ;
//   · l'unité monétaire est déclarée, jamais devinée — se tromper multiplie
//     le chiffre d'affaires par cent ;
//   · l'identifiant produit doit survivre, c'est lui qui empêche les doublons
//     au renommage (0137).
//
//   PORT=3000 node scripts/test-zelty-mapper.mjs

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
const verifier = async (commandes, centimes = false) => {
  const r = await fetch(`${BASE}/api/integrations/zelty/verifier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandes, centimes }),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('\n── Traduction Zelty ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent'); process.exit(1) }

// ── 1. Commande nominale, en euros ──────────────────────────────────
// Forme RÉELLE d'après docs.zelty.fr : montants entiers en centimes,
// `price` et `tax` sont des objets, la ligne porte `item_id`.
const nominale = {
  id: 1001,
  total: 1240,
  closed_at: '2026-09-15T08:30:00Z',
  transactions: [{ name: 'CB', price: 1240 }],
  items: [
    { item_id: 'P-77', name: 'Croissant', qty: 2,
      price: { final_amount_inc_tax: 240 }, tax: { tax_rate: 550, tax_amount: 13 } },
    { item_id: 'P-88', name: 'Panuozzi', qty: 1,
      price: { final_amount_inc_tax: 1000 }, tax: { tax_rate: 1000, tax_amount: 91 } },
  ],
}
// Le webhook `order.ended` nomme les lignes `contents`, pas `items` :
// c'est REQUIS dans sa spec OpenAPI. Ne lire que `items` ferait entrer
// chaque ticket sans une seule ligne — CA juste, marges aveugles.
{
  const { items, ...sansItems } = nominale
  const parWebhook = { ...sansItems, id: 2999, contents: items }
  const w = await verifier([parWebhook], true)
  t('les lignes arrivent aussi par `contents` (webhook)',
    w.body.lignes_produits === 2, `${w.body.lignes_produits}`)
  t('et le détail produit est vu comme présent',
    w.body.detail_produits_present === true, JSON.stringify(w.body).slice(0, 160))
}

let r = await verifier([nominale], true)
t('la route répond', r.status === 200, `HTTP ${r.status}`)
t('la commande est traduite', r.body.traduites === 1, JSON.stringify(r.body).slice(0, 200))
t('les centimes sont convertis en euros', r.body.total_ttc === 12.40, `${r.body.total_ttc}`)
t('le détail produit est présent', r.body.detail_produits_present === true)
t('les deux lignes passent', r.body.lignes_produits === 2, `${r.body.lignes_produits}`)
let e = r.body.apercu?.[0] ?? {}
t("l'identifiant produit est conservé",
  e.produits?.[0]?.identifiant_externe === 'P-77', JSON.stringify(e.produits?.[0]))
t('le mode de paiement vient des transactions', e.mode_paiement === 'carte', e.mode_paiement)
t('le prix unitaire est ramené à la pièce',
  e.produits?.[0]?.prix_unitaire_ttc === 1.20, `${e.produits?.[0]?.prix_unitaire_ttc}`)
t('un taux en points de base devient un pourcentage',
  e.produits?.[0]?.tva_taux === 5.5, `${e.produits?.[0]?.tva_taux}`)
t('la TVA est ventilée par taux',
  JSON.stringify(e.ventilation_tva) === JSON.stringify({ '5.5': 0.13, '10': 0.91 }),
  JSON.stringify(e.ventilation_tva))
t("la date d'encaissement est reprise",
  String(e.encaisse_at).startsWith('2026-09-15T08:30'), e.encaisse_at)

// ── 2. Mauvaise unité : le garde-fou doit crier ─────────────────────
const lot = Array.from({ length: 6 }, (_, i) => ({ ...nominale, id: 2000 + i }))
r = await verifier(lot, false)   // centimes déclarés faux à tort
t('un panier moyen absurde déclenche un avertissement',
  (r.body.avertissements ?? []).some(a => /montantsEnCentimes/.test(a)),
  JSON.stringify(r.body.avertissements))

// ── 3. expand[]=items oublié : le piège principal de cette API ──────
r = await verifier([
  { id: 5001, total: 500, closed_at: '2026-09-15T08:00:00Z', items: [] },
  { id: 5002, total: 700, closed_at: '2026-09-15T08:05:00Z', items: [] },
], true)
t('deux commandes sans lignes sont comptées', r.body.traduites === 2)
t('mais l\'oubli de expand[]=items est signalé',
  (r.body.avertissements ?? []).some(a => /expand\[\]=items/.test(a)),
  JSON.stringify(r.body.avertissements))

// ── 4. Commande annulée ─────────────────────────────────────────────
r = await verifier([{ id: 3001, total: 2000, status: 'CANCELLED' }], true)
t('une commande annulée est écartée', r.body.traduites === 0)
t('et le statut brut est nommé dans le rejet',
  (r.body.rejets ?? []).some(x => /CANCELLED/.test(x.raison)), JSON.stringify(r.body.rejets))

// ── 4 bis. Statut NUMÉRIQUE : 255 seul vaut une vente ───────────────
// Zelty exprime le statut en nombre. Une commande partielle ou remboursée
// comptée comme une vente gonflerait le CA sans que rien ne le signale.
r = await verifier([{ id: 3100, total: 1500, status: 'opened', closed_at: '2026-09-15T09:00:00Z' }], true)
t('une commande encore ouverte est écartée', r.body.traduites === 0,
  JSON.stringify(r.body.rejets))

r = await verifier([{ id: 3101, total: 1500, status: 255, closed_at: '2026-09-15T09:00:00Z' }], true)
t('le statut numérique 255 est accepté', r.body.traduites === 1, JSON.stringify(r.body.rejets))

r = await verifier([{ id: 3102, total: 1500, status: 128, closed_at: '2026-09-15T09:00:00Z' }], true)
t('un statut numérique non clôturé est écarté', r.body.traduites === 0)

r = await verifier([{ id: 3103, total: 1500, status: 'REFUNDED', closed_at: '2026-09-15T09:00:00Z' }], true)
t('un remboursement est écarté', r.body.traduites === 0, JSON.stringify(r.body.rejets))

// ── 5. Total manquant : surtout pas 0 € ─────────────────────────────
r = await verifier([{ id: 4001, items: [{ name: 'X', qty: 1, price: { final_amount_inc_tax: 300 } }] }], true)
t('un total manquant ne produit pas de ticket', r.body.traduites === 0)
t('il est rejeté explicitement',
  (r.body.rejets ?? []).some(x => /montant/i.test(x.raison)), JSON.stringify(r.body.rejets))

// ── 6. Quantité absente : comptée 1, et DITE ────────────────────────
// La quantité n'est pas documentée sur GET. La taire transformerait
// 3 croissants en 1 sans que rien ne le signale.
r = await verifier([{
  id: 5001, total: 900, closed_at: '2026-09-15T10:00:00Z',
  items: [{ item_id: 'F-1', name: 'Part de flan',
            price: { final_amount_inc_tax: 300 }, tax: { tax_rate: 5.5, tax_amount: 16 } }],
}], true)
const l6 = r.body.apercu?.[0]?.produits?.[0] ?? {}
t('une ligne sans quantité est comptée pour 1', l6.quantite === 1, `${l6.quantite}`)
t('et le doute est signalé',
  (r.body.avertissements ?? []).some(a => /quantité absente/.test(a)),
  JSON.stringify(r.body.avertissements))
t('un taux déjà en pourcentage est laissé tel quel', l6.tva_taux === 5.5, `${l6.tva_taux}`)

// ── 7. Espèces, et repli sur created_at ─────────────────────────────
r = await verifier([{
  id: 6001, total: 500, created_at: '2026-09-15T11:00:00Z',
  transactions: [{ name: 'Espèces', price: 500 }],
  items: [{ item_id: 'C-1', name: 'Café', qty: 1, price: { final_amount_inc_tax: 500 } }],
}], true)
t('les espèces sont reconnues', r.body.apercu?.[0]?.mode_paiement === 'especes',
  r.body.apercu?.[0]?.mode_paiement)
t("created_at sert de repli quand closed_at manque",
  String(r.body.apercu?.[0]?.encaisse_at).startsWith('2026-09-15T11:00'),
  r.body.apercu?.[0]?.encaisse_at)
t("l'identifiant numérique devient la référence du ticket",
  r.body.apercu?.[0]?.ticket_externe === '6001', r.body.apercu?.[0]?.ticket_externe)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
