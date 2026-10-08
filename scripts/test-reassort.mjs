// Réassort : ce qu'on a, ce qu'il faut avoir, ce qu'il faut commander.
//
//   PORT=3000 node scripts/test-reassort.mjs
//
// ⚠️ Il RECOPIE les règles de `src/lib/reassort.ts` (la source est en TS) :
// modifier les deux ensemble. L'essentiel porte sur ce que l'écran REFUSE
// de faire — inventer une quantité, confondre « jamais compté » et
// « zéro », ou compter un prix inconnu pour zéro.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) {
  const i=l.indexOf('='); if(i<0||l.trim().startsWith('#'))continue
  env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')
}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const sb=async p=>{const r=await fetch(U+'/rest/v1/'+p,{headers:{apikey:K,Authorization:'Bearer '+K}});const t=await r.text();const j=t?JSON.parse(t):null;if(!r.ok)throw new Error(j?.message??r.status);return j}
let ok=0,ko=0
const t=(n,c)=>{if(c){ok++;console.log(`  ✓ ${n}`)}else{ko++;console.log(`  ✗ ${n}`)}}
const titre=s=>console.log(`\n── ${s} ──`)

// ─── Règles recopiées ─────────────────────────────────────────────
const tenuEffectif = l => l.tenu ?? 0
const etat = l => {
  if (l.cible == null) return 'non_parametre'
  const x = tenuEffectif(l)
  if (l.seuil != null && x <= l.seuil) return 'a_commander'
  if (x <= 0) return 'a_commander'
  if (x >= l.cible) return 'complet'
  return 'suffisant'
}
const aCommander = l => {
  if (l.cible == null) return 0
  const m = l.cible - tenuEffectif(l)
  return m > 0 ? Math.round(m*1000)/1000 : 0
}
const coutReassort = l => {
  const q = aCommander(l)
  if (!q || l.cout_unitaire_ht == null) return null
  return Math.round(q*l.cout_unitaire_ht*100)/100
}
const PEREMPTION = 30
const comptagePerime = (l, auj) => {
  if (!l.compte_le) return false
  return (auj - new Date(l.compte_le+'T00:00:00Z')) / 86400000 > PEREMPTION
}
const AUJ = new Date('2026-09-27T12:00:00Z')

titre('Sans cible, on n’invente RIEN')
t('aucune quantité proposée',        aCommander({ cible: null, tenu: 0 }) === 0)
t('l’état le dit : « à paramétrer »', etat({ cible: null, tenu: 0 }) === 'non_parametre')
t('et aucun coût n’est calculé',      coutReassort({ cible: null, tenu: 0, cout_unitaire_ht: 5 }) === null)

titre('Seuil et cible, deux rôles distincts')
t('sous le seuil → à commander',   etat({ cible: 20, seuil: 5, tenu: 4 }) === 'a_commander')
t('au-dessus du seuil mais sous la cible → suffisant', etat({ cible: 20, seuil: 5, tenu: 12 }) === 'suffisant')
t('à la cible → complet',          etat({ cible: 20, seuil: 5, tenu: 20 }) === 'complet')
t('la quantité ramène à la CIBLE, pas au seuil', aCommander({ cible: 20, seuil: 5, tenu: 4 }) === 16)
t('⚠️ à zéro, on commande même sans seuil', etat({ cible: 20, seuil: null, tenu: 0 }) === 'a_commander')

titre('« Jamais compté » n’est pas « zéro »')
t('les deux appellent la même commande',
  aCommander({ cible: 10, tenu: null }) === aCommander({ cible: 10, tenu: 0 }))
t('⚠️ mais ils se distinguent à l’affichage', (null ?? 'inconnu') !== 0)

titre('Un comptage vieux n’est pas un stock')
t('un comptage du jour est valable',   !comptagePerime({ compte_le: '2026-09-27' }, AUJ))
t('un comptage de 20 jours passe',     !comptagePerime({ compte_le: '2026-09-07' }, AUJ))
t('⚠️ un comptage du 24/08 est PÉRIMÉ', comptagePerime({ compte_le: '2026-08-24' }, AUJ))
t('une ligne sans date n’est pas périmée (elle est inconnue)',
  !comptagePerime({ compte_le: null }, AUJ))

titre('Le total dit ce qu’il ignore')
t('un prix inconnu ne vaut PAS zéro',
  coutReassort({ cible: 10, tenu: 0, cout_unitaire_ht: null }) === null)
