// LES DEUX LISTES D'ACHAT — la pizzeria et la brasserie, séparées.
//
//   node scripts/liste-achat-cartes.cjs [--pour AAAA-MM-JJ] [--csv]
//
// On ne commande pas les deux de la même façon. Les PIZZAS restent en
// permanence à la carte (décision du gérant) : leur liste est la même
// toutes les semaines, et c'est le socle. La BRASSERIE change chaque
// semaine avec l'ardoise : sa liste est à refaire à chaque fois.
//
// LECTURE SEULE. Aucun bon créé, aucun message envoyé.
//
// ⚠️ AUCUNE SECONDE IMPLÉMENTATION : `listeAchat()` et `VOLUME_CASATASIA`
// viennent de `src/lib/ardoise.ts`, et le stock de
// `chargerLignesReassort()` — exactement ce que lisent `/admin/ardoise` et
// `/admin/reassort`. Un troisième calcul finirait par annoncer une
// quantité que l'écran ne montre pas.
//
// ⚠️⚠️ DEUX CHIFFRES PAR LIGNE, ET ILS NE DISENT PAS LA MÊME CHOSE :
//   • BESOIN  — ce que la semaine consomme ;
//   • À COMMANDER — le besoin MOINS ce qu'on a déjà en stock.
// Les confondre fait racheter ce qui est au frigo. Et un stock inconnu
// n'est pas un stock nul : la ligne le dit plutôt que de supposer zéro.
const fs = require('node:fs'), path = require('node:path')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  interopDefault: true, esmResolve: true,
})
const { createClient } = require('@supabase/supabase-js')
const A = jiti('../src/lib/ardoise.ts')
const R = jiti('../src/lib/reassort.ts')
const { chargerLignesReassort } = jiti('../src/lib/reassort-donnees.ts')

