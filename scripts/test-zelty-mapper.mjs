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
const nominale = {
  id: 'ZEL-1001',
  total: 12.40, total_ht: 11.28, vat_amount: 1.12,
  closed_at: '2026-09-15T08:30:00Z',
  payment_method: 'CARD',
  items: [
    { product_id: 'P-77', name: 'Croissant', quantity: 2, price: 1.20, vat_rate: 5.5 },
    { product_id: 'P-88', name: 'Panuozzi',  quantity: 1, price: 10.00, vat_rate: 10 },
  ],
}
let r = await verifier([nominale])
t('la route répond', r.status === 200, `HTTP ${r.status}`)
t('la commande est traduite', r.body.traduites === 1, JSON.stringify(r.body).slice(0, 200))
t('le montant est repris tel quel', r.body.total_ttc === 12.40, `${r.body.total_ttc}`)
t('le détail produit est présent', r.body.detail_produits_present === true)
t('les deux lignes passent', r.body.lignes_produits === 2, `${r.body.lignes_produits}`)
let e = r.body.apercu?.[0] ?? {}
t("l'identifiant produit est conservé",
  e.produits?.[0]?.identifiant_externe === 'P-77', JSON.stringify(e.produits?.[0]))
t('le mode de paiement est normalisé', e.mode_paiement === 'carte', e.mode_paiement)
t("la date d'encaissement est reprise",
  String(e.encaisse_at).startsWith('2026-09-15T08:30'), e.encaisse_at)

// ── 2. Les mêmes montants en CENTIMES ───────────────────────────────
const enCentimes = {
  ...nominale, id: 'ZEL-1002',
  total: 1240, total_ht: 1128, vat_amount: 112,
  items: [{ product_id: 'P-77', name: 'Croissant', quantity: 2, price: 120, vat_rate: 5.5 }],
}
r = await verifier([enCentimes], true)
t('les centimes sont convertis', r.body.total_ttc === 12.40, `${r.body.total_ttc}`)
t('le prix unitaire aussi',
  r.body.apercu?.[0]?.produits?.[0]?.prix_unitaire_ttc === 1.20,
  `${r.body.apercu?.[0]?.produits?.[0]?.prix_unitaire_ttc}`)

// ── 3. Mauvaise unité : le garde-fou doit crier ─────────────────────
const lot = Array.from({ length: 6 }, (_, i) => ({ ...enCentimes, id: `ZEL-20${i}` }))
r = await verifier(lot, false)   // centimes déclarés faux à tort
t('un panier moyen absurde déclenche un avertissement',
  (r.body.avertissements ?? []).some(a => /montantsEnCentimes/.test(a)),
  JSON.stringify(r.body.avertissements))

// ── 4. Commande annulée ─────────────────────────────────────────────
r = await verifier([{ id: 'ZEL-3001', total: 20, status: 'CANCELLED' }])
t('une commande annulée est écartée', r.body.traduites === 0)
t('et la raison est dite',
  (r.body.rejets ?? []).some(x => /annul/i.test(x.raison)), JSON.stringify(r.body.rejets))

// ── 5. Total manquant : surtout pas 0 € ─────────────────────────────
r = await verifier([{ id: 'ZEL-4001', items: [{ name: 'X', quantity: 1, price: 3 }] }])
t('un total manquant ne produit pas de ticket', r.body.traduites === 0)
t('il est rejeté explicitement',
  (r.body.rejets ?? []).some(x => /montant/i.test(x.raison)), JSON.stringify(r.body.rejets))

// ── 6. Ligne sans prix unitaire, seulement un total ─────────────────
r = await verifier([{
  id: 'ZEL-5001', total: 9, date: '2026-09-15T10:00:00Z',
  products: [{ name: 'Part de flan', qty: 3, total_price: 9, tax_rate: 0.055 }],
}])
const l6 = r.body.apercu?.[0]?.produits?.[0] ?? {}
t('le prix unitaire est déduit du total de ligne', l6.prix_unitaire_ttc === 3, `${l6.prix_unitaire_ttc}`)
t('un taux en fraction est ramené en pourcentage', l6.tva_taux === 5.5, `${l6.tva_taux}`)
t("l'alias « products » est accepté", r.body.lignes_produits === 1)

// ── 7. Alias « lines » et paiement en tableau ───────────────────────
r = await verifier([{
  order_id: 'ZEL-6001', amount: 5, paid_at: '2026-09-15T11:00:00Z',
  payments: [{ method: 'CASH', amount: 5 }],
  lines: [{ label: 'Café', qty: 1, unit_price: 5 }],
}])
t("l'alias « lines » est accepté", r.body.lignes_produits === 1)
t('les espèces sont reconnues', r.body.apercu?.[0]?.mode_paiement === 'especes',
  r.body.apercu?.[0]?.mode_paiement)
t("l'alias « order_id » sert de référence",
  r.body.apercu?.[0]?.ticket_externe === 'ZEL-6001', r.body.apercu?.[0]?.ticket_externe)

// ── 8. Commande sans aucune ligne : le CA passe, le détail manque ───
r = await verifier([{ id: 'ZEL-7001', total: 4.5, date: '2026-09-15T12:00:00Z' }])
t('une commande sans ligne est quand même comptée', r.body.traduites === 1)
t('mais signalée comme sans détail', r.body.detail_produits_present === false)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
