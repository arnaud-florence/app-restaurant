#!/usr/bin/env node
// Trois ajustements du bar demandés le 12/10/2026 :
//   « rajoute le monaco à 3,00, pinte affligem 6,90, change le prix heineken
//     mets-le à 3,80 »
//
//   node scripts/bar-ajustements-1210.mjs [--ecrire]
//
// ⚠️ LE MONACO N'EST PAS À CRÉER : il EXISTE, à 3,00 € pile, avec son coût
// (0,8729 €) — il est seulement DÉSACTIVÉ. Le recréer aurait produit un
// doublon, coupé sa série de ventes en deux et perdu son coût. On regarde
// toujours la base AVANT de créer : la moitié des « ajouts » demandés sont
// des réveils.
//
// ⚠️ « HEINEKEN » S'APPELLE « Bière bouteille 33 cl » en caisse. Sa matière
// est « Heineken VC 33 cl », c'est donc bien elle. Le gérant la nomme par sa
// marque, la caisse par sa catégorie — un bouton que personne ne reconnaît
// sous le nom qu'on lui donne est un bouton qu'on cherche en service.
//
// ⚠️ LE COÛT DE LA PINTE EST DÉRIVÉ, PAS INVENTÉ : une pinte vaut deux demis
// du même fût, et la maison le vérifie déjà — Demi pression 0,9159 €, Pinte
// pression 1,8318 €, exactement le double, 80 demis ou 40 pintes par fût.
// On applique la même arithmétique à l'Affligem.
//
// ⚠️ Retrait/réveil et prix se mènent des DEUX côtés, CAISSE D'ABORD (0141).
// `POST /catalog/dishes` est un upsert : on relit, on recopie name/price/tax
// tels quels, tableau NU, un seul appel par opération.

import fs from 'node:fs'
import crypto from 'node:crypto'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const Z = env.ZELTY_API_KEY
if (!U || !K || !Z) { console.error('✗ .env.local incomplet'); process.exit(1) }

