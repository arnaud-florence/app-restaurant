// Le comptage d'ouverture du bar — 02/10/2026, sur décision du gérant.
//
// `(ops)/inventaire` ne calcule les entrées que DEPUIS le dernier comptage :
// sans point de départ, la livraison France Boissons du 01/10 n'apparaît nulle
// part, malgré son bon de livraison. Le bar n'avait jamais été compté — zéro
// ligne.
//
// ⚠️ UN ZÉRO ÉCRIT N'EST PAS UNE LIGNE ABSENTE, et toute la valeur de ce
// comptage est là. Une ligne absente dit « personne n'a regardé » ; un zéro
// dit « on a regardé, il n'y avait rien ». C'est la distinction que ce projet
// applique partout — « rien déclaré » ≠ « aucun allergène » (0138),
// statutFoodCost(0) ≠ vert (0150), « jamais compté » ≠ « zéro » (0163). Ici,
// le fait est vrai : la maison était fermée et le bar n'avait jamais été
// approvisionné.
//
// ⚠️ CELA DÉROGE À LA RÈGLE DE SAISIE de l'écran, où une quantité 0 SUPPRIME
// la ligne (0130) — et c'est délibéré. Cette règle évite d'empiler du bruit
// pendant un comptage ; elle ne couvre pas le geste inverse, qui est
// d'affirmer un stock nul à une date. Les deux coexistent sans se gêner : au
// comptage suivant, l'équipe saisit ce qu'elle trouve et laisse le reste.
//
// ⚠️ DATÉ DU 30/09, LA VEILLE DE LA LIVRAISON. Daté du 01/10 ou après, il
// annulerait l'entrée qu'il doit servir à mesurer : les entrées ne comptent
// que si leur document est POSTÉRIEUR au comptage.
//
//   node scripts/comptage-ouverture-bar.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const LE = '2026-09-30'

// ⚠️ On REPRODUIT le regroupement de l'écran, on n'en invente pas un second :
// clé = nom_matiere ?? libelle_achat ?? nom, représentant = premier par id.
// Un représentant instable ferait porter le comptage par un autre produit au
// rechargement, et la ligne paraîtrait s'être effacée (0163).
const prods = await sb('recettes?actif=is.true&tag_destination=eq.BAR'
  + '&select=id,nom,nom_matiere,libelle_achat,cout_achat_ht,unites_par_achat&order=id')
const groupes = new Map()
for (const r of prods) {
  // ⚠️ Au bar, un produit SANS nom_matiere est EXCLU : Kir, Spritz, Panaché et
  // les pichets mélangent deux matières. Personne ne stocke des kirs.
  if (!((r.nom_matiere ?? '').trim())) continue
  const cle = (r.nom_matiere).trim()
  if (groupes.has(cle)) continue
  const parAchat = Number(r.unites_par_achat ?? 1) || 1
  const cv = r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
  groupes.set(cle, { id: r.id, nom: cle,
    cout: cv == null ? null : Math.round(cv * parAchat * 10000) / 10000 })
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — comptage d'ouverture du bar au ${LE} ──\n`)
console.log(`   ${prods.length} produits du bar → ${groupes.size} matières à compter`)
const sansMatiere = prods.filter(r => !((r.nom_matiere ?? '').trim()))
console.log(`   ${sansMatiere.length} exclus (mélangent deux matières) : ${sansMatiere.map(r => r.nom).join(' · ')}`)
const sansCout = [...groupes.values()].filter(g => g.cout == null)
if (sansCout.length) console.log(`\n   ⚠️ ${sansCout.length} sans coût connu — comptés quand même, valorisés à rien :`)
for (const g of sansCout) console.log(`      ${g.nom}`)

const [existant] = await sb(`inventaires?date_inventaire=eq.${LE}&select=id&limit=1`)
if (existant) { console.log(`\n   ⚠️ un inventaire existe déjà au ${LE} — rien n'est écrit.\n`); process.exit(0) }
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// `cout_unitaire_ht` est FIGÉ à la saisie : un stock nul vaut zéro quel que
// soit le tarif, mais la colonne porte le coût du jour pour que la ligne
// reste lisible — et pour que le comptage suivant ait un repère.
const corps = [...groupes.values()].map(g => ({
  date_inventaire: LE, recette_id: g.id, quantite: 0,
  cout_unitaire_ht: g.cout ?? 0,
}))
await sb('inventaires', { method: 'POST', body: JSON.stringify(corps) })
console.log(`\n   ✓ ${corps.length} lignes à zéro écrites au ${LE}`)
console.log(`   ✓ les entrées du BL-47231850 (01/10) se compteront à partir de là\n`)
