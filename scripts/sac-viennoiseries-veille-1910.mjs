// LE SAC DE VIENNOISERIES DE LA VEILLE, À 2,00 € — 19/10/2026.
//
// Demande du gérant : « ajoute sacs de viennoiseries de la veille a 2€ ».
//
// ⚠️⚠️ CE PRODUIT NE SE JUGE PAS AU FOOD COST, ET C'EST TOUT SON INTÉRÊT.
// Les quatre viennoiseries du Fournil coûtent 0,37 à 0,59 € et se vendent
// 1,40 €. Trois dans un sac à 2,00 € : ~1,50 € de coût pour 1,90 € HT de
// recette, soit ~79 % de food cost — et quatre le mettraient à 105 %.
// Lu ainsi, le produit paraît absurde. Mais l'alternative n'est pas de les
// vendre plus cher : c'est de les JETER. Chaque sac vendu est 2,00 € reprise
// sur une perte déjà consommée. Le bon repère n'est pas le ratio, c'est
// `(ops)/invendus`, qui chiffre la casse.
//
// ⚠️⚠️ AUCUN COÛT D'ACHAT, ET POUR DEUX RAISONS QUI SE CUMULENT :
//  1. le CONTENU VARIE — trois croissants, ou deux pains au chocolat et un
//     chausson. Le chiffrer sur une composition fixe mentirait pour tous les
//     autres sacs : la règle de « Formule CasaTasia », du menu enfant et du
//     bouton « Cocktail » ;
//  2. SURTOUT, il serait compté DEUX FOIS. Ces viennoiseries ont déjà été
//     saisies en casse la veille au soir, avec leur coût FIGÉ au tarif du
//     jour (0129). Leur redonner un coût ici ferait payer deux fois la même
//     marchandise, et ça ne se verrait nulle part.
// Il sort donc en « coût inconnu » (gris), jamais à zéro — un zéro se lirait
// « gratuit » et le ferait passer pour le meilleur produit de la carte (0150).
//
// ⚠️⚠️ FAMILLE « Anti-gaspi », PAS « Viennoiserie », et ce n'est pas un détail
// d'affichage. `estStockable()` exclut par CATÉGORIE : rangé en Viennoiserie,
// ce sac serait devenu STOCKABLE — une ligne à compter chaque semaine à
// `(ops)/inventaire` pour un produit qui n'existe que le matin, et une ligne
// « à paramétrer » au réassort. « Anti-gaspi » est donc déclarée dans
// `CATEGORIES_ASSEMBLEES` LE JOUR MÊME, avant que la liste ne se fasse
// déborder une quatrième fois (après Formule petit-déjeuner, les familles de
// la brasserie et Plat du jour).
//
// ⚠️ Une famille à un seul produit n'a normalement pas sa place sur une
// caisse (règle posée en rangeant la Focaccia en Sandwich). C'est la seconde
// exception assumée après « Tabac », et pour la même raison : le rayon va se
// remplir — pain de la veille, panier surprise. Et surtout, l'autre choix
// créait deux faux SILENCIEUX ; ici l'erreur, s'il y en a une, est un rayon
// mal placé, que le comptoir signale le premier matin.
//
// ⚠️ GLUTEN déclaré, et c'est VRAI PAR DÉFINITION — une viennoiserie est à
// base de farine, quelle que soit celle qu'on met dans le sac. Mais
// `allergenes_valides_le` reste NULL : personne n'a lu les emballages, et le
// lait et les œufs sont probables sans être définitionnels. Le public lira
// donc « information non disponible » (0138), pas « aucun allergène ».
//
// ⚠️ PAS EN LIGNE : le stock n'est connu qu'au matin et varie chaque jour.
// En click & collect, on promettrait ce qu'on n'a peut-être pas.
// « Anti-gaspi » est ajoutée à `JAMAIS_EN_LIGNE` pour que
// `generer-visuels-sans-photo.mjs` ne l'y mette pas au prochain passage —
// troisième fois que cette liste se fait déborder.
//
// ⚠️ TVA 5,5 % à emporter (boulangerie), 10 % sur place. En MILLIÈMES côté
// caisse : 550 / 1000. Un taux recopié d'un script de boissons (1000) sur
// l'emporter sur-collecterait.
//
// ⚠️ PAS de `nom_matiere` : le contenu mélange plusieurs produits.
// ⚠️ PAS de `id_fabrication_place` à la création : Zelty répond 500 (12/10).
// ⚠️ Reprise sur la CORRESPONDANCE de caisse, pas sur le nom : un produit peut
// exister chez nous et pas en caisse (429 au mauvais moment, vécu deux fois).
//
//   node scripts/sac-viennoiseries-veille-1910.mjs [--ecrire] [--prix=N]
import fs from 'node:fs'

