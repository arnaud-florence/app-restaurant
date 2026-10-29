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
 *
 * ⚠️ LE RELEVÉ EST ORGANISÉ PAR JOUR, pas par produit. Un total groupé par
 * article ne dit pas QUAND la marchandise est partie : le client qui vérifie
 * sa facture compte ses journées, pas ses baguettes. Chaque date porte donc
 * ses tickets, ses lignes et son sous-total, et les JOURS SANS LIGNE sont
 * nommés — c'est le seul moyen de distinguer « rien livré ce jour-là » de
 * « livraison non saisie », qui est exactement le trou que le rattrapage du
 * 29/10 a comblé sur neuf jours.
 *
 * ⚠️ LE JOUR EST CALCULÉ EN HEURE DE PARIS, jamais en découpant la chaîne
 * ISO. `created_at` est en UTC : un ticket de soirée à 00 h 30 (le bar ferme
 * à 1 h une fois par mois) s'y lit 22 h 30 la VEILLE, et la facture
 * l'imputerait au mauvais jour. Même piège que `booking_for` côté Zelty.
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
// ⚠️ « 5.5 » est un point ANGLAIS : sur une facture française ça se remarque,
// et dans le CSV un Excel FR le lit comme du TEXTE — la colonne TVA devient
// incalculable. Le taux se formate, il ne se concatène pas.
const pct = t => String(t ?? '').replace('.', ',')

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

// ⚠️ SEULES LES VENTES `encaisse` ENTRENT DANS UNE FACTURE. Sans ce filtre,
// une commande annulée ou restée en attente gonflait le relevé en silence —
// et il aurait divergé de `clients.total_depense`, qui filtre là-dessus
// (lib/clients.ts). Deux chiffres pour la même question, et on ne sait plus
// lequel croire. Ce qui est ÉCARTÉ est compté et dit, jamais masqué.
let filtre = `client_id=eq.${cl.id}&statut=eq.encaisse`
if (MOIS) {
  const [a, m] = MOIS.split('-').map(Number)
  const fin = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  filtre += `&created_at=gte.${MOIS}-01&created_at=lt.${fin}`
}

const cmds = await q(`commandes?select=numero,created_at,statut,montant_total_ttc,montant_total_ht,mode_paiement,commande_articles(quantite,prix_unitaire_ttc,tva_taux,recettes(nom))&${filtre}&order=created_at`)
const ecartees = await q(`commandes?select=numero,created_at,statut,montant_total_ttc&client_id=eq.${cl.id}&statut=neq.encaisse${MOIS ? filtre.slice(filtre.indexOf('&created_at')) : ''}&order=created_at`)

// ⚠️ Le webhook écrit une ligne par article avec quantite=1 : dix baguettes
// font dix lignes. On REGROUPE par produit et par prix — une facture qui
// répète « 1 × Baguette » dix fois se fait contester, et dix lignes
// identiques ne disent pas la même chose que « 10 × ».
const regrouper = articles => {
  const m = new Map()
  for (const a of articles ?? []) {
    const nom = a.recettes?.nom ?? '(produit inconnu)'
    const pu = Number(a.prix_unitaire_ttc ?? 0)
    const cle = `${nom}@@${pu}@@${a.tva_taux}`
    const e = m.get(cle) ?? { nom, pu, tva: a.tva_taux, qte: 0 }
    e.qte += Number(a.quantite ?? 1)
    m.set(cle, e)
  }
  return [...m.values()].sort((a, b) => b.qte * b.pu - a.qte * a.pu)
}

// ⚠️ Le JOUR se calcule en heure de Paris (voir l'en-tête) : découper la
// chaîne ISO imputerait un ticket de 00 h 30 à la veille.
const TZ = { timeZone: 'Europe/Paris' }
const jourDe = iso => new Date(iso).toLocaleDateString('en-CA', TZ)              // AAAA-MM-JJ
const libJour = j => new Date(`${j}T12:00:00Z`)
  .toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', ...TZ })
const heureDe = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...TZ })

