// LE GOMMÉ EST UNE BIÈRE CITRON, PAS UN ANISÉ — 15/10/2026.
//
// Décision du gérant, dite DEUX fois. La fiche le portait en « Apéritif » à
// 2,20 € avec un coût dérivé du Ricard : c'était faux de bout en bout.
//
// ⚠️⚠️ LE PRIX ÉTAIT LE VRAI DÉFAUT. 2,20 € est le tarif des ANISÉS (posé le
// 13/10). Une bière citron contient un DEMI ENTIER : à 2,20 € elle serait
// MOINS CHÈRE qu'un demi nature à 2,80 €, et plus personne ne commanderait
// autre chose. Le nouveau prix n'est pas inventé, il est ANCRÉ deux fois :
//   · le Monaco (bière + limonade + grenadine) est à 3,00 € ;
//   · notre propre supplément « Sirop » sur une bière vaut 0,20 € (créé la
//     veille) → demi 2,80 + sirop 0,20 = 3,00 €.
// Les deux ancrages tombent sur le même nombre.
//
// ⚠️ LE COÛT EST DÉRIVÉ DE CHIFFRES MESURÉS, ET LA DÉRIVATION EST CONTRÔLÉE
// AVANT D'ÉCRIRE (même discipline que la Pinte Picon) :
//     Monaco 0,8729 − Panaché 0,8371 = 0,0358  → le trait de sirop
//     Gommé = Demi pression 0,9159 + 0,0358    = 0,9517 €
// Si l'un des trois coûts de départ a bougé, la dérivation ne vaut plus rien :
// le script REFUSE d'écrire.
//
// ⚠️⚠️ UNE BIÈRE CONTIENT DU GLUTEN. La fiche portait `allergenes = []` quand
// les trois autres bières portent « gluten » — un reste de sa vie d'anisé.
// Rien n'était SIGNÉ (`allergenes_valides_le` est NULL), donc le public lisait
// « information non disponible » et pas « aucun allergène » (0138) : le risque
// n'était pas réalisé, la fiche était fausse quand même.
//
// ⚠️ PAS de `nom_matiere` : il mélange DEUX matières (fût + sirop), comme le
// Monaco et le Panaché. Lui en poser une perdrait l'autre, qui sortirait du
// stock sans que rien ne le signale. Conséquence connue et assumée : le fût ne
// baisse pas quand on vend un Gommé.
//
// ⚠️ PAS de supplément « Sirop » non plus : il est DÉJÀ aromatisé, exactement
// la raison pour laquelle Monaco et Panaché en ont été écartés la veille. L'y
// ajouter créerait un second chemin vers la même boisson, à un autre prix.
//
//   node scripts/gomme-biere-citron-1510.mjs [--ecrire]
import fs from 'node:fs'

const NOM = 'Gommé'
const TTC = 3.00
const FAMILLE = 'Bière'
const ECRIRE = process.argv.includes('--ecrire')

// coûts de référence RELUS en base avant toute dérivation
const ATTENDU = { 'Demi pression': 0.9159, 'Monaco': 0.8729, 'Panaché': 0.8371 }

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
// ⚠️ annonce le code à chaque tour : un helper qui avale le statut fait
// soupçonner un plafond de débit là où c'est un 500 (vécu le 12/10).
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

