// LES PETITS WHISKIES — « baby » et « fetus » (16/10/2026).
//
// Demandés par le gérant le 13/10 (« fetus 2,00 € », « baby 4 € »), précisés
// le 16 : « le 1 cl est le fetus, le 2 cl est le baby, et le whisky est 4 cl ».
// Restés non faits trois jours faute de savoir ce que c'était — et c'était la
// bonne décision : la TVA dépend de la présence d'alcool, et le point de vente
// aussi (le Fournil n'en vend aucun). ⚠️ « Fetus » avait même été annoncé
// comme un PASTIS avant d'être corrigé : le créer sur cette lecture aurait
// produit un troisième bouton indiscernable du Ricard et du 51.
//
// ⚠️ LA GRILLE EST COHÉRENTE AU CENTILITRE, et c'est ce qui la valide :
//     fetus 1 cl → 2,00 €  = 2,00 €/cl
//     baby  2 cl → 4,00 €  = 2,00 €/cl
//     whisky 4 cl → 5,00 € = 1,25 €/cl
// Les deux petites doses au même tarif, la dose pleine dégressive. L'avertis-
// sement émis la veille (« le baby est proportionnellement plus cher que le
// shot de tequila ») tombe donc : ce n'est pas une anomalie, c'est une grille
// à deux niveaux voulue.
//
// ⚠️ LE PATRON EXISTE DÉJÀ, on ne l'invente pas : « Shot tequila 2 cl » est
// dérivé de « Tequila 4 cl » — même matière, `unites_par_achat` DOUBLÉ (35 au
// lieu de 17,5 : deux fois plus de doses dans la même bouteille), coût
// exactement la moitié. Le script VÉRIFIE ce témoin avant d'écrire : si le
// patron a bougé, la dérivation ne vaut plus rien.
//
// ⚠️ AUCUN ALLERGÈNE, et c'est JUSTE ici — contrairement au Gommé de la
// veille. Les distillats (whisky, vodka, gin, rhum) sont EXEMPTÉS
// d'étiquetage gluten par l'annexe II du règlement, même issus de céréales.
// Ne pas les déclarer par analogie avec la bière. `allergenes_valides_le`
// reste NULL : personne n'a lu d'étiquette (0138).
//
// ⚠️ `vendable_online: false` — l'alcool n'est JAMAIS en ligne, aucun contrôle
// d'âge sur le click & collect (0144).
//
//   node scripts/baby-whisky-1610.mjs [--ecrire] [--cl=N] [--prix=N] [--nom=…]
//   baby  : --cl=2 --prix=4            (défauts)
//   fetus : --nom="Fetus whisky" --cl=1 --prix=2
// ✅ LE FOURNISSEUR, LE LIBELLÉ D'ACHAT ET LA RÉFÉRENCE SONT HÉRITÉS, ET C'EST
// VOULU : c'est la MÊME bouteille Grant's que le gabarit. Ne PAS les effacer en
// croyant appliquer la règle du 19/10 — elle vise la copie SANS fait derrière.
import fs from 'node:fs'

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const argS = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const CL = arg('cl', 2)
const TTC = arg('prix', 4.00)
// ⚠️ Le nom porte la contenance, comme « Shot tequila 2 cl » : deux doses du
// même spiritueux sur le même écran de caisse ne se départagent pas sans elle.
const NOM = `${argS('nom', 'Baby whisky')} ${CL} cl`
const GABARIT = 'Whisky 4 cl'          // la dose pleine, dont on dérive tout
const TEMOIN = 'Shot tequila 2 cl'     // le même geste, déjà à la carte
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
               Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation',
               ...(o.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} ${c} :: ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 4; n++) {
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                 'Content-Type': 'application/json', ...(o.headers || {}) } })
    d = { status: r.status, body: await r.json().catch(() => ({})) }
    if (r.status === 200) return d
    console.log(`   tentative ${n} sur ${p} → HTTP ${r.status}`)
    if (r.status !== 429 && r.status < 500) return d
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  return d
}

