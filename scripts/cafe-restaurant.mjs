// Le café du SERVICE DU SOIR — deux fiches (22/09/2026).
//
// Décision du gérant : 1,40 € le café au comptoir et le midi, 1,80 € servi à
// table au service du soir. Ce n'est pas l'HEURE qui change le prix, c'est le
// SERVICE : un client au comptoir à 21 h paie 1,40 €.
//
// ⚠️ Deux prix imposent DEUX BOUTONS en caisse. Un seul bouton et l'équipe
// tape au jugé : on ne saurait jamais ce qui a été vendu, et le client du soir
// paierait parfois 1,40 €, parfois 1,80 €, sans règle lisible.
//
// ⚠️ Les deux prix doivent être AFFICHÉS, chacun à sa place : 1,40 € sur
// l'ardoise du bar et l'affichage extérieur obligatoire, 1,80 € sur la carte du
// restaurant. Le client a droit au prix affiché.
//
// Le café gourmand est le vrai levier du soir : il coûte trois fois le café et
// rapporte trois fois plus. Il utilise les mignardises du Fournil — celles qui
// seraient jetées le lendemain.
//
//   node scripts/cafe-restaurant.mjs [--ecrire]
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
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(`${p} → ${j?.message ?? r.status}`); return j
}

// Le coût du café vient de la fiche déjà chiffrée (grains + sucre) : une seule
// source, elle suivra si le mélange ou la dose changent.
const [cafe] = await sb('recettes?select=cout_achat_ht&nom=eq.Caf%C3%A9%20expresso&actif=eq.true')
const COUT_CAFE = Number(cafe?.cout_achat_ht ?? 0)
if (!COUT_CAFE) { console.log('✗ coût du café expresso introuvable — lancer d\'abord cafe-grains.mjs'); process.exit(1) }

// Trois mignardises prises au plus bas de la vitrine (cannelé, madeleine,
// donut) : moyenne des coûts d'achat réels du Fournil.
const petits = await sb('recettes?select=nom,cout_achat_ht&actif=eq.true&categorie=in.(Gourmandise,P%C3%A2tisserie)&cout_achat_ht=lt.0.8&cout_achat_ht=gt.0')
const COUT_MIGN = petits.length ? petits.reduce((s, r) => s + Number(r.cout_achat_ht), 0) / petits.length : 0.6
const COUT_GOURMAND = COUT_CAFE + 3 * COUT_MIGN

const [pdv] = await sb('etablissements?select=id&slug=eq.le-relais-des-saveurs')
const deja = new Set((await sb('recettes?select=nom')).map(r => r.nom))
const f2 = n => n.toFixed(2).replace('.', ',')

const FICHES = [
  ['Café servi à table', 'Boisson chaude', 1.80, COUT_CAFE,
    "Service du soir, à table. Le café du comptoir et du midi reste à 1,40 € : c'est le service qui change, pas l'heure."],
  ['Café gourmand', 'Dessert', 5.50, COUT_GOURMAND,
    `Un café + trois mignardises de la vitrine du Fournil (cannelé, madeleine, donut ou l'équivalent du jour).\nServir le café en même temps que l'assiette, sucre à côté.\nUtiliser en priorité ce qui ne passera pas la journée : c'est la vocation de ce dessert.`],
]

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
console.log(`  café : ${f2(COUT_CAFE)} € · mignardise moyenne : ${f2(COUT_MIGN)} € (${petits.map(p => p.nom).join(', ')})\n`)
const lignes = []
for (const [nom, cat, ttc, cout, procedure] of FICHES) {
  const ht = Math.round(ttc / 1.1 * 10000) / 10000
  if (deja.has(nom)) { console.log(`  = ${nom} existe déjà`); continue }
  console.log(`  + ${nom.padEnd(20)} ${f2(ttc)} € · coût ${f2(cout)} · marge ${f2(ht - cout)} € HT · food cost ${Math.round(cout / ht * 100)} %`)
  lignes.push({
    nom, nom_caisse: nom, categorie: cat, tag_destination: 'CUISINE', etablissement_id: pdv.id,
    tva: 10, prix_vente_ht: ht, cout_achat_ht: Math.round(cout * 10000) / 10000,
    contient_alcool: false, actif: true, vendable_online: false,
    nb_portions: 1, temps_preparation: 2, type_revenu: 'vente', procedure,
    nom_matiere: null, unites_par_achat: 1, reference_fournisseur: null,
    allergenes_complementaires: nom === 'Café gourmand' ? ['gluten', 'lait', 'oeufs'] : [],
  })
}
if (ECRIRE && lignes.length) {
  const r = await sb('recettes', { method: 'POST', body: JSON.stringify(lignes) })
  console.log(`\n  → ${r.length} fiche(s) créée(s)`)
} else if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)')
