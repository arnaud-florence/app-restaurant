// Compléments de la carte du bar — validés par le gérant le 21/09/2026.
//
// Ce qu'un bar de village du Var ne peut pas ne pas avoir : le 51 à côté du
// Ricard, les pastis « de couleur » (mauresque, tomate, perroquet), le rosé
// pamplemousse, le Martini rouge, un rhum ambré, la tequila des soirées, le jus
// de tomate — et quelques digestifs pour le restaurant et la pizzeria.
//
// Coûts relevés sur Eazle le même jour : prix remisé + droits MESURÉS produit
// par produit (écart du total à chaque ajout). Deux surprises : le rhum
// Negrita paie des droits réduits (rhum des DOM), et le Martini Rosso est sous
// CRD (droits déjà dans le prix).
//
// ⚠️ Les coûts sont lus dans data/france-boissons-couts-unitaires-*.json,
// HORS DÉPÔT : ce sont des conditions NÉGOCIÉES et le dépôt est public. Sans
// ce fichier sur le poste, le script refuse d'écrire plutôt que d'inventer.
//
// Pastis de couleur : coût calculé avec le Ricard (pastis de la maison), 2 cl
// de pastis + 2 cl de sirop. Planteur : 4 cl rhum ambré + 8 cl ananas + 8 cl
// nectar d'orange + 1 cl grenadine.
//
//   node scripts/complements-bar.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); return t ? JSON.parse(t) : null
}

const FICHIER_COUTS = 'data/france-boissons-couts-unitaires-2026-09-21.json'
if (!fs.existsSync(FICHIER_COUTS)) { console.log(`✗ ${FICHIER_COUTS} absent — coûts négociés introuvables, rien n'est écrit.`); process.exit(1) }
const COUTS = JSON.parse(fs.readFileSync(FICHIER_COUTS, 'utf8'))
const cout = nom => { const c = COUTS[nom]; if (c == null) throw new Error('coût absent du relevé local : ' + nom); return c }

const A = true, S = false
const PRODUITS = [
  // [nom, famille, TTC, TVA, alcool, coût, matière, unités/achat, réf FB, allergènes]
  ['Pastis 51 2 cl',        'Apéritif', 2.50, 20, A, cout('Pastis 51 2 cl'), 'Pastis 51 1 L', 50, '53636', []],
  ['Mauresque',             'Apéritif', 2.80, 20, A, cout('Mauresque'), null, null, null, []],
  ['Tomate',                'Apéritif', 2.80, 20, A, cout('Tomate'), null, null, null, []],
  ['Perroquet',             'Apéritif', 2.80, 20, A, cout('Perroquet'), null, null, null, []],
  ['Rosé pamplemousse',     'Apéritif', 3.00, 20, A, cout('Rosé pamplemousse'), null, null, null, ['sulfites']],
  ['Martini rouge 4 cl',    'Apéritif', 3.00, 20, A, cout('Martini rouge 4 cl'), 'Martini Rosso 1 L', 25, '122981', ['sulfites']],
  ['Rhum ambré 4 cl',       'Alcool',   5.00, 20, A, cout('Rhum ambré 4 cl'), 'Rhum ambré Negrita 1 L', 25, '88969', []],
  ['Tequila 4 cl',          'Alcool',   5.00, 20, A, cout('Tequila 4 cl'), 'Tequila Sierra 70 cl', 17.5, '121435', []],
  // Le shot sort de la même bouteille : 35 doses de 2 cl.
  ['Shot tequila 2 cl',     'Alcool',   3.00, 20, A, cout('Shot tequila 2 cl'), 'Tequila Sierra 70 cl', 35, '121435', []],
  ['Limoncello 4 cl',       'Alcool',   4.00, 20, A, cout('Limoncello 4 cl'), 'Limoncello Ramazzotti 70 cl', 17.5, '125186', []],
  ['Cognac 4 cl',           'Alcool',   6.00, 20, A, cout('Cognac 4 cl'), 'Cognac Gautier VS 70 cl', 17.5, '17706', []],
  ['Amaretto 4 cl',         'Alcool',   5.00, 20, A, cout('Amaretto 4 cl'), 'Amaretto Disaronno 70 cl', 17.5, '24472', []],
  ['Baileys 4 cl',          'Alcool',   5.00, 20, A, cout('Baileys 4 cl'), 'Baileys 70 cl', 17.5, '11264', ['lait']],
  ['Marc de Provence 4 cl', 'Alcool',   5.00, 20, A, cout('Marc de Provence 4 cl'), 'Marc de Provence Garlaban 70 cl', 17.5, '114952', []],
  ['Cointreau 4 cl',        'Alcool',   5.00, 20, A, cout('Cointreau 4 cl'), 'Cointreau 70 cl', 17.5, '11266', []],
  // Le jus de tomate est une boisson SANS alcool : 10 % sur place.
  ['Jus de tomate 25 cl',   'Boisson fraîche', 2.80, 10, S, cout('Jus de tomate 25 cl'), 'Jus de tomate Granini 25 cl', 1, '124468', []],
  // ── Softs oubliés (21/09/2026) — verre consigné, taxe soda comprise ──
  ['Schweppes Agrumes 25 cl', 'Boisson fraîche', 2.80, 10, S, cout('Schweppes Agrumes 25 cl'), 'Schweppes Agrumes VC 25 cl', 1, '87892', []],
  // Le tonic était commandé sans fiche : impossible de le vendre seul.
  ['Schweppes Tonic 25 cl',   'Boisson fraîche', 2.80, 10, S, cout('Schweppes Tonic 25 cl'), 'Schweppes Tonic VC 25 cl', 1, '87881', []],
  ["Jus d'abricot 25 cl",     'Boisson fraîche', 2.80, 10, S, cout("Jus d'abricot 25 cl"), 'Minute Maid abricot VC 25 cl', 1, '122384', []],
  ["Jus d'ananas 25 cl",      'Boisson fraîche', 2.80, 10, S, cout("Jus d'ananas 25 cl"), 'Minute Maid ananas VC 25 cl', 1, '119147', []],
  ['Planteur',              'Apéritif', 6.00, 20, A, cout('Planteur'), null, null, null, []],
]