const jours = new Map()
const parProduit = new Map()
let ttc = 0, ht = 0
for (const c of cmds) {
  ttc += Number(c.montant_total_ttc ?? 0)
  ht += Number(c.montant_total_ht ?? 0)
  const j = jourDe(c.created_at)
  const e = jours.get(j) ?? { jour: j, tickets: [], ttc: 0, ht: 0 }
  e.tickets.push(c)
  e.ttc += Number(c.montant_total_ttc ?? 0)
  e.ht += Number(c.montant_total_ht ?? 0)
  jours.set(j, e)
  for (const a of c.commande_articles ?? []) {
    const nom = a.recettes?.nom ?? '(produit inconnu)'
    const pu = Number(a.prix_unitaire_ttc ?? 0)
    const cle = `${nom}@@${pu}@@${a.tva_taux}`
    const p = parProduit.get(cle) ?? { nom, pu, tva: a.tva_taux, qte: 0 }
    p.qte += Number(a.quantite ?? 1)
    parProduit.set(cle, p)
  }
}
const parJour = [...jours.values()].sort((a, b) => a.jour.localeCompare(b.jour))

// Le dernier ticket ingéré, toutes caisses : c'est lui qui dit jusqu'où ce
// relevé peut être complet.
const dernier = await q('encaissements_externes?select=encaisse_at,source_caisse&order=encaisse_at.desc&limit=1')
const borne = dernier[0]?.encaisse_at?.slice(0, 16).replace('T', ' ')

console.log(`\n📄 RELEVÉ — ${titre}${MOIS ? `  ·  ${MOIS}` : '  ·  tout l\u2019historique'}`)
console.log(`   contact : ${cl.telephone || '(aucun téléphone)'} · ${cl.email || '(aucun e-mail)'}`)
if (!cl.telephone && !cl.email) console.log('   ⚠ fiche sans contact : aucune facture ne peut partir par e-mail')
if (!cl.adresse) console.log('   ⚠ aucune adresse de facturation')
if (ecartees.length) {
  console.log(`   ⚠ ${ecartees.length} commande(s) ÉCARTÉE(S) — non encaissées, donc hors facture :`)
  for (const c of ecartees) console.log(`      ${(c.created_at ?? '').slice(0, 10)}  ${(c.numero ?? '').padEnd(24)} ${eur(c.montant_total_ttc).padStart(9)}  ${c.statut}`)
}
if (!cmds.length) { console.log('\n   Aucune vente sur cette période.'); process.exit(0) }

console.log(`\n   ${cmds.length} ticket(s) sur ${parJour.length} journée(s)`)

// ── jour par jour, avec le détail de chaque journée ──────────────────────
console.log(`\n   ══════ JOUR PAR JOUR ══════`)
for (const d of parJour) {
  console.log(`\n   ${libJour(d.jour).padEnd(14)} ${d.jour}`)
  for (const c of d.tickets) {
    const conv = (c.numero ?? '').startsWith('LIVR-')
    console.log(`      ${heureDe(c.created_at)}${conv ? '*' : ' '} ${(c.numero ?? '').padEnd(24)} ${eur(c.montant_total_ttc).padStart(9)} TTC   ${(c.mode_paiement ?? '')}`)
    for (const p of regrouper(c.commande_articles)) {
      console.log(`             ${String(p.qte).padStart(3)} × ${p.nom.padEnd(30)} ${eur(p.pu).padStart(8)}  →  ${eur(p.qte * p.pu).padStart(9)}  (TVA ${pct(p.tva)} %)`)
    }
  }
  if (d.tickets.length > 1) {
    console.log(`      ${''.padEnd(27)}── journée ${eur(d.ttc).padStart(9)} TTC   ${eur(d.ht).padStart(9)} HT`)
  }
}
console.log(`\n   * heure de CONVENTION : la livraison n\u2019a pas été tapée en caisse, seule la DATE fait foi.`)

