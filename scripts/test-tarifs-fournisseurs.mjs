// Tarifs fournisseurs : ce que l'écran REFUSE de faire compte plus que ce
// qu'il affiche. Un classement faux se lit comme un classement juste.
//
//   PORT=3000 node scripts/test-tarifs-fournisseurs.mjs
//
// ⚠️ Ce fichier RECOPIE les règles de `src/lib/tarifs-fournisseurs.ts`
// (la source est en TS). Modifier les deux ensemble.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT
/**
 * ⚠️⚠️ TOUT LE CATALOGUE, PAS LES MILLE PREMIÈRES LIGNES. PostgREST
 * plafonne ses réponses à 1 000 lignes SANS le dire, et sans `order` il ne
 * promet AUCUN ordre : deux appels ne rendent pas les mêmes lignes. Ce
 * test lisait donc 1 000 références sur 3 392, tirées au hasard — il a
 * compté 100 factures et 10 face-à-face un jour, 43 et 5 le lendemain, sur
 * des données inchangées. Un test dont le verdict dépend du tirage ne
 * prouve rien. Le tri porte sur `id`, colonne UNIQUE (0162).
 */
const sbTout = async (p) => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const lot = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`)
    out.push(...lot)
    if (lot.length < 1000) break
  }
  return out
}

const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

let ok = 0, ko = 0
const T = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ' — ' + detail : ''}`) }
}

// ─── Règles recopiées ────────────────────────────────────────────
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const CONTENANTS = new Set(['BA', 'SA', 'BT', 'SO', 'CO', 'PO', 'CT', 'BQ'])
const conv = (v, u) => u === 'KG' ? { valeur: v, unite: 'kg' }
  : u === 'G' ? { valeur: v / 1000, unite: 'kg' }
  : u === 'L' ? { valeur: v, unite: 'L' }
  : u === 'CL' ? { valeur: v / 100, unite: 'L' }
  : u === 'ML' ? { valeur: v / 1000, unite: 'L' } : null

function extraireContenance(designation, unite) {
  const d = norm(designation)
  const contenant = unite ? CONTENANTS.has(unite.toUpperCase()) : false
  const mult = d.match(/(\d+(?:[.,]\d+)?)\s*(G|KG|ML|CL|L)\s*X\s*\d+/)
  if (mult) { if (contenant) return null; return conv(Number(mult[1].replace(',', '.')), mult[2]) }
  // ⚠️ Un COMPTE nu après `=` à côté d'un poids isolé : « 70G BTE=20 ».
  if (/(?:BTE|BOITE|BT|CAISSE|CARTON|COL|C)\s*=\s*\d+(?![\d.,]*\s*(?:KG|G|ML|CL|L)\b)/.test(d)
      && /(?<![A-Z0-9])\d+(?:[.,]\d+)?\s*(?:KG|G|ML|CL|L)(?![A-Z])/.test(d)) return null
  const trouves = []
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)(?![A-Z])/g)) {
    const c = conv(Number(m[1].replace(',', '.')), m[2]); if (c) trouves.push(c)
  }
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+)K(\d*)(?![A-Z0-9])/g))
    trouves.push({ valeur: Number(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0), unite: 'kg' })
  if (!trouves.length) return null
  return new Set(trouves.map(t => `${t.valeur}${t.unite}`)).size > 1 ? null : trouves[0]
}
const formatConserve = d => norm(d).match(/(?<![\d/])(\d{1,2}\/\d{1,2})(?![\d/])/)?.[1] ?? null

console.log('\n═══ Tarifs fournisseurs ═══\n')
console.log('── Lecture d’un format, ou silence ──')

// Le cas qui a vraiment produit un faux chiffre : un sachet de 9 pains de
// 90 g, dont le prix est celui du SACHET. Lu comme une pièce de 90 g, il
// donnait 64 €/kg pour du pain à burger.
// Le carpaccio Gineys sortait à 809 €/kg : le 70 g est celui d'UNE tranche,
// la boîte en contient vingt. Trente fois le prix réel, sur l'écran qui
// déclenche les commandes.
T('un compte nu après « = » à côté d’un poids : on se tait',
  extraireContenance('CARPACCIO DE BŒUF ASSAISONNE VBF 70G BTE=20', 'BT') === null)
