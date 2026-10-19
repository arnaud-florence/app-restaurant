// LA CARTE DE LA SEMAINE DU 19 OCTOBRE 2026.
//
// Demande du gérant : « supprime les plats burger et salade de la semaine
// dernière et ajoute les nouveaux plats de cette semaine : American burger
// 17,90 - tortelini 16,50 - salade italienne 15,90 - saint felicien 18,90 -
// Entrecote 19,90 - plat du jour 12,90, 13,90, 14,90 ».
//
// ⚠️ L'ENTRECÔTE EST DÉJÀ LÀ, AU BON PRIX. « Entrecôte grillée » est active à
// 19,90 € depuis la création de la carte, et elle porte son groupe de cuisson.
// Rien à faire — la citer confirme qu'elle reste à l'ardoise.
//
// ⚠️⚠️ « SALADE ITALIENNE » EXISTE DÉJÀ, à 5,40 €, en famille « Salade » : c'est
// la salade en barquette du comptoir. Créer une seconde « Salade italienne » à
// 15,90 € mettrait DEUX libellés identiques sur les tickets, à 10 € d'écart —
// le serveur et le client s'y tromperaient, et le rapprochement des ventes par
// le nom aussi. La grande salade s'appelle donc « Grande salade italienne ».
// ⚠️ C'est MON choix de nom, pas celui du gérant : à renommer d'un mot.
//
// ⚠️⚠️ LE PLAT DU JOUR : TROIS PRIX, DONC TROIS BOUTONS. Un produit ne porte
// qu'un prix, et le gérant dit que le prix change selon le jour. L'existant
// (15,90 €) est RENOMMÉ en « Plat du jour 12,90 € » plutôt que désactivé : il
// est référencé par SIX lignes d'ardoise (`plats_du_jour.recette_id`), et le
// désactiver aurait laissé cet historique pointer sur un produit éteint.
// ⚠️ Le nom porte son prix, donc il devient FAUX si le prix bouge : les deux
// changent ensemble, comme `AFFICHES` et les prix.
// ⚠️ C'est au gérant de pointer l'ardoise du jour sur le bon des trois dans
// `/admin/ardoise`.
//
// ⚠️⚠️ AUCUNE COMPOSITION N'EST COPIÉE — `recette_ingredients` est une autre
// table. Les quatre nouveaux plats sortent donc SANS fiche technique, donc en
// « coût inconnu » (0150), et surtout **le réassort ne commandera rien pour
// eux** : la cible des matières de la restauration se calcule depuis ce qui est
// réellement servi (0167). C'est le chantier qui reste, et il est nommé.
//
// ⚠️⚠️ LES ALLERGÈNES DU GABARIT SONT EFFACÉS, puis on ne pose QUE ce qui est
// vrai PAR DÉFINITION : gluten sur un burger (le pain) et sur des tortellini
// (la pâte), lait sur un Saint-Félicien (c'est un fromage). Rien sur la grande
// salade ni sur les plats du jour — leur contenu n'est pas défini. Aucun n'est
// SIGNÉ : personne n'a lu d'étiquette, donc le public lit « information non
// disponible » (0138). C'est la leçon du Gommé, qui avait hérité des sulfites
// du Martini.
//
// ⚠️ Les champs d'ACHAT du gabarit sont effacés aussi : un plat de restauration
// n'a pas de `libelle_achat`, mais si le gabarit en portait un, le prochain
// scan de facture écrirait son prix sur le nouveau plat (le croissant à 40 €).
//
// ⚠️ ORDRE DES ÉCRITURES : la caisse d'abord pour les MODIFICATIONS (0141), la
// base d'abord pour les CRÉATIONS — un plat Zelty a besoin de notre uuid dans
// `remote_id`, qui n'existe qu'après l'insert. Un produit resté en base et
// absent de la caisse est repris au passage suivant par la CORRESPONDANCE.
//
//   node scripts/ardoise-semaine-1910.mjs [--ecrire]
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

// ── ce qui sort de la carte ────────────────────────────────────────
const RETIRES = ['Burger Montagnard', 'Salade Chèvre chaud']