const NOM = 'Sac de viennoiseries de la veille'
const GABARIT = 'Croissant'
const FAMILLE = 'Anti-gaspi'
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const TTC = arg('prix', 2.00)
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  let der
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                   Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                   'Content-Type': 'application/json', Prefer: 'return=representation',
                   ...(o.headers || {}) } })
      const t = await r.text()
      if (r.ok) return t ? JSON.parse(t) : null
      der = `Supabase ${r.status} :: ${t.slice(0, 220)}`
      if (r.status < 500) throw new Error(der)
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(`Supabase injoignable : ${der}`)
}
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
        headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                   'Content-Type': 'application/json', ...(o.headers || {}) } })
      d = { status: r.status, body: await r.json().catch(() => ({})) }
      if (r.status === 200) return d
      console.log(`   caisse, tentative ${n} sur ${p} → HTTP ${r.status} ${JSON.stringify(d.body).slice(0, 160)}`)
      if (r.status !== 429 && r.status < 500) return d
    } catch (e) { console.log(`   caisse, tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return d
}

console.log(`\n🥐 « ${NOM} » à ${TTC.toFixed(2)} €`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const [gab] = await sb(`recettes?select=*&nom=eq.${encodeURIComponent(GABARIT)}`)
if (!gab) throw new Error(`gabarit « ${GABARIT} » introuvable — rien écrit`)
if (Number(gab.tva) !== 5.5) throw new Error(`« ${GABARIT} » est à ${gab.tva} % — une viennoiserie est à 5,5 %, rien écrit`)
if (gab.contient_alcool) throw new Error(`« ${GABARIT} » est marqué alcoolisé — le gabarit ne convient pas`)

const vien = await sb('recettes?select=nom,prix_vente_ht,tva,cout_achat_ht&categorie=eq.Viennoiserie&actif=eq.true&order=nom')
const ht = Number((TTC / 1.055).toFixed(4))
console.log(`   famille ${FAMILLE} · FOURNIL · TVA 5,5 % emporter / 10 % sur place`)
console.log(`   ${TTC.toFixed(2)} € TTC = ${ht.toFixed(4)} € HT`)
console.log(`\n   ce que le sac peut contenir :`)
for (const v of vien) console.log(`     ${v.nom.padEnd(24)} vendue ${(v.prix_vente_ht * 1.055).toFixed(2)} € · coût ${Number(v.cout_achat_ht).toFixed(4)} €`)
const couts = vien.map(v => Number(v.cout_achat_ht)).filter(Number.isFinite)
const moy = couts.reduce((a, b) => a + b, 0) / couts.length
for (const n of [2, 3, 4]) {
  const c = moy * n
  console.log(`   ${n} pièces → coût ~${c.toFixed(2)} € · food cost ~${(c / ht * 100).toFixed(0)} %` +
              (c > ht ? `  ⚠ au-dessus du prix : la seule alternative est la POUBELLE` : ''))
}
console.log(`\n   coût d'achat écrit en base : AUCUN — contenu variable, ET la casse est`)
console.log(`   déjà valorisée la veille par (ops)/invendus : un coût ici la compterait deux fois`)
console.log(`   effacés du gabarit : cout_achat_ht ${Number(gab.cout_achat_ht).toFixed(4)}, libelle_achat « ${String(gab.libelle_achat).slice(0, 40)} », reference_fournisseur, nom_matiere`)
console.log(`   allergènes : ["gluten"] — vrai par DÉFINITION, mais NON signé`)

const [existe] = await sb(`recettes?select=id,nom,actif&nom=eq.${encodeURIComponent(NOM)}`)
console.log(`   ${existe ? `⚠ existe déjà (${existe.actif ? 'actif' : 'INACTIF'}) — on ne recrée pas` : 'nouveau produit'}`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. la famille côté caisse, créée si elle manque ─────────────────
let tags = (await zl('catalog/tags')).body.tags ?? []
let tag = tags.find(t => t.name === FAMILLE)
if (!tag) {
  const o = Math.max(0, ...tags.map(t => Number(t.o) || 0)) + 1
  const r = await zl('catalog/tags', { method: 'POST', body: JSON.stringify([{ name: FAMILLE, remote_id: FAMILLE, o }]) })
  if (r.status !== 200) throw new Error(`famille : ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`)
  tags = (await zl('catalog/tags')).body.tags ?? []
  tag = tags.find(t => t.name === FAMILLE)
  if (!tag) throw new Error(`famille « ${FAMILLE} » absente après création — rien poussé`)
  console.log(`\n   ✓ famille « ${FAMILLE} » créée en caisse (#${tag.id}, ordre ${o} — en fin de liste)`)
} else console.log(`\n   = famille « ${FAMILLE} » déjà en caisse (#${tag.id})`)

// ── 2. notre base, par COPIE du gabarit (unites_par_achat est NOT NULL) ──
let prod = existe
if (!prod) {
  const { id, created_at, updated_at, ...base } = gab
  const [cree] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...base,
    nom: NOM, nom_caisse: NOM, categorie: FAMILLE,
    prix_vente_ht: ht, prix_sur_place_ttc: null, tva: 5.5,
    contient_alcool: false, vendable_online: false, actif: true,
    cout_achat_ht: null, libelle_achat: null, reference_fournisseur: null,
    nom_matiere: null, unites_par_achat: 1,
    allergenes_complementaires: ['gluten'], allergenes_valides_le: null, allergenes_valides_par: null,
    description: 'Les viennoiseries non vendues la veille, en sac.',
    procedure: "Contenu VARIABLE selon ce qui reste : aucun coût d'achat n'est "
      + "chiffré, et c'est voulu. Ces viennoiseries ont déjà été saisies en casse "
      + "la veille au soir par (ops)/invendus, avec leur coût figé au tarif du jour "
      + "— leur en redonner un ici compterait deux fois la même marchandise. "
      + "Ce produit ne se juge donc pas au food cost : il se compare à la poubelle.",
    image_url: null, rupture_le: null,
  }]) })
  prod = cree
  console.log(`   ✓ base : « ${prod.nom} » créé · ${prod.id}`)
} else {
  await sb(`recettes?id=eq.${prod.id}`, { method: 'PATCH', body: JSON.stringify({
    prix_vente_ht: ht, tva: 5.5, categorie: FAMILLE, actif: true, vendable_online: false }) })
  console.log(`   ✓ base : « ${prod.nom} » mis à jour · ${prod.id}`)
}

