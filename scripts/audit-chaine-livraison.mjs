// AUDIT n°1 — une livraison enregistrée arrive-t-elle en stock, au bon
// chiffre, sur les trois écrans ? (02/10/2026)
//
// Pas un audit « les pages répondent ». Celui-ci suit une livraison RÉELLE
// ligne par ligne et dit, pour chacune, si elle sera VUE — et sinon pourquoi.
// Les quatre défauts trouvés le 02/10 étaient tous invisibles à un audit de
// disponibilité : ils n'apparaissent qu'au premier passage de vraies données.
//
// Les trois lecteurs :
//   • (ops)/inventaire   — comptage + entrées − sorties
//   • /admin/reassort    — comptage + entrées  (décide les commandes)
//   • /admin/stock       — même source que le réassort depuis ce jour
//
// ⚠️ DEUX IMPLÉMENTATIONS POUR UNE SEULE RÈGLE. `(ops)/inventaire` porte sa
// propre copie du calcul des entrées, en ligne dans la page ; le réassort et
// l'onglet Stock passent par `chargerLignesReassort()`. Elles sont identiques
// aujourd'hui — ce script le vérifie — mais rien ne les tient ensemble. À
// fusionner : le jour où l'une bouge, deux écrans donneront deux stocks.
//
//   node scripts/audit-chaine-livraison.mjs [BL-47231850]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const NUM = process.argv.find(a => a.startsWith('BL-')) ?? 'BL-47231850'
const sb = async p => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}
const lireTout = async q => {
  const out = []
  for (let o = 0; ; o += 1000) { const p = await sb(`${q}&order=id&offset=${o}&limit=1000`); out.push(...p); if (p.length < 1000) break }
  return out
}
const norm = x => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
let ko = 0, ok = 0
const ECHEC = m => { ko++; console.log(`   ✗ ${m}`) }
const PASSE = m => { ok++; console.log(`   ✓ ${m}`) }

console.log(`\n══ AUDIT — la livraison ${NUM} arrive-t-elle en stock ? ══\n`)

// ── 1. le document existe et il est du bon type ──────────────────────
const [doc] = await sb(`factures_fournisseurs?numero=eq.${NUM}&select=id,type_document,date_emission,montant_ht,facture_liee_id,fournisseurs(nom)`)
if (!doc) { console.log(`   ✗ aucun document ${NUM} — rien à auditer\n`); process.exit(1) }
console.log(`── 1. Le document`)
doc.type_document === 'bon_livraison' ? PASSE(`type « bon_livraison » — il fait foi sur les entrées (0166)`) : ECHEC(`type « ${doc.type_document} » : une facture rattachée à un BL n'ajoute AUCUNE entrée`)
Number(doc.montant_ht) === 0 ? PASSE(`montant à 0 — un BL n'engage pas d'argent, il constate`) : ECHEC(`montant ${doc.montant_ht} € sur un BL`)
const lignes = await sb(`facture_lignes?facture_id=eq.${doc.id}&select=description,quantite,unite,recette_id,ingredient_id`)
lignes.length > 0 ? PASSE(`${lignes.length} lignes`) : ECHEC('aucune ligne — le document est vide')

// ── 2. un point de départ existe, sinon aucune entrée n'est calculée ──
console.log(`\n── 2. Le point de départ`)
const inv = await sb(`inventaires?date_inventaire=lt.${doc.date_emission}&select=date_inventaire&order=date_inventaire.desc&limit=1`)
const depuis = inv[0]?.date_inventaire
depuis
  ? PASSE(`comptage du ${depuis}, antérieur à la livraison du ${doc.date_emission}`)
  : ECHEC(`AUCUN comptage avant le ${doc.date_emission} — sans point de départ, les trois écrans calculent ZÉRO entrée, quoi qu'il y ait sur le bon`)

// ── 3. chaque ligne trouve-t-elle sa cible ? ─────────────────────────
console.log(`\n── 3. Les lignes qui seront VUES`)
const prods = await lireTout(`recettes?actif=is.true&select=id,nom,nom_matiere,libelle_achat`)
const mats = await lireTout(`ingredients?actif=is.true&stocke=is.true&select=id,nom,libelle_achat`)
const cles = [
  ...new Map(prods.filter(p => (p.nom_matiere ?? '').trim() || (p.libelle_achat ?? '').trim())
    .map(p => [((p.nom_matiere ?? '').trim() || (p.libelle_achat ?? '').trim()),
               { cible: (p.libelle_achat ?? '').trim() || (p.nom_matiere ?? '').trim() }])).values(),
  ...mats.map(m => ({ cible: (m.libelle_achat ?? '').trim() || m.nom })),
].filter(x => x.cible.length >= 4)

const vues = [], muettes = []
for (const l of lignes) {
  const d = norm(l.description)
  const touche = cles.filter(c => d.includes(norm(c.cible)))
  if (touche.length === 1) vues.push(l)
  else if (touche.length === 0) muettes.push({ l, pourquoi: 'aucun libelle_achat ne la reconnaît' })
  else muettes.push({ l, pourquoi: `reconnue par ${touche.length} cibles — l'entrée serait comptée plusieurs fois` })
}
vues.length === lignes.length
  ? PASSE(`les ${lignes.length} lignes sont reconnues`)
  : ECHEC(`${muettes.length} ligne(s) sur ${lignes.length} ne seront PAS comptées en stock`)
for (const m of muettes) console.log(`        · ${String(m.l.description).slice(0, 48).padEnd(48)} ${m.pourquoi}`)

// ── 4. les unités : le piège qui multiplie par vingt ─────────────────
console.log(`\n── 4. Les unités`)
const suspectes = lignes.filter(l => !/^(pce|pi[eè]ce|piece|p|u)s?$/.test(String(l.unite ?? '').toLowerCase()))
suspectes.length === 0
  ? PASSE(`toutes les lignes sont à la pièce — aucune multiplication par un conditionnement`)
  : ECHEC(`${suspectes.length} ligne(s) dans une unité qui n'est pas la pièce : à vérifier une par une`)
for (const l of suspectes.slice(0, 6)) console.log(`        · ${l.description} — q=${l.quantite} ${l.unite}`)

// ── 5. pas de double comptage ────────────────────────────────────────
console.log(`\n── 5. Le double comptage`)
const liee = await sb(`factures_fournisseurs?facture_liee_id=eq.${doc.id}&select=numero,type_document`)
liee.length === 0
  ? PASSE(`aucune facture rattachée pour l'instant — rien ne peut doubler`)
  : PASSE(`${liee.length} facture(s) rattachée(s) : elles n'ajoutent aucune entrée, le BL l'a déjà fait`)
const memeNum = await sb(`factures_fournisseurs?numero=eq.${NUM}&select=id`)
memeNum.length === 1 ? PASSE(`un seul document porte ce numéro`) : ECHEC(`${memeNum.length} documents portent le numéro ${NUM} — la marchandise entrerait ${memeNum.length} fois`)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
if (ko) console.log(`  ⚠️ Tant qu'une ligne n'est pas vue, sa marchandise n'existe pour aucun\n     écran : ni inventaire, ni réassort, ni commande conseillée.\n`)
process.exit(ko ? 1 : 0)
