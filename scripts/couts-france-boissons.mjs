// Coûts d'achat RÉELS du bar — relevé France Boissons (Eazle) du 21/09/2026.
//
// Les coûts du bar étaient les estimations qui avaient servi à bâtir la carte
// (0144). Ils sont remplacés par ce que France Boissons facture vraiment à
// CASATASIA, relevé sur l'espace pro en simulant la commande.
//
// ⚠️ PRIX REMISÉ, JAMAIS LE TARIF. Le tarif affiché sur la fiche produit est
// le prix public pro ; la remise du contrat n'apparaît qu'à la SIMULATION du
// panier. L'écart est important et INÉGAL selon la marque — certaines n'ont
// aucune remise. Calculer sur le tarif aurait faussé les marges de tout le bar.
// (Les taux par marque sont des conditions négociées : ils restent dans le
// relevé local, gitignoré, jamais dans ce dépôt public.)
//
// ⚠️ LES DROITS D'ACCISES SONT UN COÛT. Ils ne se récupèrent pas comme la TVA,
// et sur un spiritueux ils pèsent autant ou plus que la bouteille remisée :
// les ignorer aurait divisé par deux le coût du pastis. Le site ne les
// détaille pas par ligne :
// ils ont été isolés en ajoutant les produits UN PAR UN et en lisant l'écart
// du total à chaque simulation — des droits identiques pour des volumes et
// degrés identiques valident la méthode.
//
// ⚠️ Un produit sous capsule CRD (Martini, Suze) a ses droits DÉJÀ inclus dans
// le prix : 0 € de droits est alors correct, pas un oubli.
//
// La CONSIGNE (fûts, verre consigné) n'est pas un coût : elle revient au
// retour du contenant. Les frais administratifs (4,50 €) sont par commande.
//
// ⚠️ Les COMPOSITES (Kir, Spritz, Monaco…) sont chiffrés sur des DOSES
// STANDARD de bar, écrites ci-dessous. Ce n'est pas une estimation de coût,
// c'est une recette : si le bar sert autrement, l'écart se lit dans la
// démarque. « Alcool + soft » reste hors calcul — le soft ne vient pas de
// France Boissons et l'alcool varie.
//
//   node scripts/couts-france-boissons.mjs [--ecrire]

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const RELEVE = JSON.parse(fs.readFileSync('data/france-boissons-releve-2026-09-21.json', 'utf8'))
const parCle = Object.fromEntries(RELEVE.map(r => [r.cle, r]))
const ref = cle => parCle[cle].colisage.replace(/^c0+/, '').replace(/[a-z]+$/, '')

// Coût de l'unité ACHETÉE = prix remisé + droits (consigne exclue).
const achat = cle => { const r = parCle[cle]; if (!r) throw new Error('relevé absent : ' + cle); return r.remise + r.droits }
// Coût au LITRE, pour les doses et les composites.
const litre = (cle, litres) => achat(cle) / litres

const L = {
  blonde:  litre('blonde Moretti 20L', 20),
  ambree:  litre('ambrée Affligem 20L', 20),
  rose:    litre('vin rosé BIB 10L', 10),
  blanc:   litre('vin blanc BIB 10L', 10),
  rouge:   litre('vin rouge BIB 10L', 10),
  cremant: litre('Crémant Loire 75', 4.5),        // carton de 6 × 75 cl
  prosecco:litre('Prosecco Perlino 75', 4.5),
  cassis:  litre('Crème cassis MB 1L', 1),
  aperol:  litre('Aperol 1L', 1),
  picon:   litre('Picon bière 1L', 1),
  sirop:   litre('sirop grenadine Teiss', 1),
  limonade:litre('limonade Phénix FB VC25', 6),   // caisse 24 × 25 cl
  perrier: litre('Perrier VC 33', 7.92),          // caisse 24 × 33 cl
}

