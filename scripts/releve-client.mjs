#!/usr/bin/env node
/**
 * Relevé des ventes d'UN client — ce qu'il faut pour facturer en fin de mois.
 *
 *   node scripts/releve-client.mjs --nom="Supérette"            # tout l'historique
 *   node scripts/releve-client.mjs --nom="Supérette" --mois=2026-10
 *   node scripts/releve-client.mjs --nom="Supérette" --csv
 *
 * ⚠️ Ce relevé ne voit QUE les ventes entrées dans l'outil. Le chiffre
 * d'affaires n'arrive que par le webhook de la caisse (`GET /orders` rend
 * 0 commande, défaut connu du 12/10) : si le flux est interrompu, le relevé
 * est COMPLET pour ce qu'il montre et MUET sur le reste. Il affiche donc
 * toujours la date du dernier ticket ingéré, toutes caisses confondues —
 * sans elle, un relevé amputé se lit comme un relevé à jour.
 *
 * ⚠️ `clients.total_depense` somme le HT (choix du calcul de fidélité). Pour
 * facturer un professionnel c'est la bonne base ; le TTC est rappelé à côté.
 */
import fs from 'node:fs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const NOM = arg('nom')
const MOIS = arg('mois')            // AAAA-MM
const CSV = process.argv.includes('--csv')
if (!NOM) { console.error('Usage : --nom="…" [--mois=AAAA-MM] [--csv]'); process.exit(1) }

const env = {}
for (const l of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!/^https?:\/\//.test(SB ?? '') || !KEY) {
  console.error('.env.local : NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY illisibles'); process.exit(1)
}