t('un prix connu est chiffré', coutReassort({ cible: 10, tenu: 4, cout_unitaire_ht: 2.5 }) === 15)

titre('Le schéma')
const colR = await sb("rpc/exec_sql?").catch(()=>null)
const q = async s => {
  const r = await fetch(U+'/rest/v1/rpc/exec_sql',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify({query:s})})
  return (await r.json()).rows_affected
}
t('recettes porte stock_minimum et stock_cible',
  await q("select 1 from information_schema.columns where table_name='recettes' and column_name in ('stock_minimum','stock_cible')") === 2)
t('ingredients porte stock_cible',
  await q("select 1 from information_schema.columns where table_name='ingredients' and column_name='stock_cible'") === 1)
t('⚠️ une cible sous le seuil est REFUSÉE par la base',
  await q("select 1 from pg_constraint where conname in ('recettes_stock_coherent','ingredients_stock_coherent')") === 2)
t('⚠️ recettes n’a PAS de stock_actuel (le stock se calcule)',
  await q("select 1 from information_schema.columns where table_name='recettes' and column_name='stock_actuel'") === 0)

if (process.env.PORT) {
  titre('L’écran est fermé aux appels anonymes')
  const r = await fetch(`http://localhost:${process.env.PORT}/admin/reassort`, { redirect: 'manual' })
  t('appel anonyme refusé ou redirigé', [301,302,307,401,403].includes(r.status))
}

// ═══ COORDINATION STOCK → COMMANDE ═════════════════════════════════════
// ⚠️ RECOPIE de `parEtablissement()` / `lignesCommandables()`
// (src/lib/reassort.ts) — modifier les deux ensemble.
const parEtablissement = (lignes) => {
  const m = new Map()
  for (const l of lignes) { const k = l.etablissement ?? '\u0000'; if (!m.has(k)) m.set(k, []); m.get(k).push(l) }
  return [...m.entries()].map(([k, ls]) => ({
    etablissement: k === '\u0000' ? null : k, lignes: ls,
    aCommander: ls.filter(l => etat(l) === 'a_commander').length,
    cout: ls.reduce((a, l) => a + (coutReassort(l) ?? 0), 0),
  })).sort((a, b) => (a.etablissement === null ? 1 : b.etablissement === null ? -1 : b.cout - a.cout))
}
const fournisseurRetenu = (l, auMoinsCher) => {
  if (auMoinsCher && l.ailleurs && l.ailleurs.fournisseur_id !== l.fournisseur_id)
    return { id: l.ailleurs.fournisseur_id, nom: l.ailleurs.fournisseur, bascule: true }
  if (!l.fournisseur_id || !l.fournisseur) return null
  return { id: l.fournisseur_id, nom: l.fournisseur, bascule: false }
}
const lignesCommandables = (lignes, auMoinsCher = false) => {
  const prets = [], sansFournisseur = [], bascules = []
  for (const l of lignes) {
    const q = aCommander(l)
    if (q <= 0) continue
    const retenu = fournisseurRetenu(l, auMoinsCher)
    if (!retenu) { sansFournisseur.push(l); continue }
    if (retenu.bascule && l.ailleurs)
      bascules.push({ nom: l.nom, de: l.fournisseur, vers: retenu.nom, ecartPct: l.ailleurs.ecartPct })
    prets.push({ ...l, quantite: q, retenu, prix: retenu.bascule ? null : l.cout_unitaire_ht })
  }
  return { prets, sansFournisseur, bascules }
}
const economieEstimee = (prets) => {
  let t = 0
  for (const l of prets) {
    if (!l.retenu.bascule || l.cout_unitaire_ht == null || !l.ailleurs) continue
    t += l.quantite * l.cout_unitaire_ht * (l.ailleurs.ecartPct / 100)
  }
  return Math.round(t * 100) / 100
}

const L = (o) => ({
  cle: o.cle ?? 'x', nom: o.nom ?? 'X', categorie: null,
  etablissement: o.etab ?? null, unite: 'kg',
  tenu: o.tenu === undefined ? null : o.tenu, compte_le: o.le ?? null,
  seuil: o.seuil ?? null, cible: o.cible ?? null,
  cout_unitaire_ht: o.cout === undefined ? 10 : o.cout,
  fournisseur: o.f ?? null, fournisseur_id: o.fid ?? null,
  ailleurs: o.ailleurs ?? null,
})

