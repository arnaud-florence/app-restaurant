// Quatre desserts de plus, demandés par le gérant (13/10/2026).
//
//   Pâtisserie (FOURNIL, 3,80 €)  : Gâteau pomme noix · Brownie
//   Dessert    (CUISINE, 5,90 €)  : les deux « (salle) », plus le gâteau
//                                   fraise fromage blanc qui n'existait
//                                   qu'en pâtisserie
//   Dessert    (CUISINE, 6,00 €)  : Assiette de fromages
//
// La convention des doublons de salle était déjà en place : même gâteau, nom
// suffixé « (salle) », famille Dessert, TVA 10 % et prix de la famille. On la
// suit plutôt que d'en inventer une autre.
//
// ⚠️⚠️ ON EFFACE `libelle_achat`, `cout_achat_ht` ET `reference_fournisseur`
// DU GABARIT. Le modèle (« Éclair au chocolat ») porte « ECLAIR CHOCOLAT
// ARTISANAL 16CM 120G ARTIPAT C=12 » : copié tel quel, le prochain scan de
// facture écrirait le prix de l'éclair sur un brownie, et une marge fausse ne
// se signale pas. C'est la leçon du croissant à 40 € (22/08) et celle du
// Gommé qui avait hérité des sulfites du Martini (ce matin).
//
// ⚠️ Les allergènes sont ceux qui sont vrais PAR DÉFINITION, jamais par
// probabilité, et `allergenes_valides_le` reste NULL : personne n'a lu
// d'emballage, donc le public lira « information non disponible » (0138).
//   · gluten là où la farine est définitionnelle ;
//   · fruits_a_coque sur le gâteau pomme NOIX — c'est dans son nom ;
//   · lait sur l'assiette de fromages et le gâteau au fromage blanc.
// Un brownie contient d'ordinaire œufs et beurre, mais ce n'est pas
// définitionnel : ça s'ajoutera en lisant l'emballage.
//
// ⚠️ Aucun coût d'achat : ces produits n'ont jamais été facturés. Ils sortent
// en « coût inconnu » (gris), ce qui est la vérité — un zéro se lirait
// « gratuit » et les ferait passer pour les meilleurs de la carte (0150).
//
//   node scripts/desserts-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const PAT = 'Éclair au chocolat', SAL = 'Éclair au chocolat (salle)'

const NOUVEAUX = [
  { nom: 'Gâteau pomme noix',                  gabarit: PAT, ttc: 3.80, allerg: ['gluten', 'fruits_a_coque'] },
  { nom: 'Brownie',                            gabarit: PAT, ttc: 3.80, allerg: ['gluten'] },
  { nom: 'Gâteau pomme noix (salle)',          gabarit: SAL, ttc: 5.90, allerg: ['gluten', 'fruits_a_coque'] },
  { nom: 'Brownie (salle)',                    gabarit: SAL, ttc: 5.90, allerg: ['gluten'] },
  { nom: 'Gâteau fraise fromage blanc (salle)', gabarit: SAL, ttc: 5.90, allerg: ['gluten', 'lait'] },
  // ⚠️ 6,00 € casse le « une famille, un prix » du Dessert (5,90 €) : c'est
  // le prix donné par le gérant, et une assiette de fromages n'est pas une
  // pâtisserie — elle n'a pas de raison de suivre leur palier.
  { nom: 'Assiette de fromages',               gabarit: SAL, ttc: 6.00, allerg: ['lait'] },
]

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const H = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o, headers: H })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 320)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  for (let n = 1; n <= 5; n++) {
    await new Promise(s => setTimeout(s, 1400))
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
    const b = await r.json().catch(() => ({}))
    if (r.status === 200) return b
    console.log(`   (HTTP ${r.status}, essai ${n})`)
    if (r.status !== 429 && r.status < 500) throw new Error(JSON.stringify(b).slice(0, 250))
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  throw new Error('abandon')
}

