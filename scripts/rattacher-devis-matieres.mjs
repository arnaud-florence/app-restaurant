#!/usr/bin/env node
// Rattache les DEVIS reçus à nos matières — le fournisseur ET son prix.
//
// 51 matières n'avaient aucun fournisseur attitré, alors que 285 lignes de
// devis (Félix Potin 184, La Frite Belge 52, France Boissons 43, Gel Var 26)
// dormaient au catalogue sans être reliées à rien. Le fournisseur manquant
// les tenait hors des bons de commande ; le prix manquant les tenait hors
// de toute comparaison.
//
// ⚠️⚠️ CHAQUE PAIRE EST UNE DÉCISION HUMAINE, PAS UN CALCUL. Le
// rapprochement automatique a été essayé et il produit des horreurs :
// « Roquette » → **ROQUEFORT** (même racine de cinq lettres), « Citron » →
// gâteau au citron, « Glace » → sucre glace, « Sauce burger » → pain
// burger. Un faux rapprochement affiche un « moins cher » qui compare deux
// produits, et fait commander l'un pour l'autre.
//
// ⚠️ ON N'ÉCRIT PAS `ingredients.prix_achat_ht`. Un devis est une
// PROPOSITION, une facture est une PREUVE (0151) — et une assertion du
// test le verrouille. Le prix du devis vit dans `catalogue_fournisseur` et
// sert à COMPARER ; le coût de revient attend la première facture.
//
//   node scripts/rattacher-devis-matieres.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('✗ identifiants Supabase manquants.'); process.exit(1) }
const ECRIRE = process.argv.includes('--ecrire')

// ─── LES PAIRES RETENUES ────────────────────────────────────────────────
// [ notre matière, un fragment SUFFISAMMENT DISTINCTIF de leur désignation ]
// Le fragment doit désigner UNE SEULE ligne : le script refuse d'écrire
// s'il en trouve plusieurs — une désignation ambiguë ferait écrire le prix
// d'un autre produit.
const RETENUES = [
  // — même produit, même format, aucune ambiguïté —
  ['Aubergines grillées (kg)',      'Aubergine grillée'],
  ['Courgettes grillées (kg)',      'Courgette grillée marinée'],
  ['Cerneaux de noix (kg)',         'CERNEAU NOIX INVALIDE'],
  ['Entrecôte de bœuf (kg)',        'ENTRECOTE BOEUF MATUREE'],
  ['Gorgonzola (kg)',               'GORGONZOLA AOP'],
  ['Reblochon (kg)',                'REBLOCHON AOP'],
  ['Huile de friture (litre)',      'HUILE FRITURE GRILL'],
  ['Poivrons en lanières (kg)',     'POIVRON ROUGE VERT LANIERE'],
  ['Lardons fumés (kg)',            'LARDON FUME ALLUMETTE'],
  ['Miel liquide',                  'MIEL MILLE FLEURS'],
  ['Gnocchis frais (kg)',           'GNOCCHIS POMME DE TERRE'],
  ['Frites surgelées (kg)',         'FRITE 10/10 BI-TEMP'],
  ['Pain burger (pièce)',           'PAIN BURGER BRIOCHE'],
  ['Aïoli (kg)',                    'Aïoli — PET 3 L'],

  // — le grammage concorde au gramme près —
  ['Camembert 250 g (pièce)',       'CAMEMBERT S/BTE'],
  ['Burrata 125 g (pièce)',         'BURRATA 20% POT 125G'],

  // — « TR » / « tranché » : c'est bien le produit TRANCHÉ, pas la pièce
  //   entière à travailler. La distinction est celle que la 0151 pose déjà
  //   entre « JAMBON CUIT SUP AC 8K » (à trancher) et le jambon tranché.
  ['Coppa tranchée (kg)',           'COPPA SEL SEC TR'],
  ['Jambon blanc tranché',          'JAMBON CUIT SUP DD 1/2 LUNE'],
  ['Jambon cru tranché (kg)',       'JAMBON CRU PETALE'],
  // ⚠️ « 84TR » = quatre-vingt-quatre TRANCHES : c'est bien du cheddar
  // tranché. C'est le « Cheddar — Tube 1 L » de La Frite Belge qui est
  // une SAUCE, et qui reste écarté juste en dessous.
  ['Cheddar en tranches (kg)',      'CHEDDAR FONDU 26%'],

  // — « émincé » de part et d'autre —
  ['Oignons jaunes émincés (kg)',   'OIGNON EMINCE CN'],

  // — même produit, format à préciser : le lien vaut pour le FOURNISSEUR,
  //   la contenance se tranchera dans /admin/tarifs-fournisseurs —
  ['Câpres (kg)',                   'CAPRE FINE VINAIGRE'],
  ['Viande hachée de bœuf (kg)',    'Viande de boeuf égrenée'],
  ['Steak haché de bœuf 150 g (pièce)', 'STEAK HACHE BOEUF BLACK ANGUS'],
]

