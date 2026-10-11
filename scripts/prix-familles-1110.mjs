#!/usr/bin/env node
// Aligner une FAMILLE entière sur un prix unique. Décision du gérant,
// 11/10/2026 : pâtisseries du Fournil à 3,80 €, desserts en salle à 5,90 €.
//
//   node scripts/prix-familles-1110.mjs [--ecrire]
//
// Essai à blanc par défaut.
//
// ⚠️ Une vitrine à PRIX UNIQUE se lit d'un coup d'œil et ne se tape pas de
// travers au comptoir. C'est le gain, et il justifie qu'un produit cher à
// produire perde de la marge pendant qu'un produit bon marché en gagne : le
// panier moyen compte plus que la ligne.
//
// ⚠️⚠️ MAIS LE SCRIPT DIT CE QUE CHAQUE LIGNE DEVIENT. Un alignement par
// famille déplace les food costs dans les DEUX sens, et un ratio qui passe
// de 45 à 50 % sans que personne le voie finit par surprendre au bilan.
//
// ⚠️ `POST /catalog/dishes` est l'upsert dangereux de la 0141 : on RELIT avec
// `show_all=true`, on recopie `name` et `tax` TELS QUELS, on ne touche QUE
// les prix, on REFUSE de construire s'il manque un champ, et tout part en
// TABLEAU NU, en UN SEUL appel.
//
// ⚠️ `price` est le prix SUR PLACE, `price_togo` celui de l'emporter. Les
// deux bougent : n'en changer qu'un laisserait le ticket du comptoir à
// l'ancien prix. Vérifié avant d'écrire : AUCUN de ces 17 produits ne porte
// de `prix_sur_place_ttc` distinct, donc un seul prix suffit des deux côtés.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const Z = env.ZELTY_API_KEY
if (!U || !K) { console.error('✗ Supabase manquant'); process.exit(1) }
if (!Z)       { console.error('✗ ZELTY_API_KEY manquante'); process.exit(1) }

const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init,
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + t.slice(0, 200))
  try { return JSON.parse(t) } catch { return t }
}
const T = async p => { const o = []; for (let d = 0; d < 60_000; d += 1000) {
  const j = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`); o.push(...j); if (j.length < 1000) break } return o }
const zelty = async (path, init = {}) => { for (let t = 0; t < 4; t++) {
  const r = await fetch('https://api.zelty.fr/2.11' + path, { ...init,
    headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (t + 1))); continue }
  const txt = await r.text(); let b; try { b = JSON.parse(txt) } catch { b = txt }
  return { status: r.status, body: b } } throw new Error('Zelty injoignable : ' + path) }

// ═══════════════════════════════════════════════════════════════════════
const FAMILLES = [
  { categorie: 'Pâtisserie', tag: 'FOURNIL', prixTtc: 3.80 },
  { categorie: 'Dessert',    tag: 'CUISINE', prixTtc: 5.90 },
]
// ═══════════════════════════════════════════════════════════════════════

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const SEUIL_HAUT = 40   // au-delà, on le DIT : ce n'est plus un arrondi

async function main() {
  const recs = await T('recettes?select=id,nom,categorie,tag_destination,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht,actif&actif=eq.true')
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const zid = new Map(corr.map(c => [c.recette_id, Number(c.identifiant_externe)]))

  const majs = [], alertes = []
  for (const f of FAMILLES) {
    const l = recs.filter(r => r.categorie === f.categorie && r.tag_destination === f.tag)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    console.log(`\n╔══ ${f.tag} / ${f.categorie} → ${eur(f.prixTtc)}  (${l.length} produits, TVA ${[...new Set(l.map(x => x.tva))].join('/')} %)`)

    // ⚠️ Un prix sur place distinct changerait la règle : on refuse plutôt
    // que d'écraser en silence le tarif de la salle.
    const avecSalle = l.filter(x => x.prix_sur_place_ttc != null)
    if (avecSalle.length) { console.error('✗ prix sur place distinct sur : ' + avecSalle.map(x => x.nom).join(' · ') + ' — refus'); process.exit(1) }

    for (const r of l) {
      const tva = 1 + Number(r.tva) / 100
      const ancienTtc = Number(r.prix_vente_ht) * tva
      const htNew = f.prixTtc / tva
      const c = Number(r.cout_achat_ht || 0)
      const fc = x => c ? (c / x * 100) : null
      const avant = fc(Number(r.prix_vente_ht)), apres = fc(htNew)
      const bouge = Math.abs(ancienTtc - f.prixTtc) >= 0.005
      const fleche = !bouge ? '  (déjà au prix)' :
        `  ${avant != null ? `food cost ${avant.toFixed(0)} % → ${apres.toFixed(0)} %` : 'coût inconnu'}`
      console.log('   ' + (bouge ? (ancienTtc < f.prixTtc ? '↑' : '↓') : '=') + ' ' +
        r.nom.padEnd(36) + eur(ancienTtc).padStart(8) + ' → ' + eur(f.prixTtc).padStart(8) + fleche)
      if (apres != null && apres > SEUIL_HAUT)
        alertes.push(`${r.nom} : ${apres.toFixed(0)} % de food cost à ${eur(f.prixTtc)} (coût ${eur(c)}, le plus lourd de sa famille)`)
      if (bouge) majs.push({ r, prixTtc: f.prixTtc, ht: htNew })
    }
  }

  if (alertes.length) {
    console.log('\n  ⚠ AU-DESSUS DE ' + SEUIL_HAUT + ' % APRÈS ALIGNEMENT — dit, pas corrigé :')
    for (const a of alertes) console.log('    · ' + a)
    console.log('    un prix unique fait gagner les uns et perdre les autres ; c\'est le')
    console.log('    panier moyen qu\'on arbitre, pas la ligne.')
  }
  console.log(`\n  ${majs.length} prix à changer sur ${recs.filter(r => FAMILLES.some(f => f.categorie === r.categorie && f.tag === r.tag_destination)).length}`)

  if (!ECRIRE) { console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n'); return }
  if (!majs.length) { console.log('  rien à faire.\n'); return }

  // ─── la caisse d'abord : si elle refuse, rien n'est désynchronisé ─────
  const plats = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
  if (plats.length < 100) { console.error(`✗ la caisse ne rend que ${plats.length} plats : LECTURE RATÉE. Rien n’est écrit.`); process.exit(1) }
  const parZid = new Map(plats.map(p => [Number(p.id), p]))

  const charge = [], sans = []
  for (const { r, prixTtc } of majs) {
    const p = parZid.get(zid.get(r.id))
    if (!p) { sans.push(r.nom); continue }
    if (!p.name || p.price == null || p.tax == null) { console.error('✗ ' + r.nom + ' : champ obligatoire absent — refus'); process.exit(1) }
    charge.push({ id: Number(p.id), name: p.name, tax: Number(p.tax),
                  price: Math.round(prixTtc * 100), price_togo: Math.round(prixTtc * 100) })
  }
  if (sans.length) console.log('  ⚠ sans contrepartie caisse : ' + sans.join(' · '))
  if (charge.length) {
    const rep = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(charge) })
    if (rep.status !== 200) { console.error('✗ caisse : ' + rep.status + ' ' + JSON.stringify(rep.body).slice(0, 300)); process.exit(1) }
    console.log(`\n  ✓ caisse : ${charge.length} prix mis à jour`)
  }
  for (const { r, ht } of majs)
    await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: Number(ht.toFixed(4)) }) })
  console.log(`  ✓ base : ${majs.length} prix mis à jour\n`)
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
