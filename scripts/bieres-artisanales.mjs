// Bières artisanales en bouteille — deux références de La Rade (Toulon),
// validées par le gérant le 21/09/2026 (pas de blanche : on entre dans
// l'automne). Coûts relevés sur Eazle le même jour : prix remisé + droits
// d'accises, ramenés à la bouteille (carton de 24 × 33 cl, verre perdu —
// aucune consigne). Les montants négociés restent hors dépôt ; seul le coût
// unitaire calculé est écrit en base, comme pour le reste du bar.
//
// Prix : 5,00 € TTC — au-dessus de la marge du demi, la règle « rien ne
// rapporte moins que le demi » tient, et 33 cl artisanal à 5 € ne paraît pas
// cher à côté de la pinte à 5,20 €.
//
//   node scripts/bieres-artisanales.mjs [--ecrire]
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
if (!fs.existsSync(FICHIER_COUTS)) { console.log(`✗ ${FICHIER_COUTS} absent — rien n'est écrit.`); process.exit(1) }
const COUTS = JSON.parse(fs.readFileSync(FICHIER_COUTS, 'utf8'))
const TTC = 5.00
const BIERES = [
  // [nom, matière comptée, référence France Boissons, coût HT par bouteille]
  ['Rade Girelle 33 cl', 'Rade Girelle 5° VP 33 cl', '124886', COUTS['Rade Girelle 33 cl']],
  ['Rade Naïade 33 cl',  'Rade Naïade 6,5° VP 33 cl', '124890', COUTS['Rade Naïade 33 cl']],
]

const [pdv] = await sb('etablissements?select=id&slug=eq.bar')
if (!pdv) { console.log('✗ point de vente « bar » introuvable'); process.exit(1) }
const deja = new Set(((await sb('recettes?select=nom&tag_destination=eq.BAR')) ?? []).map(r => r.nom))
const ht = Math.round(TTC / 1.2 * 10000) / 10000

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const lignes = []
for (const [nom, matiere, ref, cout] of BIERES) {
  if (deja.has(nom)) { console.log(`  = ${nom} existe déjà`); continue }
  console.log(`  + ${nom.padEnd(20)} ${TTC.toFixed(2)} € · coût ${cout.toFixed(2)} € · marge ${(ht - cout).toFixed(2)} € HT · food cost ${(cout / ht * 100).toFixed(0)} %`)
  lignes.push({
    nom, nom_caisse: nom, categorie: 'Bière', tag_destination: 'BAR', etablissement_id: pdv.id,
    tva: 20, prix_vente_ht: ht, cout_achat_ht: cout, contient_alcool: true,
    actif: true, vendable_online: false, // alcool : pas de click & collect
    nb_portions: 1, temps_preparation: 0, type_revenu: 'vente',
    nom_matiere: matiere, unites_par_achat: 1, reference_fournisseur: ref,
    allergenes_complementaires: ['gluten'], // bière : par définition ; non signé
  })
}
if (ECRIRE && lignes.length) {
  const r = await sb('recettes', { method: 'POST', body: JSON.stringify(lignes) })
  console.log(`  → ${Array.isArray(r) ? r.length : 0} produit(s) créé(s)`)
} else if (!ECRIRE) console.log('  (rien écrit — relancer avec --ecrire)')
