// Heineken en canette, 2,50 €. Créée au BAR (le Fournil ne vend aucun alcool).
//
// ⚠️ AUCUN COÛT : Euro-Cash a neuf références Heineken, TOUTES à « N.C. » —
// le rayon Bières est l'un des 18 qu'ils n'ont jamais chiffrés. Reporter le
// coût de la BOUTEILLE (1,5088 €) serait faux deux fois : ce n'est ni le
// même contenant, ni le même fournisseur (France Boissons, verre consigné).
// Elle sort en « coût inconnu » (0150), gris, pas à zéro.
//
// ⚠️ `vendable_online: false` — l'alcool n'est JAMAIS en ligne (0144) : pas
// de contrôle d'âge sur le click & collect.
import fs from 'node:fs'
import crypto from 'node:crypto'
const env = {}
for (const l of fs.readFileSync('/Users/admin/projets/app-restaurant/.env.local','utf8').split('\n')) {
  const i=l.indexOf('='); if(i<0||l.trim().startsWith('#')) continue
  env[l.slice(0,i).trim()] = l.slice(i+1).trim().replace(/^["']|["']$/g,'')
}
const U=env.NEXT_PUBLIC_SUPABASE_URL, K=env.SUPABASE_SERVICE_ROLE_KEY, Z=env.ZELTY_API_KEY
const sb = async (p,init) => { const r=await fetch(`${U}/rest/v1/${p}`,{...init,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(init?.headers||{})}})
  const t=await r.text(); if(!r.ok) throw new Error(p+' → '+r.status+' '+t.slice(0,250)); try{return JSON.parse(t)}catch{return t} }
const zelty = async (path,init={}) => { for(let t=0;t<5;t++){ let r
  try { r=await fetch('https://api.zelty.fr/2.11'+path,{...init,headers:{Authorization:`Bearer ${Z}`,'Content-Type':'application/json',...(init.headers||{})}}) }
  catch(e){ await new Promise(s=>setTimeout(s,3000*(t+1))); continue }
  if(r.status===429||r.status>=500){ console.log('   …'+r.status+', nouvel essai'); await new Promise(s=>setTimeout(s,3000*(t+1))); continue }
  const x=await r.text(); let b; try{b=JSON.parse(x)}catch{b=x}; return {status:r.status,body:b} }
  throw new Error('Zelty a refusé '+(init.method??'GET')+' '+path) }

const NOM='Heineken canette 33 cl', TTC=2.50, GABARIT='Heineken 33 cl'
const [dejala] = await sb(`recettes?select=id&nom=eq.${encodeURIComponent(NOM)}`)
if(dejala){ console.log('= « '+NOM+' » existe déjà'); process.exit(0) }
const [g] = await sb(`recettes?select=*&nom=eq.${encodeURIComponent(GABARIT)}`)
if(!g){ console.log('✗ gabarit introuvable'); process.exit(1) }

const id = crypto.randomUUID()
const ht = TTC/(1+Number(g.tva)/100)
await sb('recettes',{method:'POST',body:JSON.stringify([{
  id, nom:NOM, nom_caisse:NOM,
  categorie:g.categorie, tag_destination:g.tag_destination, etablissement_id:g.etablissement_id,
  prix_vente_ht:Number(ht.toFixed(4)), prix_sur_place_ttc:null,
  tva:g.tva, contient_alcool:g.contient_alcool,
  vendable_online:false,
  cout_achat_ht:null,           // Euro-Cash n'a jamais chiffré ses bières
  nom_matiere:NOM, unites_par_achat:1,   // une canette vendue = une achetée
  image_url:null, actif:true, type_revenu:'vente',
  allergenes_complementaires:g.allergenes_complementaires ?? [],
}])})
console.log(`✓ base : « ${NOM} » ${TTC.toFixed(2)} € TTC (HT ${ht.toFixed(4)}, TVA ${g.tva} %) · ${g.categorie} · ${g.tag_destination}`)

const [c] = await sb(`correspondances_catalogue?select=identifiant_externe&systeme=eq.zelty&recette_id=eq.${g.id}`)
const plats=(await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes||[]
if(plats.length<100){ console.log('✗ lecture ratée'); process.exit(1) }
const m = plats.find(x=>Number(x.id)===Number(c.identifiant_externe))
// ⚠️ pas de `id_fabrication_place` sur une création : Zelty répond 500.
const r = await zelty('/catalog/dishes',{method:'POST',body:JSON.stringify([{
  remote_id:id, name:NOM, price:Math.round(TTC*100), price_togo:Math.round(TTC*100),
  tax:m.tax, tax_takeaway:m.tax_takeaway, tags:m.tags??[] }])})
if(r.status!==200){ console.log('✗ caisse : '+r.status+' '+JSON.stringify(r.body).slice(0,250)); process.exit(1) }
const apres=(await zelty('/catalog/dishes?show_all=true&limit=0')).body.dishes||[]
const p = apres.find(x=>String(x.remote_id)===id)
if(p){ await sb('correspondances_catalogue',{method:'POST',body:JSON.stringify([{systeme:'zelty',identifiant_externe:String(p.id),recette_id:id,libelle_externe:NOM}])})
  console.log('✓ caisse : créée #'+p.id+', lien enregistré') }
else console.log('⚠ aucun identifiant rendu par la caisse')