// ── ce qui entre. `gabarit` donne la famille, le point de vente et la TVA ──
const NOUVEAUX = [
  { nom: 'American burger',         ttc: 17.90, gabarit: 'Burger Montagnard',    alg: ['gluten'] },
  { nom: 'Tortellini',              ttc: 16.50, gabarit: 'Gnocchis forestiers',  alg: ['gluten'] },
  { nom: 'Saint-Félicien',          ttc: 18.90, gabarit: 'Camembert rôti',       alg: ['lait'] },
  { nom: 'Grande salade italienne', ttc: 15.90, gabarit: 'Salade Chèvre chaud',  alg: [] },
  { nom: 'Plat du jour 13,90 €',    ttc: 13.90, gabarit: 'Plat du jour 12,90 €', alg: [] },
  { nom: 'Plat du jour 14,90 €',    ttc: 14.90, gabarit: 'Plat du jour 12,90 €', alg: [] },
]
// ── le plat du jour existant : renommé, pas recréé ─────────────────
const RENOMME = { de: 'Plat du jour', vers: 'Plat du jour 12,90 €', ttc: 12.90 }
// ── déjà en place, cité pour mémoire ───────────────────────────────
const DEJA = [{ nom: 'Entrecôte grillée', ttc: 19.90 }]

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  let der, fatal = false
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
      // ⚠️⚠️ UN 4xx NE SE CORRIGERA PAS EN RÉESSAYANT, et le `throw` d'ici
      // était attrapé par le `catch` juste en dessous : un PGRST204 (colonne
      // inconnue) était rejoué cinq fois, puis annoncé « Supabase injoignable »
      // — trente secondes perdues et un message qui désigne la mauvaise cause.
      if (r.status < 500) { fatal = true; break }
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(fatal ? der : `Supabase injoignable : ${der}`)
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

console.log('\n🍽️  La carte de la semaine du 19 octobre 2026')
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const tousNoms = [...RETIRES, ...NOUVEAUX.map(n => n.nom), ...NOUVEAUX.map(n => n.gabarit),
                  RENOMME.de, RENOMME.vers, ...DEJA.map(d => d.nom)]
const base = await sb(`recettes?select=*&nom=in.(${[...new Set(tousNoms)].map(n => JSON.stringify(n)).join(',')})`)
const parNom = Object.fromEntries(base.map(r => [r.nom, r]))

console.log('── retirés de la carte ──')
for (const n of RETIRES) {
  const p = parNom[n]
  if (!p) { console.log(`   ⚠ « ${n} » introuvable — ignoré`); continue }
  console.log(`   ${p.actif ? '✓ actif → éteint' : '= déjà éteint'}  ${n} (${(p.prix_vente_ht * (1 + p.tva / 100)).toFixed(2)} €)`)
}

console.log('\n── déjà en place, rien à faire ──')
for (const d of DEJA) {
  const p = parNom[d.nom]
  if (!p) { console.log(`   ⚠ « ${d.nom} » introuvable !`); continue }
  const ttc = p.prix_vente_ht * (1 + p.tva / 100)
  console.log(`   ${Math.abs(ttc - d.ttc) < 0.005 && p.actif ? '✓' : '✗'} ${d.nom.padEnd(24)} ${ttc.toFixed(2)} € ${p.actif ? 'actif' : 'INACTIF'} (demandé ${d.ttc.toFixed(2)} €)`)
}

console.log('\n── renommé ──')
// ⚠️ REJOUABLE : après un premier passage le produit porte déjà son
// nouveau nom. Chercher `RENOMME.de` seul rendait le script à usage unique,
// et un script qu'on ne peut pas rejouer n'est pas un script.
const dejaRenomme = !parNom[RENOMME.de] && !!parNom[RENOMME.vers]
const pdj = parNom[RENOMME.de] ?? parNom[RENOMME.vers]
if (!pdj) console.log(`   ⚠ « ${RENOMME.de} » introuvable`)
else if (dejaRenomme) console.log(`   = déjà renommé en « ${RENOMME.vers} » à ${(pdj.prix_vente_ht * (1 + pdj.tva / 100)).toFixed(2)} €`)
else {
  const liens = await sb(`plats_du_jour?select=titre&recette_id=eq.${pdj.id}`)
  console.log(`   « ${RENOMME.de} » → « ${RENOMME.vers} » · ${(pdj.prix_vente_ht * (1 + pdj.tva / 100)).toFixed(2)} € → ${RENOMME.ttc.toFixed(2)} €`)
  console.log(`   ⚠ ${liens.length} ligne(s) d'ardoise le visent — on renomme pour les garder, on ne désactive pas`)
}