const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init,
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + t.slice(0, 250))
  try { return JSON.parse(t) } catch { return t }
}
const T = async p => { const o = []; for (let d = 0; d < 60_000; d += 1000) {
  const j = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`); o.push(...j); if (j.length < 1000) break } return o }
const zelty = async (path, init = {}) => {
  const vus = []
  for (let t = 0; t < 5; t++) {
    let r
    try { r = await fetch('https://api.zelty.fr/2.11' + path, { ...init,
      headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }) }
    catch (e) { vus.push('réseau: ' + e.message); await new Promise(s => setTimeout(s, 3000 * (t + 1))); continue }
    if (r.status === 429 || r.status >= 500) {
      vus.push(r.status + ' ' + (await r.text()).slice(0, 120))
      console.log(`    … ${init.method ?? 'GET'} ${path} → ${r.status}, nouvel essai`)
      await new Promise(s => setTimeout(s, 3000 * (t + 1))); continue
    }
    const txt = await r.text(); let b; try { b = JSON.parse(txt) } catch { b = txt }
    return { status: r.status, body: b }
  }
  throw new Error(`Zelty a refusé ${init.method ?? 'GET'} ${path} — ` + vus.join(' | '))
}

// ═══════════════════════════════════════════════════════════════════════
const REVEIL  = [['Monaco', 3.00]]                       // existe, désactivé
const PRIX    = [['Heineken 33 cl', 3.80, 'la Heineken bouteille']]
const CREER   = [{ nom: 'Pinte Affligem', gabarit: 'Demi Affligem', ttc: 6.90,
                   facteur: 2, parAchat: 40 }]           // 2 demis, 40 par fût
// ═══════════════════════════════════════════════════════════════════════

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const fc = (c, ht) => c ? (c / ht * 100).toFixed(0) + ' %' : '—'

async function main() {
  const recs = await T('recettes?select=*')
  const parNom = new Map(recs.map(r => [r.nom, r]))
  const ttcDe = r => Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)

  const reveils = [], prix = [], creations = []

  console.log('\n╔══ RÉVEILS ' + '═'.repeat(60))
  for (const [nom, attendu] of REVEIL) {
    const r = parNom.get(nom)
    if (!r) { console.log('  ⚠ ' + nom + ' introuvable — il faudrait le créer'); continue }
    const t = ttcDe(r)
    const bougePrix = Math.abs(t - attendu) >= 0.005
    console.log(`  ${r.actif ? '=' : '↑'} ${nom.padEnd(26)}${eur(t)}${bougePrix ? ' → ' + eur(attendu) : ' (déjà au prix demandé)'}` +
      `   coût ${eur(Number(r.cout_achat_ht ?? 0))} · food cost ${fc(Number(r.cout_achat_ht), attendu / (1 + r.tva / 100))}` +
      (r.actif ? '   déjà actif' : '   DÉSACTIVÉ → à rallumer'))
    if (!r.actif || bougePrix) reveils.push({ r, ttc: attendu, rallume: !r.actif, bougePrix })
  }

  console.log('\n╔══ PRIX ' + '═'.repeat(63))
  for (const [nom, cible, note] of PRIX) {
    const r = parNom.get(nom)
    if (!r) { console.log('  ⚠ ' + nom + ' introuvable'); continue }
    const t = ttcDe(r), htN = cible / (1 + r.tva / 100), c = Number(r.cout_achat_ht ?? 0)
    console.log(`  ${nom.padEnd(26)}${eur(t)} → ${eur(cible)}   (${note})`)
    console.log(`     coût ${eur(c)} · marge ${eur(Number(r.prix_vente_ht) - c)} → ${eur(htN - c)} · food cost ${fc(c, Number(r.prix_vente_ht))} → ${fc(c, htN)}`)
    if (Math.abs(t - cible) >= 0.005) prix.push({ r, ttc: cible, ht: htN })
  }

  console.log('\n╔══ CRÉATIONS ' + '═'.repeat(58))
  for (const c of CREER) {
    if (parNom.has(c.nom)) { console.log('  = ' + c.nom + ' existe déjà'); continue }
    const g = parNom.get(c.gabarit)
    if (!g) { console.error('✗ gabarit « ' + c.gabarit + ' » introuvable'); process.exit(1) }
    const cout = g.cout_achat_ht == null ? null : Number(g.cout_achat_ht) * c.facteur
    const ht = c.ttc / (1 + Number(g.tva) / 100)
    console.log(`  + ${c.nom.padEnd(26)}${eur(c.ttc)}   TVA ${g.tva} % · ${g.categorie} · ${g.tag_destination}`)
    console.log(`     coût DÉRIVÉ du ${c.gabarit} × ${c.facteur} = ${cout == null ? '—' : eur(cout)}` +
      `   marge ${cout == null ? '—' : eur(ht - cout)} · food cost ${fc(cout, ht)}`)
    console.log(`     matière « ${g.nom_matiere ?? '—'} », ${c.parAchat} par unité achetée`)
    creations.push({ ...c, g, cout, ht })
  }

  if (!reveils.length && !prix.length && !creations.length) { console.log('\n  rien à faire.\n'); return }
  if (!ECRIRE) { console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n'); return }

  // ═══ écriture — caisse d'abord ═══════════════════════════════════════
  console.log('\n╔══ ÉCRITURE ' + '═'.repeat(59))
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const zid = new Map(corr.map(c => [c.recette_id, Number(c.identifiant_externe)]))
  const plats = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
  if (plats.length < 100) { console.error(`✗ la caisse ne rend que ${plats.length} plats : LECTURE RATÉE.`); process.exit(1) }
  const parZ = new Map(plats.map(p => [Number(p.id), p]))
  console.log(`  catalogue relu : ${plats.length} plats`)

  const base = (p, quoi) => {
    if (!p.name || p.price == null || p.tax == null) throw new Error(quoi + ' : champ obligatoire absent en caisse — refus')
    return { id: Number(p.id), name: p.name, price: Number(p.price), tax: Number(p.tax) }
  }

  // ── réveils + prix, en UN seul upsert
  const maj = []
  for (const x of [...reveils, ...prix]) {
    const p = parZ.get(zid.get(x.r.id))
    if (!p) { console.log('  ⚠ ' + x.r.nom + ' : sans contrepartie caisse'); continue }
    const o = base(p, x.r.nom)
    if (x.rallume) o.disable = false
    if (x.bougePrix !== false && x.ttc != null) {
      o.price = Math.round(x.ttc * 100)
      o.price_togo = Math.round(x.ttc * 100)
    }
    maj.push(o)
  }
  if (maj.length) {
    const r = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(maj) })
    if (r.status !== 200) { console.error('✗ caisse : ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 300)); process.exit(1) }
    console.log(`  ✓ caisse : ${maj.length} plat(s) mis à jour`)
  }
  for (const x of reveils) {
    const patch = {}
    if (x.rallume) patch.actif = true
    if (x.bougePrix) patch.prix_vente_ht = Number((x.ttc / (1 + x.r.tva / 100)).toFixed(4))
    await sb(`recettes?id=eq.${x.r.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  for (const x of prix) await sb(`recettes?id=eq.${x.r.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: Number(x.ht.toFixed(4)) }) })
  if (reveils.length + prix.length) console.log(`  ✓ base : ${reveils.length} réveil(s), ${prix.length} prix`)

  // ── créations
  for (const c of creations) {
    const g = c.g
    const id = crypto.randomUUID()
    await sb('recettes', { method: 'POST', body: JSON.stringify([{
      id, nom: c.nom, nom_caisse: c.nom,
      categorie: g.categorie, tag_destination: g.tag_destination,
      etablissement_id: g.etablissement_id,
      prix_vente_ht: Number(c.ht.toFixed(4)),
      prix_sur_place_ttc: g.prix_sur_place_ttc,
      tva: g.tva, contient_alcool: g.contient_alcool,
      vendable_online: false,              // ⚠️ l'alcool n'est JAMAIS en ligne (0144)
      cout_achat_ht: c.cout,
      nom_matiere: g.nom_matiere, unites_par_achat: c.parAchat,
      fournisseur_id: g.fournisseur_id, reference_fournisseur: g.reference_fournisseur,
      image_url: null, actif: true, type_revenu: 'vente',
      allergenes_complementaires: g.allergenes_complementaires ?? [],
    }]) })
    const modele = parZ.get(zid.get(g.id))
    if (!modele) { console.error('✗ ' + c.gabarit + ' sans contrepartie caisse — le plat n’est pas poussé'); continue }
    // ⚠️ pas de `id_fabrication_place` sur une création : Zelty répond 500.
    const r = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify([{
      remote_id: id, name: c.nom,
      price: Math.round(c.ttc * 100), price_togo: Math.round(c.ttc * 100),
      tax: modele.tax, tax_takeaway: modele.tax_takeaway, tags: modele.tags ?? [],
    }]) })
    if (r.status !== 200) { console.error('✗ caisse (création) : ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 300)); process.exit(1) }
    const apres = (await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes || []
    const p = apres.find(x => String(x.remote_id) === id)
    if (p) { await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{ systeme: 'zelty', identifiant_externe: String(p.id), recette_id: id, libelle_externe: c.nom }]) })
      console.log(`  ✓ ${c.nom} créé des deux côtés (caisse #${p.id})`) }
    else console.log('  ⚠ ' + c.nom + ' : aucun identifiant rendu par la caisse')
  }
  console.log('')
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