console.log(`\n🥃 « ${NOM} » — ${TTC.toFixed(2)} € TTC`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// ── 1. le gabarit et le témoin ────────────────────────────────────────
const refs = await sb(`recettes?select=*&nom=in.("${GABARIT}","${TEMOIN}","Tequila 4 cl","${NOM}")`)
const par = Object.fromEntries(refs.map(r => [r.nom, r]))
const g = par[GABARIT], t = par[TEMOIN], tq = par['Tequila 4 cl']
if (!g) throw new Error(`gabarit « ${GABARIT} » introuvable`)
if (!t || !tq) throw new Error('témoin « Shot tequila 2 cl » / « Tequila 4 cl » introuvable — le patron ne peut pas être vérifié')

// ⚠️ le patron se VÉRIFIE : moitié de dose = moitié de coût, doses doublées.
const ratioDose = Number(t.unites_par_achat) / Number(tq.unites_par_achat)
const ratioCout = Number(t.cout_achat_ht) / Number(tq.cout_achat_ht)
console.log(`   témoin ${TEMOIN} : ×${t.unites_par_achat} (soit ${ratioDose}× les doses de Tequila 4 cl), coût ×${ratioCout.toFixed(3)}`)
if (Math.abs(ratioDose - 2) > 0.01 || Math.abs(ratioCout - 0.5) > 0.01)
  throw new Error('le patron du shot a changé — la dérivation ne tient plus, rien écrit')

const facteur = 4 / CL                                   // 4 cl → CL cl
const unites = Number((Number(g.unites_par_achat) * facteur).toFixed(2))
const cout = Number((Number(g.cout_achat_ht) / facteur).toFixed(4))
const ht = TTC / (1 + Number(g.tva) / 100)
const fc = cout / ht

console.log(`\n   gabarit ${GABARIT} : ${(g.prix_vente_ht * (1 + g.tva / 100)).toFixed(2)} € · coût ${Number(g.cout_achat_ht).toFixed(4)} · ×${g.unites_par_achat}`)
console.log(`   → ${NOM} : ${TTC.toFixed(2)} € · coût ${cout.toFixed(4)} · ×${unites} · ${g.nom_matiere}`)
console.log(`   marge ${(ht - cout).toFixed(2)} € HT · food cost ${(fc * 100).toFixed(0)} %`)

// ⚠️ Comparaison DITE, pas corrigée : c'est le prix du gérant.
const pleinTTC = g.prix_vente_ht * (1 + g.tva / 100)
const temoinTTC = t.prix_vente_ht * (1 + t.tva / 100)
const tqTTC = tq.prix_vente_ht * (1 + tq.tva / 100)
const partCe = TTC / pleinTTC, partTemoin = temoinTTC / tqTTC
console.log(`\n   part du prix plein : ${NOM} ${(partCe * 100).toFixed(0)} % de ${GABARIT} (${pleinTTC.toFixed(2)} €)`)
console.log(`     à comparer : ${TEMOIN} ${(partTemoin * 100).toFixed(0)} % de Tequila 4 cl`)
// ⚠️ Cette ligne était écrite EN DUR (« plus cher que le shot »), vraie pour
// le baby et FAUSSE pour le fetus (40 % contre 60 %). Une phrase figée dans
// une sortie se lit comme un fait : elle se calcule.
console.log(partCe > partTemoin + 0.05
  ? `     ⚠ proportionnellement PLUS cher que le shot — dit, pas corrigé`
  : partCe < partTemoin - 0.05
    ? `     ✓ proportionnellement MOINS cher que le shot`
    : `     ✓ même logique de prix que le shot`)
console.log(`     ${(TTC / CL).toFixed(2)} €/cl, contre ${(pleinTTC / 4).toFixed(2)} €/cl sur la dose pleine`)
if (fc < 0.15) console.log(`   ⚠ food cost ${(fc * 100).toFixed(0)} % : le plus bas du bar, normal sur une petite dose à prix rond`)

if (par[NOM]) {
  const [lien] = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=eq.${par[NOM].id}&select=id`)
  if (lien) { console.log(`\n   = « ${NOM} » existe déjà des DEUX côtés. Rien à faire.\n`); process.exit(0) }
  console.log(`\n   ↻ existe en base mais PAS en caisse — reprise de la seule poussée`)
}
if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 2. la base (le produit doit exister avant d'être poussé) ──────────
let id = par[NOM]?.id
if (!id) {
  id = crypto.randomUUID()
  await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...g, id, nom: NOM, nom_caisse: NOM,
    prix_vente_ht: Number(ht.toFixed(4)),
    cout_achat_ht: cout,
    unites_par_achat: unites,
    created_at: undefined, updated_at: undefined,
    allergenes_complementaires: [],      // distillat : exempté (annexe II)
    allergenes_valides_le: null, allergenes_valides_par: null,
    vendable_online: false,              // l'alcool n'est jamais en ligne
    rupture_le: null, image_url: null,
    reference_fournisseur: g.reference_fournisseur,   // même bouteille
  }]) })
  console.log(`   ✓ base : créé ${id}`)
}

// ── 3. la caisse ──────────────────────────────────────────────────────
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE`)
const modele = plats.find(p => String(p.remote_id) === g.id)
if (!modele) throw new Error(`le gabarit « ${GABARIT} » n'a pas de contrepartie en caisse`)
// ⚠️ tax RECOPIÉ du gabarit, jamais recalculé : un whisky est à 20 % dans les
// deux modes, et un taux posé en dur a déjà produit une sous-collecte (13/10).
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
  remote_id: id, name: NOM,
  price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
  tax: modele.tax, tax_takeaway: modele.tax_takeaway ?? modele.tax,
  tags: modele.tags,
}]) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)

const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const plat = apres.find(p => String(p.remote_id) === id)
if (!plat) { console.log('   ⚠ aucun identifiant rendu — lien NON enregistré, relancer'); process.exit(1) }
await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
  systeme: 'zelty', identifiant_externe: String(plat.id), recette_id: id, libelle_externe: NOM }]) })
console.log(`   ✓ caisse : plat #${plat.id} · ${(plat.price / 100).toFixed(2)} € · tax ${plat.tax} · tags ${JSON.stringify(plat.tags)}`)
console.log('\n✅ En vente au bar.\n')
