// Trois règles enfreintes par le travail du 02/10, et leurs correctifs.
//
// Trouvées par `test-tarifs-fournisseurs.mjs` et `test-achats.mjs`. Chacune
// existait AVANT, avec sa raison écrite : ce sont mes écritures du jour qui
// les ont cassées, pas les tests qui sont trop stricts.
//
//   node scripts/corriger-regressions-krill.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — régressions du 02/10 ──\n`)

// ── 1. Une unité de stock doit DIRE sa contenance ────────────────────
// ⚠️ « bouteille » tout court ne se compare à rien : deux prix justes, et
// l'écran affiche « unités différentes ». On PRÉCISE l'unité sans la changer —
// « bouteille » devient « bouteille 70 cl ». La contenance est lue dans le NOM
// du produit, jamais devinée.
//
// ⚠️ Le chocolat en poudre garde « pièce » : le libellé Krill ne donne AUCUN
// poids (« CHOCOLAT ESPRESSO BOITE POUDRE »). « pièce » ne promet rien ;
// « boîte » promettrait un contenant dont on ignore la taille.
const UNITES = [
  ['Aperol 1 L', 'bouteille 1 L'],
  ['Get 31 70 cl', 'bouteille 70 cl'],
  ['Crème de cassis 70 cl', 'bouteille 70 cl'],
  ['Prosecco Scalini 75 cl', 'bouteille 75 cl'],
  ['Café déca moulu 250 g', 'boîte 250 g'],
  ['Bûchettes de sucre (700)', 'boîte 700'],
  ['Tube CO2 5 kg', 'bouteille 5 kg'],
  ['Chocolat en poudre', 'pièce'],
]
console.log('1. les unités de stock doivent dire leur contenance')
for (const [nom, unite] of UNITES) {
  const [m] = await sb(`ingredients?nom=eq.${encodeURIComponent(nom)}&select=id,nom,unite`)
  if (!m) { console.log(`   = ${nom} introuvable`); continue }
  console.log(`   ${m.unite === unite ? '=' : '→'} ${nom.padEnd(26)} « ${m.unite} » → « ${unite} »`)
  if (ECRIRE && m.unite !== unite) await sb(`ingredients?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ unite }) })
}

// ── 2. Une ligne tarifée À LA PIÈCE ne porte pas de contenance ───────
// ⚠️ Le prix d'une ligne facturée à la pièce EST déjà le prix de référence.
// Lui coller le poids lu dans le libellé le transforme en €/kg — et c'est
// exactement ce qui a fait divorcer les bases sur le Paris-Brest et la sauce
// pizza. J'avais posé 0,12 kg sur la tartelette Carigel en croyant rendre la
// comparaison possible : je l'ai rendue incomparable avec les autres lignes.
console.log('\n2. une ligne tarifée à la pièce ne porte pas de poids')
for (const frag of ['TARTELETTE CITRON MERINGUEE 120G', 'TARTELETTE CITRON MERINGUEE DIAM 9']) {
  const ls = await sb(`catalogue_fournisseur?designation=ilike.*${encodeURIComponent(frag)}*&unite=eq.piece&contenance_valeur=not.is.null&select=id,designation,contenance_valeur`)
  for (const l of ls) {
    console.log(`   → ${l.designation.slice(0, 46)} : ${l.contenance_valeur} kg retiré`)
    if (ECRIRE) await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({ contenance_valeur: null, contenance_unite: null }) })
  }
  if (!ls.length) console.log(`   = « ${frag} » : rien à retirer`)
}

// ── 3. Une facture n'est JAMAIS un « tarif public » ─────────────────
// ⚠️ « tarif public » ne peut porter que sur un prix AFFICHÉ. Une facture est
// un prix PAYÉ et un devis est chiffré nommément pour CASATASIA : marquer l'un
// des deux « public » effacerait une négociation obtenue. Le fût Affligem
// venait du relevé Eazle — un prix France Boissons est notre prix négocié.
console.log('\n3. une facture n’est jamais un « tarif public »')
const mauvais = await sb(`catalogue_fournisseur?nature=in.(devis,facture)&tarif_negocie=is.false&select=id,designation,nature`)
for (const l of mauvais) {
  console.log(`   → [${l.nature}] ${l.designation.slice(0, 50)} : passe à « remise connue »`)
  if (ECRIRE) await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH', body: JSON.stringify({ tarif_negocie: true }) })
}
if (!mauvais.length) console.log('   = aucune')
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