// ⚠️ Un 4xx ne se réessaie pas : une colonne inconnue ne changera pas d'avis
// au tour suivant, et cinq tentatives masquent la vraie cause derrière un
// « Supabase injoignable » (défaut corrigé dans cinq scripts le 19/10).
const q = async chemin => {
  let fatal = null
  for (let n = 1; n <= 4; n++) {
    try {
      const r = await fetch(`${SB}/rest/v1/${chemin}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
      if (r.ok) return r.json()
      const txt = await r.text()
      if (r.status < 500) { fatal = `HTTP ${r.status} — ${txt.slice(0, 200)}`; break }
      console.log(`   tentative ${n} → HTTP ${r.status}`)
    } catch (e) {
      const code = e.cause?.code ?? e.message
      if (String(code).includes('INVALID_URL')) { fatal = `URL Supabase illisible (${code}) — vérifier .env.local`; break }
      console.log(`   tentative ${n} → ${code}`)
    }
    await new Promise(s => setTimeout(s, 1500 * n))
  }
  throw new Error(fatal ?? 'Supabase injoignable')
}

const eur = n => Number(n ?? 0).toFixed(2).replace('.', ',') + ' €'

const clients = await q(`clients?select=id,nom,prenom,telephone,email,adresse,total_depense,nb_visites&nom=ilike.*${encodeURIComponent(NOM)}*`)
if (!clients.length) { console.error(`Aucun client ne correspond à « ${NOM} »`); process.exit(1) }
if (clients.length > 1) {
  // ⚠️ On ne tire pas au sort un destinataire de facture.
  console.error(`${clients.length} clients correspondent — précisez :`)
  for (const c of clients) console.error(`   ${c.nom} ${c.prenom ?? ''}`)
  process.exit(1)
}
const cl = clients[0]
const titre = [cl.nom, cl.prenom].filter(Boolean).join(' ')

let filtre = `client_id=eq.${cl.id}`
if (MOIS) {
  const [a, m] = MOIS.split('-').map(Number)
  const fin = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  filtre += `&created_at=gte.${MOIS}-01&created_at=lt.${fin}`
}

const cmds = await q(`commandes?select=numero,created_at,statut,montant_total_ttc,montant_total_ht,mode_paiement,commande_articles(quantite,prix_unitaire_ttc,tva_taux,recettes(nom))&${filtre}&order=created_at`)

// ⚠️ Le webhook écrit une ligne par article avec quantite=1 : dix baguettes
// font dix lignes. On REGROUPE par produit et par prix — une facture qui
// répète « 1 × Baguette » dix fois se fait contester, et dix lignes
// identiques ne disent pas la même chose que « 10 × ».
const parProduit = new Map()
let ttc = 0, ht = 0
const lignesCmd = []
for (const c of cmds) {
  ttc += Number(c.montant_total_ttc ?? 0)
  ht += Number(c.montant_total_ht ?? 0)
  lignesCmd.push(c)
  for (const a of c.commande_articles ?? []) {
    const nom = a.recettes?.nom ?? '(produit inconnu)'
    const pu = Number(a.prix_unitaire_ttc ?? 0)
    const cle = `${nom}@@${pu}@@${a.tva_taux}`
    const e = parProduit.get(cle) ?? { nom, pu, tva: a.tva_taux, qte: 0 }
    e.qte += Number(a.quantite ?? 1)
    parProduit.set(cle, e)
  }
}

// Le dernier ticket ingéré, toutes caisses : c'est lui qui dit jusqu'où ce
// relevé peut être complet.
const dernier = await q('encaissements_externes?select=encaisse_at,source_caisse&order=encaisse_at.desc&limit=1')
const borne = dernier[0]?.encaisse_at?.slice(0, 16).replace('T', ' ')

console.log(`\n📄 RELEVÉ — ${titre}${MOIS ? `  ·  ${MOIS}` : '  ·  tout l’historique'}`)
console.log(`   contact : ${cl.telephone || '(aucun téléphone)'} · ${cl.email || '(aucun e-mail)'}`)
if (!cl.telephone && !cl.email) console.log('   ⚠ fiche sans contact : aucune facture ne peut partir par e-mail')
if (!cl.adresse) console.log('   ⚠ aucune adresse de facturation')

console.log(`\n   ${cmds.length} ticket(s)\n`)
for (const c of lignesCmd) {
  const d = (c.created_at ?? '').slice(0, 16).replace('T', ' ')
  console.log(`   ${d}   ${(c.numero ?? '').padEnd(22)} ${eur(c.montant_total_ttc).padStart(10)} TTC   ${eur(c.montant_total_ht).padStart(10)} HT   ${c.statut}`)
}

console.log(`\n   ── Détail regroupé par produit ──`)
const tri = [...parProduit.values()].sort((a, b) => b.qte * b.pu - a.qte * a.pu)
for (const p of tri) {
  console.log(`   ${String(p.qte).padStart(4)} × ${p.nom.padEnd(32)} ${eur(p.pu).padStart(9)}  →  ${eur(p.qte * p.pu).padStart(10)}  (TVA ${p.tva} %)`)
}

console.log(`\n   ════ TOTAL : ${eur(ttc)} TTC   ·   ${eur(ht)} HT ════`)
if (borne) console.log(`\n   ⚠ dernier ticket de caisse entré dans l’outil : ${borne}`)
console.log(`      Ce relevé est complet jusqu’à cette date, et muet au-delà.`)

if (CSV) {
  const nf = `data/releve-${cl.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}${MOIS ? `-${MOIS}` : ''}.csv`
  const l = ['Quantite;Produit;Prix unitaire TTC;Total TTC;TVA %']
  for (const p of tri) l.push(`${p.qte};"${p.nom}";${p.pu.toFixed(2).replace('.', ',')};${(p.qte * p.pu).toFixed(2).replace('.', ',')};${p.tva}`)
  l.push(`;TOTAL;;${ttc.toFixed(2).replace('.', ',')};`)
  fs.mkdirSync('data', { recursive: true })
  fs.writeFileSync(nf, '﻿' + l.join('\n'), 'utf8')   // BOM : Excel lit l'UTF-8
  console.log(`\n   ✓ écrit : ${nf}`)
}