// ─── LES PAIRES ÉCARTÉES, ET POURQUOI ───────────────────────────────────
// ⚠️ Cette liste compte autant que l'autre : sans elle, dans six mois, on
// ne saura plus si une paire absente est un oubli ou une décision.
const ECARTEES = [
  ['Roquette (kg)', 'ROQUEFORT AOP', 'un fromage pour une salade — même racine de cinq lettres, rien d’autre'],
  ['Citron (pièce)', 'GATEAU CITRON ROND', 'un gâteau pour un fruit'],
  ['Glace (boule)', 'SUCRE GLACE / NOUGAT GLACE', 'ni l’un ni l’autre n’est une boule de glace'],
  ['Sauce burger maison (kg)', 'PAIN BURGER BRIOCHE', 'le pain, pas la sauce'],
  ['Vinaigrette (litre)', 'CAPRE FINE VINAIGRE', '« vinaigre » n’est pas « vinaigrette »'],
  ['Pommes de terre en rondelles (kg)', 'GNOCCHIS / Purée', 'ni gnocchis ni purée ne sont des rondelles'],
  ['Anneaux de calamars (kg)', 'Calamar anneau crispy', 'panés — le travail diffère, donc le prix aussi'],
  ['Crevettes décortiquées (kg)', 'Crevette entière', 'entière ≠ décortiquée : c’est tout l’écart de prix'],
  ['Chorizo tranché (kg)', 'CHORIZO CULAR / ALLUMETTE', 'pièce entière à trancher, ou allumettes — pas des tranches'],
  ['Cheddar en tranches (kg)', 'Cheddar — Tube 1 L (La Frite Belge)', 'une SAUCE cheddar — c’est le « CHEDDAR FONDU 84TR » de Félix Potin qui est retenu'],
  ['Parmesan (kg)', 'GRANA PADANO PETALE', 'une autre AOP, et en pétales quand il nous le faut râpé'],
  ['Tomates (kg)', 'TOMATE SECHEE / CONCASSEE / CONCENTRE', 'aucune tomate fraîche au devis — séchée, concassée et concentrée sont trois autres produits'],
  ['Salade mesclun (kg)', 'Salade spartacus / taboulé', 'des salades COMPOSÉES, pas de la feuille'],
  ['Oignons rouges émincés (kg)', 'Oignons rouges épluchés', 'épluchés ≠ émincés (règle déjà posée pour La Frite Belge)'],
  ['Champignons émincés (kg)', 'CHAMPIGNON HOTEL 5/1', 'conserve 5/1 : ni le format ni l’état ne concordent'],
  ['Saumon fumé tranché', 'TARTARE SAUMON / Filet', 'ni tartare ni filet ne sont des tranches fumées'],
]