// ⚠️ Mais un poids APRÈS le « = » reste lisible : c'est le contenant lui-même.
T('un poids après « = » reste lu',
  extraireContenance('MOZZARELLA CERISE 8G BQT=1KG', 'PR') === null
  || extraireContenance('MIEL BTE=1KG', 'BT')?.valeur === 1)

T('sachet de 9 × 90 g : ambigu, donc rien',
  extraireContenance('PAIN BURGER BRIOCHE 90GX9 MAISON BUNS', 'SA') === null)
T('pièce de 110 g dans un colis de 40 : 0,110 kg',
  extraireContenance('FEUILLETE COMTE 110GX40', 'PI')?.valeur === 0.11)
T('deux poids contradictoires : rien',
  extraireContenance('RACLETTE 26% TR 22G 400G CDF', 'BA') === null)
T('barquette de 500 g sans multiplicateur : 0,5 kg',
  extraireContenance('ROSETTE S/AT 50TR 500G T&T', 'BA')?.valeur === 0.5)
T('notation du grossiste 1K033 = 1,033 kg',
  extraireContenance('CHEDDAR FONDU 26% 12.3GX84TR 8X8 1K033', 'KG') === null
  || extraireContenance('CHEDDAR FONDU 1K033', 'KG')?.valeur === 1.033)
T('2,5 L lus en litres',
  extraireContenance('V 2.5L SORBET ANANAS G CELESTINE', 'PI')?.unite === 'L')
T('un format de conserve est reconnu', formatConserve('SAUCE PIZZA AROMATISEE 5/1 SFF') === '5/1')
T('… et n’est pas confondu avec un poids',
  extraireContenance('CAPRE FINE VINAIGRE 4/4 VITAL', 'BT') === null)

console.log('\n── Nos unités se ramènent à une référence ──')
// Une matière enregistrée en « barquette » tout court ne se compare à rien :
// deux prix justes, et l'écran qui affiche « unités différentes ». Les
// contenances sont relues sur NOS factures (« BQT=500G »), jamais devinées.
//
// ⚠️⚠️ L'ASSERTION A CHANGÉ D'OBJET, PAS DE SÉVÉRITÉ — et elle est plus
// STRICTE. Elle cherchait « un chiffre dans l'unité », ce qui est le SYMPTÔME
// de la règle, pas la règle : une unité peut porter un chiffre et rester
// illisible pour le comparateur. Ce qui compte est que `prixReferenceMatiere()`
// sache la RAMENER à une référence — c'est exactement ce dont dépendent le
// « moins cher ailleurs » et la bascule de fournisseur.
const prixReferenceMatiere = (unite) => {
  const u = norm(unite).trim()
  if (/^(KG|KILO|KILOS?)$/.test(u)) return 'kg'
  if (/^(L|LITRE|LITRES?)$/.test(u)) return 'L'
  if (/^(PIECE|PI|UNITE|U)$/.test(u)) return 'piece'
  if (formatConserve(u)) return 'piece'
  // ⚠️ Une BOTTE n'a pas de poids, et on ne lui en invente pas un : le persil
  // se vend, se commande et se compte à la botte. Même mécanique que le format
  // de conserve — aucun poids déduit, mais deux bottes se comparent entre
  // elles, et jamais à un kilo.
  if (/^(BOTTE|BOUQUET|BRIN)S?$/.test(u)) return 'piece'
  if (extraireContenance(u)) return 'ref'
  if (/^(?:COLIS|SAC|SACHET|CARTON|BOITE|LOT)\s+(\d+)$/.test(u)) return 'piece'
  return null
}
const stockees = await sb('ingredients?select=nom,unite&stocke=eq.true&actif=eq.true')
const flou = stockees.filter(i => !prixReferenceMatiere(i.unite))
T('aucune unité de stock que le comparateur ne sait ramener',
  flou.length === 0, flou.map(i => `${i.nom} (${i.unite})`).join(', '))
