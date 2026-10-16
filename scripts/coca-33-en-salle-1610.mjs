// LE COCA 33 CL VISIBLE AUSSI AU BAR — 16/10/2026.
//
// Le gérant : « peux-tu ajouter un coca 33 cl », puis, quand j'ai répondu
// qu'il existait : « non c'est le coca 25 cl qui est présent ».
//
// ⚠️⚠️ IL N'Y AVAIT RIEN À CRÉER, ET LE CRÉER AURAIT COÛTÉ CHER. Le produit
// existe (plat caisse #2173093, 2,00 € à emporter / 2,80 € en salle, coût
// 0,60 €, photo, en ligne). Ce qui manquait, c'est sa PLACE : il est en
// famille « Boisson fraîche » — le rayon du comptoir — et le bar travaille
// dans « Boisson salle », où seul le 25 cl figure. C'est la conséquence
// directe de la séparation des deux familles du 13/10.
//
// Une seconde fiche aurait COUPÉ EN DEUX le CA par produit et le stock du
// même Coca, exactement le défaut de « Lin tournesol » / « Pain
// lin-tournesol » qu'il a fallu fusionner à la main. ⚠️ Et Zelty ne sait pas
// supprimer un plat : la fiche en trop serait restée pour toujours.
//
// ⚠️ UN PLAT PEUT PORTER PLUSIEURS FAMILLES : `tags` est un TABLEAU. Un seul
// produit, un seul prix, un seul stock, un seul CA — visible dans les deux
// rayons. C'est la bonne réponse ici parce que le produit porte DÉJÀ deux
// prix (`price` 2,80 en salle, `price_togo` 2,00 à emporter) : le rayon ne
// décide pas du prix, c'est le MODE du ticket qui le fait. Le même bouton
// facture donc juste au comptoir comme à table.
//
// ⚠️ ON NE TOUCHE PAS `recettes.categorie`. Elle est UNE chaîne et elle
// pilote bien autre chose que la caisse : les exclusions d'inventaire, les
// invendus, la commande conseillée, les rayons de `catalogue-achats`, la
// carte imprimée. Le second rayon est un fait de CAISSE, il reste en caisse.
//
// ⚠️ Le contrôle de carte l'accepte : il exige que notre `categorie` soit
// PARMI les familles du plat (`fams.includes`), pas qu'elle soit la seule.
// Et `pousser-familles-zelty.mjs` SAUTE un plat qui porte déjà sa famille,
// donc il ne l'effacera pas. ⚠️ MAIS il écrit `tags: [famille]` sur un plat
// qui ne l'a pas encore : si la `categorie` du Coca 33 cl changeait un jour,
// ce script le repousserait seul et le second rayon disparaîtrait en silence.
//
// ⚠️ CE QUI EST VOLONTAIREMENT LAISSÉ DE CÔTÉ : le Zéro et le Cherry 33 cl
// sont dans le même cas, le gérant n'a nommé que le Coca. Un mot suffit
// (`--aussi-zero`, `--aussi-cherry`).
//
// ⚠️ L'INVENTAIRE LE COMPTERA AU FOURNIL, pas au bar : le produit est
// rattaché au point de vente Fournil, et `(ops)/inventaire?poste=` filtre
// là-dessus. S'il y a deux frigos, le comptage du bar ne le verra pas.
//
//   node scripts/coca-33-en-salle-1610.mjs [--ecrire] [--aussi-zero] [--aussi-cherry]
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const RAYON = 'Boisson salle'
const CIBLES = ['Coca-Cola 33 cl']
if (process.argv.includes('--aussi-zero')) CIBLES.push('Coca-Cola Zéro 33 cl')
if (process.argv.includes('--aussi-cherry')) CIBLES.push('Coca-Cola Cherry 33 cl')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
// ⚠️ Réessai côté BASE aussi : le 16/10 le réseau a rendu des
// UND_ERR_CONNECT_TIMEOUT sur Supabase comme sur Zelty. Un script de lecture
// qui meurt sur un timeout de connexion fait croire à un défaut de données.
const sb = async c => {
  let der
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`,
        { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                     Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })
      if (r.ok) return r.json()
      der = `Supabase ${r.status} :: ${(await r.text()).slice(0, 200)}`
      if (r.status < 500) throw new Error(der)
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(`Supabase injoignable : ${der}`)
}
// ⚠️ annonce le code ET la cause réseau à chaque tour : l'API a rendu des
// ETIMEDOUT de connexion ce matin, et un helper muet fait chercher ailleurs.
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
        headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                   'Content-Type': 'application/json', ...(o.headers || {}) } })
      d = { status: r.status, body: await r.json().catch(() => ({})) }
      if (r.status === 200) return d
      console.log(`   tentative ${n} sur ${p} → HTTP ${r.status}`)
      if (r.status !== 429 && r.status < 500) return d
    } catch (e) { console.log(`   tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return d
}

