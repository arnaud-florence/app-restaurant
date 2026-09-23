// France Boissons est le canal, Lavazza est la marque.
//
//   node scripts/catalogue-france-boissons.mjs [--ecrire]
//
// Deux choses, et elles tiennent ensemble :
//
//   1. le café Lavazza se commande CHEZ France Boissons (précision du gérant,
//      23/09/2026). « Lavazza » figurait comme fournisseur à part, avec deux
//      factures et six articles — la comparaison désignait donc un
//      fournisseur qui n'en est pas un, et une commande partie de là serait
//      allée à la mauvaise adresse ;
//
//   2. France Boissons n'avait aucun tarif dans l'outil alors qu'on a relevé
//      ses prix référence par référence sur Eazle le 21/09.
//
// ⚠️ ON DÉSACTIVE, ON NE SUPPRIME PAS. Les deux factures d'août sont des
// pièces comptables : elles sont RATTACHÉES à France Boissons, avec la raison
// écrite dans leurs notes, jamais effacées. La fiche Lavazza reste en base,
// désactivée — la supprimer emporterait l'historique.
//
// ⚠️ AUCUNE CONTENANCE N'EST DÉDUITE DES LIBELLÉS France Boissons. Une
// bouteille s'y écrit « 70cl », « 1L », « VC33 », « 75 » ou rien du tout :
// quatre conventions pour la même idée. En inventer une donnerait un prix au
// litre faux, affiché comme les autres. Le prix est celui de l'unité VENDUE ;
// l'écran demandera la contenance le jour où il faudra comparer.
//
// ⚠️ Les prix viennent de `data/france-boissons-*.json`, GITIGNORÉS : ce sont
// des conditions négociées et le dépôt est public. Le script refuse de
// tourner sans eux.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const F_RELEVE = 'data/france-boissons-releve-2026-09-21.json'
const F_COUTS  = 'data/france-boissons-couts-unitaires-2026-09-21.json'
for (const f of [F_RELEVE, F_COUTS]) {
  if (!fs.existsSync(f)) {
    console.error(`\n  ✗ ${f} absent. Les conditions négociées vivent hors dépôt ; sans elles, rien à écrire.\n`)
    process.exit(1)
  }
}
const releve = JSON.parse(fs.readFileSync(F_RELEVE, 'utf8'))
const couts = JSON.parse(fs.readFileSync(F_COUTS, 'utf8'))
const DATE = '2026-09-21'
const SOURCE = 'Relevé Eazle du 21/09/2026'