// ⚠️⚠️ UNE REQUÊTE EN ERREUR REND `data` À NULL, PAS UNE EXCEPTION — donc
// une liste d'achat VIDE qui a l'air d'une réponse. Vécu à l'écriture de ce
// script : une colonne inexistante (`conditionnement_achat`) a produit
// « 0 matières » sous une en-tête annonçant 16 pizzas et 280 portions, sans
// le moindre message. On refuse de continuer plutôt que de rendre zéro.
const ou = (r, quoi) => {
  if (r.error) { console.error(`ÉCHEC sur ${quoi} : ${r.error.message}`); process.exit(1) }
  return r.data ?? []
}

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const POUR = arg('--pour') ?? new Date().toISOString().slice(0, 10)
const CSV = process.argv.includes('--csv')
const eur = n => n == null ? '—'
  : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const nb = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 })

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  // ─── L'ardoise qui couvre la semaine visée ───────────────────────────
  // ⚠️⚠️ ON CHARGE LA SEMAINE ENTIÈRE, PAS LE PREMIER JOUR. Les plats du
  // jour sont datés UN PAR UN (date_debut = date_fin) : un filtre sur la
  // seule date de départ n'en voyait qu'UN SUR CINQ, et les quatre autres
  // ne se seraient jamais commandés. Mesuré le 05/10/2026 — la liste
  // sortait à 6 plats de cuisine au lieu de 10, sous une en-tête qui
  // annonçait l'ardoise de la semaine. Rien ne le signalait.
  const FIN = new Date(new Date(POUR + 'T12:00:00Z').getTime() + 6 * 86400_000)
    .toISOString().slice(0, 10)
  const pdj = ou(await sb.from('plats_du_jour')
    .select('id, recette_id, titre, date_debut, date_fin, recettes(nom, tag_destination)')
    .lte('date_debut', FIN).or(`date_fin.is.null,date_fin.gte.${POUR}`), 'plats_du_jour')
  if (!pdj.length) {
    console.error(`Aucune ardoise ne couvre la semaine du ${POUR} au ${FIN}.`); process.exit(1) }

  // ⚠️ DEUX TABLES DE COMPOSITION, et il faut les deux. Un plat de la carte
  // porte sa fiche dans `recette_ingredients` ; un PLAT DU JOUR est hors
  // carte et porte la sienne sur l'OCCURRENCE (0167). N'en lire qu'une
  // laisserait les 140 couverts du midi se commander à l'aveugle.
  const lire = async (t, col) => {
    const out = []
    for (let d = 0; d < 20000; d += 1000) {
      const lot = ou(await sb.from(t).select(`${col}, ingredient_id, quantite, unite`).order('id').range(d, d + 999), t)
      out.push(...lot); if (lot.length < 1000) break
    }
    return out
  }
  const compoFiches = await lire('recette_ingredients', 'recette_id')
  const compoPdj = await lire('plat_du_jour_ingredients', 'plat_du_jour_id')
  const parRecette = new Map(), parPdj = new Map()
  for (const l of compoFiches) (parRecette.get(l.recette_id) ?? parRecette.set(l.recette_id, []).get(l.recette_id)).push(l)
  for (const l of compoPdj) (parPdj.get(l.plat_du_jour_id) ?? parPdj.set(l.plat_du_jour_id, []).get(l.plat_du_jour_id)).push(l)

  const ardoise = pdj.map(p => ({
    id: p.id,
    nom: p.titre ?? p.recettes?.nom ?? '—',
    // ⚠️ Un plat du jour sans recette est de la CUISINE : il est hors carte,
    // et c'est le midi qu'il se sert.
    carte: (p.recettes?.tag_destination === 'PIZZA') ? 'PIZZA' : 'CUISINE',
    // ⚠️ La composition de l'OCCURRENCE prime sur la fiche du produit.
    composition: (parPdj.get(p.id)?.length ? parPdj.get(p.id) : parRecette.get(p.recette_id) ?? [])
      .map(l => ({ ingredient_id: l.ingredient_id, quantite: Number(l.quantite), unite: l.unite })),
  }))

  // ─── Les matières, avec prix et colisage ─────────────────────────────
  const ings = ou(await sb.from('ingredients')
    .select('id, nom, unite, prix_achat_ht, prix_estime, dlc_moyenne_jours')
    .eq('actif', true), 'ingredients')
  // ⚠️ `ingredients` n'a AUCUNE colonne de colisage : on ne sait pas quel est
  // le plus petit lot achetable. `conditionnement: null` fait retomber
  // `listeAchat()` sur un lot de 1, qui est le plancher honnête — on achète
  // au moins une unité. Conséquence à connaître : le RELIQUAT calculé est
  // sous-estimé, puisqu'on ignore qu'il faut prendre le sac entier.
  const matieres = new Map(ings.map(i => [i.id, {
    id: i.id, nom: i.nom, unite: i.unite,
    prix_achat_ht: i.prix_achat_ht == null ? null : Number(i.prix_achat_ht),
    conditionnement: null,
    dlc_jours: i.dlc_moyenne_jours == null ? null : Number(i.dlc_moyenne_jours),
  }]))
  // ⚠️ `prix_estime` a pour DÉFAUT true (0165) : tant que personne n'a
  // prouvé qu'un prix vient d'une facture, il est présumé estimé.
  const estime = new Map(ings.map(i => [i.id, i.prix_estime !== false]))

  // ─── Le stock compté ET le fournisseur retenu ───────────────────────
  const reassort = R.sansComptagePerime(await chargerLignesReassort(sb, POUR))
  const stock = new Map(), ligne = new Map()
  for (const l of reassort) if (l.cle?.startsWith('ing:')) {
    stock.set(l.cle.slice(4), l.tenu)
    ligne.set(l.cle.slice(4), l)
  }

  // ⚠️⚠️ LE FOURNISSEUR VIENT DU COMPARATEUR, PAS DU CHAMP ATTITRÉ.
  // Première version de ce script : il écrivait `fournisseur_principal`
  // tel quel. Résultat signalé par le gérant le 05/10/2026 — la liste
  // envoyait l'emmental et la mozzarella chez Gineys alors que le
  // comparateur les donne 9,5 % moins cher chez Félix Potin et 12 % moins
  // cher chez Gel Var. Le beurre doux et les olives y perdaient 30 % et
  // 25 %.
  //
  // C'était la TROISIÈME implémentation de la même question, celle que ce
  // projet refuse partout ailleurs : `/admin/reassort` et l'agent Stock
  // passent par `fournisseurRetenu()`, ce script l'ignorait. Toute la
  // plateforme de comparaison ne sert à rien si la liste qu'on imprime
  // la contourne.
  const retenu = id => {
    const l = ligne.get(id)
    if (!l) return { nom: null, bascule: false, ecart: null }
    const r = R.fournisseurRetenu(l, true)   // true = au moins cher
    return r
      ? { nom: r.nom, bascule: r.bascule, ecart: r.bascule ? l.ailleurs?.ecartPct ?? null : null,
          de: r.bascule ? l.fournisseur : null }
      : { nom: null, bascule: false, ecart: null }
  }
  const fourn = new Map(ings.map(i => [i.id, retenu(i.id).nom]))

  // ⚠️⚠️ LE STOCK NE SE DÉDUIT QU'UNE FOIS. Les deux cartes partagent des
  // matières — le camembert est sur « La Camembert » ET sur le camembert
  // rôti, la crème fraîche sur les deux. Déduire le stock dans CHAQUE bloc
  // le comptait deux fois : on aurait sous-commandé de tout ce qu'on a en
  // réserve, sur chaque matière partagée. Les blocs par carte montrent donc
  // le BESOIN (ce que la semaine consomme) ; la commande se fait sur le
  // total, plus bas.
  const bloc = (titre, carte, note) => {
    const plats = ardoise.filter(p => p.carte === carte)
    const lignes = A.listeAchat(plats, A.VOLUME_CASATASIA, matieres)
    const p = A.portionsSemaine(A.VOLUME_CASATASIA)
    console.log(`\n\n╔═══ ${titre}`)
    console.log(`║  ${plats.length} plats · ${p[carte]} portions sur la semaine · ${lignes.length} matières`)
    console.log(`║  ${note}`)
    console.log('╚' + '═'.repeat(62))
    console.log(`\n  ${plats.map(x => x.nom).join(' · ')}\n`)
    console.log('     besoin  unité            coût   fournisseur       matière')
    let T = 0, inconnus = 0, estimes = 0
    for (const l of lignes.sort((a, b) => (b.coutHT ?? 0) - (a.coutHT ?? 0))) {
      const pu = matieres.get(l.ingredient_id)?.prix_achat_ht
      const cout = pu == null ? null : Math.round(l.besoin * pu * 100) / 100
      if (cout == null) inconnus++; else T += cout
      if (estime.get(l.ingredient_id)) estimes++
      console.log(
        `   ${nb(l.besoin).padStart(8)}  ${(l.unite ?? '').slice(0, 12).padEnd(13)} ` +
        `${(cout == null ? 'à confirmer' : eur(cout)).padStart(10)}   ` +
        `${(fourn.get(l.ingredient_id) ?? '⛔ aucun').slice(0, 16).padEnd(17)} ` +
        `${l.nom.slice(0, 34)}${estime.get(l.ingredient_id) ? '  ⚠ prix estimé' : ''}`)
    }
    console.log(`\n   ─── ${eur(T)} de consommation` + (inconnus ? ` · ${inconnus} sans prix connu` : '') +
      ` · ${estimes} prix ESTIMÉS sur ${lignes.length}`)
    return lignes
  }

  console.log(`\nSEMAINE DU ${POUR} AU ${FIN} — volumes : ${A.VOLUME_CASATASIA.midi} couverts le midi (7 j), ` +
    `${A.VOLUME_CASATASIA.soirWeekEnd} le soir ven/sam, ${A.VOLUME_CASATASIA.soirSemaine} les autres soirs, ` +
    `${A.VOLUME_CASATASIA.pizzasAEmporter} pizzas à emporter par soir.`)
  console.log('⚠️ Ce ne sont pas des mesures — aucun couvert n\'a encore été servi.')

  // ─── § SNACKING DU FOURNIL — paninis, sandwiches, salades ───────────
  //
  // ⚠️ ICI LES VOLUMES SONT MESURÉS, pas supposés : 7 jours de ventes
  // réelles (17→24 août 2026), le seul historique que la maison possède.
  // C'est la meilleure base disponible — et il faut dire sa limite : le
  // Fournil tournait SEUL, sans restaurant ni bar. Ces volumes monteront.
  const snacking = async () => {
    const prods = ou(await sb.from('recettes')
      .select('id, nom, categorie').eq('actif', true)
      .in('categorie', ['Panini', 'Sandwich', 'Salade']), 'snacking')
    const ids = prods.map(x => x.id)
    const ventes = []
    for (let d = 0; d < 20000; d += 1000) {
      const lot = ou(await sb.from('commande_articles')
        .select('recette_id, quantite, commandes(created_at, statut)')
        .in('recette_id', ids).order('id').range(d, d + 999), 'ventes')
      ventes.push(...lot); if (lot.length < 1000) break
    }
    const vendu = new Map(), jours = new Set()
    for (const v of ventes) {
      if (v.commandes?.statut !== 'encaisse') continue
      jours.add(v.commandes.created_at.slice(0, 10))
      vendu.set(v.recette_id, (vendu.get(v.recette_id) ?? 0) + Number(v.quantite))
    }
    const n = jours.size || 1
    const besoin = new Map(), platsUtiles = []
    for (const p of prods) {
      const parSemaine = Math.round(((vendu.get(p.id) ?? 0) / n) * 7 * 10) / 10
      const compo = parRecette.get(p.id) ?? []
      // ⚠️ Un produit SANS composition ne peut rien demander : la focaccia
      // est en achat-revente, elle se commande telle quelle ailleurs.
      if (!compo.length || parSemaine <= 0) continue
      platsUtiles.push(`${p.nom} ×${parSemaine}`)
      for (const l of compo) besoin.set(l.ingredient_id,
        Math.round(((besoin.get(l.ingredient_id) ?? 0) + Number(l.quantite) * parSemaine) * 1000) / 1000)
    }
    console.log(`\n\n╔═══ SNACKING DU FOURNIL — paninis, sandwiches, salades`)
    console.log(`║  ${platsUtiles.length} produits · volumes MESURÉS sur ${n} jours de ventes réelles (août 2026)`)
    console.log(`║  ⚠️ le Fournil tournait seul à l'époque : ces volumes monteront`)
    console.log('╚' + '═'.repeat(62))
    console.log(`\n  ${platsUtiles.join(' · ')}\n`)
    console.log('     besoin  unité            coût   fournisseur       matière')
    const lignes = []
    let T = 0, inconnus = 0
    for (const [id, q] of [...besoin].sort((x, y) => {
      const px = matieres.get(x[0])?.prix_achat_ht ?? 0, py = matieres.get(y[0])?.prix_achat_ht ?? 0
      return (y[1] * py) - (x[1] * px)
    })) {
      const m = matieres.get(id); if (!m) continue
      const cout = m.prix_achat_ht == null ? null : Math.round(q * m.prix_achat_ht * 100) / 100
      if (cout == null) inconnus++; else T += cout
      lignes.push({ ingredient_id: id, nom: m.nom, unite: m.unite, besoin: q })
      console.log(`   ${nb(q).padStart(8)}  ${(m.unite ?? '').slice(0, 12).padEnd(13)} ` +
        `${(cout == null ? 'à confirmer' : eur(cout)).padStart(10)}   ` +
        `${(fourn.get(id) ?? '⛔ aucun').slice(0, 16).padEnd(17)} ` +
        `${m.nom.slice(0, 34)}${estime.get(id) ? '  ⚠ prix estimé' : ''}`)
    }
    console.log(`\n   ─── ${eur(T)} de consommation` + (inconnus ? ` · ${inconnus} sans prix connu` : ''))
    return lignes
  }

  const a = bloc('TOUTES LES PIZZAS', 'PIZZA',
    'Elles restent en permanence à la carte : cette liste ne change pas d\'une semaine à l\'autre.')
  const b = bloc('RESTAURATION — l\'ardoise de la semaine', 'CUISINE',
    'Elle change chaque semaine : cette liste est à refaire avec la prochaine ardoise.')

  const c3 = await snacking()

  console.log('\n\n⚠️ CE QUI N\'EST PAS DANS CES LISTES, SUR TA DEMANDE : pains,')
  console.log('   viennoiseries, pâtisseries, desserts, gourmandises, glaces et')
  console.log('   boissons. Ce sont des produits ACHETÉS TELS QUELS — tu choisis')
  console.log('   les quantités. Ils figurent dans la commande complète')
  console.log('   (`commande-semaine.cjs`), dimensionnés sur leurs cibles.')

  // ─── CE QU'IL FAUT COMMANDER : le total des trois, moins le stock ────
  const besoin = new Map()
  const quelle = l => a.includes(l) ? 'pizza' : b.includes(l) ? 'resto' : 'snacking'
  for (const l of [...a, ...b, ...c3]) {
    const e = besoin.get(l.ingredient_id)
    besoin.set(l.ingredient_id, e
      ? { ...e, besoin: Math.round((e.besoin + l.besoin) * 1000) / 1000,
          cartes: e.cartes.includes(quelle(l)) ? e.cartes : e.cartes + ' + ' + quelle(l) }
      : { ...l, cartes: quelle(l) })
  }

  const parF = new Map()
  let TOTAL = 0, SANS = 0
  const rows = []
  for (const l of besoin.values()) {
    const st = stock.get(l.ingredient_id)
    // ⚠️ UN STOCK INCONNU N'EST PAS UN STOCK NUL. On commande le besoin
    // entier et la ligne le DIT, plutôt que de supposer un frigo plein —
    // supposer l'inverse ferait manquer la marchandise en plein service.
    const q = st == null ? l.besoin : Math.max(0, Math.round((l.besoin - st) * 1000) / 1000)
    if (q <= 0) continue
    const r0 = retenu(l.ingredient_id)
    // ⚠️⚠️ UNE LIGNE QUI BASCULE PART SANS PRIX. Notre coût est celui de
    // NOTRE conditionnement chez l'ANCIEN fournisseur ; celui du nouveau
    // est celui du sien. Afficher le premier sous le nom du second, c'est
    // écrire un prix qui n'a jamais existé — et il ne se signale pas, il
    // se découvre à la facture. Même règle que `lignesCommandables()`,
    // qui met `prix_unitaire_ht` à NULL dans ce cas, jamais à zéro.
    const pu = r0.bascule ? null : matieres.get(l.ingredient_id)?.prix_achat_ht
    const cout = pu == null ? null : Math.round(q * pu * 100) / 100
    if (cout == null) SANS++; else TOTAL += cout
    const f = fourn.get(l.ingredient_id) ?? null
    const k = f ?? '⛔ SANS FOURNISSEUR'
    if (!parF.has(k)) parF.set(k, [])
    parF.get(k).push({ ...l, stock: st, q, cout })
    rows.push({ ...l, fournisseur: f ?? '', stock: st, q, cout })
  }

  console.log(`\n\n╔═══ À COMMANDER — les trois listes réunies, moins le stock`)
  console.log(`║  ⚠️ le stock n'est déduit QU'UNE FOIS : les trois listes partagent des`)
  console.log(`║     matières (camembert, crème fraîche, parmesan…), et le déduire dans`)
  console.log(`║     chaque liste aurait sous-commandé de tout ce qu'on a en réserve.`)
  console.log('╚' + '═'.repeat(62))
  for (const [f, ls] of [...parF].sort((x, y) =>
    y[1].reduce((s, l) => s + (l.cout ?? 0), 0) - x[1].reduce((s, l) => s + (l.cout ?? 0), 0))) {
    const t = ls.reduce((s, l) => s + (l.cout ?? 0), 0)
    console.log(`\n━━━ ${f} — ${ls.length} lignes · ${eur(t)}`)
    for (const l of ls.sort((x, y) => (y.cout ?? 0) - (x.cout ?? 0))) {
      const r = retenu(l.ingredient_id)
      console.log(`      ${nb(l.q).padStart(8)} ${(l.unite ?? '').slice(0, 12).padEnd(13)} ` +
        `${(l.cout == null ? 'à confirmer' : eur(l.cout)).padStart(10)}  ` +
        `${l.nom.slice(0, 36).padEnd(37)}${l.stock == null ? ' stock inconnu' : ''}` +
        // ⚠️ La bascule est DITE : recevoir un bon d'un fournisseur chez
        // qui on n'a jamais commandé, sans savoir pourquoi, c'est le
        // meilleur moyen de ne pas l'envoyer.
        (r.bascule ? `  ↪ ${Math.abs(Math.round(r.ecart ?? 0))} % moins cher qu'à ${r.de}` : ''))
    }
  }
  console.log(`\n╔═══ TOTAL À COMMANDER ${eur(TOTAL)}` + (SANS ? ` · ${SANS} lignes sans prix` : ''))
  console.log('║  ⚠️ la très large majorité de ces prix sont des ESTIMATIONS : aucune')
  console.log('║     facture de ces matières n\'est encore arrivée (0165).')
  console.log('╚' + '═'.repeat(62))

  if (CSV) {
    // ⚠️ DEUX FICHIERS, parce que ce sont DEUX questions. Le détail dit ce
    // que CHAQUE carte consomme — c'est lui qu'on relit pour ajuster une
    // recette. Le consolidé dit ce qu'on COMMANDE, stock déduit une seule
    // fois. Les fondre en un seul obligerait à choisir laquelle des deux
    // on perd.
    const det = ['Section;Matiere;Fournisseur;Besoin semaine;Unite;Prix unitaire HT;Cout HT;Prix releve']
    for (const [sec, lignes] of [['Pizzas', a], ['Restauration', b], ['Snacking Fournil', c3]])
      for (const l of lignes) {
        const pu = matieres.get(l.ingredient_id)?.prix_achat_ht
        det.push([sec, `"${l.nom.replace(/"/g, "'")}"`, fourn.get(l.ingredient_id) ?? '',
          l.besoin, l.unite, pu ?? '', pu == null ? '' : (l.besoin * pu).toFixed(2),
          estime.get(l.ingredient_id) ? 'ESTIME' : 'releve'].join(';'))
      }
    const fd = `data/liste-detail-${POUR}.csv`
    fs.writeFileSync(fd, det.join('\n') + '\n')
    console.log(`\n✓ ${fd}`)

    const out = ['Cartes;Matiere;Fournisseur;Besoin semaine;En stock;A commander;Unite;Cout HT']
    for (const r of rows) out.push([r.cartes, `"${r.nom.replace(/"/g, "'")}"`,
      r.fournisseur, r.besoin, r.stock == null ? 'inconnu' : r.stock, r.q, r.unite, r.cout ?? ''].join(';'))
    const f = `data/liste-achat-cartes-${POUR}.csv`
    fs.writeFileSync(f, out.join('\n') + '\n')
    console.log(`\n✓ ${f}`)
  }
  console.log()
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1) })
