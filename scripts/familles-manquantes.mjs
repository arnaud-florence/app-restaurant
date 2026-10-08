// RANGER LES RÉFÉRENCES SANS FAMILLE — 04/10/2026.
//
// 1 180 références sur 4 888 n'avaient aucune famille : Gineys 1 069, Gel Var
// 94, Plaza 10, France Boissons 7. Le filtre par catégorie de `/admin/achats`
// les laissait toutes invisibles — et une référence qu'on ne voit pas ne se
// commande pas.
//
// ⚠️⚠️ LES FAMILLES SONT CELLES DÉJÀ EN USAGE, jamais des noms neufs.
// `rayonFournisseur()` range par MOTS-CLÉS : une famille inédite tomberait
// en « Non classé », donc on aurait rangé pour rien. 304 familles existent
// déjà dans le catalogue ; on puise dedans.
//
// ⚠️⚠️ L'ORDRE DES RÈGLES EST LE CŒUR DU SUJET. Le PRODUIT passe avant son
// CONTENANT et avant son mode de CONSERVATION, sinon :
//   « BEURRE DE TOURAGE … C=10KG »      → emballage au lieu de B.O.F.
//   « STEAK DE THON … C=5KG »           → bœuf au lieu de marée
//   « BOITE BUCHE FENETRE »             → pâtisserie au lieu d'emballage
// C'est la même leçon que l'indexation des catalogues de marques, où les
// livres d'inspiration passent en dernier.
//
// ⚠️ CE QUI RESTE SANS FAMILLE Y RESTE. Ranger au jugé met le produit dans
// le mauvais rayon, et on ne le retrouve plus en commandant — c'est pire que
// « non classé », qui au moins se voit.
//
//   node scripts/familles-manquantes.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
const lire = async (t, s, f = '') => { let o = [], x = 0; for (;;) { const r = await sb(`${t}?select=${s}${f}&order=id&offset=${x}&limit=1000`); o = o.concat(r); if (r.length < 1000) break; x += 1000 } return o }