console.log(`\n🍺 « ${NOM} » — bière citron, et non plus anisé`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// ── 1. relire les coûts de référence, et REFUSER s'ils ont bougé ──────
const refs = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,tva,cout_achat_ht,nom_matiere,allergenes_complementaires,allergenes_valides_le&nom=in.("${NOM}","Demi pression","Monaco","Panaché")`)
const par = Object.fromEntries(refs.map(r => [r.nom, r]))
for (const [n, attendu] of Object.entries(ATTENDU)) {
  const vu = Number(par[n]?.cout_achat_ht)
  if (!par[n]) throw new Error(`« ${n} » introuvable — la dérivation ne tient plus`)
  if (Math.abs(vu - attendu) > 0.0001)
    throw new Error(`coût de « ${n} » : ${vu} attendu ${attendu} — la dérivation ne tient plus, rien écrit`)
  console.log(`   ✓ ${n.padEnd(16)} ${attendu.toFixed(4)} € confirmé en base`)
}
const g = par[NOM]
if (!g) throw new Error(`« ${NOM} » introuvable`)
if (g.allergenes_valides_le)
  throw new Error(`« ${NOM} » porte une déclaration d'allergènes SIGNÉE le ${g.allergenes_valides_le} — la corriger est une décision humaine, pas un script`)

const sirop = Number((ATTENDU['Monaco'] - ATTENDU['Panaché']).toFixed(4))
const cout = Number((ATTENDU['Demi pression'] + sirop).toFixed(4))
const ht = TTC / 1.20   // alcool : 20 % dans les deux modes
const fc = cout / ht

console.log(`\n   trait de sirop  = Monaco − Panaché = ${sirop.toFixed(4)} €`)
console.log(`   coût du Gommé   = demi ${ATTENDU['Demi pression'].toFixed(4)} + ${sirop.toFixed(4)} = ${cout.toFixed(4)} €`)
console.log(`\n   avant : ${(g.prix_vente_ht * (1 + g.tva / 100)).toFixed(2)} € · ${g.categorie} · coût ${Number(g.cout_achat_ht).toFixed(4)} · allergènes ${JSON.stringify(g.allergenes_complementaires)}`)
console.log(`   après : ${TTC.toFixed(2)} € · ${FAMILLE} · coût ${cout.toFixed(4)} · allergènes ["gluten"]`)
console.log(`   marge ${(ht - cout).toFixed(2)} € HT · food cost ${(fc * 100).toFixed(0)} %`)
if (fc > 0.40) console.log(`   ⚠ au-dessus de 40 % — c'est la norme des bières de la maison (demi 39 %), dit plutôt que corrigé`)
if (g.nom_matiere) console.log(`   ⚠ il porte nom_matiere="${g.nom_matiere}" alors qu'il mélange deux matières — à retirer`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 2. LA CAISSE D'ABORD (0141) : si elle refuse, rien n'est désynchronisé ──
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const plat = plats.find(p => String(p.remote_id) === g.id)
if (!plat) throw new Error(`aucune correspondance de caisse pour « ${NOM} »`)
if (plat.name == null || plat.tax == null) throw new Error('champ obligatoire manquant côté caisse — on ne construit pas')

const tags = (await zl('catalog/tags')).body.tags ?? []
const tag = tags.find(t => t.name === FAMILLE)
if (!tag) throw new Error(`famille « ${FAMILLE} » inconnue de la caisse`)

// ⚠️ on RECOPIE name et tax tels quels ; on ne touche QUE le prix et la famille.
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
  id: plat.id, name: plat.name, tax: plat.tax,
  price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
  tags: [tag.id],
}]) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`\n   ✓ caisse : plat #${plat.id} → ${TTC.toFixed(2)} €, famille « ${FAMILLE} »`)

// ── 3. notre base ENSUITE ─────────────────────────────────────────────
const alg = Array.from(new Set([...(g.allergenes_complementaires ?? []), 'gluten']))
await sb(`recettes?id=eq.${g.id}`, { method: 'PATCH', body: JSON.stringify({
  categorie: FAMILLE,
  prix_vente_ht: Number(ht.toFixed(4)),
  cout_achat_ht: cout,
  nom_matiere: null,              // composite : deux matières, aucune ne le représente
  allergenes_complementaires: alg,
  // allergenes_valides_le reste NULL : personne n'a lu d'étiquette (0138)
}) })
console.log(`   ✓ base   : ${FAMILLE} · ${TTC.toFixed(2)} € · coût ${cout.toFixed(4)} · ${JSON.stringify(alg)}`)

// ── 4. relecture, parce que l'écran de confirmation ne prouve rien ────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const v = apres.find(p => p.id === plat.id)
const [b] = await sb(`recettes?id=eq.${g.id}&select=nom,categorie,prix_vente_ht,tva,cout_achat_ht,allergenes_complementaires`)
const ttcBase = b.prix_vente_ht * (1 + b.tva / 100)
console.log(`\n   relu caisse : ${v?.price} centimes · tags ${JSON.stringify(v?.tags)}`)
console.log(`   relu base   : ${b.categorie} · ${ttcBase.toFixed(2)} € · ${JSON.stringify(b.allergenes_complementaires)}`)
if (v?.price !== Math.round(TTC * 100) || Math.abs(ttcBase - TTC) > 0.005)
  { console.log('   ✗ ÉCART après écriture'); process.exit(1) }
console.log('\n✅ Les deux côtés concordent.\n')