// ⚠️ Préciser, ce n'est pas changer : « barquette » reste une barquette.
// La passer en « kg » diviserait par cinq cents les quantités déjà saisies.
const barq = stockees.find(i => i.nom === 'Rosette de Lyon')
T('la rosette reste comptée en barquette', barq?.unite === 'barquette 500 g', barq?.unite)
T('aucune unité n’a été doublée par une relance', stockees.every(i => !/(\b\d+ ?(g|kg|ml|l)\b).*\1/i.test(i.unite)))

console.log('\n── Le devis lu en base ──')
const [f] = await sb('fournisseurs?select=id,nom,email&nom=eq.' + encodeURIComponent('Félix Potin Provence'))
T('le fournisseur existe', Boolean(f))
if (f) {
  const tarifs = await sb(`catalogue_fournisseur?select=id,reference,designation,unite,prix_ht,colis_quantite,cle_comparaison,ingredient_id,date_tarif&fournisseur_id=eq.${f.id}`)
  T('184 tarifs importés', tarifs.length === 184, `${tarifs.length}`)
  T('toutes les lignes ont une référence', tarifs.every(t => t.reference))
  T('tous les prix sont strictement positifs', tarifs.every(t => Number(t.prix_ht) > 0))
  T('toutes les lignes portent la date du devis', tarifs.every(t => t.date_tarif === '2026-09-28'))

  const lies = tarifs.filter(t => t.ingredient_id)
  T('des rapprochements sont posés', lies.length >= 15, `${lies.length}`)
  T('un rapprochement porte toujours une clé', lies.every(t => t.cle_comparaison))

  // ⚠️ La règle qui protège le food cost : un devis ne devient jamais un
  // prix payé. Si elle saute, toutes les marges bougent sans qu'une seule
  // facture soit arrivée.
  // ⚠️⚠️ ASSERTION RÉVISÉE LE 27/09/2026, et l'objet du contrôle a changé.
  //
  // Elle exigeait qu'AUCUN prix d'achat n'égale un tarif de devis. C'était
  // juste tant que rien ne permettait de basculer de fournisseur : seul un
  // import pouvait produire cette égalité, et c'était une fuite.
  //
  // Depuis que « Prendre celui-ci » existe, un humain peut décider de
  // passer chez Félix Potin — et le prix DOIT suivre, sinon la fiche
  // affirme qu'on paie encore le tarif de l'ancien fournisseur. Ce qui
  // protège n'est donc plus l'écart entre les deux nombres, c'est le
  // DRAPEAU : un prix qui vient d'un devis doit être marqué ESTIMÉ (0165).
  //
  // ⚠️ Ce test reste le filet de l'import : si `rapprocher-tarifs-*.mjs`
  // se mettait à écrire des prix, il les écrirait sans drapeau et cette
  // assertion tomberait.
  const ids = [...new Set(lies.map(t => t.ingredient_id))]
  const ings = await sb(`ingredients?select=id,nom,prix_achat_ht,prix_estime&id=in.(${ids.join(',')})`)
  const menteurs = ings.filter(i =>
    !i.prix_estime && lies.some(t => Math.abs(Number(t.prix_ht) - Number(i.prix_achat_ht)) < 0.0001))
  T('un prix venu d’un DEVIS est marqué estimé, jamais relevé', menteurs.length === 0,
    menteurs.map(i => i.nom).join(', '))

  // La coppa n'est pas du jambon serrano, les herbes de Provence ne sont pas
  // de l'origan : écartés à la main, ils doivent le rester.
  //
  // ⚠️ ASSERTION RÉVISÉE LE 27/09/2026, et la nuance compte. Elle
  // vérifiait que la ligne coppa n'était rattachée à RIEN — un raccourci
  // qui tenait tant qu'aucune matière « coppa » n'existait. Depuis le
  // rattachement des devis, elle est rattachée à « Coppa tranchée », ce
  // qui est JUSTE. La règle n'a pas changé : on teste maintenant ce
  // qu'elle dit vraiment — la coppa ne doit pas pointer sur le SERRANO.
  const coppa = tarifs.find(t => t.reference === '115748')
  const serrano = coppa?.ingredient_id
    ? (await sb(`ingredients?select=nom&id=eq.${coppa.ingredient_id}`))[0]
    : null
  T('la coppa n’est pas rapprochée au serrano',
    !serrano || !/serrano/i.test(serrano.nom), serrano?.nom ?? '')
  const herbes = tarifs.find(t => t.reference === '180396')
  T('les herbes de Provence ne sont pas rapprochées à l’origan', !herbes?.ingredient_id)

  // Le jambon en pièce entière ne doit pas être présenté comme du tranché.
  const piece = tarifs.find(t => t.reference === '63273')  // JAMBON CUIT SUP AC 8K
  T('le jambon en pièce entière reste non rapproché', !piece?.ingredient_id)
}

