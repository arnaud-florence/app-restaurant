// Vente de spiritueux À LA BOUTEILLE — demande du gérant, 02/10/2026.
//
// La logique : une bouteille est une vente d'OCCASION (table d'anniversaire,
// soirée du mois), pas un substitut au verre. Le client doit y gagner
// franchement, sinon il commande au verre et personne n'y pense ; nous devons
// garder un coefficient qui tienne, sinon c'est du chiffre sans marge.
//
// ⚠️ UNE BOUTEILLE RAPPORTE TOUJOURS MOINS QUE SES VERRES, et c'est
// arithmétique : 17,5 doses à 5 € rendent 60,72 € de marge, la bouteille à
// 59 € en rend 36,98. On ne « perd » ces 23,74 € que si le groupe aurait
// vraiment bu dix-sept verres — ce qui n'arrive pas. C'est une vente qui
// n'existerait pas autrement, à une table qui commande aussi des softs.
//
// ⚠️ `unites_par_achat = 1` et la MÊME `nom_matiere` que la dose : la
// bouteille et le verre puisent dans le même stock. L'inventaire les replie
// en une seule ligne (0131) et les sorties se déduisent juste — une dose
// retire 1/17,5 de bouteille, une bouteille en retire une.
//
// ⚠️ `vendable_online = false`, SANS EXCEPTION : pas de contrôle d'âge sur le
// click & collect (0144). Une bouteille d'alcool encore moins qu'un verre.
//
// ⚠️ Les coûts sont au tarif PUBLIC France Boissons — la remise ne figurait
// pas sur la commande du 30/09, signalée au commercial. Si elle s'applique,
// les coûts baissent d'environ un cinquième et les marges montent d'autant.
// On fixe sur ce qu'on paie aujourd'hui : surestimer un coût fait un prix
// prudent, le sous-estimer fait vendre à perte.
//
//   node scripts/bouteilles-spiritueux.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')
const TVA = 20

// Un prix unique pour les cinq standards : au comptoir on ne consulte pas une
// grille, et le client non plus. Le premium a le sien.
const BOUTEILLES = [
  { nom: 'Bouteille de vodka 70 cl',   dose: 'Vodka 4 cl',          ttc: 59, detail: 'Smirnoff' },
  { nom: 'Bouteille de whisky 70 cl',  dose: 'Whisky 4 cl',         ttc: 59, detail: 'Grant’s Triple Wood' },
  { nom: 'Bouteille de gin 70 cl',     dose: 'Gin 4 cl',            ttc: 59, detail: 'Gordon’s' },
  { nom: 'Bouteille de tequila 70 cl', dose: 'Tequila 4 cl',        ttc: 59, detail: 'Sierra Blanco' },
  { nom: 'Bouteille de rhum 70 cl',    dose: 'Rhum 4 cl',           ttc: 59, detail: 'Havana Club 3 ans' },
  // Proposé en plus : un groupe qui demande « une bouteille de whisky »
  // demandera laquelle, et le JD est déjà au verre à 6,50 €.
  { nom: 'Bouteille Jack Daniel’s 70 cl', dose: 'Whisky premium 4 cl', ttc: 79, detail: 'Jack Daniel’s N°7' },
]

const [modele] = await sb('recettes?tag_destination=eq.BAR&categorie=eq.Alcool&actif=eq.true&select=etablissement_id&limit=1')
if (!modele) { console.error('  ✗ aucun produit modèle au bar'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — spiritueux à la bouteille ──\n`)
console.log('  bouteille                     prix   au verre   le client gagne   coût   food cost   marge   coef')
const nouveaux = []
for (const b of BOUTEILLES) {
  const [d] = await sb(`recettes?nom=eq.${encodeURIComponent(b.dose)}&tag_destination=eq.BAR&select=id,nom,prix_vente_ht,tva,cout_achat_ht,unites_par_achat,nom_matiere,reference_fournisseur`)
  if (!d) { console.log(`  ✗ dose « ${b.dose} » introuvable`); continue }
  const n = Number(d.unites_par_achat)                       // doses par bouteille
  const coutBouteille = Math.round(Number(d.cout_achat_ht) * n * 1e4) / 1e4
  const auVerre = Number(d.prix_vente_ht) * (1 + Number(d.tva) / 100) * n
  const ht = Math.round(b.ttc / (1 + TVA / 100) * 1e4) / 1e4
  const marge = ht - coutBouteille
  console.log(`  ${b.nom.padEnd(29)}${f2(b.ttc).padStart(6)} € ${f2(auVerre).padStart(9)} €   ${('−' + Math.round((1 - b.ttc / auVerre) * 100) + ' %').padStart(13)}  ${f2(coutBouteille).padStart(6)} €  ${(coutBouteille / ht * 100).toFixed(1).replace('.', ',').padStart(8)} %  ${f2(marge).padStart(6)} €  ×${(ht / coutBouteille).toFixed(1)}`)
  const [deja] = await sb(`recettes?nom=eq.${encodeURIComponent(b.nom)}&select=id`)
  if (deja) { console.log(`  ${' '.repeat(29)}(existe déjà)`); continue }
  if (!ECRIRE) continue
  const [r] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: b.nom, nom_caisse: b.nom, categorie: 'Alcool', tag_destination: 'BAR',
    etablissement_id: modele.etablissement_id,
    prix_vente_ht: ht, tva: TVA, cout_achat_ht: coutBouteille,
    // ⚠️ MÊME matière que la dose : un seul stock, compté une seule fois.
    nom_matiere: d.nom_matiere, reference_fournisseur: d.reference_fournisseur,
    unites_par_achat: 1,
    contient_alcool: true,
    vendable_online: false,
    description: `${b.detail} — bouteille entière servie à table, ${n} verres de 4 cl.`,
    actif: true }) })
  nouveaux.push(r)
}

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
console.log(`\n  ✓ ${nouveaux.length} bouteille(s) créée(s)`)
if (!Z || !nouveaux.length) { console.log('') ; process.exit(0) }
// ⚠️ Tableau NU, un seul appel, `remote_id` = notre uuid, TVA en MILLIÈMES.
// L'alcool est à 20 % en salle comme à emporter.
const corps = nouveaux.map(r => ({ name: r.nom_caisse, remote_id: r.id,
  price: Math.round(Number(r.prix_vente_ht) * 1.2 * 100), price_togo: Math.round(Number(r.prix_vente_ht) * 1.2 * 100),
  tax: 2000, tax_takeaway: 2000 }))
const rep = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST',
  headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const j = await rep.json().catch(() => ({}))
console.log(`  → caisse : HTTP ${rep.status} · ${(j.dishes ?? []).length} plat(s) · errno ${j.errno}`)
for (const d of j.dishes ?? [])
  await sb('correspondances_catalogue', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ systeme: 'zelty', identifiant_externe: String(d.id), recette_id: String(d.remote_id) }) })
console.log('  ✓ correspondances enregistrées.\n')
