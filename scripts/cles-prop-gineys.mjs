// Rapprocher la proposition Gineys de nos matières — à la main.
//
// ⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT (0151). La méthode « racine de
// cinq lettres, deux mots communs » range « Roquette » sous « ROQUEFORT » et
// « Citron » sous « GATEAU CITRON ROND ». Chaque paire ci-dessous a été
// décidée, et porte sa raison. Les ÉCARTÉES y figurent aussi : sans elles,
// dans six mois, on ne saura plus si une paire absente est un oubli ou une
// décision.
//
// Usage : node scripts/cles-prop-gineys.mjs [--ecrire]

import fs from 'node:fs'

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
const DATE = '2026-10-05'

// ─── HÉRITAGE PAR RÉFÉRENCE ───────────────────────────────────────────
// ⚠️ C'est EXACT, pas approchant : même fournisseur, même code article, un
// prix plus récent. La référence ne souffre ni des accents ni des
// abréviations et ne confond pas deux produits proches (0142). C'est la
// seule déduction automatique qu'on s'autorise ici.
const HERITER = true

// ─── PAIRES DÉCIDÉES ──────────────────────────────────────────────────
// `cle` : une clé EXISTANTE, sauf mention « nouvelle ».
const PAIRES = [
  ['0055037', 'Viande hachée de bœuf (kg)', 'égrenée 20 % MG — même produit que le sac Gel Var'],
  ['0061390', 'Cheddar en tranches (kg)',  'fondu, 84 tranches de 12 g : l’exact équivalent du 12,3 g × 84 de Félix Potin'],
  ['0062202', 'Lardons fumés (kg)',        'allumette, barquette 1 kg'],
  ['0062206', 'Lardons fumés (kg)',        'second format, barquette 500 g — l’écran montre ce que le format coûte'],
  ['0061341', 'Gorgonzola (kg)',           'AOP, pièce de 1,5 kg comme Félix Potin et Gel Var'],
  ['0061364', 'Reblochon (kg)',            'pièce ENTIÈRE de 450 g, comme les 500 g FP et 520 g Gel Var'],
  ['0063011', 'Jambon cru tranché (kg)',   'jambon sec tranché avec intercalaires'],
  ['0063002', 'Jambon blanc tranché',      'découenné dégraissé, 10 tranches — format 400 g'],
  ['0063016', 'Jambon cru Serrano',        'serrano 10 mois, 500 g : même article que notre facture d’août'],
  ['0063020', 'Coppa tranchée (kg)',       'tranchée, 250 g'],
  ['0057519', 'Champignons émincés (kg)',  'émincé qualité hôtel — ⚠️ PAS « champignons de Paris frais », le travail diffère'],
  ['0064702', 'Entrecôte de bœuf (kg)',    'entrecôte SP, pièce de 4 kg'],
  ['0062523', 'Gnocchis frais (kg)',       'gnocchi de pomme de terre, sac 1 kg'],
  ['0067605', 'Huile d’olive',             'vierge extra, bidon 5 L'],
  ['0061022', 'Beurre doux',               'plaquette 250 g, comme Félix Potin et Gel Var'],
  ['0062601', 'Pesto alla genovese',       'seau 2,1 kg contre notre seau 1 kg facturé en août'],
  ['0067403', 'Cornichons (kg)',           '⚠️ 5/1 — c’est lui qui rend le groupe comparable, Gineys n’avait qu’une 3/1'],
  ['0067513', 'Sauce pizza',               'aromatisée 5/1, même format que Félix Potin'],
  ['0067613', 'Graisse de bœuf (kg)',      'colis de 10 kg — crée le face-à-face avec La Frite Belge'],
  ['0057353', 'Poivrons en lanières (kg)', 'duo rouge/vert grillé en lanières'],
  ['0067201', 'Pain burger (pièce)',       'brioché tranché, 9 × 90 g — le même article que le « 90GX9 » de Félix Potin'],
  // NOUVELLES clés
  ['0063017', 'Lard fumé en tranches (kg)', 'NOUVELLE — poitrine fumée 24 tranches. Comble l’orpheline documentée, et crée le face-à-face avec la poitrine tranchée Gel Var'],
  ['0061104', 'Œuf calibre M (pièce)',      'NOUVELLE — ⚠️ calibre M, PAS la clé « Œuf (pièce) » qui porte le calibre G : un œuf de 53-63 g n’est pas un 63-73 g, et le prix à la pièce s’en ressent'],
  ['0061109', 'Œuf calibre M (pièce)',      'NOUVELLE — même calibre 53-63, colis de 180'],
]