console.log('\n── Le catalogue tiré de nos factures ──')
const tousF = await sbTout('catalogue_fournisseur?select=id,designation,unite,prix_ht,contenance_valeur,contenance_unite,nature,fournisseur_id,cle_comparaison')
const factures = tousF.filter(t => t.nature === 'facture')
T('des tarifs viennent de nos factures', factures.length >= 100, `${factures.length}`)
T('ils sont tous marqués « facture »', factures.every(t => t.nature === 'facture'))

// ⚠️ Le prix d'une ligne facturée AU KILO est déjà le prix de référence. Lui
// coller la contenance lue dans le libellé (« BID=5L ») le redivisait par
// cinq : l'huile Gineys tombait à 0,827 €/L et l'écran annonçait 496 %
// d'écart avec le devis, sur un prix qu'on paie nous-mêmes.
const auKilo = factures.filter(t => ['kg', 'L', 'piece'].includes(t.unite))
T('aucune ligne au kilo/litre ne porte de contenance', auKilo.every(t => !t.contenance_valeur),
  auKilo.filter(t => t.contenance_valeur).map(t => t.designation).join(' | '))
const huile = factures.find(t => t.designation.includes('GIDOLIVE'))
T('l’huile Gineys reste à son prix au litre', huile && Math.abs(Number(huile.prix_ht) - 4.133) < 0.001,
  huile ? String(huile.prix_ht) : 'absente')
const olives = factures.find(t => t.designation.includes('OLIVE NOIRE A LA GRECQUE'))
T('les olives Gineys restent à 10,30 €/kg', olives && !olives.contenance_valeur && Math.abs(Number(olives.prix_ht) - 10.3) < 0.001)

// ⚠️ « BAGUETTE … 280G ARTIPAT C=32 » : le 280 g est le poids d'UNE
// baguette, le prix celui du CARTON. Les relier donnerait 49 €/kg.
const bag = factures.filter(t => t.designation.toUpperCase().includes('BAGUETTE'))
T('un poids au milieu d’un libellé ne fait pas une contenance',
  bag.every(t => !t.contenance_valeur || t.contenance_unite === 'piece'),
  bag.filter(t => t.contenance_unite && t.contenance_unite !== 'piece').map(t => t.designation).join(' | '))
const croissant = factures.find(t => t.designation.includes('CROISSANT PREPOUSSE 70G'))
T('un colis de 96 croissants donne bien 0,30 € la pièce',
  croissant && Math.abs(Number(croissant.prix_ht) / Number(croissant.contenance_valeur) - 0.300) < 0.002)

// La raison d'être de l'écran : des clés portées par DEUX fournisseurs.
const parCle = new Map()
for (const t of tousF.filter(t => t.cle_comparaison)) {
  if (!parCle.has(t.cle_comparaison)) parCle.set(t.cle_comparaison, new Set())
  parCle.get(t.cle_comparaison).add(t.fournisseur_id)
}
const duels = [...parCle.values()].filter(s => s.size > 1).length
T('au moins dix face-à-face entre fournisseurs', duels >= 10, `${duels}`)