// [produit, coût par unité vendue, matière comptée, unités par achat, relevé source, remarque]
const PLAN = [
  // ── Pression — Moretti 20 L (le fût du panier) et Affligem ambrée 20 L ─
  // Le fût passe de 30 L à 20 L : 80 demis et 40 pintes, plus 120 et 60.
  ['Demi pression',   L.blonde * 0.25, 'Fût Moretti 20 L', 80, 'blonde Moretti 20L'],
  ['Pinte pression',  L.blonde * 0.50, 'Fût Moretti 20 L', 40, 'blonde Moretti 20L'],
  ['Demi ambrée',     L.ambree * 0.25, 'Fût Affligem ambrée 20 L', 80, 'ambrée Affligem 20L'],

  // ── Bouteilles, à l'unité (le colisage viendra de la facture, C=N) ─────
  ['Bière bouteille 33 cl',   achat('bière Heineken VC33') / 24, 'Heineken VC 33 cl', 1, 'bière Heineken VC33'],
  ['Bière sans alcool 33 cl', achat('sans alcool Hnk 0.0 33') / 24, 'Heineken 0.0 33 cl', 1, 'sans alcool Hnk 0.0 33',
    'renommé 33 cl le 21/09 — seul format disponible chez France Boissons'],
  ['Desperados 33 cl',        achat('Desperados VC33') / 24, 'Desperados VC 33 cl', 1, 'Desperados VC33'],
  ['Perrier 33 cl',           achat('Perrier VC 33') / 24, 'Perrier VC 33 cl', 1, 'Perrier VC 33'],
  ['Limonade 25 cl',          achat('limonade Phénix FB VC25') / 24, 'Limonade Phénix VC 25 cl', 1, 'limonade Phénix FB VC25'],
  ['Bouteille Coteaux Varois',achat('Coteaux Varois rosé 75') / 6, 'Coteaux Varois Joio rosé 75 cl', 1, 'Coteaux Varois rosé 75'],
  ['Crémant 75 cl',           achat('Crémant Loire 75') / 6, 'Crémant Monmousseau 75 cl', 1, 'Crémant Loire 75'],

  // ── Spiritueux, dose de 4 cl ─────────────────────────────────────────
  ['Whisky 4 cl',          achat('whisky WL 70cl') / 17.5, "William Lawson's 70 cl", 17.5, 'whisky WL 70cl'],
  ['Whisky premium 4 cl',  achat('whisky JD 70cl') / 17.5, "Jack Daniel's 70 cl", 17.5, 'whisky JD 70cl'],
  ['Vodka 4 cl',           achat('vodka Smirnoff 70') / 17.5, 'Smirnoff 70 cl', 17.5, 'vodka Smirnoff 70'],
  ['Gin 4 cl',             achat('gin Gordons 70') / 17.5, "Gordon's 70 cl", 17.5, 'gin Gordons 70'],
  ['Rhum 4 cl',            achat('rhum Bacardi 70') / 17.5, 'Bacardi 70 cl', 17.5, 'rhum Bacardi 70'],
  ['Digestif 4 cl',        achat('digestif Get27 70') / 17.5, 'Get 27 70 cl', 17.5, 'digestif Get27 70'],

  // ── Apéritifs ────────────────────────────────────────────────────────
  ['Pastis 2 cl',  achat('pastis Ricard 1L') / 50, 'Ricard 1 L', 50, 'pastis Ricard 1L'],
  ['Martini 4 cl', achat('Martini Bianco 1L') / 25, 'Martini Bianco 1 L', 25, 'Martini Bianco 1L', 'droits inclus (CRD)'],
  ['Picon 4 cl',   achat('Picon bière 1L') / 25, 'Picon bière 1 L', 25, 'Picon bière 1L'],
  ['Suze 4 cl',    achat('Suze 1L') / 25, 'Suze 1 L', 25, 'Suze 1L', 'droits inclus (CRD)'],
  ['Porto 6 cl',   achat('Porto tawny FB 75') / 12.5, 'Porto tawny 75 cl', 12.5, 'Porto tawny FB 75'],
  // Le muscat passe au litre : 16,67 doses de 6 cl, et moins cher à la dose.
  ['Muscat 6 cl',  achat('Muscat Rivesaltes 1L V') / (100 / 6), 'Muscat Rivesaltes 1 L', Math.round(10000 / 6) / 100, 'Muscat Rivesaltes 1L V',
    'Muscat de Lunel en rupture — Rivesaltes 1 L retenu'],

  // ── Vin au verre et en pichet — bag-in-box 10 L ──────────────────────
  // 10 L / 12 cl = 83,33 verres (1000 cl / 12). ⚠️ Une première version
  // écrivait 8,33 : coût juste, rendement faux d'un facteur 10 — attrapé par
  // test-matieres-bar.mjs.
  // Le BIB coûte 3 €/L quand la bouteille la
  // moins chère en coûte plus du double : c'est le format du vin servi.
  ['Verre de rosé 12 cl',  L.rose * 0.12,  'Vin rosé BIB 10 L', Math.round(100000 / 12) / 100, 'vin rosé BIB 10L'],
  ['Verre de blanc 12 cl', L.blanc * 0.12, 'Vin blanc BIB 10 L', Math.round(100000 / 12) / 100, 'vin blanc BIB 10L'],
  ['Verre de rouge 12 cl', L.rouge * 0.12, 'Vin rouge BIB 10 L', Math.round(100000 / 12) / 100, 'vin rouge BIB 10L'],
  // Les pichets ne disent pas leur couleur, mais les trois BIB coûtent 2,99
  // à 3,04 €/L : le coût est juste au centime près quelle qu'elle soit. Seul
  // le rattachement au STOCK attend la décision — donc pas de matière.
  ['Pichet 25 cl', L.rose * 0.25, null, null, 'vin rosé BIB 10L', 'couleur à décider — coût identique à 1 centime près'],
  ['Pichet 50 cl', L.rose * 0.50, null, null, 'vin rosé BIB 10L', 'couleur à décider — coût identique à 1 centime près'],

  ['Sirop à l\'eau', L.sirop * 0.02, 'Sirop Teisseire 1 L', 50, 'sirop grenadine Teiss'],

  // ── Composites : doses standard de bar ───────────────────────────────
  ['Kir',         L.blanc * 0.12 + L.cassis * 0.02, null, null, null, '12 cl blanc + 2 cl cassis'],
  ['Kir royal',   L.cremant * 0.12 + L.cassis * 0.02, null, null, null, '12 cl crémant + 2 cl cassis'],
  ['Spritz',      L.aperol * 0.06 + L.prosecco * 0.09 + L.perrier * 0.03, null, null, null, '6 cl Apérol + 9 cl prosecco + 3 cl eau gazeuse'],
  ['Panaché',     L.blonde * 0.125 + L.limonade * 0.125, null, null, null, 'demi : ½ bière + ½ limonade'],
  ['Monaco',      L.blonde * 0.12 + L.limonade * 0.11 + L.sirop * 0.02, null, null, null, '12 cl bière + 11 cl limonade + 2 cl grenadine'],
  ['Picon bière', L.blonde * 0.22 + L.picon * 0.03, null, null, null, '22 cl bière + 3 cl Picon'],
  ['Diabolo',     L.limonade * 0.23 + L.sirop * 0.02, null, null, null, '23 cl limonade + 2 cl sirop'],
]