const [pdv] = await sb('etablissements?select=id&slug=eq.bar')
if (!pdv) { console.log('✗ point de vente « bar » introuvable'); process.exit(1) }
const deja = new Set(((await sb('recettes?select=nom&actif=eq.true')) ?? []).map(r => r.nom))
const r4 = n => Math.round(n * 10000) / 10000, f2 = n => n.toFixed(2).replace('.', ',')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const lignes = []
for (const [nom, cat, ttc, tva, alc, cout, matiere, parAchat, ref, allerg] of PRODUITS) {
  if (deja.has(nom)) { console.log(`  = ${nom} existe déjà`); continue }
  const ht = r4(ttc / (1 + tva / 100))
  console.log(`  + ${nom.padEnd(24)} ${f2(ttc).padStart(5)} € · coût ${f2(cout)} · marge ${f2(ht - cout)} € HT · ${Math.round(cout / ht * 100)} %`)
  lignes.push({
    nom, nom_caisse: nom, categorie: cat, tag_destination: 'BAR', etablissement_id: pdv.id,
    tva, prix_vente_ht: ht, cout_achat_ht: r4(cout), contient_alcool: alc,
    actif: true, vendable_online: false, nb_portions: 1, temps_preparation: 0, type_revenu: 'vente',
    // Mêmes clés sur toutes les lignes : un insert groupé PostgREST l'exige
    // (PGRST102). Les composites n'ont pas de matière — on écrit NULL.
    nom_matiere: matiere, unites_par_achat: parAchat ?? 1, reference_fournisseur: ref,
    // Proposé, jamais signé : allergenes_valides_le reste NULL.
    allergenes_complementaires: allerg,
  })
}
if (ECRIRE && lignes.length) {
  const r = await sb('recettes', { method: 'POST', body: JSON.stringify(lignes) })
  if (!Array.isArray(r)) { console.log("  ✗ refusé :", JSON.stringify(r)); process.exit(1) }
  console.log(`\n  → ${r.length} produit(s) créé(s)`)
} else if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)')