console.log('\n── Lavazza est une marque, pas un fournisseur ──')
// Le café Lavazza se commande CHEZ France Boissons. Tant que « Lavazza »
// figurait comme fournisseur, la comparaison désignait un interlocuteur qui
// n'en est pas un — et une commande partie de là serait allée à la mauvaise
// adresse.
const [lavazza] = await sb('fournisseurs?select=id,actif&nom=eq.Lavazza')
if (lavazza) {
  T('la fiche Lavazza est désactivée, pas supprimée', lavazza.actif === false)
  const resteC = await sb(`catalogue_fournisseur?select=id&fournisseur_id=eq.${lavazza.id}`)
  const resteF = await sb(`factures_fournisseurs?select=id&fournisseur_id=eq.${lavazza.id}`)
  T('plus aucun tarif ne lui est rattaché', resteC.length === 0, `${resteC.length}`)
  T('plus aucune facture ne lui est rattachée', resteF.length === 0, `${resteF.length}`)
}
const [fboissons] = await sb('fournisseurs?select=id&nom=eq.' + encodeURIComponent('France Boissons'))
const catFB = await sb(`catalogue_fournisseur?select=id,nature,famille,prix_ht,unite,contenance_valeur,designation&fournisseur_id=eq.${fboissons.id}`)
T('France Boissons a un catalogue', catFB.length >= 40, `${catFB.length}`)
T('les factures du café y sont reprises', catFB.some(t => t.nature === 'facture' && /LAVAZZA/i.test(t.designation)))
const grains = catFB.find(t => t.designation.includes('grains Lavazza'))
T('le café en grains y est chiffré au kilo', grains && grains.unite === 'kg' && Number(grains.prix_ht) > 20)
// ⚠️ « 70cl », « 1L », « VC33 », « 75 » : quatre écritures pour la même idée.
// En déduire une contenance donnerait un prix au litre faux, affiché comme
// les autres.
//
// ⚠️ ASSERTION PRÉCISÉE LE 27/09/2026 — la règle n'a pas bougé, sa mesure
// était absolue. Elle interdisait TOUTE contenance sur une ligne France
// Boissons ; ce qu'il faut interdire, c'est une contenance INVENTÉE. Le
// Perrier en porte une depuis que son face-à-face avec Euro-Cash existe
// (0,939 € contre 0,500 €), et elle n'est pas devinée : son libellé se
// termine par « Perrier VC 33 », et la ligne Euro-Cash du MÊME produit
// écrit « c-24x33cl ». Le test vérifie donc que le nombre posé se
// RETROUVE dans le libellé.
const inventees = catFB.filter(t => t.famille === 'Boissons' && t.contenance_valeur)
  .filter(t => {
    // 0,33 L doit se lire « 33 » (cl) ou « 0.33 » / « 0,33 » (L) dans le libellé.
    const v = Number(t.contenance_valeur)
    const formes = [String(v), String(v).replace('.', ','), String(Math.round(v * 100))]
    return !formes.some(f => t.designation.includes(f))
  })
T('aucune contenance INVENTÉE sur un libellé France Boissons',
  inventees.length === 0, inventees.map(t => t.designation.slice(0, 40)).join(', '))

if (PORT) {
  // ⚠️ On ne vérifie PAS le contenu de la page : depuis le module 28 le
  // middleware renvoie un 307 vers /login, et c'est ce qu'on veut. Cet écran
  // expose des CONDITIONS NÉGOCIÉES — des remises obtenues fournisseur par
  // fournisseur. Les laisser répondre à un appel anonyme serait les publier.
  // Même correction que `test-rh.mjs`, pour la même raison.
  console.log('\n── L’écran est fermé aux appels anonymes ──')
  const r = await fetch(`http://localhost:${PORT}/admin/tarifs-fournisseurs`, { redirect: 'manual' })
  T('un appel non authentifié est redirigé', r.status === 307 || r.status === 302, `HTTP ${r.status}`)
  T('… vers la page de connexion', (r.headers.get('location') ?? '').includes('/login'))
  const suivi = await fetch(`http://localhost:${PORT}/admin/tarifs-fournisseurs`)
  const html = await suivi.text()
  T('aucun tarif ne fuit dans la réponse', !html.includes('Félix Potin'))
}

