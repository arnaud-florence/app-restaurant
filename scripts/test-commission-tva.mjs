// Revenus de COMMISSION + TVA presse à 2,1 % (migration 0136).
//
// Ce que ça protège :
//   · un paquet de cigarettes à 12 € ne doit pas compter 12 € de CA ;
//   · un produit en commission sans rémunération renseignée doit être refusé
//     à l'écriture, sinon son revenu serait silencieusement nul ;
//   · un journal doit sortir à 2,1 % — avant la 0136, `tauxTvaVente` rejetait
//     ce taux sans rien dire et retombait sur 5,5 %.
//
// ⚠️ AUCUNE commande n'est créée : le circuit de vente est réel depuis le
// 22/08/2026. On teste la règle et les contraintes, pas un ticket.
//
// ⚠️ Les formules ci-dessous RECOPIENT src/lib/tva.ts et src/lib/ventes-stats.ts
// (les sources sont en TS). Modifier les trois ensemble.
//
//   node scripts/test-commission-tva.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

// ── Règles recopiées ────────────────────────────────────────────────
const TAUX_ADMIS = [2.1, 5.5, 10, 20]
const tauxTvaVente = (p, conso) => {
  if (p.contient_alcool) return 20
  const porte = Number(p.tva)
  if (TAUX_ADMIS.includes(porte)) return porte
  return conso === 'sur_place' ? 10 : 5.5
}
/** Ce qui vous reste sur une ligne. Forfait prioritaire sur pourcentage. */
const revenuLigne = ({ commission, q, ca, caHT, forfait, pct }) =>
  !commission ? caHT
    : forfait != null ? q * forfait
    : pct != null ? ca * (pct / 100)
    : 0

console.log('\n── Commissions et TVA presse ──\n')

// ── Setup ───────────────────────────────────────────────────────────
const creer = async (body) => {
  const r = await fetch(`${U}/rest/v1/recettes`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json() }
}
const base = { categorie: 'TEST', prix_vente_ht: 1, actif: false, tag_destination: 'FOURNIL' }
const crees = []

const presse = await creer({ ...base, nom: 'ZZTEST Quotidien régional', tva: 2.1 })
t('un produit à 2,1 % est accepté en base', presse.status === 201,
  `HTTP ${presse.status} ${JSON.stringify(presse.body).slice(0, 120)}`)
if (presse.status === 201) crees.push(presse.body[0].id)

const sansRemu = await creer({ ...base, nom: 'ZZTEST Commission vide', type_revenu: 'commission' })
t('une commission sans rémunération est REFUSÉE', sansRemu.status === 400,
  `HTTP ${sansRemu.status}`)
if (sansRemu.status === 201) crees.push(sansRemu.body[0].id)

const tabac = await creer({ ...base, nom: 'ZZTEST Paquet cigarettes', tva: 20,
  prix_vente_ht: 10, type_revenu: 'commission', commission_pct: 8 })
t('une commission au pourcentage est acceptée', tabac.status === 201, `HTTP ${tabac.status}`)
if (tabac.status === 201) crees.push(tabac.body[0].id)

const colis = await creer({ ...base, nom: 'ZZTEST Remise colis', tva: 20,
  prix_vente_ht: 0, type_revenu: 'commission', commission_forfait_ht: 0.55 })
t('une commission au forfait est acceptée', colis.status === 201, `HTTP ${colis.status}`)
if (colis.status === 201) crees.push(colis.body[0].id)

// ── Assertions sur la règle ─────────────────────────────────────────
t('un journal sort à 2,1 %, pas à 5,5 %',
  tauxTvaVente({ tva: 2.1 }, 'emporter') === 2.1,
  `obtenu ${tauxTvaVente({ tva: 2.1 }, 'emporter')}`)
t('un taux inconnu retombe sur la règle de consommation',
  tauxTvaVente({ tva: 7 }, 'sur_place') === 10)
t("l'alcool reste à 20 % même avec un taux porté",
  tauxTvaVente({ tva: 2.1, contient_alcool: true }, 'emporter') === 20)

// Un paquet à 12 € TTC, remise 8 % → 0,96 € de revenu, pas 12 €.
const rTabac = revenuLigne({ commission: true, q: 1, ca: 12, caHT: 10, pct: 8 })
t('12 € de tabac ne comptent pas 12 € de CA',
  Math.abs(rTabac - 0.96) < 0.001, `revenu ${rTabac}`)

// 3 colis à 0,55 € de forfait → 1,65 €, quel que soit le montant du ticket.
const rColis = revenuLigne({ commission: true, q: 3, ca: 0, caHT: 0, forfait: 0.55 })
t('un forfait ne dépend pas du montant du ticket',
  Math.abs(rColis - 1.65) < 0.001, `revenu ${rColis}`)

// Le forfait prime quand les deux sont renseignés.
t('le forfait prime sur le pourcentage',
  revenuLigne({ commission: true, q: 1, ca: 100, caHT: 90, forfait: 2, pct: 50 }) === 2)

// Une vente ordinaire rapporte son CA HT.
t('une vente ordinaire rapporte son CA HT',
  revenuLigne({ commission: false, q: 2, ca: 12, caHT: 10 }) === 10)

// ── Cleanup ─────────────────────────────────────────────────────────
let supprimes = 0
for (const id of crees) {
  const r = await fetch(`${U}/rest/v1/recettes?id=eq.${id}`, { method: 'DELETE', headers: H })
  if (r.ok) supprimes++
}
t('cleanup complet', supprimes === crees.length, `${supprimes}/${crees.length}`)
const reste = await (await fetch(`${U}/rest/v1/recettes?select=id&nom=like.ZZTEST*`, { headers: H })).json()
t('aucun produit de test résiduel', Array.isArray(reste) && reste.length === 0,
  `${Array.isArray(reste) ? reste.length : '?'} restant(s)`)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