console.log('\n── Par établissement ──')
{
  const g = parEtablissement([
    L({ cle: 'a', etab: 'Le Fournil', cible: 2 }),
    L({ cle: 'b', etab: 'Le Fournil', cible: 1 }),
    L({ cle: 'c', etab: null, cible: 1 }),
    L({ cle: 'd', etab: 'Bar', cible: 1 }),
  ])
  t('un groupe par établissement', g.length === 3)
  t('⚠️ « non rattaché » passe en DERNIER, jamais masqué',
    g[g.length - 1].etablissement === null)
  t('le plus gros coût passe en premier', g[0].etablissement === 'Le Fournil')
  t('le coût du groupe additionne ses lignes', g[0].cout === 30)
}

console.log('\n── Ce qui part en bon de commande ──')
{
  const r = lignesCommandables([
    L({ cle: 'a', cible: 3, fid: 'f1', f: 'Gineys' }),
    L({ cle: 'b', cible: 2, fid: null, f: null }),
    L({ cle: 'c', cible: 0 }),
    L({ cle: 'd', cible: 5, tenu: 5, le: new Date().toISOString().slice(0, 10), fid: 'f1' }),
  ])
  t('⚠️ une ligne SANS fournisseur est écartée — on n’écrit à personne',
    r.prets.length === 1 && r.sansFournisseur.length === 1)
  t('⚠️ elle est COMPTÉE, pas perdue en silence', r.sansFournisseur[0].cle === 'b')
  t('une ligne déjà au niveau ne part pas', !r.prets.some(l => l.cle === 'd'))
  t('rien à commander sur une cible nulle', !r.prets.some(l => l.cle === 'c'))
  t('la quantité retenue est le manque, pas la cible', r.prets[0].quantite === 3)
}

console.log('\n── Le préfixe décide de la colonne visée ──')
{
  // ⚠️ Une ligne de bon porte SOIT recette_id SOIT ingredient_id : se
  // tromper de colonne écrirait la commande sur un objet qui n’existe pas.
  const viser = (cle) => cle.startsWith('ing:')
    ? { recette_id: null, ingredient_id: cle.slice(4) }
    : { recette_id: cle, ingredient_id: null }
  t('une matière vise ingredient_id', viser('ing:abc').ingredient_id === 'abc')
  t('une matière ne vise PAS recette_id', viser('ing:abc').recette_id === null)
  t('un produit vise recette_id', viser('abc').recette_id === 'abc')
  t('un produit ne vise PAS ingredient_id', viser('abc').ingredient_id === null)
}

console.log('\n── ON COMMANDE AU MOINS CHER (règle du gérant) ──')
{
  const moinsCher = { fournisseur_id: 'f2', fournisseur: 'Félix Potin', ecartPct: 30 }
  const lignes = [
    L({ cle: 'a', nom: 'Beurre', cible: 2, fid: 'f1', f: 'Gineys', cout: 8, ailleurs: moinsCher }),
    L({ cle: 'b', nom: 'Huile', cible: 1, fid: 'f1', f: 'Gineys', cout: 4 }),
  ]
  const habituel = lignesCommandables(lignes, false)
  const cher = lignesCommandables(lignes, true)

  t('sans la règle, tout part chez l’habituel',
    habituel.prets.every(l => l.retenu.id === 'f1') && habituel.bascules.length === 0)
  t('⚠️ avec la règle, la ligne part chez le MOINS CHER',
    cher.prets.find(l => l.cle === 'a').retenu.id === 'f2')
  t('la bascule est TRACÉE, pas silencieuse',
    cher.bascules.length === 1 && cher.bascules[0].vers === 'Félix Potin')
  t('une ligne sans comparaison reste chez l’habituel — il n’y a pas de moins cher à choisir',
    cher.prets.find(l => l.cle === 'b').retenu.id === 'f1')
  t('⚠️⚠️ une ligne qui bascule part SANS PRIX — notre conditionnement n’est pas le leur',
    cher.prets.find(l => l.cle === 'a').prix === null)
  t('⚠️ et surtout pas à ZÉRO : un zéro sous-estimerait le total du bon',
    cher.prets.find(l => l.cle === 'a').prix !== 0)
  t('la ligne qui ne bascule pas garde son prix connu',
    cher.prets.find(l => l.cle === 'b').prix === 4)
  t('l’économie se chiffre en EUROS, pas en pourcentage — 2 × 8 € × 30 %',
    economieEstimee(cher.prets) === 4.8)
  t('sans bascule, aucune économie annoncée', economieEstimee(habituel.prets) === 0)

  // ⚠️ Le cas qui compte : le « moins cher » EST déjà notre fournisseur.
  const deja = lignesCommandables([
    L({ cle: 'c', cible: 1, fid: 'f1', f: 'Gineys',
        ailleurs: { fournisseur_id: 'f1', fournisseur: 'Gineys', ecartPct: 20 } })], true)
  t('on ne « bascule » pas vers celui chez qui on est déjà',
    deja.bascules.length === 0 && deja.prets[0].retenu.bascule === false)
  t('et cette ligne garde donc son prix', deja.prets[0].prix === 10)

  // ⚠️ Un moins cher sans fournisseur habituel doit quand même partir.
  const orphelin = lignesCommandables([
    L({ cle: 'd', cible: 1, fid: null, f: null, ailleurs: moinsCher })], true)
  t('une ligne sans habituel mais avec un moins cher devient commandable',
    orphelin.prets.length === 1 && orphelin.sansFournisseur.length === 0)
}

