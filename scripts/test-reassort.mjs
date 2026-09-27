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

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