// ── 3. la caisse. Reprise sur la CORRESPONDANCE, pas sur le nom ─────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien poussé`)
const deja = plats.find(x => String(x.remote_id) === prod.id)
if (deja) console.log(`   = déjà en caisse (#${deja.id}) — rien recréé`)
else {
  // ⚠️ tax en MILLIÈMES. 550 à emporter (boulangerie), 1000 sur place : la
  // loi, pas le panneau. ⚠️ PAS de id_fabrication_place sur une création.
  const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
    name: NOM, remote_id: prod.id, tags: [tag.id],
    price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
    tax: 1000, tax_takeaway: 550, disable: false,
  }]) })
  if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 300)}`)
  console.log(`   ✓ caisse : plat créé`)
}

// ── 4. relecture ───────────────────────────────────────────────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const z = apres.find(x => String(x.remote_id) === prod.id)
const [b] = await sb(`recettes?id=eq.${prod.id}&select=nom,categorie,prix_vente_ht,tva,cout_achat_ht,libelle_achat,nom_matiere,vendable_online,allergenes_complementaires,allergenes_valides_le`)
console.log(`\n   relu base   : ${b.nom} · ${b.categorie} · ${(b.prix_vente_ht * 1.055).toFixed(2)} € TTC · coût ${b.cout_achat_ht ?? 'AUCUN'} · libelle_achat ${b.libelle_achat ?? 'AUCUN'} · online ${b.vendable_online} · ${JSON.stringify(b.allergenes_complementaires)} signé ${b.allergenes_valides_le ?? 'non'}`)
if (!z) { console.log('   ✗ ABSENT de la caisse'); process.exit(1) }
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))
console.log(`   relu caisse : #${z.id} « ${z.name} » · ${(z.price / 100).toFixed(2)} / ${(z.price_togo / 100).toFixed(2)} · tax ${z.tax}/${z.tax_takeaway} · famille ${JSON.stringify((z.tags ?? []).map(t => T[t]))}`)
if (z.tax_takeaway !== 550) { console.log('   ✗ TVA à emporter ≠ 5,5 %'); process.exit(1) }
if (z.tax !== 1000) { console.log('   ✗ TVA sur place ≠ 10 %'); process.exit(1) }
if (z.price !== Math.round(TTC * 100)) { console.log('   ✗ prix non appliqué'); process.exit(1) }
if (b.cout_achat_ht != null) { console.log('   ✗ un coût a été copié du gabarit — double comptage de la casse'); process.exit(1) }
if (b.libelle_achat != null) { console.log('   ✗ le libellé Gineys a été copié — le prochain scan écrirait un prix'); process.exit(1) }
if (b.vendable_online) { console.log('   ✗ en ligne : le stock n\'est connu qu\'au matin'); process.exit(1) }
console.log('\n✅ En place, coût inconnu assumé et casse comptée une seule fois.\n')