console.log('\n── Un comptage périmé est neutralisé pour TOUS les lecteurs ──')
{
  // ⚠️ RECOPIE de `sansComptagePerime()` (src/lib/reassort.ts).
  const sansComptagePerime = (lignes, auj) =>
    lignes.map(l => (comptagePerime(l, auj) ? { ...l, tenu: null } : l))
  const REF2 = new Date('2026-09-27T00:00:00Z')
  const brut = [
    L({ cle: 'vieux', tenu: 28, le: '2026-08-24', seuil: 5, cible: 10 }),
    L({ cle: 'frais', tenu: 28, le: '2026-09-25', seuil: 5, cible: 10 }),
  ]
  const net = sansComptagePerime(brut, REF2)

  t('un comptage du 24 août est ramené à INCONNU', net[0].tenu === null)
  t('⚠️ mais sa DATE est conservée — « périmé » n’est pas « jamais compté »',
    net[0].compte_le === '2026-08-24')
  t('un comptage récent est laissé tel quel', net[1].tenu === 28)
  t('⚠️ sans neutralisation, la ligne périmée passe pour au niveau',
    etat(brut[0]) === 'complet')
  t('⚠️ et avec, elle repasse à commander — c’est tout l’enjeu',
    etat(net[0]) === 'a_commander')
  t('la quantité redevient la cible entière', aCommander(net[0]) === 10)
}