const [fb] = await sb('fournisseurs?select=id,nom&nom=eq.' + encodeURIComponent('France Boissons'))
const [lav] = await sb('fournisseurs?select=id,nom,actif&nom=eq.Lavazza')
if (!fb) { console.error('France Boissons introuvable'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)

// ─── 1. Le canal du café ─────────────────────────────────────────
let factures = [], catLav = []
if (lav) {
  factures = await sb(`factures_fournisseurs?select=id,numero,date_emission,montant_ht,notes&fournisseur_id=eq.${lav.id}`)
  catLav = await sb(`catalogue_fournisseur?select=id,designation&fournisseur_id=eq.${lav.id}`)
  console.log(`  Lavazza → France Boissons`)
  for (const f of factures) console.log(`     facture ${f.numero} du ${f.date_emission} (${f.montant_ht} €)`)
  console.log(`     ${catLav.length} article(s) au catalogue`)
  console.log(`     la fiche Lavazza sera DÉSACTIVÉE, pas supprimée\n`)
} else console.log('  (aucun fournisseur « Lavazza » — rien à rattacher)\n')

// ─── 2. Le tarif France Boissons ─────────────────────────────────
//
// `units` est le NOMBRE d'unités dans le colis, pas une contenance : un fût
// de 20 L donne units=20 (des litres), une caisse de 24 bouteilles donne
// units=24 (des bouteilles). Diviser par lui rend le prix de l'unité VENDUE,
// ce qui est vrai dans les deux cas.
//
// ⚠️ Le coût réel est le prix REMISÉ + les DROITS d'accises. Les droits ne se
// récupèrent pas comme la TVA : sur un spiritueux ils pèsent autant que la
// bouteille. La consigne, elle, n'est pas un coût — elle revient.
const refDe = c => String(c ?? '').match(/Réf\.\s*(\d+)/)?.[1] ?? null
const rows = []
for (const r of releve) {
  const units = Number(r.units) || 1
  const total = Number(r.remise ?? 0) + Number(r.droits ?? 0)
  if (!total) continue
  const auLitre = r.uniteVente === 'fut' && /Litre\(s\)/.test(String(r.conditionnement))
  rows.push({
    fournisseur_id: fb.id,
    reference: refDe(r.conditionnement) ?? r.cle,
    designation: `${r.nom} — ${r.cle}`,
    famille: 'Boissons',
    unite: auLitre ? 'L' : 'contenant',
    prix_ht: Number((total / units).toFixed(4)),
    colis_quantite: units,
    colis_libelle: r.uniteVente ?? null,
    contenance_valeur: null,   // voir l'avertissement en tête de fichier
    contenance_unite: null,
    cle_comparaison: null,
    ingredient_id: null,
    recette_id: null,
    date_tarif: DATE,
    source: SOURCE,
    nature: 'devis',
    actif: true,
  })
}

// Les matières dont l'unité est écrite dans la clé : celles-là sont sûres.
const MATIERES = {
  '_ingredient:Café grains Lavazza Gold Selection (kg)': { nom: 'Café en grains Lavazza Gold Selection', unite: 'kg' },
  '_ingredient:Café déca moulu (kg)':                    { nom: 'Café déca moulu', unite: 'kg' },
  '_ingredient:Chocolat poudre espresso (kg)':           { nom: 'Chocolat en poudre espresso', unite: 'kg' },
  '_ingredient:Sucre bûchette (pièce)':                  { nom: 'Sucre en bûchette', unite: 'piece' },
  '_ingredient:Sirop (litre)':                           { nom: 'Sirop Teisseire', unite: 'L' },
}
for (const [cle, m] of Object.entries(MATIERES)) {
  const prix = couts[cle]
  if (!prix) continue
  rows.push({
    fournisseur_id: fb.id, reference: `FB-${m.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    designation: m.nom, famille: 'Café & épicerie', unite: m.unite, prix_ht: Number(prix),
    colis_quantite: null, colis_libelle: null, contenance_valeur: null, contenance_unite: null,
    cle_comparaison: null, ingredient_id: null, recette_id: null,
    date_tarif: DATE, source: SOURCE, nature: 'devis', actif: true,
  })
}

console.log(`  France Boissons : ${rows.length} tarif(s)`)
console.log(`     ${rows.filter(r => r.famille === 'Boissons').length} références bar (prix remisé + droits, à l'unité vendue)`)
console.log(`     ${rows.filter(r => r.famille !== 'Boissons').length} matières café & épicerie`)
for (const r of rows.filter(r => r.famille !== 'Boissons'))
  console.log(`        ${r.designation.padEnd(38)} ${String(r.prix_ht).padStart(8)} €/${r.unite}`)
console.log(`\n  ⚠️ Aucune contenance déduite : « 70cl », « 1L », « VC33 », « 75 » —`)
console.log(`     quatre écritures pour la même idée. L'écran la demandera si besoin.`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

if (lav) {
  const note = ` — Rattachée à France Boissons le 23/09/2026 : le café Lavazza se commande chez France Boissons (précision du gérant). Fournisseur d'origine enregistré : Lavazza.`
  for (const f of factures) {
    await sb('factures_fournisseurs?id=eq.' + f.id, { method: 'PATCH',
      body: JSON.stringify({ fournisseur_id: fb.id, notes: (f.notes ?? '') + note }) })
  }
  if (catLav.length) {
    await sb(`catalogue_fournisseur?fournisseur_id=eq.${lav.id}`, { method: 'PATCH',
      body: JSON.stringify({ fournisseur_id: fb.id, source: 'Facture Lavazza, commandée via France Boissons' }) })
  }
  await sb('fournisseurs?id=eq.' + lav.id, { method: 'PATCH', body: JSON.stringify({
    actif: false,
    conditions_tarifaires: 'Marque, pas fournisseur : le café Lavazza se commande chez France Boissons. Fiche désactivée le 23/09/2026, conservée pour l’historique.',
  }) })
  console.log(`\n  → ${factures.length} facture(s) et ${catLav.length} article(s) rattachés ; fiche Lavazza désactivée.`)
}

const ecrites = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif',
  { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows) })
console.log(`  → ${ecrites.length} tarif(s) France Boissons enregistré(s).\n`)
