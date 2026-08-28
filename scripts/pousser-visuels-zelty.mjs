// Pousser les visuels dans la caisse. Même règle que partout : on RELIT, on
// recopie name/price/tax verbatim, on n'ajoute que l'image, on refuse si un
// champ obligatoire manque.
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY,Z=env.ZELTY_API_KEY
const ECRIRE=process.argv.includes('--ecrire')
const nous=await(await fetch(U+'/rest/v1/recettes?select=id,nom,image_url&actif=eq.true&image_url=not.is.null',{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json()
const plats=(await(await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',{headers:{Authorization:`Bearer ${Z}`}})).json()).dishes??[]
const parRemote=new Map(plats.map(p=>[String(p.remote_id??''),p]))
const corps=[],refus=[]
for(const r of nous){
  const p=parRemote.get(String(r.id)); if(!p) continue
  if(p.image===r.image_url) continue
  if(p.name==null||p.price==null||p.tax==null){refus.push(`${r.nom} : champ obligatoire manquant — refus`);continue}
  corps.push({id:p.id,name:p.name,price:p.price,price_togo:p.price_togo,tax:p.tax,tax_takeaway:p.tax_takeaway,image:r.image_url})
}
console.log(`\n  visuels à poser dans la caisse : ${corps.length}`)
refus.forEach(l=>console.log('   ✗ '+l))
if(!ECRIRE){console.log('  (rien envoyé)');process.exit(0)}
if(corps.length){
  const r=await fetch('https://api.zelty.fr/2.11/catalog/dishes',{method:'POST',headers:{Authorization:`Bearer ${Z}`,'Content-Type':'application/json'},body:JSON.stringify(corps)})
  const j=await r.json();console.log(`  → HTTP ${r.status} · ${(j.dishes??[]).length} mis à jour · errno ${j.errno}`)
}
