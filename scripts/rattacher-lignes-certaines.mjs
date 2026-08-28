// Rattachement en masse — UNIQUEMENT ce qui ne prête pas à discussion.
//
// La règle du projet est qu'une suggestion généreuse finit acceptée en bloc.
// Ici c'est pire : personne ne relit. On ne traite donc que deux catégories
// où l'erreur est impossible ou sans conséquence, et on laisse le reste.
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE=process.argv.includes('--ecrire')
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation'}
const q=async(p,o={})=>{const r=await fetch(U+'/rest/v1/'+p,{...o,headers:H});const t=await r.text();return t?JSON.parse(t):null}

const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const VIDES=new Set(['de','du','la','le','les','a','au','aux','et','en','sur','cm','g','kg','cl','ml','c','pce','col','x'])
const jet=s=>[...new Set(norm(s).split(' ').filter(m=>m.length>2&&!VIDES.has(m)))]

// 1. Ce qui n'est ni vendu ni transformé : erreur sans conséquence, la ligne
//    reste dans les charges de la facture.
const ENTRETIEN=/decapant|jex pro|liq vsl|carolin|gant|javel|degraiss|nettoy|desinfect|essuie|bobine|sopalin|torchon|eponge/i

// ⚠️ Le FORMAT doit concorder. « PAGO NECTAR ORANGE PET 33CL » se rapprochait
// de « Pago orange 20 cl » — tous les mots de la cible étaient présents, et le
// contenant ne l'était pas. Un mauvais libellé d'achat écrit ensuite un
// mauvais coût, et la marge se trompe en silence.
const FORMAT=/(\d+(?:[.,]\d+)?)\s*(cl|ml|l|g|kg)\b/gi
const formats=s=>{const o=new Set();let m;const r=new RegExp(FORMAT);
  while((m=r.exec(s))) o.add(m[1].replace(',','.')+m[2].toLowerCase());return o}
const formatsCompatibles=(a,b)=>{const fa=formats(a),fb=formats(b);
  if(!fa.size||!fb.size) return true;                 // l'un des deux ne dit rien
  for(const x of fb) if(fa.has(x)) return true;       // au moins un commun
  return false}

// Un en-tête de bon de livraison ne fait pas un libellé d'achat.
const propre=d=>d.replace(/^.*?\bdu \d{2}\/\d{2}\/\d{2}\s*/i,'').trim()

const lignes=await q('facture_lignes?select=id,description,reference&ingredient_id=is.null&recette_id=is.null&ignoree=eq.false')
const recs=(await q('recettes?select=id,nom,nom_caisse,libelle_achat,categorie&actif=eq.true')).filter(r=>!/^Formule — /.test(r.nom))
const ings=await q('ingredients?select=id,nom&actif=eq.true&stocke=eq.true')
const cibles=[...recs.map(r=>({cle:'rec',id:r.id,label:r.nom,j:[...new Set([...jet(r.nom),...jet(r.libelle_achat||''),...jet(r.nom_caisse||'')])]})),
              ...ings.map(i=>({cle:'ing',id:i.id,label:i.nom,j:jet(i.nom)}))]

const aEcarter=[], aRattacher=[], aLaisser=[]
for(const l of lignes){
  if(ENTRETIEN.test(l.description)){ aEcarter.push(l); continue }
  const j=jet(l.description)
  const n=cibles.map(c=>{const cm=c.j.filter(x=>j.includes(x)).length
    return {c, sc:cm, cv:c.j.length?cm/c.j.length:0}}).filter(x=>x.sc>0)
    .sort((a,b)=>(b.sc-a.sc)||(b.cv-a.cv))
  // 2. Certain = la meilleure piste couvre TOUS les mots de la cible, et
  //    devance nettement la suivante. Tout le reste demande un humain.
  const [a,b]=n
  if(a && a.cv===1 && a.sc>=2 && (!b || b.sc<a.sc || b.cv<1)
     && formatsCompatibles(l.description, a.c.label)) aRattacher.push({l, cible:a.c})
  else aLaisser.push(l)
}

console.log(`\n── ${ECRIRE?'ÉCRITURE':'ESSAI À BLANC'} ──\n`)
console.log(`  à écarter (entretien)      ${aEcarter.length}`)
console.log(`  rattachement certain       ${aRattacher.length}`)
console.log(`  laissées à votre jugement  ${aLaisser.length}`)
console.log('\n  ── ce qui serait rattaché ──')
for(const {l,cible} of aRattacher.slice(0,25))
  console.log('    '+l.description.slice(0,44).padEnd(46)+'→ '+cible.label+(cible.cle==='ing'?'  (matière)':''))
if(aRattacher.length>25) console.log(`    … et ${aRattacher.length-25} autres`)

if(!ECRIRE){ console.log('\n  (rien écrit)'); process.exit(0) }
let n1=0,n2=0
for(const l of aEcarter){ await q('facture_lignes?id=eq.'+l.id,{method:'PATCH',body:JSON.stringify({ignoree:true})}); n1++ }
for(const {l,cible} of aRattacher){
  await q('facture_lignes?id=eq.'+l.id,{method:'PATCH',
    body:JSON.stringify(cible.cle==='rec'?{recette_id:cible.id}:{ingredient_id:cible.id})})
  // Le libellé d'achat : seulement s'il est vide. C'est lui qui débloque le stock.
  const [c]=await q(`${cible.cle==='rec'?'recettes':'ingredients'}?select=libelle_achat&id=eq.${cible.id}`)
  if(c && !String(c.libelle_achat??'').trim())
    await q(`${cible.cle==='rec'?'recettes':'ingredients'}?id=eq.${cible.id}`,
      {method:'PATCH',body:JSON.stringify({libelle_achat:propre(l.description)})})
  n2++
}
console.log(`\n  → ${n1} écartée(s), ${n2} rattachée(s)`)