const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}&order=id&offset=${d}&limit=1000`,
      { headers: { apikey: K, Authorization: 'Bearer ' + K } })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300))
    out.push(...j)
    if (j.length < 1000) break
  }
  return out
}

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

async function main() {
  const [ing, cat, fourns] = await Promise.all([
    T('ingredients?select=id,nom,unite,prix_achat_ht,fournisseur_principal&actif=is.true'),
    T('catalogue_fournisseur?select=id,fournisseur_id,designation,prix_ht,unite,ingredient_id,nature&actif=is.true'),
    T('fournisseurs?select=id,nom'),
  ])
  const nomF = new Map(fourns.map(f => [f.id, f.nom]))
  const parNom = new Map(ing.map(i => [i.nom, i]))

  const aEcrire = []
  const problemes = []

  for (const [nomMatiere, fragment] of RETENUES) {
    const m = parNom.get(nomMatiere)
    if (!m) { problemes.push(`matière introuvable : ${nomMatiere}`); continue }
    const hits = cat.filter(c => c.nature === 'devis' && norm(c.designation).includes(norm(fragment)))
    // ⚠️ Un fragment qui désigne PLUSIEURS lignes ferait écrire le prix
    // d'un autre produit. On refuse plutôt que de prendre le premier.
    if (hits.length === 0) { problemes.push(`aucune ligne de devis pour « ${fragment} » (${nomMatiere})`); continue }
    if (hits.length > 1) {
      problemes.push(`AMBIGU — « ${fragment} » désigne ${hits.length} lignes : ${hits.map(h => h.designation.slice(0, 40)).join(' | ')}`)
      continue
    }
    aEcrire.push({ m, c: hits[0], fournisseur: nomF.get(hits[0].fournisseur_id) ?? '?' })
  }

  console.log('\n══ RATTACHEMENT DES DEVIS AUX MATIÈRES ══\n')
  console.log(`${aEcrire.length} paire(s) retenue(s) · ${ECARTEES.length} écartée(s) · ${problemes.length} problème(s)\n`)

  for (const { m, c, fournisseur } of aEcrire) {
    const avant = m.fournisseur_principal && !/^ESTIMATION/i.test(m.fournisseur_principal)
      ? m.fournisseur_principal : '—'
    console.log(`  ${m.nom.padEnd(32)} → ${fournisseur.padEnd(22)} ${Number(c.prix_ht).toFixed(3).padStart(8)} /${(c.unite ?? '?').padEnd(9)} ${c.designation.slice(0, 44)}`)
    if (avant !== '—') console.log(`     ⚠️ remplace « ${avant} »`)
  }

  if (problemes.length) {
    console.log('\n⚠️ À REGARDER :')
    problemes.forEach(p => console.log('   ·', p))
  }

  console.log('\n⛔ ÉCARTÉES VOLONTAIREMENT — et il faut que ça le reste :')
  for (const [a, b, motif] of ECARTEES) {
    console.log(`   ${a.padEnd(32)} ✗ ${b.padEnd(30)} ${motif}`)
  }

  const restantes = ing.filter(i => {
    const b = i.fournisseur_principal || ''
    const sans = !b || /^ESTIMATION/i.test(b)
    return sans && !aEcrire.some(x => x.m.id === i.id)
  })
  console.log(`\n⚠️ ${restantes.length} matière(s) resteront sans fournisseur : aucun devis reçu ne les couvre.`)
  console.log('   C’est une question à poser aux commerciaux, pas une correspondance à forcer.')

  if (!ECRIRE) {
    console.log('\n\n── ESSAI À BLANC — rien n’a été écrit. ──\n')
    return
  }

  console.log('\n\n── ÉCRITURE ──\n')
  let nLien = 0, nFourn = 0
  for (const { m, c, fournisseur } of aEcrire) {
    // 1. le LIEN : c'est lui qui rend le prix du devis comparable
    const r1 = await fetch(`${U}/rest/v1/catalogue_fournisseur?id=eq.${c.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ingredient_id: m.id, cle_comparaison: m.nom }),
    })
    if (r1.ok) nLien++; else console.log(`  ✗ lien ${m.nom} : ${(await r1.text()).slice(0, 120)}`)

    // 2. le FOURNISSEUR ATTITRÉ — ⚠️ mais PAS le prix : un devis n'est pas
    //    une facture, et `prix_achat_ht` est le coût de revient.
    const r2 = await fetch(`${U}/rest/v1/ingredients?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ fournisseur_principal: fournisseur }),
    })
    if (r2.ok) nFourn++; else console.log(`  ✗ fournisseur ${m.nom} : ${(await r2.text()).slice(0, 120)}`)
  }
  console.log(`  ✓ ${nLien} lien(s) tarif ↔ matière · ${nFourn} fournisseur(s) attitré(s).`)
  console.log('  ⚠️ Aucun prix d’achat modifié : un devis n’est pas une facture.')
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1) })
