// Gineys, ce sont DEUX interlocuteurs — et deux grilles de prix.
//
// ⚠️⚠️ Décision du gérant (06/10/2026) : le portail et la proposition
// commerciale ne viennent pas de la même personne. **Nicolas** tient le
// compte et son tarif portail ; **Sabine Ramillon** a chiffré la
// proposition du 05/10. Leurs prix diffèrent sur les mêmes références, et
// c'est précisément ce qu'on veut pouvoir comparer.
//
// ⚠️⚠️ SANS CETTE SÉPARATION, LA RÈGLE DU TARIF PÉRIMÉ LES ÉCRASE L'UN
// L'AUTRE. `comparer()` marque comme remplacée toute ligne du MÊME
// fournisseur portant la MÊME référence à une date plus ancienne — règle
// juste quand un fournisseur révise son tarif, fausse quand deux
// commerciaux proposent chacun le leur. Sous une seule fiche, la
// proposition de Sabine éteignait silencieusement les prix de Nicolas :
// le comparateur n'en montrait qu'un, et on ne pouvait plus voir lequel
// des deux est le moins cher.
//
// ⚠️ ON NE DÉPLACE QUE LES 66 LIGNES DE LA PROPOSITION. Le reste —
// portail, factures d'août, catalogue Arti'Pat — demeure sous « Gineys »,
// et c'est délibéré : 46 matières y renvoient par leur champ TEXTE
// `fournisseur_principal`, 40 produits par `recettes.fournisseur_id` et
// 2 bons de commande par leur clé étrangère. Renommer la fiche existante
// romprait ces rattachements en silence.
//
// Usage : node scripts/separer-gineys-sabine.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })

const ECRIRE = process.argv.includes('--ecrire')
const DATE_PROP = '2026-10-05'
const NOM_SABINE = 'Gineys — Sabine'

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

const [gineys] = await sb('fournisseurs?select=id,nom,email,conditions_tarifaires&nom=eq.Gineys%20(Nicolas)')
if (!gineys) { console.error('⛔ Fournisseur « Gineys » introuvable.'); process.exit(1) }

const prop = await sb(`catalogue_fournisseur?select=id,reference,designation&fournisseur_id=eq.${gineys.id}&date_tarif=eq.${DATE_PROP}&nature=eq.devis`)
console.log(`\n📋 ${prop.length} ligne(s) de la proposition du ${DATE_PROP} chez « ${gineys.nom} »`)

// ⚠️ Le PDF annonce 66 lignes. Si le compte ne concorde pas, on ne touche
// à rien : déplacer un sous-ensemble laisserait la grille coupée en deux,
// et le comparateur opposerait Nicolas à une Sabine amputée.
if (prop.length !== 66) {
  console.error(`⛔ 66 attendues, ${prop.length} trouvées. Rien n'est déplacé.`)
  process.exit(1)
}

// Combien de face-à-face cette séparation va-t-elle ouvrir ?
const avecCle = await sb(`catalogue_fournisseur?select=reference,cle_comparaison&fournisseur_id=eq.${gineys.id}&cle_comparaison=not.is.null`)
const refProp = new Set(prop.map(l => l.reference))
const clesSabine = new Set(avecCle.filter(l => refProp.has(l.reference)).map(l => l.cle_comparaison))
console.log(`   ${clesSabine.size} clé(s) de comparaison deviennent des face-à-face Nicolas / Sabine`)

let [sabine] = await sb(`fournisseurs?select=id,nom&nom=eq.${encodeURIComponent(NOM_SABINE)}`)
console.log(`\n   fournisseur « ${NOM_SABINE} » : ${sabine ? 'déjà créé' : 'à créer'}`)
console.log(`   ⚠️ sans adresse e-mail — à demander à Sabine avant le premier bon`)

if (!ECRIRE) {
  console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`)
  process.exit(0)
}

if (!sabine) {
  ;[sabine] = await sb('fournisseurs', { method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      nom: NOM_SABINE,
      actif: true,
      conditions_tarifaires: 'Sabine Ramillon, commerciale Gineys. Grille distincte de celle '
        + 'du portail, tenue par Nicolas — proposition commerciale du 05/10/2026. '
        + 'Deux interlocuteurs, deux tarifs : ils se comparent.',
    }) })
  console.log(`   ✅ fournisseur créé`)
}

// ⚠️ On repointe les lignes, on ne les recrée pas : les clés de
// comparaison, les contenances posées à la main et les rattachements aux
// matières vivent dessus. Les recréer les perdrait.
let n = 0
for (const l of prop) {
  await sb(`catalogue_fournisseur?id=eq.${l.id}`, { method: 'PATCH',
    body: JSON.stringify({ fournisseur_id: sabine.id }) })
  n++
}
console.log(`   ✅ ${n} ligne(s) déplacée(s) vers « ${NOM_SABINE} »`)
console.log(`   ⚠️ Portail, factures et catalogue restent chez « Gineys » (Nicolas).\n`)
