// Import initial du catalogue : outil → Zelty.
//
// Zelty arrive vide. Plutôt que de saisir 85 produits à la main, on pousse la
// carte que nous avons déjà — prix, TVA et photos compris.
//
// Ce qu'on protège :
//   · NOTRE identifiant part dans `remote_id` : la correspondance est exacte
//     dès le premier jour, plus jamais de rapprochement par le nom ;
//   · la TVA SUR PLACE suit la loi (10 %), pas le taux du panneau (5,5 %) —
//     recopier sous-déclarerait la TVA d'un croissant mangé à table ;
//   · les montants partent en centimes, les taux en millièmes ;
//   · un produit déjà lié n'est JAMAIS renvoyé : un second lancement
//     doublonnerait toute la carte.
//
//   PORT=3000 node scripts/test-zelty-import.mjs

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
const imp = async (aImporter, dejaLies = []) => {
  const r = await fetch(`${BASE}/api/integrations/zelty/verifier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ aImporter, dejaLies }),
  })
  return await r.json().catch(() => ({}))
}

console.log('\n── Import de la carte vers Zelty ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent'); process.exit(1) }

const ID = 'aaaaaaaa-0000-0000-0000-000000000001'
// Croissant à 1,20 € TTC, TVA emporter 5,5 % → HT = 1,20 / 1,055
const croissant = {
  id: ID, nom: 'Croissant', description: 'Pur beurre',
  prix_vente_ht: 1.1374, tva: 5.5, contient_alcool: false,
  image_url: 'https://app-restaurant-livid.vercel.app/produits/croissant.jpg',
  actif: true,
}

let r = await imp([croissant])
t('la route répond', typeof r.aCreer !== 'undefined', JSON.stringify(r).slice(0, 200))
const p = r.aCreer?.[0] ?? {}
t('notre identifiant part dans remote_id', p.remote_id === ID, p.remote_id)
t('le nom est repris', p.name === 'Croissant', p.name)
t('le prix à emporter est en centimes', p.price_togo === 120, `${p.price_togo}`)
t('la TVA à emporter est en millièmes', p.tax_takeaway === 550, `${p.tax_takeaway}`)
t('la photo est transmise', typeof p.image === 'string' && p.image.startsWith('https://'), p.image)
t('la description suit', p.description === 'Pur beurre', p.description)

// ── LE point fiscal ─────────────────────────────────────────────────
t('la TVA SUR PLACE est à 10 %, pas au taux du panneau', p.tax === 1000, `${p.tax}`)
t('le prix affiché reste le même sur place', p.price === 120, `${p.price}`)

// ── Alcool ──────────────────────────────────────────────────────────
r = await imp([{ ...croissant, id: 'bbbb', nom: 'Bière', tva: 20, contient_alcool: true, prix_vente_ht: 4 }])
t("l'alcool reste à 20 % dans les deux modes",
  r.aCreer?.[0]?.tax === 2000 && r.aCreer?.[0]?.tax_takeaway === 2000,
  JSON.stringify({ tax: r.aCreer?.[0]?.tax, togo: r.aCreer?.[0]?.tax_takeaway }))

// ── Presse ──────────────────────────────────────────────────────────
r = await imp([{ ...croissant, id: 'cccc', nom: 'Quotidien', tva: 2.1, prix_vente_ht: 1.5 }])
t('la presse reste à 2,1 % sur place aussi',
  r.aCreer?.[0]?.tax === 210 && r.aCreer?.[0]?.tax_takeaway === 210,
  JSON.stringify({ tax: r.aCreer?.[0]?.tax }))

// ── Le garde-fou anti-doublon ───────────────────────────────────────
r = await imp([croissant], [ID])
t('un produit déjà lié n\'est PAS renvoyé', r.aCreer?.length === 0 && r.dejaLies === 1,
  JSON.stringify({ aCreer: r.aCreer?.length, dejaLies: r.dejaLies }))

// ── Les refus ───────────────────────────────────────────────────────
const { prix_vente_ht, ...sansPrix } = croissant
r = await imp([{ ...sansPrix, id: 'dddd' }])
t('un produit sans prix est écarté', r.aCreer?.length === 0 && r.ecartes?.length === 1)
t('et Zelty est cité comme raison',
  /Zelty l'exige/.test(r.ecartes?.[0]?.raison ?? ''), r.ecartes?.[0]?.raison)

r = await imp([{ ...croissant, id: 'eeee', tva: 7 }])
t('un taux de TVA inattendu est écarté', r.ecartes?.length === 1, JSON.stringify(r.ecartes))

r = await imp([{ ...croissant, id: 'ffff', prix_vente_ht: 0 }])
t('un prix nul est écarté', r.ecartes?.length === 1, JSON.stringify(r.ecartes))

// ── Produit inactif ─────────────────────────────────────────────────
r = await imp([{ ...croissant, id: 'gggg', actif: false }])
t('un produit inactif part désactivé', r.aCreer?.[0]?.disable === true)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
