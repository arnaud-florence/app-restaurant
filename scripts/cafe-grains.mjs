// Le café passe de la DOSETTE aux GRAINS (22/09/2026).
//
// France Boissons met la machine et le moulin à disposition ; le café se paie
// au kilo. C'est le poste où la maison perdait le plus : la dosette Lavazza
// revenait à 0,53 € la tasse pour un café vendu 1,40 € — 41 % de food cost, le
// pire de la carte, sur le produit le plus vendu d'un village.
//
// En grains, une tasse de 8 g coûte le quart. Le prix du panneau ne bouge
// pas : c'est la marge qui monte.
//
// Mélange retenu par le gérant : **Lavazza Gold Selection** (la machine et le
// moulin sont prêtés par Lavazza, donc le café vient de chez eux).
//
// ⚠️ Coûts lus dans data/france-boissons-couts-unitaires-*.json (hors dépôt,
// conditions négociées). Sans le fichier, le script refuse d'écrire.
//
// ⚠️ Le lait du cappuccino et de la noisette N'EST PAS chiffré ici : il ne
// vient pas de France Boissons. Leur coût porte le café, le sucre et une
// ESTIMATION de lait, à corriger à la première facture du crémier.
//
//   node scripts/cafe-grains.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const FICHIER = 'data/france-boissons-couts-unitaires-2026-09-21.json'
if (!fs.existsSync(FICHIER)) { console.log(`✗ ${FICHIER} absent — rien n'est écrit.`); process.exit(1) }
const C = JSON.parse(fs.readFileSync(FICHIER, 'utf8'))

const GRAINS_KG = C['_ingredient:Café grains Lavazza Gold Selection (kg)']
const SUCRE = C['_ingredient:Sucre bûchette (pièce)']
const CHOCO_KG = C['_ingredient:Chocolat poudre espresso (kg)']
const DOSE_G = 8          // dose d'espresso au moulin, réglage de départ
const LAIT_L = 1.10       // ESTIMATION — le lait ne vient pas de France Boissons
const tasse = GRAINS_KG * DOSE_G / 1000 + SUCRE

// [produit, coût, matière comptée, tasses par kilo acheté, remarque]
const PLAN = [
  ['Café expresso', tasse, 'Café en grains 1 kg', Math.round(1000 / DOSE_G), `${DOSE_G} g de grains + 1 bûchette de sucre`],
  ['Café allongé',  tasse, 'Café en grains 1 kg', Math.round(1000 / DOSE_G), `${DOSE_G} g de grains + 1 bûchette de sucre`],
  ['Café noisette', tasse + LAIT_L * 0.03, 'Café en grains 1 kg', Math.round(1000 / DOSE_G), '+ 3 cl de lait (estimation)'],
  ['Cappuccino',    tasse + LAIT_L * 0.15, 'Café en grains 1 kg', Math.round(1000 / DOSE_G), '+ 15 cl de lait (estimation)'],
  ['Chocolat chaud', CHOCO_KG * 0.025 + LAIT_L * 0.20, 'Chocolat poudre 1 kg', 40, '25 g de poudre + 20 cl de lait (estimation)'],
]

const prods = await (await fetch(U + '/rest/v1/recettes?select=id,nom,prix_vente_ht,tva,cout_achat_ht,nom_matiere,unites_par_achat&actif=eq.true&nom=in.(' +
  PLAN.map(p => `"${p[0]}"`).join(',') + ')', { headers: H })).json()
const parNom = new Map(prods.map(r => [r.nom, r]))
const f2 = n => n.toFixed(2).replace('.', ',')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — le café passe en grains ──\n`)
console.log('  produit'.padEnd(20) + 'prix TTC'.padStart(9) + 'avant'.padStart(8) + ' → ' + 'après'.padEnd(7) + 'food cost'.padStart(10))
for (const [nom, cout, matiere, parAchat, remarque] of PLAN) {
  const r = parNom.get(nom); if (!r) { console.log('  ⚠️ introuvable : ' + nom); continue }
  const ht = Number(r.prix_vente_ht), ttc = ht * (1 + Number(r.tva) / 100)
  console.log('  ' + nom.padEnd(18) + (f2(ttc) + ' €').padStart(9) + f2(Number(r.cout_achat_ht ?? 0)).padStart(8)
    + ' → ' + f2(cout).padEnd(7) + (f2(cout / ht * 100) + ' %').padStart(10) + '   · ' + remarque)
  if (!ECRIRE) continue
  await fetch(U + '/rest/v1/recettes?id=eq.' + r.id, { method: 'PATCH', headers: H, body: JSON.stringify({
    cout_achat_ht: Math.round(cout * 10000) / 10000, nom_matiere: matiere, unites_par_achat: parAchat,
    // Le libellé de facture s'apprendra au premier scan : on ne l'invente pas.
  }) })
}
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
