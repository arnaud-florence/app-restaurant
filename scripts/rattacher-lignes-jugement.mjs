// Rattachement au jugement — décidé ligne à ligne, pas déduit.
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE=process.argv.includes('--ecrire')
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation'}
const q=async(p,o={})=>{const r=await fetch(U+'/rest/v1/'+p,{...o,headers:H});const t=await r.text();return t?JSON.parse(t):null}
const propre=d=>d.replace(/^.*?\bdu \d{2}\/\d{2}\/\d{2}\s*/i,'').trim()

// motif de description → cible. « P: » produit vendu, « M: » matière.
const REGLES=[
  // ── Boulangerie et viennoiserie ──
  [/BAGUETTE CAMPESTRE MULTICEREALE/i,      'P:Campestre multicéréales'],
  [/BAGUETTE PRECUITE SUR FOUR A SOLE/i,    'P:Baguette classique'],
  [/BATARD CEREALE/i,                       'P:Bâtard céréales'],
  [/BATARD MAIS/i,                          'P:Bâtard maïs et graines'],
  [/BUCHE LIN TOURNSOL/i,                   'P:Pain lin-tournesol'],
  [/^PAIN PRECUIT 58CM/i,                   'P:Pain restaurant'],
  [/CROISSANT (PREPOUSSE|BEUREUSSE)/i,      'P:Croissant'],
  [/PAIN AU RAISIN/i,                       'P:Pain aux raisins'],
  [/CHAUSSON AU POMME/i,                    'P:Chausson aux pommes'],
  // ── Pâtisserie et gourmandise ──
  [/HAOU FLAN CRU/i,                        'P:Part de flan pâtissier'],
  [/TROPEZIENNE/i,                          'P:Tropézienne individuelle'],
  [/TIRAMISU SAV/i,                         'P:Tiramisu individuel'],
  [/SACRISTAIN/i,                           'P:Sacristain'],
  [/CANELE DE BORDEAUX/i,                   'P:Cannelé'],
  [/MADELEINE FOURRE CHOCOLAT NOISETTE/i,   'P:Madeleine chocolat-noisette'],
  [/MUFFIN (BUENO CHOCO|CHOCOLAT NOISETTE)/i,'P:Muffin chocolat-noisette'],
  [/COULANT GOURMAND AU CHOCOLAT/i,         'P:Moelleux au chocolat'],
  [/BIG DONUT/i,                            'P:Donuts'],
  // ── Glaces ──
  [/PUSH UP 80ML SUPER MARIO/i,             'P:Mario'],
  [/SUN ROLL 90ML/i,                        'P:Sunroll'],
  [/FUZZEO 60ML/i,                          'P:Fusée'],
  [/CORNET VANILLE/i,                       'P:Cône vanille'],
  // ── Boissons ──
  [/ORANGINA SLIM/i,                        'P:Orangina 33 cl'],
  [/SLIM CHERRY COKE/i,                     'P:Coca-Cola Cherry 33 cl'],
  [/OASIS POM CASSIS/i,                     'P:Oasis 33 cl'],
  [/dosettes chocolat/i,                    'P:Chocolat chaud'],
  [/dosettes de th[ée]/i,                   'P:Thé'],
  [/Kit (café|complet café) 100? ?Lavazza/i,'P:Café expresso'],
  // ── Pizza ──
  [/PATON A PIZZA/i,                        'P:Panuozzi'],
  // ── Matières ──
  [/BATON LISTAO/i,                         'M:Thon listao'],
  [/FROMAGES? A LA CREME/i,                 'M:Fromage à la crème'],
  [/HUILE GIDOLIVE/i,                       'M:Huile d’olive'],
  [/OLIVE NOIRE/i,                          'M:Olives noires'],
  [/ORIGAN SPECIAL PIZZA/i,                 'M:Origan'],
  [/TRANCHE DE MOZZARELLA SANDWICH/i,       'M:Mozzarella en tranches'],
  [/TRANCHETTE D'EMMENTAL/i,                'M:Emmental en tranches'],
  [/KIT COUVERT 3 PIECE EN BOIS/i,          'M:Kits couverts bois'],
  [/BOITE PATISSIERE BLANCHE 16/i,          'M:Boîtes pâtissières 16'],
  [/BOITE PATISSIERE BLANCHE 22/i,          'M:Boîtes pâtissières 22'],
  [/BOL SALADE/i,                           'M:Bols à salade'],
  [/SAC A BAGUETTE KRAFT/i,                 'M:Sacs kraft baguette'],
  [/SACHET A BAGUETTE BLANC/i,              'M:Sachets à baguette'],
  [/SAC KRAFT BRUN A\/POIGNEE/i,            'M:Sacs kraft à poignées'],
  [/SAC SANDWICH KRAFT/i,                   'M:Sacs sandwich'],
  [/(PQ 200 SERV BLC|SERVIETTE SNACK)/i,    'M:Serviettes'],
]
// Ni vendu ni transformé : matériel, entretien, consommable non suivi.
const ECARTER=/^(100 CV POUR POT|100 POT 30CC|750ML DESINF|ALUMINIUM BOITE|DEVIDOIR|FEUILLE PAPIER CUISSON|FILM ALIMENTAIRE|PELLE COUDEE|PINCE |PLAQUE Suneo|ROULETTE A PIZZA|TOUILLETE BOIS|PAILLE CARTON|PAPIER BRUN ING BURGER)/i

const lignes=await q('facture_lignes?select=id,description&ingredient_id=is.null&recette_id=is.null&ignoree=eq.false')
const recs=await q('recettes?select=id,nom,libelle_achat&actif=eq.true')
const ings=await q('ingredients?select=id,nom,libelle_achat&actif=eq.true&stocke=eq.true')
const parNom=new Map([...recs.map(r=>['P:'+r.nom,{t:'rec',...r}]),...ings.map(i=>['M:'+i.nom,{t:'ing',...i}])])

const plan=[],ecart=[],reste=[]
for(const l of lignes){
  const d=propre(l.description)
  if(ECARTER.test(d)){ ecart.push(l); continue }
  const r=REGLES.find(([re])=>re.test(d))
  if(!r){ reste.push(d); continue }
  const c=parNom.get(r[1])
  if(!c){ console.log('  ⚠ cible inconnue : '+r[1]); reste.push(d); continue }
  plan.push({l,d,c})
}
console.log(`\n── ${ECRIRE?'ÉCRITURE':'ESSAI À BLANC'} ──\n`)
for(const {d,c} of plan) console.log('  '+d.slice(0,46).padEnd(48)+'→ '+c.nom+(c.t==='ing'?'  (matière)':''))
console.log(`\n  rattachements : ${plan.length}`)
console.log(`  écartés       : ${ecart.length}`)
console.log(`  laissés       : ${reste.length}`)
if(reste.length){console.log('\n  ── laissés à votre décision ──');reste.forEach(d=>console.log('    '+d.slice(0,60)))}
if(!ECRIRE){console.log('\n  (rien écrit)');process.exit(0)}
for(const l of ecart) await q('facture_lignes?id=eq.'+l.id,{method:'PATCH',body:JSON.stringify({ignoree:true})})
for(const {l,d,c} of plan){
  await q('facture_lignes?id=eq.'+l.id,{method:'PATCH',body:JSON.stringify(c.t==='rec'?{recette_id:c.id}:{ingredient_id:c.id})})
  if(!String(c.libelle_achat??'').trim())
    await q((c.t==='rec'?'recettes':'ingredients')+'?id=eq.'+c.id,{method:'PATCH',body:JSON.stringify({libelle_achat:d})})
}
console.log(`\n  → ${plan.length} rattachée(s), ${ecart.length} écartée(s)`)