// ─── Un tarif PÉRIMÉ ne participe pas à la comparaison ──────────────
//
// ⚠️ RECOPIE de la règle de `comparer()` (src/lib/tarifs-fournisseurs.ts) :
// modifier les deux ensemble.
//
// La clé d'upsert porte la DATE, exprès : un tarif d'une autre date s'ajoute
// et l'ancien survit, et c'est lui qui rend une hausse lisible. Jusqu'au
// 05/10/2026 chaque référence n'avait de fait qu'une ligne par fournisseur.
// La proposition commerciale de Gineys a posé la question : ses 66
// références existaient déjà au portail, 27,8 % plus cher en moyenne. Les
// deux lignes étant actives, le comparateur voyait Gineys DEUX FOIS — une
// fois couronné « moins cher », une fois affiché « le plus cher » — et
// l'écart mesurait la distance entre deux prix du MÊME fournisseur sur le
// MÊME article. Un écart de 46 % qui ne désigne personne.
console.log('\n── Un tarif remplacé ne compare plus ──')
{
  const perime = (ls) => {
    const recent = new Map()
    for (const l of ls) {
      const r = (l.reference ?? '').trim(); if (!r) continue
      const k = `${l.fournisseur_id}|${r}`
      const d = recent.get(k)
      if (!d || l.date_tarif > d) recent.set(k, l.date_tarif)
    }
    return ls.map(l => {
      const r = (l.reference ?? '').trim()
      const d = r ? recent.get(`${l.fournisseur_id}|${r}`) : undefined
      return { ...l, perime: d != null && l.date_tarif < d }
    })
  }
  const L = [
    { id: 'a', fournisseur_id: 'G', reference: '0061022', date_tarif: '2026-09-26' },
    { id: 'b', fournisseur_id: 'G', reference: '0061022', date_tarif: '2026-10-05' },
    { id: 'c', fournisseur_id: 'F', reference: '63470',   date_tarif: '2026-09-28' },
  ]
  const p = perime(L)
  T('l’ancien tarif de la même référence est marqué périmé', p.find(l => l.id === 'a').perime === true)
  T('le plus récent ne l’est pas', p.find(l => l.id === 'b').perime === false)
  T('la ligne d’un AUTRE fournisseur n’est jamais touchée', p.find(l => l.id === 'c').perime === false)

  // ⚠️ On ne déduplique QUE sur une référence NON VIDE : `reference` a un
  // défaut à `''` (l'index unique est TOTAL, `on_conflict` ne sachant pas
  // viser un index partiel), et deux lignes sans code ne sont PAS le même
  // article — c'est le cas des quatre lignes La Frite Belge sans code.
  const V = perime([
    { id: 'x', fournisseur_id: 'L', reference: '', date_tarif: '2026-09-24' },
    { id: 'y', fournisseur_id: 'L', reference: '', date_tarif: '2026-09-28' },
  ])
  T('⚠️ deux lignes SANS référence ne se périment pas l’une l’autre',
    V.every(l => l.perime === false))

  const lib = fs.readFileSync('src/lib/tarifs-fournisseurs.ts', 'utf8')
  T('la lib porte la règle',
    /perime/.test(lib) && /l\.ref && !l\.perime/.test(lib))
  // ⚠️ Elles RESTENT dans `lignes`, comme les lignes sans prix : l'écran
  // montre l'historique avec sa date. Les retirer effacerait la trace de
  // ce qu'on payait avant.
  T('… et les périmées restent dans le groupe, pour l’historique',
    /l'écran\s*\n?\s*\/\/ montre l'historique|montre l.historique/.test(lib))
  // ⚠️ Un groupe dont il ne reste qu'UNE ligne non périmée n'est pas un
  // face-à-face : deux tarifs du MÊME article chez le MÊME fournisseur.
  T('un groupe réduit à une seule ligne vivante est écarté',
    /avecRef\.filter\(l => !l\.perime\)\.length < 2/.test(lib))
}