console.log('\n── créés ──')
for (const n of NOUVEAUX) {
  const g = parNom[n.gabarit]
  if (!g) { console.log(`   ✗ gabarit « ${n.gabarit} » introuvable — ARRÊT`); process.exit(1) }
  const deja = parNom[n.nom]
  const ht = Number((n.ttc / (1 + g.tva / 100)).toFixed(4))
  console.log(`   ${deja ? '= existe déjà' : 'nouveau'}  ${n.nom.padEnd(26)} ${n.ttc.toFixed(2)} € (HT ${ht.toFixed(4)}) · ${g.categorie} · ${g.tva} % · gabarit « ${n.gabarit} »`)
  console.log(`        allergènes ${JSON.stringify(n.alg)} non signés · effacés du gabarit : ${JSON.stringify(g.allergenes_complementaires ?? [])}, coût ${g.cout_achat_ht ?? 'aucun'}, libelle_achat ${g.libelle_achat ?? 'aucun'}`)
}
console.log('\n   ⚠ aucune composition : le réassort ne commandera rien pour ces plats')
console.log('     (la cible des matières de la restauration se calcule depuis ce qui est servi, 0167)')

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ══ 1. LA CAISSE D'ABORD pour les MODIFICATIONS ════════════════════
const plats0 = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats0.length < 100) throw new Error(`la caisse rend ${plats0.length} plats — LECTURE RATÉE, rien écrit`)
const tags = (await zl('catalog/tags')).body.tags ?? []
const idTag = Object.fromEntries(tags.map(t => [t.name, t.id]))
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))

const modifs = []
for (const n of RETIRES) {
  const p = parNom[n]; if (!p) continue
  const z = plats0.find(x => String(x.remote_id) === p.id)
  if (!z) { console.log(`   ⚠ « ${n} » sans contrepartie en caisse — base seulement`); continue }
  if (z.name == null || z.price == null || z.tax == null) throw new Error(`« ${n} » : champ obligatoire manquant`)
  modifs.push({ id: z.id, name: z.name, price: z.price, tax: z.tax, disable: true })
}
if (pdj && !dejaRenomme) {
  const z = plats0.find(x => String(x.remote_id) === pdj.id)
  if (!z) throw new Error(`« ${RENOMME.de} » sans contrepartie en caisse — rien écrit`)
  if (z.tax == null) throw new Error('tax manquant côté caisse — on ne construit pas')
  modifs.push({ id: z.id, name: RENOMME.vers, tax: z.tax,
                price: Math.round(RENOMME.ttc * 100), price_togo: Math.round(RENOMME.ttc * 100) })
}
if (modifs.length) {
  const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(modifs) })
  if (r.status !== 200) throw new Error(`caisse (modifs) : ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`)
  console.log(`\n   ✓ caisse : ${modifs.length} modification(s)`)
}
// base ensuite
for (const n of RETIRES) {
  const p = parNom[n]; if (!p) continue
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ actif: false }) })
}
if (pdj && !dejaRenomme) await sb(`recettes?id=eq.${pdj.id}`, { method: 'PATCH', body: JSON.stringify({
  nom: RENOMME.vers, nom_caisse: RENOMME.vers,
  prix_vente_ht: Number((RENOMME.ttc / (1 + pdj.tva / 100)).toFixed(4)) }) })
console.log(`   ✓ base   : ${RETIRES.length} éteint(s)${dejaRenomme ? '' : ', 1 renommé'}`)