// ── les règles, du PLUS SPÉCIFIQUE au plus général ─────────────────
const REGLES = [
  // ① Emballage et hygiène — reconnus à l'OBJET, pas au contenu. « BOITE
  //    BUCHE », « COFFRET REPAS », « SACHET FOND PLAT » décrivent le
  //    contenant lui-même : ce sont les produits vendus.
  [/^(boite|bo[iî]te|barquette|coffret|sachet|sac |paille|couvercle|gobelet|assiette|serviette|couvert|plateau|caissette|cabas|pochette|film |papier|lunch box|pot |bol |touillette|pique |nappe)/i, 'EMBALLAGE'],
  [/emballage|vaisselle jetable|essuie.main|rouleau|poubelle|d[ée]graissant|d[ée]sinfect|lave.vaisselle|lessive|savon|cr[eè]me main|gel hydro|gant |[ée]ponge|balai|serpill/i, 'PRODUITS SERVICES'],

  // ② Les produits, avant toute mention de conditionnement ou de froid.
  [/cornet|b[aâ]tonnet|glace |cr[eè]me glac|sorbet|haagen|magnum|esquimau/i, 'DESSERT'],
  [/viennois|croissant|pain au chocolat|chausson|brioche|pain aux raisins|kouign|beignet/i, 'VIENNOISERIE'],
  [/baguette|pain |ficelle|fougasse|focaccia|ciabatta|bagel|burger brioche|pain de mie|panini/i, 'BOULANGERIE'],
  [/tarte|tartelette|[ée]clair|flan |p[aâ]tissier|entremet|mille.feuille|macaron|paris.brest|tropez|op[ée]ra|fraisier|charlotte|bavaroise|moelleux|coulant|brownie|cookie|muffin|madeleine|sacristain|chou |profiterol|religieuse|savarin|cheesecake|tiramisu/i, 'PÂTISSERIE'],
  [/praline|nougat|confiserie|chocolat (noir|lait|blanc)|bonbon|caramel .*(seau|sac)|p[aâ]te d.amande|sucre inverti|trimoline|glucose|fondant p[aâ]tissier/i, 'SECS'],

  [/beurre|cr[eè]me (fra[iî]che|liquide|[ée]paisse|uht)|lait |yaourt|fromage blanc|mascarpone|ricotta|emmental|mozzarella|gruy[eè]re|comt[ée]|parmesan|gorgonzola|reblochon|camembert|ch[eè]vre|raclette|cheddar|bleu |brie |feta|burrata|[oœ]uf/i, 'B.O.F.'],

  [/thon|saumon|cabillaud|colin|lieu |merlu|dorade|bar |sole |truite|crevette|gambas|calamar|seiche|poulpe|moule|st.jacques|saint.jacques|surimi|anchois|hareng|sardine|maquereau|poisson|fruits de mer|crustac/i, 'MARÉE'],
  [/b[oœ]uf|veau|agneau|porc |volaille|poulet|dinde|canard|magret|entrec[oô]te|bavette|faux.filet|rumsteck|onglet|hach[ée]|steak de|r[oô]ti de|[ée]paule|gigot/i, 'VIANDE'],
  [/jambon|saucisse|saucisson|chorizo|coppa|lard |bacon|lardon|pancetta|andouille|rillette|p[aâ]t[ée]|terrine|boudin|mortadelle|salami|charcut|serrano|bresaola/i, 'CHARCUTERIE'],

  [/nem |samoussa|bricks?|acras|beignet de|friand|quiche|croque|pizza|sandwich|wrap|bagel garni|tapas|feuillet[ée]|bouch[ée]e|verrine|traiteur|plat cuisin/i, 'TRAITEUR'],
  [/sauce|mayonnaise|moutarde|ketchup|vinaigrette|a[iï]oli|pesto|b[ée]chamel|hollandaise|tartare|barbecue|cond[ij]ment/i, 'SAUCES FROIDES'],
  [/huile|vinaigre|sel |poivre|[ée]pice|herbe|farine|semoule|riz |p[aâ]tes |l[ée]gumineuse|lentille|pois chiche|conserve|boc?al|bouillon|fond de|levure|sucre |miel |confiture|p[aâ]te [aà] tartiner|nutella|c[ée]r[ée]ale|biscuit/i, 'ÉPICERIE'],
  [/l[ée]gume|pomme de terre|frite|oignon|carotte|tomate|salade|courgette|aubergine|poivron|champignon|[ée]pinard|haricot|brocoli|chou |poireau|ail |[ée]chalote|fruit|pomme |banane|citron|orange |fraise|framboise|myrtille|ananas|mangue/i, 'LÉGUMES'],
  [/caf[ée]|th[ée] |infusion|chocolat en poudre|capsule|dosette/i, 'Boissons'],

  // ── SECONDE PASSE : ce que la première a laissé, et qui se reconnaît ──
  // ⚠️ Chaque mot ajouté vient d'un cas RÉEL vu dans les 352 restantes, pas
  // d'une liste imaginée. Un mot-clé spéculatif range au jugé.
  [/rond de carton|carr[ée] raine|disque|intercalaire|opercule|[ée]tiquette|ruban|bolduc|cagette|calage/i, 'EMBALLAGE'],
  [/nettoyant|d[ée]tergent|parfum (pin|citron)|3d sol|anti.calcaire|javel|produit sol/i, 'PRODUITS SERVICES'],
  [/b[aâ]tard|galette (frangipane|des rois)|panettone|stollen|pain d.[ée]pice|viennois/i, 'BOULANGERIE'],
  [/frangipane|panna cotta|cr[eè]me br[uû]l[ée]e|[îi]le flottante|riz au lait|clafoutis|far breton|kouglof/i, 'PÂTISSERIE'],
  [/cerf|sanglier|chevreuil|bison|autruche|lapin|pintade|caille|pigeon|basse c[oô]te|paleron|jarret|joue de|collier/i, 'VIANDE'],
  [/listao|albacore|[ée]perlan|lotte|raie|congre|rouget|encornet|bulot|bigorneau|tarama|[oœ]ufs de/i, 'MARÉE'],
  [/olive|c[aâ]pre|cornichon|artichaut|asperge|betterave|c[ée]leri|concombre|courge|endive|fenouil|navet|panais|poireau|radis|rhubarbe/i, 'LÉGUMES'],
  [/graine|colorant|ar[oô]me|g[ée]lifiant|agar|p[ée]pite|amande|noisette|noix|pistache|raisin sec|abricot sec|datte|figue/i, 'ÉPICERIE'],
  [/kit couvert|couverts? |cuill[eè]re|fourchette|couteau jetable|b[aâ]tonnet m[ée]langeur/i, 'EMBALLAGE'],
  [/canette|caneton|poularde|chapon|suprem?e de volaille/i, 'VIANDE'],
  [/cannelle|muscade|curcuma|paprika|cumin|curry|safran|gingembre|vanille|badiane|girofle|laurier|thym|romarin|basilic|origan|persil|coriandre/i, 'ÉPICERIE'],
  [/sun ?roll|mister freeze|mini b[aâ]ton|pot de glace|vanille.fraise|napolitain/i, 'DESSERT'],
  [/panisse|socca|ballotin|ravioli|lasagne|gnocchi|cannelloni|tortilla|falafel|houmous|taboul[ée]|piadina/i, 'TRAITEUR'],
  [/eau |jus |soda|cola|limonade|sirop|boisson|bi[eè]re|vin |champagne|prosecco|whisky|vodka|rhum|gin |pastis|liqueur|ap[ée]ritif/i, 'Boissons'],
]

const fo = await sb('fournisseurs?select=id,nom')
const nf = Object.fromEntries(fo.map(x => [x.id, x.nom]))
const sans = await lire('catalogue_fournisseur', 'id,fournisseur_id,designation,famille', '&actif=eq.true&famille=is.null')
const plan = sans.map(x => {
  const r = REGLES.find(([re]) => re.test(x.designation))
  return { ...x, nouvelle: r ? r[1] : null }
})
const g = {}
for (const p of plan) g[p.nouvelle ?? '✗ laissé sans famille'] = (g[p.nouvelle ?? '✗ laissé sans famille'] ?? 0) + 1
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${sans.length} références sans famille ──\n`)
for (const [k, v] of Object.entries(g).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`)
const rien = plan.filter(p => !p.nouvelle)
console.log(`\n   échantillon de ce qui RESTE sans famille (${rien.length}) :`)
for (const p of rien.slice(0, 15)) console.log(`      ${(nf[p.fournisseur_id] ?? '?').slice(0, 12).padEnd(13)} ${p.designation.slice(0, 58)}`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
let n = 0
const parFamille = new Map()
for (const p of plan) { if (!p.nouvelle) continue; if (!parFamille.has(p.nouvelle)) parFamille.set(p.nouvelle, []); parFamille.get(p.nouvelle).push(p.id) }
for (const [famille, ids] of parFamille) {
  // ⚠️ Par paquets : un `in.(…)` de mille identifiants dépasse la longueur
  // d'URL admise et échoue en 414, sans rien dire d'utile.
  for (let i = 0; i < ids.length; i += 80) {
    await sb(`catalogue_fournisseur?id=in.(${ids.slice(i, i + 80).join(',')})`, {
      method: 'PATCH', body: JSON.stringify({ famille }) })
    n += Math.min(80, ids.length - i)
  }
}
console.log(`\n   ✓ ${n} référence(s) rangée(s)\n`)