// ── les jours SANS ligne, entre le premier et le dernier ────────────────
// ⚠️ C'est la moitié du contrôle : un jour manquant n'est pas forcément une
// journée sans livraison, c'est peut-être une livraison non saisie. Le dire
// ou le taire décide si la facture est complète ou amputée.
const trous = []
for (let t = libJour(parJour[0].jour).length && Date.parse(`${parJour[0].jour}T12:00:00Z`);
     t <= Date.parse(`${parJour.at(-1).jour}T12:00:00Z`); t += 86400000) {
  const j = new Date(t).toLocaleDateString('en-CA', TZ)
  if (!jours.has(j)) trous.push(j)
}
console.log(`\n   ── Couverture : du ${parJour[0].jour} au ${parJour.at(-1).jour} ──`)
if (!trous.length) console.log(`   ✓ aucun jour sans ligne sur la période : ${parJour.length} journées consécutives`)
else {
  console.log(`   ⚠ ${trous.length} jour(s) SANS aucune ligne — livraison non saisie, ou pas de livraison ?`)
  for (const j of trous) console.log(`      ${libJour(j)}  ${j}`)
}

// ── récapitulatif par produit ───────────────────────────────────────────
console.log(`\n   ══════ RÉCAPITULATIF PAR PRODUIT ══════`)
const tri = [...parProduit.values()].sort((a, b) => b.qte * b.pu - a.qte * a.pu)
for (const p of tri) {
  console.log(`   ${String(p.qte).padStart(4)} × ${p.nom.padEnd(32)} ${eur(p.pu).padStart(9)}  →  ${eur(p.qte * p.pu).padStart(10)}  (TVA ${pct(p.tva)} %)`)
}

console.log(`\n   ════ TOTAL : ${eur(ttc)} TTC   ·   ${eur(ht)} HT ════`)
if (borne) console.log(`\n   ⚠ dernier ticket de caisse entré dans l\u2019outil : ${borne}`)
console.log(`      Ce relevé est complet jusqu\u2019à cette date, et muet au-delà.`)

if (CSV) {
  // ⚠️ CHAQUE LIGNE PORTE SA DATE. Un CSV groupé par produit ne justifie
  // aucune facture : le client vérifie ses journées.
  const nf = `data/releve-${cl.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}${MOIS ? `-${MOIS}` : ''}.csv`
  const num = n => Number(n).toFixed(2).replace('.', ',')
  const l = ['Date;Jour;Ticket;Quantite;Produit;PU TTC;Total TTC;TVA %;Reglement']
  for (const d of parJour) {
    for (const c of d.tickets) {
      for (const p of regrouper(c.commande_articles)) {
        l.push([d.jour, libJour(d.jour), c.numero, p.qte, `"${p.nom}"`,
                num(p.pu), num(p.qte * p.pu), pct(p.tva), c.mode_paiement ?? ''].join(';'))
      }
    }
    l.push(`${d.jour};${libJour(d.jour)};TOTAL JOURNEE;;;;${num(d.ttc)};;`)
  }
  l.push(`;;TOTAL PERIODE;;;;${num(ttc)};;`)
  l.push(`;;TOTAL HT;;;;${num(ht)};;`)
  fs.mkdirSync('data', { recursive: true })
  fs.writeFileSync(nf, '\ufeff' + l.join('\n'), 'utf8')   // BOM : Excel lit l'UTF-8
  console.log(`\n   ✓ écrit : ${nf}  (${l.length - 1} lignes, date sur chacune)`)

  // ⚠️ Les métadonnées partent À CÔTÉ du CSV, pour que le classeur Excel
  // porte la BORNE du flux et les manques de la fiche. Un relevé envoyé sans
  // sa date de dernier ticket se lit comme un relevé à jour — c'est la faute
  // que ce projet traque partout. Même patron que `export-caisse.mjs` :
  // node produit les données, python met en forme.
  const meta = {
    client: titre, periode: MOIS ?? 'tout l\u2019historique',
    tickets: cmds.length, journees: parJour.length,
    ttc, ht, borne: borne ?? null, trous,
    manques: [
      !cl.telephone && !cl.email ? 'fiche sans téléphone ni e-mail : aucune facture ne peut partir' : null,
      !cl.adresse ? 'aucune adresse de facturation' : null,
      ecartees.length ? `${ecartees.length} commande(s) non encaissée(s), écartée(s) du relevé` : null,
    ].filter(Boolean),
  }
  fs.writeFileSync(nf.replace(/\.csv$/, '.meta.json'), JSON.stringify(meta, null, 2), 'utf8')
}
