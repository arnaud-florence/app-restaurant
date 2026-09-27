// Sommes-nous en mesure de passer TOUTES nos commandes aujourd'hui ?
//
//   node scripts/diagnostic-commandes.mjs
//
// Lecture seule. Il ne juge pas sur une impression : pour chaque étage de
// la carte, il compte ce qu'on sait commander et ce qu'on ne sait pas.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) {
  const i=l.indexOf('='); if(i<0||l.trim().startsWith('#'))continue
  env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')
}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const tout=async p=>{const o=[];for(let d=0;d<30000;d+=1000){
  const r=await fetch(U+'/rest/v1/'+p+`&order=id&offset=${d}&limit=1000`,{headers:{apikey:K,Authorization:'Bearer '+K}})
  const j=await r.json(); if(!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0,160))
  o.push(...j); if(j.length<1000)break} return o}
const un=async p=>{const r=await fetch(U+'/rest/v1/'+p,{headers:{apikey:K,Authorization:'Bearer '+K}});return r.json()}

const pct = (a,b)=> b ? `${Math.round(a/b*100)} %` : '—'
const tt = s => console.log(`\n── ${s} ──`)

const etabs = await un('etablissements?select=id,nom,slug,actif')
const nomE = new Map(etabs.map(e=>[e.id,e.nom]))
const produits = await tout('recettes?select=id,nom,actif,categorie,etablissement_id,cout_achat_ht,libelle_achat,nom_matiere,unites_par_achat,tag_destination&actif=eq.true')
const compos  = await tout('recette_ingredients?select=recette_id,ingredient_id,quantite')
const ings    = await tout('ingredients?select=id,nom,actif,stocke,prix_achat_ht,fournisseur_principal,unite')
const fourn   = await un('fournisseurs?select=id,nom,email,actif')
const invent  = await tout('inventaires?select=cible_id,date_inventaire,quantite')

const ingParId = new Map(ings.map(i=>[i.id,i]))
const composPar = new Map()
for (const c of compos) { if(!composPar.has(c.recette_id)) composPar.set(c.recette_id,[]); composPar.get(c.recette_id).push(c) }

console.log(`\n══ PEUT-ON COMMANDER, AUJOURD'HUI, DE QUOI TENIR LA CARTE ? ══`)
console.log(`   ${produits.length} produits actifs · ${ings.filter(i=>i.actif).length} ingrédients actifs`)

tt('Par étage de la carte')
const parEtab = new Map()
for (const p of produits) {
  const k = nomE.get(p.etablissement_id) ?? '(sans point de vente)'
  if (!parEtab.has(k)) parEtab.set(k, [])
  parEtab.get(k).push(p)
}
for (const [etab, ps] of [...parEtab].sort((a,b)=>b[1].length-a[1].length)) {
  // Un produit est « commandable » si on sait CE QU'IL FAUT acheter :
  //  · achat-revente : un libellé d'achat ou une matière nommée ;
  //  · assemblé      : une composition chiffrée.
  const revente = ps.filter(p => p.libelle_achat || p.nom_matiere)
  const assemble = ps.filter(p => (composPar.get(p.id)?.length ?? 0) > 0)
  const ni = ps.filter(p => !p.libelle_achat && !p.nom_matiere && !(composPar.get(p.id)?.length))
  console.log(`\n  ${etab} — ${ps.length} produits`)
  console.log(`     achat-revente identifié : ${String(revente.length).padStart(3)}  (${pct(revente.length,ps.length)})`)
  console.log(`     composition chiffrée    : ${String(assemble.length).padStart(3)}  (${pct(assemble.length,ps.length)})`)
  console.log(`     ⚠️ ni l'un ni l'autre    : ${String(ni.length).padStart(3)}  (${pct(ni.length,ps.length)})`)
  if (ni.length) console.log(`        ex. : ${ni.slice(0,6).map(p=>p.nom.slice(0,26)).join(' · ')}`)
}

tt('Les matières : sait-on chez QUI les acheter ?')
const stockees = ings.filter(i=>i.actif && i.stocke)
const avecFour = stockees.filter(i=>i.fournisseur_principal)
const avecPrix = stockees.filter(i=>Number(i.prix_achat_ht)>0)
console.log(`  ${stockees.length} matières suivies au stock`)
console.log(`     avec un fournisseur : ${avecFour.length} (${pct(avecFour.length,stockees.length)})`)
console.log(`     avec un prix d'achat: ${avecPrix.length} (${pct(avecPrix.length,stockees.length)})`)
const sansRien = stockees.filter(i=>!i.fournisseur_principal && !(Number(i.prix_achat_ht)>0))
if (sansRien.length) console.log(`     ⚠️ ni l'un ni l'autre : ${sansRien.length} — ${sansRien.slice(0,6).map(i=>i.nom.slice(0,22)).join(' · ')}`)

tt('Les ingrédients des fiches techniques (pizzas, brasserie)')
const utilises = new Set(compos.map(c=>c.ingredient_id))
const u = [...utilises].map(id=>ingParId.get(id)).filter(Boolean)
console.log(`  ${u.length} ingrédients entrent dans une fiche technique`)
console.log(`     avec un prix d'achat : ${u.filter(i=>Number(i.prix_achat_ht)>0).length} (${pct(u.filter(i=>Number(i.prix_achat_ht)>0).length,u.length)})`)
console.log(`     suivis au stock      : ${u.filter(i=>i.stocke).length} (${pct(u.filter(i=>i.stocke).length,u.length)})`)
const orphelins = u.filter(i=>!i.stocke)
if (orphelins.length) console.log(`     ⚠️ ${orphelins.length} NON suivis au stock — ils n'apparaîtront dans aucun inventaire ni aucune commande`)

tt('L\'état du stock')
const dates = [...new Set(invent.map(i=>i.date_inventaire))].sort()
console.log(`  ${invent.length} ligne(s) d'inventaire · ${dates.length} comptage(s)`)
console.log(`  dernier comptage : ${dates[dates.length-1] ?? 'AUCUN'}`)
if (!dates.length) console.log(`  ⚠️ Sans comptage de départ, aucune quantité ne peut être calculée : la commande se fait à l'estime.`)

tt('Les fournisseurs : peut-on leur envoyer ?')
for (const f of fourn.filter(x=>x.actif)) {
  const n = stockees.filter(i=>(i.fournisseur_principal??'').toLowerCase().includes(f.nom.toLowerCase().split(' ')[0])).length
  console.log(`  ${f.nom.padEnd(22)} ${f.email ? '✓ ' + f.email.slice(0,34) : '⚠️ pas d\'adresse'}`)
}

tt('Verdict')
const total = produits.length
const couvert = produits.filter(p => p.libelle_achat || p.nom_matiere || (composPar.get(p.id)?.length ?? 0) > 0).length
console.log(`  ${couvert}/${total} produits de la carte savent dire ce qu'il faut acheter (${pct(couvert,total)})`)
console.log(`  ${avecFour.length}/${stockees.length} matières savent chez qui`)
console.log(`  ${dates.length ? 'un comptage existe' : 'AUCUN comptage de stock'}`)
console.log('')
