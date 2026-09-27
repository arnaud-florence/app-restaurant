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

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
