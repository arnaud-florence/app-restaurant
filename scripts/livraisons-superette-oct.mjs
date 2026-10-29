#!/usr/bin/env node
/**
 * Rattrapage des livraisons de pain à la Supérette de l'Issole — les jours
 * livrés mais JAMAIS SAISIS en caisse, du 12 au 22 octobre 2026.
 *
 *   node scripts/livraisons-superette-oct.mjs                 # essai à blanc
 *   node scripts/livraisons-superette-oct.mjs --jour=2026-10-12 --ecrire
 *   node scripts/livraisons-superette-oct.mjs --ecrire         # les 9 jours
 *
 * ⚠️⚠️ CE SCRIPT CRÉE DU CHIFFRE D'AFFAIRES QUI N'EXISTE PAS DANS LA CAISSE
 * AGRÉÉE. La frontière du 24/08 dit que la caisse est la source légale
 * (NF525) et qu'un second encaissement produit « un CA parallèle sans valeur
 * fiscale ». Ici la marchandise est bel et bien PARTIE — c'est une créance
 * réelle, pas du CA inventé — mais elle n'a jamais été tapée. Trois
 * conséquences, toutes assumées et visibles :
 *
 *   1. AUCUNE ligne n'est écrite dans `encaissements_externes` : inventer un
 *      ticket de caisse ferait croire au rapprochement (0139) qu'un ticket
 *      existe chez la caisse alors qu'il n'y en a pas ;
 *   2. `mode_paiement` dit que l'argent N'EST PAS RENTRÉ (`paiements.ts`,
 *      14/10 : la distinction qui compte n'est pas « quel moyen » mais
 *      « l'argent est-il rentré »). Ces ventes sortiront donc en « en
 *      compte », jamais fondues dans les espèces ou la carte ;
 *   3. `source` n'est PAS `CAISSE` — elles ne viennent pas d'elle.
 *
 * ⚠️ LES PRIX SONT CEUX FACTURÉS À CE CLIENT, PAS CEUX DU CATALOGUE.
 * Baguette classique 0,90 € contre 1,20 € au panneau, Jeannette 1,05 €
 * contre 1,40 € : −25 % sur les deux, le tarif d'un revendeur. Prendre le
 * catalogue aurait surfacturé d'un quart, et une facture trop élevée se
 * conteste. Ils sont RELUS sur les tickets réels des 14 et 15/10.
 *
 * ⚠️ L'ARITHMÉTIQUE DE TVA EST CELLE DE LA CAISSE, comprise puis reproduite :
 * HT et TVA arrondis PAR UNITÉ à 2 décimales (0,90 → 0,85 + 0,05 ;
 * 1,05 → 1,00 + 0,05), puis sommés — d'où 18,50 HT / 1,00 de TVA pour
 * 19,50 TTC. Le calcul exact donnerait 18,48 / 1,02 : deux centimes d'écart,
 * mais une facture qui mélange les deux arrondis selon le jour se fait
 * contester. On suit donc les deux jours déjà en base.
 */
import fs from 'node:fs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const ECRIRE = process.argv.includes('--ecrire')
const JOUR = arg('jour')

const env = {}
for (const l of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!/^https?:\/\//.test(SB ?? '') || !KEY) { console.error('.env.local illisible'); process.exit(1) }

const sb = async (chemin, init = {}) => {
  let fatal = null
  for (let n = 1; n <= 4; n++) {
    try {
      const r = await fetch(`${SB}/rest/v1/${chemin}`, {
        ...init,
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
                   Prefer: 'return=representation', ...(init.headers ?? {}) },
      })
      const txt = await r.text()
      if (r.ok) return txt ? JSON.parse(txt) : null
      // ⚠️ Un 4xx ne change pas d'avis au tour suivant : le rejouer masque la
      // cause derrière « injoignable » (défaut du 19/10, refait le 29).
      if (r.status < 500) { fatal = `HTTP ${r.status} — ${txt.slice(0, 300)}`; break }
      console.log(`   tentative ${n} → HTTP ${r.status}`)
    } catch (e) {
      const c = e.cause?.code ?? e.message
      if (String(c).includes('INVALID_URL')) { fatal = `URL illisible (${c})`; break }
      console.log(`   tentative ${n} → ${c}`)
    }
    await new Promise(s => setTimeout(s, 1500 * n))
  }
  throw new Error(fatal ?? 'Supabase injoignable')
}

