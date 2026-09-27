// Chez QUI achète-t-on chaque matière ? La réponse est dans nos factures.
//
//   node scripts/fournisseur-des-matieres.mjs [--ecrire]
//
// `ingredients.fournisseur_principal` était vide sur 40 matières suivies
// sur 41. Conséquence invisible mais décisive : l'agent Stock construit
// ses bons de commande PAR FOURNISSEUR — sans ce champ, il ne peut en
// créer aucun. La table `bons_commande` était d'ailleurs vide.
//
// ⚠️ ON NE DEVINE PAS, ON RELIT LES FACTURES. Le fournisseur retenu est
// celui de la ligne de facture la PLUS RÉCENTE rattachée à la matière :
// c'est une preuve d'achat, pas une supposition. 38 matières sur 41 en
// ont une.
//
// ⚠️ Les 3 restantes (miel, saumon fumé, jambon blanc) n'ont AUCUNE trace
// d'achat rattachée : on les laisse vides plutôt que de leur inventer un
// fournisseur. Un bon de commande parti chez le mauvais interlocuteur se
// découvre à la livraison.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) {
  const i=l.indexOf('='); if(i<0||l.trim().startsWith('#'))continue
  env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')
}
const U=env.NEXT_PUBLIC_SUPABASE_URL, K=env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p,o={}) => {
  const r = await fetch(U+'/rest/v1/'+p,{...o,headers:{apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation',...(o.headers||{})}})
  const t = await r.text(); const j = t?JSON.parse(t):null
  if(!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`); return j
}
const tout = async p => { const o=[]; for(let d=0;d<30000;d+=1000){
  const l = await sb(`${p}&order=id&offset=${d}&limit=1000`); o.push(...l); if(l.length<1000)break } return o }

const ings   = await tout('ingredients?select=id,nom,fournisseur_principal&actif=eq.true&stocke=eq.true')
const lignes = await tout('facture_lignes?select=ingredient_id,facture_id&ingredient_id=not.is.null')
const factures = await sb('factures_fournisseurs?select=id,fournisseur_id,date_emission,type_document')
const fournisseurs = await sb('fournisseurs?select=id,nom')
const nomF = new Map(fournisseurs.map(f=>[f.id,f.nom]))
const parFacture = new Map(factures.map(f=>[f.id,f]))

// ⚠️ La ligne la PLUS RÉCENTE fait foi : un fournisseur peut avoir changé.
// ⚠️ Les AVOIRS sont écartés — c'est de la marchandise rendue, pas un achat.
const dernier = new Map()
for (const l of lignes) {
  const f = parFacture.get(l.facture_id)
  if (!f || f.type_document === 'avoir') continue
  const vu = dernier.get(l.ingredient_id)
  if (!vu || (f.date_emission ?? '') > (vu.date_emission ?? '')) dernier.set(l.ingredient_id, f)
}

const aPoser = [], sansTrace = []
for (const i of ings) {
  const f = dernier.get(i.id)
  if (!f) { sansTrace.push(i); continue }
  const nom = nomF.get(f.fournisseur_id)
  if (nom && i.fournisseur_principal !== nom) aPoser.push({ ...i, nouveau: nom, le: f.date_emission })
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · fournisseur de chaque matière ──\n`)
console.log(`  ${ings.length} matières suivies au stock`)
console.log(`  ${aPoser.length} à renseigner · ${ings.length - aPoser.length - sansTrace.length} déjà correctes`)
const par = {}
aPoser.forEach(a => { par[a.nouveau] = (par[a.nouveau]||0)+1 })
Object.entries(par).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`     ${String(v).padStart(3)}  ${k}`))
if (sansTrace.length) {
  console.log(`\n  ⚠️ ${sansTrace.length} sans aucune trace d'achat — laissées VIDES :`)
  sansTrace.forEach(i => console.log(`     · ${i.nom}`))
}

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
let n = 0
for (const a of aPoser) {
  await sb(`ingredients?id=eq.${a.id}`, { method:'PATCH',
    body: JSON.stringify({ fournisseur_principal: a.nouveau }), headers:{Prefer:'return=minimal'} })
  n++
}
console.log(`\n✓ ${n} matière(s) rattachée(s) à leur fournisseur.\n`)