// ─── CONTENANCES POSÉES À LA MAIN ─────────────────────────────────────
// ⚠️ `contenance_valeur` / `_unite` existent pour qu'un HUMAIN tranche
// depuis l'écran quand la désignation est ambiguë (0151). Chacune est lue
// sur la désignation elle-même, jamais déduite d'une voisine.
const CONTENANCES = [
  ['0067613', 10,  'kg',    'C=10KG : le colis pèse dix kilos, le prix est celui du colis'],
  ['0057353', 0.45, 'kg',   'C=10X450G facturé au SAC : le sac fait 450 g (le ×10 est le colisage)'],
  ['0067201', 9,   'piece', '9×90G facturé au SAC : le sac contient NEUF pains, pas 810 g de pain à la pièce'],
  ['0061109', 180, 'piece', 'C=180 facturé au COLIS : cent quatre-vingts œufs'],
  ['0077902', 50,  'piece', 'C=50 facturé au COLIS : cinquante pâtons'],
]
// ⚠️ Et la contrepartie chez Félix Potin, sinon le face-à-face reste muet :
// sa ligne « PAIN BURGER BRIOCHE 90GX9 » est facturée au SAchet et n'avait
// aucun prix de référence — un groupe à une seule ligne chiffrée ne compare
// rien.
const CONTENANCES_AUTRES = [
  ['Félix Potin Provence', 'PAIN BURGER BRIOCHE 90GX9 MAISON BUNS', 9, 'piece',
   'le sachet contient les neuf pains (la règle est déjà écrite dans CLAUDE.md pour cette ligne précise)'],
]

// ─── ÉCARTÉES, ET POURQUOI ────────────────────────────────────────────
const ECARTEES = [
  ['0054536', 'ANNEAU DE CALMAR FARINE', 'FARINÉ : le travail reste à faire, comme le « calamar anneau crispy » déjà écarté de Félix Potin'],
  ['0052230', 'PETIT CAMEMBERT AU FOUR 120G', 'produit PRÉPARÉ de 120 g — notre camembert est un 250 g nature'],
  ['0061405', 'PETIT CAMEMBERT AU FOUR 120G', 'idem, second tarif du même article'],
  ['0067208', 'PAIN BURGER FOCACCIA', 'pain focaccia, pas un brioché — et aucune contenance lisible'],
  ['0067202', 'BUN BRIOCHE MULTIGRAINE', 'multigraine : un autre pain, comme le multicéréales écarté chez Félix Potin'],
  ['0061337', 'FROMAGE ITALIEN RAPE', '⚠️ « fromage italien » ne NOMME pas le fromage : grana ou mozzarella changent le prix du simple au double. À faire préciser'],
  ['0061329', 'FROMAGE ITALIEN EN PETALE', 'idem — « pétale » suggère un grana, pas de la mozzarella'],
  ['0061384', 'POINTE FROMAGE ITALIEN', 'idem'],
  ['0061406', 'MOZZABELLA LANIERE', '⚠️ LANIÈRE ≠ RÂPÉ : moins cher que notre mélange, mais le rendu sur la pizza diffère. Question au gérant, pas une correspondance'],
  ['0063029', 'JAMBON CRU SERRANO GRAN RESERVA 24MOIS', '24 mois ≠ 10 mois : l’affinage change le produit et son prix'],
  ['0064709', 'ENTRECOTE N°2 SP', '« N°2 » est une qualité inférieure — même objection que le beurre allégé 40 %'],
  ['0061277', 'CREME FRAICHE EPAISSE 15% MG', '⚠️ 15 % MG : une crème allégée n’est pas une 30 % épaisse (déjà écarté chez Félix Potin)'],
  ['0062362', 'AUBERGINE GRILLEE EN LAMELLE', 'LAMELLE ≠ TRANCHE, et la tranche (0057205, héritée) est à 4,55 contre 7,99'],
  ['0063217', 'ANDOUILLETTE 6X180G', 'notre andouillette se compte à la PIÈCE, cette ligne est au kilo : bases discordantes, le groupe deviendrait muet'],
  ['0067503', 'POLPA FINE 5/1', 'pulpe de tomate ≠ sauce pizza aromatisée'],
  ['0077902', 'PATON A PIZZA CRU 200G', '⚠️ 200 g : ni notre 250 g du Fournil ni notre 350 g de la pizzeria. Même piège que les sacs à croissants 101/103/104'],
  ['0071906', 'PLAQUE FOCACCIA 550G', 'une plaque de 550 g n’est pas notre focaccia à la pièce'],
  ['0067673', 'CONFIT D’OIGNON', 'aucun autre fournisseur au catalogue : rien à comparer. Et les faire soi-même revient à une fraction du prix'],
  ['0067383', 'DOSETTE SAUCE PIMENTEE 4G', 'aucune matière correspondante'],
  ['0120056', 'BOITE PIZZA KRAFT 33X33', '⚠️ aucune matière « boîte à pizza » n’est suivie — à CRÉER avant d’ouvrir, pas à rapprocher'],
  ['0064741', 'FILET DE RUMSTEAK PAD', 'aucune matière correspondante'],
  ['0064775', 'TARTARE DE BŒUF 170G', 'notre « bœuf haché au couteau » n’a aucune autre offre : rien à comparer'],
  ['0062212', 'CREVETTE CUITE DECO', 'cuite ≠ crue, et aucune autre offre au catalogue'],
  ['0053023', 'QUEUE DE CREVETTE CRUE', 'aucune autre offre au catalogue'],
]

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