console.log(`\n🍰 Desserts${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)
const gabs = await sb(`recettes?nom=in.("${PAT}","${SAL}")&select=*`)
const gab = new Map(gabs.map(g => [g.nom, g]))
if (!gab.get(PAT) || !gab.get(SAL)) throw new Error('gabarit introuvable')

const dejaLa = await sb(`recettes?nom=in.(${NOUVEAUX.map(n => `"${n.nom}"`).join(',')})&select=id,nom,actif`)
const aFaire = NOUVEAUX.filter(n => !dejaLa.some(d => d.nom === n.nom))
for (const d of dejaLa) console.log(`   = « ${d.nom} » existe déjà (${d.actif ? 'actif' : 'désactivé'})`)
if (!aFaire.length) { console.log('\n   rien à créer.\n'); process.exit(0) }
for (const n of aFaire) {
  const g = gab.get(n.gabarit)
  console.log(`   → ${n.nom.padEnd(36)} ${n.ttc.toFixed(2)} € · [${g.categorie}] TVA ${g.tva} · ${g.tag_destination} · allergènes ${JSON.stringify(n.allerg)} (NON validés)`)
}
if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

const crees = []
for (const n of aFaire) {
  const g = gab.get(n.gabarit)
  const { id: _i, created_at: _c, updated_at: _u, ...base } = g
  const [c] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...base, id: crypto.randomUUID(), nom: n.nom, nom_caisse: n.nom,
    prix_vente_ht: Number((n.ttc / (1 + Number(g.tva) / 100)).toFixed(4)),
    prix_sur_place_ttc: null,
    // ⚠️ les trois champs d'achat du gabarit sont EFFACÉS, voir l'en-tête
    libelle_achat: null, cout_achat_ht: null, reference_fournisseur: null,
    // ⚠⚠ CINQUIÈME champ d'achat (ajouté le 19/10) : sans lui, le Brownie et le
    // Gâteau pomme noix héritaient du fournisseur de l'Éclair au chocolat (Gineys)
    // sans qu'aucun fait ne l'étaye. La 0164 exige trois sources factuelles.
    fournisseur_id: null,
    nom_matiere: null, unites_par_achat: 1,   // NOT NULL en base
    image_url: null, actif: true,
    allergenes_complementaires: n.allerg,
    allergenes_valides_le: null, allergenes_valides_par: null,
  }]) })
  crees.push({ ...n, id: c.id, categorie: c.categorie, tva: c.tva })
  console.log(`   ✓ base : ${n.nom} (${c.id})`)
}

// ── la caisse : famille comprise, sinon bouton introuvable au comptoir ──
const tags = (await zl('catalog/tags?limit=0')).tags ?? []
const idTag = new Map(tags.map(t => [t.name, Number(t.id)]))
const corps = []
for (const c of crees) {
  const tag = idTag.get(c.categorie)
  if (!tag) throw new Error(`famille « ${c.categorie} » inconnue de la caisse — refus`)
  const cts = Math.round(c.ttc * 100)
  // ⚠️ La TVA sur place suit la LOI (10 %), celle d'emporter notre fiche :
  // recopier le taux d'emporter sous-déclarerait une pâtisserie mangée à table.
  corps.push({ remote_id: c.id, name: c.nom, price: cts, price_togo: cts,
    tax: 1000, tax_takeaway: Number(c.tva) * 100, tags: [tag] })
}
await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
const ap = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
for (const c of corps) {
  const v = ap.find(x => String(x.remote_id) === String(c.remote_id))
  if (!v) { console.log(`   ⚠ ${c.name} : aucun identifiant rendu — lien NON posé, relancer`); continue }
  await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
    systeme: 'zelty', identifiant_externe: String(v.id), recette_id: c.remote_id, libelle_externe: c.name }]) })
  console.log(`   ✓ caisse : ${c.name} #${v.id}, famille [${(v.tags ?? []).join(', ')}]`)
}
console.log('\n✅ Terminé.\n')