const CLIENT = 'c16c54a9-c7fe-4045-a8c8-fee16d61f844'
const CLIENT_NOM = "La Supérette de l'Issole"

// Décisions du gérant, 29/10/2026 : le 13 est inclus (son ticket est une
// consommation, pas la livraison) et le dimanche 18 aussi (7 j sur 7).
const JOURS = ['2026-10-12', '2026-10-13', '2026-10-16', '2026-10-17', '2026-10-18',
               '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']

// ⚠️ L'heure est une CONVENTION, pas un relevé : une livraison de pain part le
// matin, et la date du jour est ce qui compte pour facturer. Les deux tickets
// réels portent 14 h 48 et 18 h 25, soit l'heure de passage en caisse, pas
// celle de la livraison.
const HEURE = '07:00:00'

const LIGNES = [
  { nom: 'Baguette classique', qte: 10, ttc: 0.90, ht: 0.85, tva_eur: 0.05 },
  { nom: 'Baguette Jeannette', qte: 10, ttc: 1.05, ht: 1.00, tva_eur: 0.05 },
]
const TVA = 5.5

console.log(`\n🥖 Livraisons non saisies — ${CLIENT_NOM}`)
console.log(ECRIRE ? '   ⚠️  ÉCRITURE RÉELLE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// --- les produits, et leur PRIX RÉEL relu sur les tickets existants ---
const prods = await sb(`recettes?select=id,nom,prix_vente_ht,tva,tag_destination&nom=in.("Baguette classique","Baguette Jeannette")`)
const parNom = new Map(prods.map(p => [p.nom, p]))
for (const l of LIGNES) {
  const p = parNom.get(l.nom)
  if (!p) { console.error(`⛔ produit introuvable : ${l.nom}`); process.exit(1) }
  if (Number(p.tva) !== TVA) { console.error(`⛔ ${l.nom} : TVA ${p.tva} % en base, ${TVA} % attendue`); process.exit(1) }
  l.id = p.id
  l.tag = p.tag_destination
}

// ⚠️ Le tarif est CONTRÔLÉ contre un ticket réel avant d'écrire : si le prix
// consenti à ce client a changé, on ne le devine pas.
const temoin = await sb(`commandes?select=id,commande_articles(recette_id,prix_unitaire_ttc,prix_unitaire_ht,tva_eur)&numero=eq.CAI-ZELTY-587206855`)
const vus = new Map()
for (const a of temoin[0]?.commande_articles ?? []) vus.set(a.recette_id, a)
for (const l of LIGNES) {
  const v = vus.get(l.id)
  if (!v) { console.error(`⛔ ${l.nom} absent du ticket témoin : tarif non vérifiable`); process.exit(1) }
  if (Number(v.prix_unitaire_ttc) !== l.ttc || Number(v.prix_unitaire_ht) !== l.ht || Number(v.tva_eur) !== l.tva_eur) {
    console.error(`⛔ ${l.nom} : le ticket témoin dit ${v.prix_unitaire_ttc}/${v.prix_unitaire_ht}/${v.tva_eur}, le script ${l.ttc}/${l.ht}/${l.tva_eur}`)
    process.exit(1)
  }
  console.log(`   ✓ ${l.nom.padEnd(22)} ${l.ttc.toFixed(2)} € TTC  (HT ${l.ht.toFixed(2)} · TVA ${l.tva_eur.toFixed(2)})  — tarif confirmé par le ticket du 14/10`)
}

const TTC = LIGNES.reduce((s, l) => s + l.qte * l.ttc, 0)
const HT = LIGNES.reduce((s, l) => s + l.qte * l.ht, 0)
const TVA_EUR = LIGNES.reduce((s, l) => s + l.qte * l.tva_eur, 0)
console.log(`\n   par jour : ${TTC.toFixed(2)} € TTC  ·  ${HT.toFixed(2)} € HT  ·  TVA ${TVA_EUR.toFixed(2)} €`)

const ET = (await sb(`commandes?select=etablissement_id&client_id=eq.${CLIENT}&limit=1`))[0]?.etablissement_id
if (!ET) { console.error('⛔ point de vente introuvable'); process.exit(1) }

const cible = JOUR ? JOURS.filter(j => j === JOUR) : JOURS
if (!cible.length) { console.error(`⛔ ${JOUR} n'est pas dans la liste des jours à rattraper`); process.exit(1) }

let faits = 0, sautes = 0
for (const j of cible) {
  // Idempotence : un jour qui porte DÉJÀ des baguettes pour ce client ne se
  // refait pas. Relancer ne doit jamais doubler une facture.
  const deja = await sb(`commandes?select=numero,commande_articles(recette_id)&client_id=eq.${CLIENT}&created_at=gte.${j}&created_at=lt.${j}T23:59:59&statut=neq.annule`)
  const aDesBaguettes = deja.some(c => (c.commande_articles ?? []).some(a => LIGNES.some(l => l.id === a.recette_id)))
  if (aDesBaguettes) { console.log(`   ⏭  ${j} : des baguettes y sont déjà — sauté`); sautes++; continue }

  const numero = `LIVR-SUPERETTE-${j.replace(/-/g, '')}`
  if (!ECRIRE) { console.log(`   ○ ${j} → ${numero}  ${TTC.toFixed(2)} €`); faits++; continue }

  const [cmd] = await sb('commandes', {
    method: 'POST',
    body: JSON.stringify([{
      numero, client_id: CLIENT, client_nom: CLIENT_NOM, etablissement_id: ET,
      created_at: `${j}T${HEURE}+00:00`,
      statut: 'encaisse',                 // sans ça, le CA ne la voit nulle part
      source: 'COMPTOIR',                 // elle ne vient PAS de la caisse agréée
      mode_paiement: 'compte_client',     // la vente est faite, l'argent n'est pas rentré
      consommation: 'emporter', mode_retrait: 'a_emporter',
      montant_total_ttc: TTC, montant_total_ht: HT,
      tva_total: TVA_EUR, ventilation_tva: { [String(TVA)]: TVA_EUR },
      notes: `Livraison de pain du ${j.split('-').reverse().join('/')} — NON saisie en caisse, ressaisie le 29/10/2026 pour facturation. Aucun ticket de caisse en face : hors Z et hors CA fiscal.`,
    }]),
  })

  const arts = []
  for (const l of LIGNES) {
    // Même FORME que les tickets de la caisse : une ligne par unité. `tva_eur`
    // y est la TVA de la ligne, et avec quantite=1 l'interprétation est sans
    // ambiguïté pour tous les lecteurs existants.
    for (let k = 0; k < l.qte; k++) arts.push({
      commande_id: cmd.id, recette_id: l.id, quantite: 1,
      prix_unitaire_ttc: l.ttc, prix_unitaire_ht: l.ht,
      tva_taux: TVA, tva_eur: l.tva_eur,
      statut: 'servi', tag_destination: l.tag, allergenes_a_eviter: [],
    })
  }
  await sb('commande_articles', { method: 'POST', body: JSON.stringify(arts) })
  console.log(`   ✓ ${j} → ${numero}  ${TTC.toFixed(2)} €  (${arts.length} lignes)`)
  faits++
}

console.log(`\n   ${faits} jour(s) ${ECRIRE ? 'créé(s)' : 'à créer'}${sautes ? `, ${sautes} sauté(s)` : ''}  ·  ${(faits * TTC).toFixed(2)} € TTC`)
if (ECRIRE && faits) {
  // ⚠️ `clients.total_depense` est une COLONNE, pas un calcul à l'affichage
  // (13/10) : sans ce rappel, /admin/clients garderait l'ancien total.
  console.log('\n   → relancer le recalcul du total client : bouton « Recalculer » sur la fiche,')
  console.log('     ou node scripts/releve-client.mjs --nom="Supérette" pour vérifier la somme.')
}
