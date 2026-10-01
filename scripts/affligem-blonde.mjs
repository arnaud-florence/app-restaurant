// L'Affligem passe de l'AMBRÉE à la BLONDE — choix du gérant, 30/09/2026 :
// deux pressions, Moretti en lager et Affligem blonde en bière d'abbaye.
//
// ⚠️ « Demi ambrée » DOIT changer de nom. Un client qui commande une ambrée et
// reçoit une blonde d'abbaye n'a pas reçu ce qu'il a demandé — et le prix
// affiché engage. On ne garde pas un libellé qui décrit l'ancien produit.
//
// ⚠️ LE COÛT EST CELUI DU BON DE COMMANDE, C'EST-À-DIRE LE PRIX PUBLIC.
// Les 47 lignes de la commande 47231850 sont au tarif public, sans trace de
// la remise qu'affichait le panier la veille. Tant que ce n'est pas
// tranché avec le commercial, on retient le prix qu'on a sous les yeux :
// surestimer un coût fait fixer un prix prudent, le sous-estimer fait vendre
// à perte. `prix_estime` reste vrai, la première facture tranchera.
//
//   node scripts/affligem-blonde.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')
const f3 = n => n.toFixed(3).replace('.', ',')

const FUT = 107.60          // réf 97087, commande 47231850 — tarif public
const DROITS = 11.04        // relevé du 21/09 sur l'ambrée, même degré (6,7-6,8°)
const DEMIS = 80            // 20 L ÷ 25 cl
const TTC = 3.90            // entre l'ambrée qu'elle remplace (3,30) et la bouteille (4,00)
const TVA = 20              // bière = alcool

const cout = Math.round((FUT + DROITS) / DEMIS * 1e4) / 1e4
const ht = Math.round(TTC / (1 + TVA / 100) * 1e4) / 1e4

// ⚠️ Rejouable : après un premier passage la fiche s'appelle « Demi
// Affligem ». Chercher le seul ancien nom faisait échouer la relance sur un
// travail pourtant déjà fait — et un script qu'on ne peut pas rejouer n'en
// est pas un.
const champs = 'id,nom,nom_caisse,prix_vente_ht,tva,cout_achat_ht,unites_par_achat,nom_matiere,reference_fournisseur'
const [p] = (await sb(`recettes?nom=eq.Demi%20ambr%C3%A9e&select=${champs}`))
  .concat(await sb(`recettes?nom=eq.Demi%20Affligem&select=${champs}`))
if (!p) { console.error('  ✗ ni « Demi ambrée » ni « Demi Affligem » en base'); process.exit(1) }
if (p.nom === 'Demi Affligem' && Math.abs(Number(p.cout_achat_ht) - cout) < 1e-4) {
  console.log(`\n  = déjà basculé : ${p.nom}, ${f2(Number(p.prix_vente_ht) * 1.20)} € TTC, coût ${f3(Number(p.cout_achat_ht))} €\n`)
  process.exit(0)
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — Affligem blonde ──\n`)
console.log(`  Demi ambrée                →  Demi Affligem`)
console.log(`  Fût Affligem ambrée 20 L   →  Fût Affligem blonde 20 L  (réf 115662 → 97087)`)
console.log(`  ${f2(Number(p.prix_vente_ht) * 1.20)} € TTC              →  ${f2(TTC)} € TTC   (HT ${f3(ht)})`)
console.log(`  coût ${f3(Number(p.cout_achat_ht))} €             →  ${f3(cout)} €   = (${f2(FUT)} + ${f2(DROITS)} de droits) ÷ ${DEMIS} demis`)
console.log(`  food cost ${(Number(p.cout_achat_ht) / Number(p.prix_vente_ht) * 100).toFixed(0)} %              →  ${(cout / ht * 100).toFixed(1)} %   ·  marge ${f3(ht - cout)} €`)
console.log(`\n  ⚠️ Coût au tarif PUBLIC : la remise ne figurait pas sur le bon de commande.`)
console.log(`     Signalée au commercial, correction annoncée — à relire sur la facture.`)
console.log(`     Le prix de vente de 3,90 € tient dans les deux cas ; c'est la marge qui change.`)

if (ECRIRE) {
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({
    nom: 'Demi Affligem', nom_caisse: 'Demi Affligem',
    prix_vente_ht: ht, cout_achat_ht: cout,
    nom_matiere: 'Fût Affligem blonde 20 L', reference_fournisseur: '97087',
    unites_par_achat: DEMIS }) })
  console.log('\n  ✓ fiche mise à jour')
}

// ── Caisse : le bouton doit changer de nom ET de prix ─────────────────
if (!Z) { console.log('  (caisse ignorée)\n'); process.exit(0) }
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.error(`  ✗ ${plats.length} plats lus — lecture ratée, caisse non touchée.`); process.exit(1) }
const d = plats.find(x => String(x.remote_id) === String(p.id))
if (!d) { console.log('  ⚠️ sans correspondance en caisse'); process.exit(0) }
// UPSERT : name, price et tax obligatoires. Ici le NOM change aussi — c'est
// le libellé qui s'imprime sur le ticket du client.
if (d.price == null || d.tax == null) { console.error('  ✗ champ obligatoire manquant — refus'); process.exit(1) }
const c = Math.round(TTC * 100)
console.log(`\n  caisse #${d.id} : « ${d.name} » ${f2(d.price / 100)} €  →  « Demi Affligem » ${f2(TTC)} €`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST',
  headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ id: d.id, name: 'Demi Affligem', price: c, price_togo: c, tax: d.tax, tax_takeaway: d.tax_takeaway }]) })
const j = await r.json().catch(() => ({}))
console.log(`  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plat · errno ${j.errno}\n`)
