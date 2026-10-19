// LE COCA 33 CL À 3,20 € EN SALLE — 17/10/2026.
//
// Décision du gérant : « c'est 3,20 le coca 33 », dit juste après qu'on ait
// rendu ce produit visible au bar et que je lui aie montré « salle 2,80 € ».
//
// ⚠️ C'EST LE PRIX DE SALLE QUI CHANGE, PAS CELUI DU COMPTOIR. Le fil portait
// sur le bar depuis deux messages, et 3,20 € est exactement le prix de salle
// du Diabolo — le palier au-dessus des 2,80 € des softs. Le 2,00 € à emporter
// du Fournil ne bouge pas : y appliquer 3,20 € serait une hausse de 60 % sur
// une canette du comptoir, que personne n'a demandée.
//
// ⚠️ Le 25 cl du bar RESTE à 2,80 €. Le gérant n'a nommé que le 33. Le 33 cl
// devient donc plus cher que le 25 — c'est cohérent, il est plus grand — et
// il rapporte en plus beaucoup plus : coût 0,60 € contre 1,13 € pour le verre
// consigné France Boissons.
//
// ⚠️ `prix_sur_place_ttc` est en TTC (0144), contrairement à `prix_vente_ht` :
// c'est le prix de l'ardoise, celui que le client lit. Le convertir en HT à la
// saisie ferait dériver l'arrondi.
//
// ⚠️ `price_togo` est OMIS de l'upsert, donc PRÉSERVÉ (mesuré le 12/10).
// L'écrire risquerait d'emporter le 2,00 € du comptoir.
//
//   node scripts/coca-33-prix-salle-1710.mjs [--ecrire] [--prix=N]
import fs from 'node:fs'

// ⚠️ Paramétré par `--nom=` le 19/10/2026 : le gérant a demandé le même
// prix de salle pour le Zéro 33 cl. Même geste, mêmes garde-fous — un second
// script quasi identique aurait fini par divergir de celui-ci.
const argS = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const NOM = argS('nom', 'Coca-Cola 33 cl')
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const SALLE = arg('prix', 3.20)
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
      der = `Supabase ${r.status} :: ${t.slice(0, 200)}`
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
      console.log(`   caisse, tentative ${n} sur ${p} → HTTP ${r.status}`)
      if (r.status !== 429 && r.status < 500) return d
    } catch (e) { console.log(`   caisse, tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return d
}

console.log(`\n🥤 « ${NOM} » → ${SALLE.toFixed(2)} € EN SALLE`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const [p] = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht&nom=eq.${encodeURIComponent(NOM)}`)
if (!p) throw new Error(`« ${NOM} » introuvable — rien écrit`)
const emporter = p.prix_vente_ht * (1 + p.tva / 100)
const cout = Number(p.cout_achat_ht)
const m = t => ({ ht: t / (1 + p.tva / 100), marge: t / (1 + p.tva / 100) - cout, fc: cout / (t / (1 + p.tva / 100)) })
const av = m(Number(p.prix_sur_place_ttc)), ap = m(SALLE)
console.log(`   emporter ${emporter.toFixed(2)} € — INCHANGÉ`)
console.log(`   salle    ${Number(p.prix_sur_place_ttc).toFixed(2)} € → ${SALLE.toFixed(2)} €`)
console.log(`   marge    ${av.marge.toFixed(2)} → ${ap.marge.toFixed(2)} € HT   (+${(ap.marge - av.marge).toFixed(2)})`)
console.log(`   food cost ${(av.fc * 100).toFixed(0)} % → ${(ap.fc * 100).toFixed(0)} %`)

const [ref] = await sb(`recettes?select=nom,prix_sur_place_ttc,prix_vente_ht,tva,cout_achat_ht&nom=eq.Coca-Cola%2025%20cl`)
if (ref) {
  const t = Number(ref.prix_sur_place_ttc ?? ref.prix_vente_ht * (1 + ref.tva / 100))
  console.log(`\n   repère  Coca-Cola 25 cl reste à ${t.toFixed(2)} € (coût ${Number(ref.cout_achat_ht).toFixed(4)}, marge ${(t / 1.1 - Number(ref.cout_achat_ht)).toFixed(2)} € HT)`)
}
if (SALLE <= 2.80) console.log(`   ⚠ ${SALLE.toFixed(2)} € n'est plus au-dessus du palier des softs (2,80 €)`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── LA CAISSE D'ABORD (0141) ────────────────────────────────────────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const z = plats.find(x => String(x.remote_id) === p.id)
if (!z) throw new Error(`aucune correspondance de caisse pour « ${NOM} » — rien écrit`)
if (z.name == null || z.tax == null) throw new Error('champ obligatoire manquant côté caisse — on ne construit pas')
const togoAvant = z.price_togo

// ⚠️ name et tax RECOPIÉS tels quels ; `price_togo` OMIS donc préservé ;
// `tags` omis aussi, donc les DEUX rayons posés hier survivent.
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
  id: z.id, name: z.name, tax: z.tax, price: Math.round(SALLE * 100),
}]) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`\n   ✓ caisse : plat #${z.id} → salle ${SALLE.toFixed(2)} €`)

// ── notre base ENSUITE ─────────────────────────────────────────────
await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_sur_place_ttc: SALLE }) })
console.log(`   ✓ base   : prix_sur_place_ttc = ${SALLE.toFixed(2)} €`)

// ── relecture ──────────────────────────────────────────────────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const v = apres.find(x => x.id === z.id)
const [b] = await sb(`recettes?id=eq.${p.id}&select=prix_sur_place_ttc,prix_vente_ht,tva`)
const T = Object.fromEntries(((await zl('catalog/tags')).body.tags ?? []).map(t => [t.id, t.name]))
console.log(`\n   relu caisse : salle ${(v?.price / 100).toFixed(2)} / emporter ${(v?.price_togo / 100).toFixed(2)} · rayons ${JSON.stringify((v?.tags ?? []).map(t => T[t]))}`)
console.log(`   relu base   : salle ${Number(b.prix_sur_place_ttc).toFixed(2)} / emporter ${(b.prix_vente_ht * (1 + b.tva / 100)).toFixed(2)}`)
if (v?.price !== Math.round(SALLE * 100)) { console.log('   ✗ prix de salle non appliqué'); process.exit(1) }
if (v?.price_togo !== togoAvant) { console.log(`   ✗ le prix À EMPORTER a bougé (${togoAvant} → ${v?.price_togo})`); process.exit(1) }
if (Math.abs(Number(b.prix_sur_place_ttc) - SALLE) > 0.005) { console.log('   ✗ écart en base'); process.exit(1) }
if ((v?.tags ?? []).length < 2) console.log('   ⚠ le plat ne porte plus ses deux rayons')
console.log('\n✅ Les deux côtés concordent, le prix du comptoir est intact.\n')