const bar = await sb('recettes?select=id,nom,prix_vente_ht,tva,cout_achat_ht,nom_matiere,unites_par_achat,reference_fournisseur&tag_destination=eq.BAR&actif=eq.true')
const parNom = new Map(bar.map(r => [r.nom, r]))

const r4 = n => Math.round(n * 10000) / 10000
const f2 = n => n.toFixed(2).replace('.', ',')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — coûts réels France Boissons (remisé + droits) ──\n`)
console.log('  produit'.padEnd(27) + 'prix TTC'.padStart(9) + 'estimé'.padStart(8) + ' → ' + 'réel'.padEnd(7) + 'food cost'.padStart(10))

let ecrits = 0
const alertes = []
for (const [nom, cout, matiere, parAchat, source, remarque] of PLAN) {
  const r = parNom.get(nom)
  if (!r) { console.log('  ⚠️ introuvable : ' + nom); continue }
  const ht = Number(r.prix_vente_ht), ttc = ht * (1 + Number(r.tva) / 100)
  const fc = cout / ht * 100
  const drapeau = fc > 32 ? '  🔴' : fc > 28 ? '  🟡' : ''
  if (fc > 32) alertes.push(`${nom} : ${f2(fc)} %`)
  console.log('  ' + nom.padEnd(25) + (f2(ttc) + ' €').padStart(9) + f2(Number(r.cout_achat_ht)).padStart(8)
    + ' → ' + f2(cout).padEnd(7) + (f2(fc) + ' %').padStart(10) + drapeau + (remarque ? '   · ' + remarque : ''))
  if (!ECRIRE) continue
  const maj = { cout_achat_ht: r4(cout) }
  if (matiere) { maj.nom_matiere = matiere; maj.unites_par_achat = parAchat }
  // La référence France Boissons passe AVANT le libellé au rapprochement des
  // factures (0142) : la première facture scannée se rattachera toute seule.
  // Plusieurs produits peuvent la porter — le demi ET la pinte sortent du
  // même fût, chacun avec son `unites_par_achat`.
  if (source && matiere) maj.reference_fournisseur = ref(source)
  await sb('recettes?id=eq.' + r.id, { method: 'PATCH', body: JSON.stringify(maj) })
  ecrits++
}

console.log(`\n  ${PLAN.length} produits chiffrés sur ${bar.length} — « Alcool + soft » reste hors calcul (le soft ne vient pas de France Boissons).`)
if (alertes.length) console.log(`\n  🔴 au-delà de 32 % :\n    ` + alertes.join('\n    '))
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
else console.log(`\n  → ${ecrits} produit(s) mis à jour.\n`)