console.log(`\n🥤 ${CIBLES.join(', ')} → visible aussi dans « ${RAYON} »`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const prod = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht&nom=in.(${CIBLES.map(n => JSON.stringify(n)).join(',')})`)
const absents = CIBLES.filter(n => !prod.some(p => p.nom === n))
if (absents.length) throw new Error(`introuvable(s) : ${absents.join(', ')} — rien écrit`)

// le repère qui décide : à prix de salle ÉGAL, le 33 cl rapporte plus
const [ref] = await sb(`recettes?select=nom,prix_sur_place_ttc,prix_vente_ht,tva,cout_achat_ht&nom=eq.Coca-Cola%2025%20cl`)
const marge = (ttc, tva, cout) => ({ ht: ttc / (1 + tva / 100), m: ttc / (1 + tva / 100) - cout, fc: cout / (ttc / (1 + tva / 100)) })
if (ref) {
  const r = marge(Number(ref.prix_sur_place_ttc ?? ref.prix_vente_ht * (1 + ref.tva / 100)), ref.tva, Number(ref.cout_achat_ht))
  console.log(`   repère  ${ref.nom.padEnd(22)} salle 2,80 € · coût ${Number(ref.cout_achat_ht).toFixed(4)} · marge ${r.m.toFixed(2)} € HT · food cost ${(r.fc * 100).toFixed(0)} %`)
  for (const p of prod) {
    const s = Number(p.prix_sur_place_ttc ?? p.prix_vente_ht * (1 + p.tva / 100))
    const c = marge(s, p.tva, Number(p.cout_achat_ht))
    console.log(`           ${p.nom.padEnd(22)} salle ${s.toFixed(2)} € · coût ${Number(p.cout_achat_ht).toFixed(4)} · marge ${c.m.toFixed(2)} € HT · food cost ${(c.fc * 100).toFixed(0)} %  → +${(c.m - r.m).toFixed(2)} €/verre`)
  }
}

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── la caisse, et elle seule ────────────────────────────────────────
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const tags = (await zl('catalog/tags')).body.tags ?? []
const tag = tags.find(t => t.name === RAYON)
if (!tag) throw new Error(`rayon « ${RAYON} » inconnu de la caisse — rien écrit`)

const corps = []
for (const p of prod) {
  const z = plats.find(x => String(x.remote_id) === p.id)
  if (!z) throw new Error(`« ${p.nom} » n'a pas de contrepartie en caisse — rien écrit`)
  if (z.name == null || z.price == null || z.tax == null)
    throw new Error(`« ${p.nom} » : champ obligatoire manquant côté caisse — on ne construit pas`)
  const avant = (z.tags ?? []).map(t => (typeof t === 'object' ? t?.id : t))
  if (!avant.includes(tags.find(t => t.name === p.categorie)?.id))
    throw new Error(`« ${p.nom} » ne porte pas déjà sa famille « ${p.categorie} » — on n'ajoute pas un second rayon à un plat mal rangé`)
  const fusion = [...new Set([...avant, tag.id])]
  if (fusion.length === avant.length) { console.log(`   = ${p.nom} déjà dans « ${RAYON} »`); continue }
  // ⚠️ name / price / tax RECOPIÉS tels quels : cet upsert peut écraser le
  // prix imprimé sur les tickets. On ne touche QUE `tags`. `price_togo` est
  // OMIS, donc PRÉSERVÉ (mesuré le 12/10) — l'écrire risquerait le 2,00 €.
  corps.push({ id: z.id, name: z.name, price: z.price, tax: z.tax, tags: fusion })
}
if (!corps.length) { console.log('\n   rien à faire.\n'); process.exit(0) }

const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`\n   ✓ ${corps.length} plat(s) envoyé(s)`)

// ── relecture : un ETIMEDOUT ne dit pas que l'écriture a échoué ──────
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
let ok = true
for (const p of prod) {
  const z = apres.find(x => String(x.remote_id) === p.id)
  const fams = (z?.tags ?? []).map(t => T[typeof t === 'object' ? t?.id : t])
  const bon = fams.includes(RAYON) && fams.includes(p.categorie)
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${p.nom.padEnd(23)} rayons ${JSON.stringify(fams)} · salle ${(z?.price / 100).toFixed(2)} / emporter ${(z?.price_togo / 100).toFixed(2)}`)
}
if (!ok) process.exit(1)
console.log('\n✅ Un seul produit, deux rayons.\n')