// ══ 2. LA BASE D'ABORD pour les CRÉATIONS (remote_id = notre uuid) ══
const aPousser = []
for (const n of NOUVEAUX) {
  const g = parNom[n.gabarit]
  let p = parNom[n.nom]
  if (!p) {
    const { id, created_at, updated_at, ...b } = g
    const [cree] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
      ...b,
      nom: n.nom, nom_caisse: n.nom, actif: true,
      prix_vente_ht: Number((n.ttc / (1 + g.tva / 100)).toFixed(4)), prix_sur_place_ttc: null,
      cout_achat_ht: null, libelle_achat: null, reference_fournisseur: null,
      // ⚠⚠ CINQUIÈME champ d'achat (ajouté le 19/10) : `fournisseur_id` se
      // copiait avec le gabarit, attribuant le produit à un fournisseur que RIEN
      // ne prouve — et un bon serait parti là-bas. La 0164 est explicite : trois
      // sources factuelles (facture, référence au catalogue, relevé), jamais une
      // déduction.
      fournisseur_id: null,
      nom_matiere: null, unites_par_achat: 1,
      allergenes_complementaires: n.alg, allergenes_valides_le: null, allergenes_valides_par: null,
      description: null, procedure: null, poids_portion_g: null,
      image_url: null, rupture_le: null, stock_cible: null, stock_minimum: 0,
    }]) })
    p = cree
    console.log(`   ✓ base : « ${p.nom} » créé`)
  } else console.log(`   = base : « ${p.nom} » existe déjà`)
  aPousser.push({ p, n, g })
}

// la caisse ensuite, en UN SEUL POST groupé (429 au 5e appel séparé)
const plats1 = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats1.length < 100) throw new Error(`la caisse rend ${plats1.length} plats — LECTURE RATÉE, rien poussé`)
const creations = []
for (const { p, n, g } of aPousser) {
  if (plats1.some(x => String(x.remote_id) === p.id)) { console.log(`   = caisse : « ${n.nom} » déjà là`); continue }
  const tag = idTag[g.categorie]
  if (!tag) throw new Error(`famille « ${g.categorie} » inconnue de la caisse — rien poussé`)
  // ⚠️ tax en MILLIÈMES. Un plat de restaurant est à 10 % sur place ; à
  // emporter la loi dit 5,5 %, mais ces plats ne s'emportent pas : on recopie
  // le taux du gabarit, qui a déjà été tranché à la création de la carte.
  const zg = plats1.find(x => String(x.remote_id) === g.id)
  if (!zg || zg.tax == null) throw new Error(`gabarit « ${n.gabarit} » illisible en caisse — rien poussé`)
  creations.push({ name: n.nom, remote_id: p.id, tags: [tag],
    price: Math.round(n.ttc * 100), price_togo: Math.round(n.ttc * 100),
    tax: zg.tax, tax_takeaway: zg.tax_takeaway ?? zg.tax, disable: false })
}
if (creations.length) {
  const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(creations) })
  if (r.status !== 200) throw new Error(`caisse (créations) : ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  console.log(`   ✓ caisse : ${creations.length} plat(s) créé(s)`)
}

// ══ 3. relecture ═══════════════════════════════════════════════════
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const relu = await sb(`recettes?select=id,nom,categorie,actif,prix_vente_ht,tva,cout_achat_ht,libelle_achat,allergenes_complementaires&nom=in.(${[...NOUVEAUX.map(n => n.nom), RENOMME.vers, ...RETIRES].map(n => JSON.stringify(n)).join(',')})`)
let ok = true
console.log('')
for (const r of relu) {
  const z = apres.find(x => String(x.remote_id) === r.id)
  const ttc = r.prix_vente_ht * (1 + r.tva / 100)
  const doitEtreEteint = RETIRES.includes(r.nom)
  const attendu = doitEtreEteint ? null
    : (NOUVEAUX.find(n => n.nom === r.nom)?.ttc ?? RENOMME.ttc)
  const bon = doitEtreEteint
    ? (r.actif === false && z?.disable === true)
    : (r.actif === true && z && !z.disable && Math.abs(ttc - attendu) < 0.005
       && z.price === Math.round(attendu * 100) && r.cout_achat_ht == null && r.libelle_achat == null)
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${r.nom.padEnd(26)} ${r.actif ? ttc.toFixed(2) + ' €' : 'éteint'} · caisse ${z ? (z.disable ? 'éteint' : (z.price / 100).toFixed(2) + ' €') : 'ABSENT'} · ${JSON.stringify((z?.tags ?? []).map(t => T[t]))} · alg ${JSON.stringify(r.allergenes_complementaires ?? [])}`)
}
if (!ok) process.exit(1)
console.log('\n✅ Les deux côtés concordent.\n')
