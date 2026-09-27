#!/usr/bin/env node
// Déduire la BASE de prix de chaque ligne Euro-Cash — unité, pack ou colis.
//
// Leur fichier mélange les trois et ne le dit pas. Sans la base, 195 prix
// restent hors comparaison : c'est-à-dire invisibles là où ils serviraient.
//
// ⚠️⚠️ ON NE DEVINE PAS, ON MESURE. Trois épreuves, dans cet ordre, et la
// première qui tranche gagne :
//
//   1. **L'ANCRAGE** — le même produit existe ailleurs au catalogue (Coca,
//      Perrier, Nutella…) avec un prix au litre ou au kilo connu. La base
//      qui approche ce prix est la bonne. C'est une MESURE, pas une
//      hypothèse.
//   2. **NOTRE PROPRE PRIX**, quand le fichier le porte (15 lignes).
//   3. **LA FOURCHETTE OBSERVÉE**, calibrée sur nos 52 boissons dont la
//      contenance est lisible — 0,49 à 3 €/L pour les softs. Elle ne
//      tranche QUE si une seule base y entre ET que les autres en sortent
//      d'un facteur 2 au moins.
//
// ⚠️ SINON ON S'ABSTIENT. Une base fausse se trompe d'un facteur 10 à 40 :
// elle ferait passer Euro-Cash pour deux fois moins cher sur toute la
// cannette, et on changerait de fournisseur sur un chiffre inventé.
//
//   node scripts/base-prix-eurocash.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')

