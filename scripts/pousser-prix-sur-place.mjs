// Pousser les tarifs SUR PLACE dans la caisse, sur les produits qui en ont un.
// ⚠️ POST /catalog/dishes est un upsert : on relit, on recopie name/price/tax
// tels quels, on ne change QUE ce qu'on vise, et on refuse si un champ manque.
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY,Z=env.ZELTY_API_KEY
const ECRIRE=process.argv.includes('--ecrire')
const nous=await(await fetch(U+'/rest/v1/recettes?select=id,nom,tva,prix_vente_ht,prix_sur_place_ttc&actif=eq.true&prix_sur_place_ttc=not.is.null',{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json()
const plats=(await(await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',{headers:{Authorization:`Bearer ${Z}`}})).json()).dishes??[]
const parRemote=new Map(plats.map(p=>[String(p.remote_id??''),p]))
const corps=[],refus=[]
for(const r of nous){
  const p=parRemote.get(String(r.id))
  if(!p){refus.push(`${r.nom} : absent de la caisse`);continue}
  if(p.name==null||p.price==null||p.tax==null){refus.push(`${r.nom} : champ obligatoire manquant — refus`);continue}
  const salle=Math.round(Number(r.prix_sur_place_ttc)*100)
  const comptoir=Math.round(Number(r.prix_vente_ht)*(1+Number(r.tva)/100)*100)
  if(p.price===salle && p.price_togo===comptoir) continue
  corps.push({id:p.id,name:p.name,price:salle,price_togo:comptoir,tax:p.tax,tax_takeaway:p.tax_takeaway})
  console.log(`  ${r.nom.padEnd(26)} salle ${(salle/100).toFixed(2)} €  ·  comptoir ${(comptoir/100).toFixed(2)} €`)
}
if(refus.length){console.log('\n  ── refusés ──');refus.forEach(l=>console.log('   '+l))}
console.log(`\n  à mettre à jour : ${corps.length}`)
if(!ECRIRE){console.log('  (rien envoyé)');process.exit(0)}
if(corps.length){
  const r=await fetch('https://api.zelty.fr/2.11/catalog/dishes',{method:'POST',headers:{Authorization:`Bearer ${Z}`,'Content-Type':'application/json'},body:JSON.stringify(corps)})
  const j=await r.json();console.log(`  → HTTP ${r.status} · ${(j.dishes??[]).length} mis à jour · errno ${j.errno}`)
}