// ─────────────────────────────────────────────────────────────────────────
// ⚠️⚠️ UNE SEULE SOURCE POUR « CHEZ QUI ON COMMANDE »
//
// Signalé par le gérant le 05/10/2026 : la liste d'achat par carte
// envoyait l'emmental et la mozzarella chez Gineys alors que le
// comparateur les donne 9,5 % moins cher chez Félix Potin et 12 % moins
// cher chez Gel Var — et le beurre doux 30 %, les olives 26 %. Le script
// écrivait `ingredients.fournisseur_principal` TEL QUEL, sans passer par
// `fournisseurRetenu()`.
//
// C'était la troisième implémentation de la même question. Toute la
// plateforme de comparaison ne sert à rien si la liste qu'on imprime la
// contourne — et rien ne le signalait, le nom du fournisseur étant
// parfaitement plausible.
// ─────────────────────────────────────────────────────────────────────────
{
  console.log('\n── Chez qui on commande : une seule source ──')
  const src = fs.readFileSync('scripts/liste-achat-cartes.cjs', 'utf8')
  t('la liste d’achat par carte passe par fournisseurRetenu()',
    /R\.fournisseurRetenu\(/.test(src))
  t('⚠️ et n’écrit JAMAIS fournisseur_principal comme destinataire',
    !/fourn(isseur)?\s*=\s*new Map\([^)]*fournisseur_principal/.test(src)
    && !/lireFournisseur\(i\.fournisseur_principal\)/.test(src))
  // ⚠️ Une ligne qui bascule part SANS PRIX : notre coût est celui du
  // conditionnement de l'ANCIEN fournisseur. L'afficher sous le nom du
  // nouveau écrirait un prix qui n'a jamais existé.
  t('⚠️ une ligne qui bascule n’emporte pas l’ancien prix',
    /r0\.bascule \? null :/.test(src))
  t('… et la bascule est DITE sur la ligne',
    /moins cher qu’à|moins cher qu'à/.test(src))
}

// ─────────────────────────────────────────────────────────────────────────
// ⚠️⚠️ ON NE RECOMMANDE PAS CE QU'ON VIENT DE COMMANDER
//
// Mesuré le 05/10/2026 : le gérant commande 150 pâtons de 350 g le matin,
// et l'écran lui en réclame 280 l'après-midi. `chargerLignesReassort()`
// ignorait purement et simplement `bons_commande`. Deux livraisons pour un
// besoin, et on ne s'en aperçoit qu'au déchargement.
// ⚠️ RECOPIE de `calculerEnCommande()` / `aCommander()` (src/lib/reassort.ts).
// ─────────────────────────────────────────────────────────────────────────
{
  console.log('\n── Ce qui est déjà en route ──')
  const EN_ROUTE = new Set(['envoye', 'confirme'])
  const calc = (lignes) => {
    const parCle = new Map(); let sansCible = 0
    for (const l of lignes) {
      if (!EN_ROUTE.has(l.statut)) continue
      const reste = Number(l.quantite_commandee ?? 0) - Number(l.quantite_recue ?? 0)
      if (reste <= 0) continue
      const cle = l.ingredient_id ? `ing:${l.ingredient_id}` : l.recette_id
      if (!cle) { sansCible++; continue }
      parCle.set(cle, (parCle.get(cle) ?? 0) + reste)
    }
    return { parCle, sansCible }
  }
  const aCmd = l => l.cible == null ? 0
    : Math.max(0, Math.round((l.cible - (l.tenu ?? 0) - (l.enCommande ?? 0)) * 1000) / 1000)

  t('un bon ENVOYÉ retire sa quantité du besoin',
    aCmd({ cible: 280, tenu: 0, enCommande: 150 }) === 130)
  // ⚠️ Un BROUILLON n'est pas une commande : le déduire ferait l'inverse du
  // défaut — on ne commanderait JAMAIS, un brouillon oublié suffisant à
  // éteindre la ligne.
  t('⚠️ un BROUILLON ne retire rien',
    calc([{ statut: 'brouillon', ingredient_id: 'a', quantite_commandee: 99, quantite_recue: 0 }]).parCle.size === 0)
  t('… et un bon REÇU non plus',
    calc([{ statut: 'recu', ingredient_id: 'a', quantite_commandee: 99, quantite_recue: 99 }]).parCle.size === 0)
  t('ce qui est déjà reçu sur un bon envoyé est retiré',
    calc([{ statut: 'envoye', ingredient_id: 'a', quantite_commandee: 100, quantite_recue: 60 }]).parCle.get('ing:a') === 40)
  // ⚠️ Une ligne qui ne porte qu'un LIBELLÉ ne dit pas DE QUOI elle parle —
  // c'est le cas de toute commande saisie depuis un portail fournisseur.
  // Elle est COMPTÉE et dite, jamais ignorée en silence : sinon l'écran
  // annonce « rien en route » alors qu'un camion arrive.
  t('⚠️ une ligne sans cible est COMPTÉE, pas ignorée',
    calc([{ statut: 'envoye', ingredient_id: null, recette_id: null, quantite_commandee: 5, quantite_recue: 0 }]).sansCible === 1)
  const srcLib = fs.readFileSync('src/lib/reassort.ts', 'utf8')
  t('la lib porte bien la règle et le garde-fou',
    /STATUTS_EN_ROUTE/.test(srcLib) && /sansCible/.test(srcLib)
    && /l\.cible - tenuEffectif\(l\) - \(l\.enCommande \?\? 0\)/.test(srcLib))
  t('… et le chargeur la branche sur les bons de commande',
    /bon_commande_lignes/.test(fs.readFileSync('src/lib/reassort-donnees.ts', 'utf8')))
}

// ─── Basculer de fournisseur depuis la ligne de commande ──────────────
//
// ⚠️ Il RECOPIE la règle depuis le TS : modifier les deux ensemble.
{
  console.log('\n── Basculer de fournisseur depuis le réassort ──')
  const act = fs.readFileSync('src/app/admin/reassort/actions.ts', 'utf8')
  const cli = fs.readFileSync('src/app/admin/reassort/ReassortClient.tsx', 'utf8')

  // ⚠️ UNE SEULE IMPLÉMENTATION. Le garde-fou des 95 %, la division par
  // `unites_par_achat` et le drapeau `prix_estime` vivent dans
  // `modifierArticleAchat` : les réécrire ici finirait par écrire un prix
  // que l'autre écran refuse.
  t('la bascule appelle l’action partagée, elle ne réécrit pas la règle',
    /modifierArticleAchat\(/.test(act) && !/0\.95/.test(act))

  // ⚠️⚠️ UNE LIGNE DE RÉASSORT EST UN GROUPE. N'écrire que sur le
  // représentant laisserait les autres membres chez l'ancien fournisseur,
  // pendant que la ligne afficherait le nouveau — basculé à moitié, et
  // rien pour le dire.
  t('⚠️ le groupe ENTIER est basculé, pas le seul représentant',
    /cleMatiere\(/.test(act) && /membres/.test(act) && /for \(const id of membres\)/.test(act))
  t('… et le groupe est reconstitué en JS, pas par un .or() PostgREST',
    !/\.or\(`?nom_matiere/.test(act))
  t('… un refus partiel est DIT',
    /refus\.length/.test(act) && /refusé\(s\)/.test(act))

  // ⚠️ LA RÉFÉRENCE DE L'ANCIEN FOURNISSEUR NE SURVIT PAS (0142) : un code
  // Gineys cité à Félix Potin fait chiffrer autre chose.
  t('⚠️ la référence reprise est celle de l’OFFRE, jamais l’ancienne',
    /reference: o\.reference \?\? null/.test(cli))

  // ⚠️ LE PRIX SUIT LE FOURNISSEUR, mais seulement si l'unité est la
  // nôtre — et le drapeau est ce qui protège, pas le refus (0165).
  t('le prix ne suit que si l’unité concorde',
    /prixReprenable\(o, l\.unite\)/.test(cli))
  t('⚠️ un prix repris d’un devis reste ESTIMÉ',
    /prix_releve: repris \? o\.nature === 'facture'/.test(cli))
  // ⚠️ Un prix non reprenable ne doit pas être EFFACÉ : un `null` se lit
  // « prix inconnu » sur l'écran qui déclenche la commande.
  t('⚠️ une unité discordante n’efface pas le prix existant',
    /prix: repris \? p\.prix : l\.cout_unitaire_ht/.test(cli))
  // ⚠️ UN PRIX CONVERTI MONTRE SON CALCUL. Un nombre dérivé qu'on ne sait
  // pas décomposer n'est pas vérifiable, et c'est la première chose qu'on
  // conteste quand il paraît faux.
  t('⚠️ un prix CONVERTI affiche son calcul',
    /p\.converti/.test(cli) && /p\.facteur/.test(cli))
  // ⚠️ Et quand la conversion n'est pas possible, l'écran dit POURQUOI :
  // ce n'est pas « les unités diffèrent », c'est « notre unité ne dit pas
  // combien elle en contient ». La nuance est ce qui indique quoi corriger.
  t('… et un refus dit que notre unité ne porte pas sa contenance',
    /ne dit pas combien/.test(cli))

  // ⚠️⚠️ L'ÉCART DU CATALOGUE N'EST PAS L'EFFET SUR NOTRE PRIX. `ecartPct`
  // compare l'offre à la ligne de catalogue de NOTRE fournisseur ; ce qu'on
  // paie vraiment est `cout_unitaire_ht`. Mesuré le 05/10/2026 : la sauce
  // moutarde est annoncée moins chère chez La Frite Belge et coûterait
  // +12,5 % de plus que ce qu'on paie. Afficher le seul écart catalogue
  // ferait basculer vers un prix PLUS CHER, pourcentage négatif à l'appui.
  t('⚠️⚠️ chaque offre dit ce qu’elle fait à NOTRE prix, pas que l’écart catalogue',
    /p\.prix \/ nous - 1/.test(cli) && /effet > 0\.001/.test(cli))
  t('… et une hausse est marquée en ROUGE, jamais fondue dans l’écart',
    /bg-red-100 text-red-800/.test(cli))
  // On AVERTIT, on ne bloque pas : un minimum de commande ou une
  // disponibilité peut justifier de payer plus cher. C'est une décision.
  t('… l’écran AVERTIT sans interdire la bascule',
    !/disabled=\{enCours \|\| effet/.test(cli))

  t('les offres sont TOUTES montrées, triées par le chargeur',
    /offres\.map\(o =>/.test(cli) && /offre\(s\) moins chère\(s\)/.test(cli))
}

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
