// Poser les rapprochements ÉVIDENTS entre le catalogue Félix Potin et nos
// matières, et seulement ceux-là.
//
//   node scripts/rapprocher-tarifs-felix-potin.mjs [--ecrire]
//
// ⚠️ Un rapprochement ne déplace AUCUN prix — il met deux lignes côte à côte
// dans /admin/tarifs-fournisseurs. Le risque n'est donc pas d'écrire un faux
// prix d'achat, mais d'afficher un « moins cher » qui compare deux produits
// différents ; il se défait d'un clic.
//
// ⚠️ CE QUI EST VOLONTAIREMENT LAISSÉ DE CÔTÉ, et pourquoi :
//
//   · « BEURRE DOUX LEGER TARTIN 40% » ≠ notre beurre doux. Un beurre allégé
//     à 40 % de matière grasse n'a ni le même usage ni le même rendement en
//     cuisine : le dire moins cher serait comparer deux produits.
//   · « RAPE MOZZARELLA 60% EMMENTAL 40% » est un MÉLANGE. Il n'est ni notre
//     emmental râpé ni notre mozzarella râpée.
//   · « JAMBON CUIT SUP AC 8K » est une pièce entière à trancher, pas du
//     jambon tranché : le prix au kilo est plus bas parce que le travail
//     reste à faire.
//   · « MOZZARELLA 23% VACHE 1K » est un bloc, notre matière est « Mozzarella
//     en tranches ». Même produit, mais pas le même état — et c'est l'état
//     qui explique l'écart de prix.
//
// Ces trois-là se posent à la main, en connaissance de cause, depuis l'écran.

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

// [référence Félix Potin, nom exact de notre matière]
// La référence, pas le libellé : c'est elle qui ne bouge pas d'un devis à
// l'autre, et c'est déjà la règle du rapprochement des factures (0142).
const LIENS = [
  ['63470',  'Beurre doux'],              // BEURRE DOUX 82% 250G — vrai beurre
  ['46928',  'Emmental râpé'],            // EMMENTAL RAPE 27% 1K SFF
  ['46798',  'Emmental râpé'],            // EMMENTAL RAPE STAND 27% 1K VALMA
  ['64417',  'Mozzarella cerise'],        // MOZZARELLA CERISE 5G SEAU 1K
  ['26660',  'Rosette de Lyon'],          // ROSETTE S/AT 50TR 500G
  ['165365', 'Rosette de Lyon'],          // ROSETTE LYON 2X25TR 500G
  ['115748', 'Jambon cru Serrano'],       // COPPA — écarté plus bas
  ['142374', 'Jambon cru Serrano'],       // JAMBON SERRANO A/INT TR 500G
  ['554523', 'Jambon cru Serrano'],       // JAMBON SERRANO STG TR 500G
  ['58171',  'Jambon blanc tranché'],     // JAMBON SUP DD TR S/AT 50GX20
  ['58170',  'Jambon blanc tranché'],     // JAMBON CUIT DD CHOIX PARIS TR 40GX25
  ['114168', 'Huile d’olive'],            // HUILE OLIVE VIERGE EXT PET 5L
  ['120741', 'Sauce pizza'],              // SAUCE PIZZA AROMATISEE 5/1 SFF
  ['178380', 'Sauce pizza'],              // SAUCE AROMA TOMATE PIZZA 5/1 MARTIN
  ['238507', 'Sauce barbecue'],           // SAUCE BARBECUE 850G
  ['238513', 'Sauce kebab'],              // SAUCE BLANCHE PITTA KEBAB 850G
  ['238514', 'Sauce burger'],             // SAUCE BURGER 850G
  ['41412',  'Sauce mayonnaise'],         // MAYONNAISE 4K65 T&T
  ['185489', 'Thon listao'],              // THON LISTAO NAT POCHE 600G SAUPIQUET
  ['248795', 'Thon listao'],              // THON LISTAO MX NAT POCHE 600G MARTINS
  ['185398', 'Olives noires'],            // OLIVE NOIRE DENOY GREC 2K2
  ['180396', 'Origan'],                   // HERBE PROVENCE 1K — écarté plus bas
]

// Retirés après relecture : la coppa n'est pas du serrano, et les herbes de
// Provence ne sont pas de l'origan. Les laisser aurait fait dire à l'écran
// « moins cher » sur deux produits qu'on n'achète pas.
const ECARTES = new Set(['115748', '180396'])
const liens = LIENS.filter(([ref]) => !ECARTES.has(ref))

const [f] = await sb('fournisseurs?select=id&nom=eq.' + encodeURIComponent('Félix Potin Provence'))
if (!f) { console.error('Fournisseur absent — lancer d’abord import-devis-felix-potin.mjs --ecrire'); process.exit(1) }

const tarifs = await sb(`catalogue_fournisseur?select=id,reference,designation,prix_ht,unite,cle_comparaison,ingredient_id&fournisseur_id=eq.${f.id}`)
const matieres = await sb('ingredients?select=id,nom,unite,prix_achat_ht&stocke=eq.true&actif=eq.true')
const parRef = new Map(tarifs.map(t => [t.reference, t]))
const parNom = new Map(matieres.map(m => [m.nom, m]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const plan = [], absents = []
for (const [ref, nom] of liens) {
  const t = parRef.get(ref), m = parNom.get(nom)
  if (!t || !m) { absents.push(`${ref} → ${nom} (${!t ? 'tarif' : 'matière'} introuvable)`); continue }
  if (t.cle_comparaison === nom && t.ingredient_id === m.id) continue
  plan.push({ id: t.id, ref, nom, m, t })
}
for (const p of plan) {
  console.log(`  ${p.ref.padEnd(7)} ${p.t.designation.slice(0, 46).padEnd(48)} → ${p.nom}`)
  console.log(`  ${''.padEnd(7)} ${String(p.t.prix_ht).padStart(9)} €/${String(p.t.unite).padEnd(8)} contre ${String(p.m.prix_achat_ht).padStart(8)} €/${p.m.unite}`)
}
console.log(`\n  à poser : ${plan.length}`)
if (absents.length) console.log(`  ⚠️ ${absents.length} non trouvé(s) :\n     ${absents.join('\n     ')}`)
console.log(`  écartés volontairement : ${[...ECARTES].join(', ')} (coppa ≠ serrano, herbes de Provence ≠ origan)`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
for (const p of plan) {
  await sb('catalogue_fournisseur?id=eq.' + p.id, { method: 'PATCH',
    body: JSON.stringify({ cle_comparaison: p.nom, ingredient_id: p.m.id, updated_at: new Date().toISOString() }) })
}
console.log(`\n  → ${plan.length} rapprochement(s) posé(s). Aucun prix n’a bougé.\n`)
