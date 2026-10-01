// Aligner la carte du bar sur le panier France Boissons du 29/09/2026.
//
// Décision du gérant : un produit dont la matière n'est pas commandée SORT de
// la carte. On le remettra quand il sera approvisionné, ici ou ailleurs.
//
// ⚠️ Le raisonnement est celui de la 0141 : une fausse rupture perd une vente,
// une fausse disponibilité fait venir un client pour rien — et ça, il le
// raconte. Un soir d'inauguration, c'est la seule erreur qui compte.
//
// ⚠️ On DÉSACTIVE, on ne supprime pas : la fiche garde son prix, sa photo, son
// coût et ses correspondances. La remettre en vente sera une case à cocher.
//
//   node scripts/carte-bar-selon-panier.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const f4 = n => n.toFixed(4).replace('.', ',')

// ── 1. Corrections de matière ─────────────────────────────────────────
// Le Perrier ÉTAIT commandé, sous une autre référence : 3 caisses de 24×33 cl
// en 10265, quand la fiche pointait 57003. Vérifié sur la fiche produit :
// 26,88 € HT public la caisse, 22,54 € remisé → 0,939 € la bouteille, et non
// 0,506 comme l'indiquait la fiche. Son food cost double.
// Les sirops Teisseire ne sont pas commandés, mais un Monin fleur de sureau
// l'est : un sirop à l'eau et un diabolo restent donc servables — au sureau.
// Un Monaco, un Perroquet, une Mauresque et une Tomate, non : ils exigent
// une grenadine, une menthe et un orgeat précis.
const SIROP_AV = 4.98 * 0.02   // Teisseire, dose de 2 cl
const SIROP_AP = 6.84 * 0.02   // Monin fleur de sureau
const CORRECTIONS = [
  { nom: 'Perrier 33 cl', matiere: 'Perrier VC 33 cl (caisse de 24)', ref: '10265', cout: 22.54 / 24,
    pourquoi: 'commandé sous 10265, pas 57003 — coût réel 0,939 €' },
  { nom: "Sirop à l'eau", matiere: 'Monin fleur de sureau 1 L', ref: '108783', delta: SIROP_AP - SIROP_AV,
    pourquoi: 'seul sirop commandé' },
  { nom: 'Diabolo', matiere: null, delta: SIROP_AP - SIROP_AV, pourquoi: 'même sirop' },
  { nom: 'Spritz', matiere: null, delta: (0.939 - 0.506) * (3 / 33),
    pourquoi: '3 cl de Perrier, au vrai prix' },
]

// ── 2. Ce qui sort de la carte ────────────────────────────────────────
const RETIRER = {
  'Amaretto 4 cl': 'Amaretto Disaronno non commandé',
  'Bière sans alcool 33 cl': 'Heineken 0.0 non commandée',
  'Bouteille Coteaux Varois': 'aucun vin au panier',
  'Crémant 75 cl': 'crémant Monmousseau non commandé',
  "Jus d'abricot 25 cl": 'Minute Maid abricot non commandé',
  "Jus d'ananas 25 cl": 'Minute Maid ananas non commandé',
  'Jus de tomate 25 cl': 'Granini tomate non commandé',
  'Muscat 6 cl': 'muscat de Rivesaltes non commandé',
  'Rade Girelle 33 cl': 'bière artisanale non commandée',
  'Rade Naïade 33 cl': 'bière artisanale non commandée',
  'Schweppes Tonic 25 cl': 'seul l’Agrumes est commandé — donc pas de gin tonic non plus',
  'Verre de blanc 12 cl': 'aucun BIB au panier',
  'Verre de rosé 12 cl': 'aucun BIB au panier',
  'Verre de rouge 12 cl': 'aucun BIB au panier',
  // Composites : il suffit qu'UN composant manque.
  'Kir': 'vin blanc manquant (la crème de cassis, elle, est commandée)',
  'Kir royal': 'crémant manquant — le prosecco Scalini pourrait le remplacer, c’est une décision de carte',
  'Pichet 25 cl': 'aucun vin au panier',
  'Pichet 50 cl': 'aucun vin au panier',
  'Rosé pamplemousse': 'ni vin rosé ni sirop de pamplemousse',
  'Monaco': 'grenadine manquante',
  'Mauresque': 'orgeat manquant',
  'Perroquet': 'menthe manquante',
  'Tomate': 'grenadine manquante',
  'Planteur': 'aucun jus de fruits au panier',
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — carte du bar selon le panier du 29/09 ──`)

console.log(`\n▸ Corrections de matière`)
for (const c of CORRECTIONS) {
  const [p] = await sb(`recettes?nom=eq.${encodeURIComponent(c.nom)}&tag_destination=eq.BAR&select=id,nom,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht`)
  if (!p) { console.log(`  ✗ ${c.nom} introuvable`); continue }
  const av = Number(p.cout_achat_ht ?? 0)
  const ap = Math.round((c.cout != null ? c.cout : av + c.delta) * 1e4) / 1e4
  const ht = p.prix_sur_place_ttc != null ? Number(p.prix_sur_place_ttc) / (1 + Number(p.tva) / 100) : Number(p.prix_vente_ht)
  const body = { cout_achat_ht: ap }
  if (c.matiere) { body.nom_matiere = c.matiere; body.reference_fournisseur = c.ref }
  console.log(`  ${c.nom.padEnd(20)} coût ${f4(av)} → ${f4(ap)}   food cost ${(av / ht * 100).toFixed(0)} % → ${(ap / ht * 100).toFixed(0)} %   (${c.pourquoi})`)
  if (ECRIRE) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

console.log(`\n▸ ${Object.keys(RETIRER).length} produits à retirer de la carte`)
const noms = Object.keys(RETIRER)
const prods = await sb(`recettes?tag_destination=eq.BAR&actif=eq.true&nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom`)
const absents = noms.filter(n => !prods.some(p => p.nom === n))
for (const p of prods.sort((a, b) => a.nom.localeCompare(b.nom))) console.log(`  − ${p.nom.padEnd(26)} ${RETIRER[p.nom]}`)
if (absents.length) console.log(`\n  (déjà inactifs ou introuvables : ${absents.join(', ')})`)
console.log(`\n  ⚠️ La désactivation passe par scripts/retirer-plats-caisse.mjs : CAISSE D'ABORD,`)
console.log(`     fiche ensuite — le miroir du catalogue est maître de \`actif\` et rallumerait`)
console.log(`     tout vingt minutes plus tard. La commande à lancer :\n`)
console.log(`  node scripts/retirer-plats-caisse.mjs \\\n    ${prods.map(p => `"${p.nom}"`).join(' \\\n    ')} \\\n    --ecrire`)
console.log(ECRIRE ? '\n  ✓ corrections écrites.\n' : '\n  (rien écrit — relancer avec --ecrire)\n')
