// Pré-remplir les allergènes CERTAINS des boissons — sans les valider.
//
// ⚠️ La règle du projet est qu'une suggestion généreuse est acceptée en bloc
// par habitude, et qu'une déclaration fausse est plus dangereuse qu'une
// déclaration absente. On ne pré-remplit donc QUE l'indiscutable, et on laisse
// `allergenes_valides_le` à NULL : c'est un humain qui signe, nominativement.
// Tant que la date est nulle, le QR public dit « information non disponible ».
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE=process.argv.includes('--ecrire')
const sb=async(p,o={})=>{const r=await fetch(U+'/rest/v1/'+p,{...o,headers:{apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation',...(o.headers||{})}});const t=await r.text();return t?JSON.parse(t):null}

// Certain, et rien d'autre.
const CERTAIN = [
  // La bière est brassée à partir d'orge ou de blé.
  { test: r => r.categorie==='Bière' && r.nom!=='Picon bière', a:['gluten'] },
  { test: r => r.nom==='Picon bière',                          a:['gluten','sulfites'] },
  // Tout vin du commerce dépasse le seuil de 10 mg/l de sulfites.
  { test: r => r.categorie==='Vin',                            a:['sulfites'] },
  // Apéritifs à base de vin : vermouth, kir, porto, muscat, spritz.
  { test: r => ['Martini 4 cl','Kir','Kir royal','Porto 6 cl','Muscat 6 cl','Spritz'].includes(r.nom), a:['sulfites'] },
  // Boissons lactées.
  { test: r => ['Cappuccino','Chocolat chaud','Café noisette','Cappuccino ou chocolat chaud'].includes(r.nom), a:['lait'] },
]
// Certain qu'il n'y en a PAS : les distillats sont exemptés d'étiquetage
// gluten, et un café ou un soda n'a aucun des 14. Laisser vide serait
// ambigu — c'est la validation humaine qui fera dire « aucun ».
const AUCUN = ['Café expresso','Café allongé','Thé','Pastis 2 cl','Whisky 4 cl',
  'Whisky premium 4 cl','Rhum 4 cl','Vodka 4 cl','Gin 4 cl']

const r = await sb('recettes?select=id,nom,categorie,allergenes_complementaires&actif=eq.true')
const plan=[], incertains=[]
for (const x of r) {
  const m = CERTAIN.find(c => c.test(x))
  if (m) { plan.push({ ...x, a: m.a }); continue }
  if (AUCUN.includes(x.nom)) continue
  if (['Bière','Vin','Apéritif','Alcool','Boisson fraîche','Boisson chaude'].includes(x.categorie))
    incertains.push(x.nom)
}
console.log(`\n── ${ECRIRE?'ÉCRITURE':'ESSAI À BLANC'} ──\n`)
const par={}; for(const p of plan)(par[p.a.join('+')]??=[]).push(p.nom)
for (const [a,noms] of Object.entries(par)) console.log(`  ${a.padEnd(18)} ${noms.length} produit(s) : ${noms.slice(0,4).join(', ')}${noms.length>4?'…':''}`)
console.log(`\n  pré-remplis      : ${plan.length}`)
console.log(`  « aucun » sûr    : ${AUCUN.length} (laissés vides — c'est la validation qui l'affirmera)`)
console.log(`  À VÉRIFIER sur l'étiquette : ${incertains.length}`)
incertains.forEach(n=>console.log('    · '+n))
if (!ECRIRE) { console.log('\n  (rien écrit)'); process.exit(0) }
for (const p of plan)
  await sb('recettes?id=eq.'+p.id, {method:'PATCH', body:JSON.stringify({ allergenes_complementaires: p.a })})
console.log(`\n  → ${plan.length} produit(s) pré-remplis. AUCUN validé : la signature reste à faire.`)