const [g] = await sb('fournisseurs?select=id,nom&nom=eq.Gineys')
const prop = await sb(`catalogue_fournisseur?select=id,reference,designation,cle_comparaison&fournisseur_id=eq.${g.id}&date_tarif=eq.${DATE}`)
const parRef = new Map(prop.map(l => [l.reference, l]))
const anciennes = await sb(`catalogue_fournisseur?select=reference,cle_comparaison,date_tarif&fournisseur_id=eq.${g.id}&date_tarif=neq.${DATE}&cle_comparaison=not.is.null`)
const cleHeritee = new Map()
for (const l of anciennes) if (parRef.has(l.reference)) cleHeritee.set(l.reference, l.cle_comparaison)

// ⚠️ On n'écrit une clé NOUVELLE que si elle n'existe pas déjà sous une
// autre orthographe : deux clés pour la même idée font deux groupes, et
// chacun gagne de son côté.
const toutes = await sb('catalogue_fournisseur?select=cle_comparaison&cle_comparaison=not.is.null&actif=is.true')
const existantes = new Set(toutes.map(l => l.cle_comparaison))

const maj = new Map()   // id → patch
let nouvelles = 0
if (HERITER) for (const [ref, cle] of cleHeritee) maj.set(parRef.get(ref).id, { cle_comparaison: cle })
for (const [ref, cle, raison] of PAIRES) {
  const l = parRef.get(ref)
  if (!l) { console.error(`⛔ référence ${ref} absente de la proposition`); process.exit(1) }
  if (/NOUVELLE/.test(raison) && !existantes.has(cle)) nouvelles++
  maj.set(l.id, { ...(maj.get(l.id) ?? {}), cle_comparaison: cle })
}
for (const [ref, v, u] of CONTENANCES) {
  const l = parRef.get(ref)
  if (!l) { console.error(`⛔ référence ${ref} absente`); process.exit(1) }
  maj.set(l.id, { ...(maj.get(l.id) ?? {}), contenance_valeur: v, contenance_unite: u })
}

console.log(`\n📄 Proposition Gineys du ${DATE} — ${prop.length} lignes`)
console.log(`\n── ${cleHeritee.size} clé(s) HÉRITÉE(S) par référence (exact) ──`)
console.log(`── ${PAIRES.length} paire(s) décidée(s) à la main, dont ${nouvelles} clé(s) nouvelle(s) ──`)
for (const [ref, cle, raison] of PAIRES) console.log(`   ${ref}  ${cle.padEnd(28)} ${raison}`)
console.log(`\n── ${CONTENANCES.length} contenance(s) posée(s) à la main ──`)
for (const [ref, v, u, raison] of CONTENANCES) console.log(`   ${ref}  ${String(v).padStart(5)} ${u.padEnd(6)} ${raison}`)
console.log(`\n── ${ECARTEES.length} ligne(s) ÉCARTÉE(S), et pourquoi ──`)
for (const [ref, quoi, raison] of ECARTEES) console.log(`   ${ref}  ${quoi.slice(0, 38).padEnd(38)} ${raison}`)

if (!ECRIRE) { console.log(`\n   (essai à blanc — ${maj.size} ligne(s) à modifier. Relancer avec --ecrire.)\n`); process.exit(0) }

for (const [id, patch] of maj) {
  await sb(`catalogue_fournisseur?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}
for (const [nomF, designation, v, u, raison] of CONTENANCES_AUTRES) {
  const [f] = await sb(`fournisseurs?select=id&nom=eq.${encodeURIComponent(nomF)}`)
  const ls = await sb(`catalogue_fournisseur?select=id&fournisseur_id=eq.${f.id}&designation=eq.${encodeURIComponent(designation)}`)
  // ⚠️ Un fragment qui vise PLUSIEURS lignes fait refuser l'écriture :
  // prendre la première poserait la contenance d'un autre produit.
  if (ls.length !== 1) { console.error(`⛔ « ${designation} » vise ${ls.length} ligne(s) — rien n'est écrit dessus.`); continue }
  await sb(`catalogue_fournisseur?id=eq.${ls[0].id}`, { method: 'PATCH',
    body: JSON.stringify({ contenance_valeur: v, contenance_unite: u }) })
  console.log(`   ${nomF} · ${designation} → ${v} ${u} (${raison})`)
}
console.log(`\n   ✅ ${maj.size} ligne(s) modifiée(s).`)
console.log(`   ⚠️ Aucun prix d'achat n'a été touché : un devis n'est pas une facture.\n`)