const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}&order=id&offset=${d}&limit=1000`,
      { headers: { apikey: K, Authorization: 'Bearer ' + K } })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300))
    out.push(...j)
    if (j.length < 1000) break
  }
  return out
}

/** « c-4x10x20cl » → comptes [4,10], contenance 0,20 L. */
function facteurs(colisage) {
  if (!colisage) return null
  const parts = String(colisage).replace(/^c-/i, '').split(/[xX]/)
  const counts = []
  let contenance = null, unite = null
  for (const p of parts) {
    const m = p.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/)
    if (!m) continue
    const v = parseFloat(m[1].replace(',', '.'))
    const suf = m[2].toLowerCase()
    if (suf === 'cl') { contenance = v / 100; unite = 'L' }
    else if (suf === 'l') { contenance = v; unite = 'L' }
    else if (suf === 'ml') { contenance = v / 1000; unite = 'L' }
    else if (suf === 'kg') { contenance = v; unite = 'kg' }
    else if (suf === 'g') { contenance = v / 1000; unite = 'kg' }
    else if (suf === 'pcs' || suf === 'pc') { counts.push(v); unite = 'piece' }
    else counts.push(v)
  }
  return { counts, contenance, unite }
}

function candidats(f) {
  if (!f) return []
  const out = [{ base: 'unite', n: 1 }]
  if (f.counts.length >= 2) out.push({ base: 'pack', n: f.counts[f.counts.length - 1] })
  const total = f.counts.reduce((a, b) => a * b, 1)
  if (total > 1) out.push({ base: 'colis', n: total })
  const vus = new Set()
  return out.filter(c => (vus.has(c.n) ? false : (vus.add(c.n), true)))
}

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()
const VIDE = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'en', 'au', 'aux', 'et', 'cl', 'bte', 'slim'])
const mots = s => norm(s).split(' ').filter(w => w.length > 2 && !VIDE.has(w))

// ⚠️ Fourchette CALIBRÉE sur nos 52 boissons dont la contenance est
// lisible : 0,49 €/L (eau plate) à 3 €/L (Perrier). On l'élargit au double
// vers le haut pour les énergisantes, que nous n'achetons pas encore —
// mais cet élargissement rend justement les énergisantes AMBIGUËS, ce qui
// est le comportement voulu : on ne tranche pas ce qu'on n'a pas mesuré.
const BANDE = { L: [0.45, 6], kg: [3, 30] }
const MARGE = 2   // les autres bases doivent sortir de la bande d'un facteur 2

async function main() {
  const [cat, fourns] = await Promise.all([
    T('catalogue_fournisseur?select=id,fournisseur_id,reference,designation,famille,prix_ht,unite,colis_libelle,contenance_valeur,contenance_unite,cle_comparaison,nature&actif=is.true'),
    T('fournisseurs?select=id,nom'),
  ])
  const nomF = new Map(fourns.map(f => [f.id, f.nom]))
  const euroId = fourns.find(f => f.nom === 'Euro-Cash')?.id
  if (!euroId) { console.error('✗ Euro-Cash introuvable.'); process.exit(1) }

  // ── LES ANCRAGES : ce que le MÊME produit coûte ailleurs, au litre ou
  // au kilo. Seules les lignes dont la contenance est connue comptent.
  const ancres = []
  for (const c of cat) {
    if (c.fournisseur_id === euroId || c.prix_ht == null) continue
    if (c.contenance_valeur == null || !c.contenance_unite) continue
    const u = c.contenance_unite === 'L' ? 'L' : c.contenance_unite === 'kg' ? 'kg' : null
    if (!u) continue
    ancres.push({ mots: mots(c.designation), parRef: Number(c.prix_ht) / Number(c.contenance_valeur),
      unite: u, nom: c.designation, cle: c.cle_comparaison ?? null })
  }

  // ── ÉPREUVE ① — NOTRE PROPRE PRIX, porté par le fichier envoyé.
  // ⚠️ C'est la preuve la plus forte et elle était décrite en tête sans
  // être écrite : le script échouait alors sur le Pot Nutella, dont la
  // base est pourtant démontrée par nos deux colonnes. Une épreuve
  // documentée mais absente est pire qu'une épreuve manquante — on la
  // croit faite.
  const CSV = 'data/tarif-eurocash-2026-09-23.csv'
  const nôtres = new Map()
  if (fs.existsSync(CSV)) {
    const l = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim())
    const h = l[0].split(';').map(x => x.trim())
    const num = t => {
      const x = String(t ?? '').replace('€', '').replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.')
      const v = Number(x); return x === '' || !Number.isFinite(v) ? null : v
    }
    for (const ligne of l.slice(1)) {
      const c = ligne.split(';')
      const o = Object.fromEntries(h.map((k, i) => [k, (c[i] ?? '').trim()]))
      const u = num(o['Notre prix actuel HT']), col = num(o['Prix colis à battre'])
      if (u != null && col != null) nôtres.set(o.Code, { unite: u, colis: col })
    }
  }

  const euro = cat.filter(c => c.fournisseur_id === euroId && c.prix_ht != null)
  const decisions = []
  for (const c of euro) {
    const f = facteurs(c.colis_libelle)
    const cands = candidats(f)
    if (!f || f.contenance == null || !f.unite || f.unite === 'piece' || cands.length < 2) {
      decisions.push({ c, base: null, par: 'colisage illisible ou sans contenance' }); continue
    }
    const prix = Number(c.prix_ht)
    const evalues = cands.map(x => ({ ...x, parRef: prix / (x.n * f.contenance) }))

    // ① NOTRE PROPRE PRIX — la base dont notre chiffre est le plus proche.
    const mien = nôtres.get(c.reference)
    if (mien) {
      const dU = Math.abs(Math.log(prix / (mien.unite || 1e-9)))
      const dC = Math.abs(Math.log(prix / (mien.colis || 1e-9)))
      // ⚠️ À plus d'un facteur 3 des DEUX côtés, ça ne prouve rien : c'est
      // peut-être une troisième base, ou un autre produit.
      if (Math.min(dU, dC) < Math.log(3)) {
        const base = dU < dC ? 'unite' : 'colis'
        const ch = evalues.find(x => x.base === base)
        if (ch) {
          decisions.push({ c, base, n: ch.n, parRef: ch.parRef, unite: f.unite, par: 'notre propre prix' })
          continue
        }
      }
    }

    // ② ANCRAGE — le même produit ailleurs
    const mm = mots(c.designation)
    const proches = ancres.filter(a => a.unite === f.unite
      && mm.length >= 1 && a.mots.length >= 1
      && mm.filter(w => a.mots.includes(w)).length >= Math.min(2, mm.length))
    if (proches.length) {
      const cible = proches.reduce((a, b) => a.parRef < b.parRef ? a : b).parRef
      const best = evalues.reduce((a, b) =>
        Math.abs(Math.log(a.parRef / cible)) < Math.abs(Math.log(b.parRef / cible)) ? a : b)
      // ⚠️ Un ancrage qui reste à plus d'un facteur 2 n'ancre rien.
      if (Math.abs(Math.log(best.parRef / cible)) < Math.log(2)) {
        // ⚠️⚠️ L'ANCRAGE SERT À TROUVER LA BASE, PAS À POSER UNE CLÉ DE
        // COMPARAISON. Essayé le 28/09/2026 et annulé le jour même : deux
        // mots communs et un prix du même ordre suffisent à rapprocher
        // « Pepsi Zéro » de « Coca-Cola Zéro », et un « Orange » en 33 cl
        // de « Pago orange 20 cl ». Le prix au litre étant voisin sur
        // toutes les canettes, le garde-fou du facteur 2 ne filtre RIEN
        // dans cette famille — il ne protège que contre les erreurs
        // grossières, pas contre la confusion entre deux sodas.
        //
        // C'est la règle de la 0151, et elle vaut ici comme ailleurs :
        // la suggestion se calcule, la DÉCISION s'enregistre. Les clés se
        // posent à la main dans /admin/tarifs-fournisseurs.
        decisions.push({ c, base: best.base, n: best.n, parRef: best.parRef, unite: f.unite,
          par: `ancrage (${proches[0].nom.slice(0, 26)})` })
        continue
      }
    }

    // ③ FOURCHETTE OBSERVÉE, avec marge
    const [lo, hi] = BANDE[f.unite]
    const dedans = evalues.filter(x => x.parRef >= lo && x.parRef <= hi)
    const dehorsLoin = evalues.filter(x => x.parRef < lo / MARGE || x.parRef > hi * MARGE)
    if (dedans.length === 1 && dehorsLoin.length === evalues.length - 1) {
      decisions.push({ c, base: dedans[0].base, n: dedans[0].n, parRef: dedans[0].parRef, unite: f.unite, par: 'fourchette observée' })
      continue
    }
    decisions.push({ c, base: null, unite: f.unite,
      par: dedans.length > 1 ? `ambiguë (${dedans.map(x => x.base).join('/')})` : 'aucune base plausible' })
  }

  const prises = decisions.filter(d => d.base)
  console.log('\n══ BASE DE PRIX DES LIGNES EURO-CASH CHIFFRÉES ══\n')
  console.log(`${euro.length} lignes chiffrées · ${prises.length} tranchées · ${euro.length - prises.length} laissées à confirmer\n`)
  const parMotif = {}
  for (const d of decisions) {
    const k = d.base ? `${d.base} — ${d.par.split(' (')[0]}` : d.par.split(' (')[0]
    parMotif[k] = (parMotif[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(parMotif).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }

  console.log('\n── CONTRÔLE sur les lignes dont la base est DÉJÀ prouvée ──')
  const connues = { '57003': 'unite', '53850': 'unite', '53860': 'unite', '28500': 'colis' }
  let justes = 0
  for (const [ref, attendu] of Object.entries(connues)) {
    const d = decisions.find(x => x.c.reference === ref)
    const ok = d?.base === attendu
    if (ok) justes++
    console.log(`  ${ok ? '✓' : '✗'} ${d?.c.designation.slice(0, 22).padEnd(24)} déduit « ${d?.base ?? '—'} » · attendu « ${attendu} »  ${d?.par ?? ''}`)
  }
  if (justes < Object.keys(connues).length) {
    console.log('\n✗ La déduction se trompe sur une base PROUVÉE : rien n’est écrit.')
    process.exit(1)
  }

  const surveille = decisions.filter(d => d.c.colis_libelle === 'c-4x10x20cl')
  console.log('\n── Le cas du PACK INTÉRIEUR (c-4x10x20cl) ──')
  for (const d of surveille.slice(0, 3)) {
    console.log(`  ${d.c.designation.slice(0, 20).padEnd(22)} ${Number(d.c.prix_ht).toFixed(2)} → `
      + `${d.base ?? '— non tranché'}${d.parRef ? ` = ${d.parRef.toFixed(2)} €/${d.unite}` : ''}  · ${d.par}`)
  }

  console.log('\n── 12 exemples tranchés ──')
  for (const d of prises.slice(0, 12)) {
    console.log(`  ${d.c.designation.slice(0, 26).padEnd(28)} ${(d.c.colis_libelle ?? '').padEnd(13)} `
      + `${Number(d.c.prix_ht).toFixed(2).padStart(7)} → ${d.base.padEnd(6)} = ${d.parRef.toFixed(2)} €/${d.unite}  · ${d.par}`)
  }

  if (!ECRIRE) {
    console.log('\n\n── ESSAI À BLANC — rien n’a été écrit. ──\n')
    return
  }

  console.log('\n── ÉCRITURE ──\n')
  let n = 0
  for (const d of prises) {
    const corps = {
      unite: d.base === 'unite' ? 'unité' : d.base === 'pack' ? `pack de ${d.n}` : `colis de ${d.n}`,
      // ⚠️ La contenance enregistrée est celle de la BASE : un colis de 24
      // bouteilles de 33 cl fait 7,92 L. C'est elle qui rend la ligne
      // comparable, et s'y tromper compare un colis à une bouteille.
      contenance_valeur: Number((d.n * (facteurs(d.c.colis_libelle).contenance)).toFixed(4)),
      contenance_unite: d.unite,
    }
    const r = await fetch(`${U}/rest/v1/catalogue_fournisseur?id=eq.${d.c.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(corps),
    })
    if (r.ok) n++; else console.log(`  ✗ ${d.c.designation} : ${(await r.text()).slice(0, 120)}`)
  }
  console.log(`  ✓ ${n} base(s) de prix posée(s) sur ${prises.length}.`)
  console.log('  ⚠️ AUCUNE clé de comparaison n’est posée : une base connue ne dit')
  console.log('     pas À QUOI la ligne se compare. Les clés se posent à la main')
  console.log('     dans /admin/tarifs-fournisseurs (règle de la 0151).')
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