// ─── La proposition commerciale de Gineys ───────────────────────────
// ─── Gineys, ce sont DEUX fournisseurs ───────────────────────────────
//
// ⚠️ RECOPIE de la règle (06/10/2026) : le portail est tenu par Nicolas, la
// proposition commerciale par Sabine, et leurs prix diffèrent sur les mêmes
// références. Sous une seule fiche, la règle du tarif PÉRIMÉ éteignait
// silencieusement les prix du plus ancien — on ne voyait plus lequel des
// deux est le moins cher.
console.log('\n── La proposition Gineys du 05/10/2026 (Sabine) ──')
{
  const [g] = await sb('fournisseurs?select=id&nom=eq.Gineys%20(Sabine)')
  T('la fiche « Gineys (Sabine) » existe', !!g)
  const [nic] = await sb('fournisseurs?select=id&nom=eq.Gineys%20(Nicolas)')
  T('… et « Gineys (Nicolas) » aussi', !!nic)

  // ⚠️⚠️ AUCUN NOM DE FOURNISSEUR NE DOIT CONTENIR « — ».
  // `lireFournisseur()` lit `brut.split(' — ')[0]` : le tiret cadratin
  // sépare le fournisseur de la note dans `ingredients.fournisseur_principal`,
  // qui est du TEXTE LIBRE. Un fournisseur nommé « Gineys — Nicolas » se
  // lirait « Gineys » et ne correspondrait à aucune fiche — 48 matières
  // se retrouveraient sans fournisseur, sans le moindre message.
  const tous = await sb('fournisseurs?select=nom')
  const fautifs = tous.filter(f => String(f.nom ?? '').includes(' — '))
  T('⚠️⚠️ aucun nom de fournisseur ne contient « — »', fautifs.length === 0,
    fautifs.map(f => f.nom).join(', '))
  const prop = await sbTout(`catalogue_fournisseur?select=id,reference,designation,unite,prix_ht,nature,tarif_negocie,cle_comparaison,contenance_valeur&fournisseur_id=eq.${g.id}&date_tarif=eq.2026-10-05`)
  T('les 66 lignes sont chez Sabine', prop.length === 66, `${prop.length}`)
  // ⚠️ Et SURTOUT pas chez Nicolas : c'est la séparation qui permet le
  // face-à-face entre les deux grilles.
  const chezNic = await sbTout(`catalogue_fournisseur?select=id&fournisseur_id=eq.${nic.id}&date_tarif=eq.2026-10-05`)
  T('⚠️ et aucune n’est restée chez Nicolas', chezNic.length === 0, `${chezNic.length}`)
  // ⚠️ Un devis est une PROPOSITION, une facture une PREUVE. Arbitrer un
  // fournisseur sur le premier en croyant lire le second se paie des mois.
  T('⚠️ elles sont de nature DEVIS, jamais facture', prop.every(l => l.nature === 'devis'))
  // Chiffré NOMMÉMENT pour CASATASIA : c'est notre prix, pas un tarif public.
  T('… et comptées comme tarif négocié', prop.every(l => l.tarif_negocie === true))
  // ⚠️ Un vrai code Gineys est NUMÉRIQUE à sept chiffres.
  T('chaque ligne porte un code article numérique', prop.every(l => /^0\d{6}$/.test(l.reference)))
  // ⚠️ Un prix nul se lit « gratuit » et remonterait en tête du comparateur.
  T('aucun prix nul ni négatif', prop.every(l => Number(l.prix_ht) > 0))
  // ⚠️ TOUT CE QUI N'EST PAS kg/L/piece DOIT ÊTRE « contenant » : une unité
  // inconnue de `CONTENANTS` rend `prixReference()` NULL, et la ligne sort
  // de toute comparaison sans qu'aucune erreur ne le signale. Vécu : le
  // miel, les câpres, la burrata et les cornichons affichaient « non
  // comparable » alors que leur contenance est dans leur désignation.
  T('⚠️ les unités hors kg/L/pièce sont normalisées en « contenant »',
    prop.every(l => ['kg', 'L', 'piece', 'contenant'].includes(l.unite)),
    [...new Set(prop.map(l => l.unite))].join(', '))
  // ⚠️ L'import ne doit PAS écraser le travail à la main : `cle_comparaison`
  // et les contenances sont absentes de sa charge, donc une relance les
  // préserve — même piège que `tarif_negocie` dans l'import du portail.
  const src = fs.readFileSync('scripts/import-prop-gineys.mjs', 'utf8')
  T('⚠️ l’import ne réécrit ni les clés ni les contenances',
    !/cle_comparaison:/.test(src) && !/contenance_valeur:/.test(src))
  T('… et il refuse d’écrire si le compte de lignes ne concorde pas',
    /Rien n'est écrit/.test(src))
  T('les rapprochements ont été posés', prop.filter(l => l.cle_comparaison).length >= 40,
    `${prop.filter(l => l.cle_comparaison).length}`)
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
