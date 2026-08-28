// Création de la carte du bar + tarifs sur place des softs.
import fs from 'node:fs'
const env={}
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')}
const U=env.NEXT_PUBLIC_SUPABASE_URL,K=env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE=process.argv.includes('--ecrire')
const sb=async(p,o={})=>{const r=await fetch(U+'/rest/v1/'+p,{...o,headers:{apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation',...(o.headers||{})}});const t=await r.text();return t?JSON.parse(t):null}

// ── Tarifs SUR PLACE des softs déjà en base (canette au comptoir → verre en salle)
const SUR_PLACE = {
  'Coca-Cola 33 cl':2.50,'Coca-Cola Zéro 33 cl':2.50,'Coca-Cola Cherry 33 cl':2.50,
  'Orangina 33 cl':2.50,'Fanta 33 cl':2.50,'Oasis 33 cl':2.50,'Ice Tea 33 cl':2.50,
  'Ciao 33 cl':2.50,'Jus d\'orange 33 cl':2.50,'Jus de pomme 33 cl':2.50,
  'Pago pomme 33 cl':2.50,'Pago orange 20 cl':2.20,'Pago pomme 20 cl':2.20,
  'Eau plate 50 cl':2.00,'Eau gazeuse 50 cl':2.20,
  'Red Bull 25 cl':3.00,'Red Bull Ice':3.00,
}

// ── La carte du bar. Le prix est le prix SUR PLACE : au bar, il n'y a pas
//    d'emporter. `prix_vente_ht` en porte donc la conversion, et
//    prix_sur_place_ttc reste NULL — un seul tarif.
//    France Boissons (groupe Heineken) fournit la pression et les softs.
const A=true, S=false   // alcool / sans alcool
const BAR = [
  // [nom, catégorie, TTC, TVA, alcool, coût estimé]
  ['Demi pression',            'Bière',   2.50, 20, A, 0.45],
  ['Pinte pression',           'Bière',   4.50, 20, A, 0.90],
  ['Demi ambrée',              'Bière',   3.00, 20, A, 0.60],
  ['Panaché',                  'Bière',   2.50, 20, A, 0.40],
  ['Monaco',                   'Bière',   2.80, 20, A, 0.55],
  ['Picon bière',              'Bière',   3.20, 20, A, 0.70],
  ['Bière bouteille 33 cl',    'Bière',   3.00, 20, A, 1.00],
  ['Desperados 33 cl',         'Bière',   4.00, 20, A, 1.40],
  ['Bière sans alcool 25 cl',  'Bière',   2.80, 10, S, 0.80],

  ['Pastis 2 cl',              'Apéritif',2.50, 20, A, 0.45],
  ['Martini 4 cl',             'Apéritif',3.00, 20, A, 0.70],
  ['Suze 4 cl',                'Apéritif',3.00, 20, A, 0.70],
  ['Picon 4 cl',               'Apéritif',3.00, 20, A, 0.70],
  ['Kir',                      'Apéritif',3.00, 20, A, 0.85],
  ['Kir royal',                'Apéritif',5.50, 20, A, 1.80],
  ['Porto 6 cl',               'Apéritif',3.00, 20, A, 0.90],
  ['Muscat 6 cl',              'Apéritif',3.00, 20, A, 0.90],
  ['Spritz',                   'Apéritif',5.00, 20, A, 1.60],

  ['Whisky 4 cl',              'Alcool',  5.00, 20, A, 1.05],
  ['Whisky premium 4 cl',      'Alcool',  6.50, 20, A, 1.80],
  ['Rhum 4 cl',                'Alcool',  5.00, 20, A, 1.00],
  ['Vodka 4 cl',               'Alcool',  5.00, 20, A, 1.00],
  ['Gin 4 cl',                 'Alcool',  5.00, 20, A, 1.00],
  ['Alcool + soft',            'Alcool',  6.00, 20, A, 1.55],
  ['Digestif 4 cl',            'Alcool',  4.00, 20, A, 1.10],

  ['Verre de rosé 12 cl',      'Vin',     2.80, 20, A, 0.80],
  ['Verre de rouge 12 cl',     'Vin',     2.80, 20, A, 0.80],
  ['Verre de blanc 12 cl',     'Vin',     2.80, 20, A, 0.80],
  ['Pichet 25 cl',             'Vin',     5.00, 20, A, 1.65],
  ['Pichet 50 cl',             'Vin',     9.00, 20, A, 3.30],
  ['Bouteille Coteaux Varois', 'Vin',    15.00, 20, A, 6.00],
  ['Crémant 75 cl',            'Vin',    26.00, 20, A,12.00],

  ['Sirop à l\'eau',           'Boisson fraîche', 1.80, 10, S, 0.12],
  ['Diabolo',                  'Boisson fraîche', 2.50, 10, S, 0.30],
  ['Limonade 25 cl',           'Boisson fraîche', 2.20, 10, S, 0.25],
  ['Perrier 33 cl',            'Boisson fraîche', 2.50, 10, S, 0.71],
]

const [pdv] = await sb('etablissements?select=id,slug&slug=eq.bar')
const existants = await sb('recettes?select=nom&actif=eq.true')
const deja = new Set((existants??[]).map(x=>x.nom))

console.log(`\n── ${ECRIRE?'ÉCRITURE':'ESSAI À BLANC'} ──\n`)
console.log(`  point de vente « bar » : ${pdv?'trouvé':'ABSENT — les produits ne seront rattachés à rien'}`)

let maj=0
for (const [nom,ttc] of Object.entries(SUR_PLACE)) {
  if (!deja.has(nom)) { console.log(`  ✗ ${nom} introuvable`); continue }
  if (ECRIRE) await sb('recettes?nom=eq.'+encodeURIComponent(nom)+'&actif=eq.true',
    {method:'PATCH',body:JSON.stringify({prix_sur_place_ttc:ttc})})
  maj++
}
console.log(`  tarifs sur place posés : ${maj} / ${Object.keys(SUR_PLACE).length}`)

const aCreer = BAR.filter(([n])=>!deja.has(n))
console.log(`  produits du bar à créer : ${aCreer.length} / ${BAR.length}`)
if (BAR.length !== aCreer.length) console.log(`    (déjà présents : ${BAR.filter(([n])=>deja.has(n)).map(([n])=>n).join(', ')})`)

if (ECRIRE && aCreer.length) {
  const lignes = aCreer.map(([nom,cat,ttc,tva,alc,cout])=>({
    nom, categorie:cat, tva,
    prix_vente_ht: Math.round(ttc/(1+tva/100)*10000)/10000,
    cout_achat_ht: cout,
    contient_alcool: alc,
    actif: true,
    // L'alcool ne part pas au click & collect : pas de contrôle d'âge en ligne.
    vendable_online: false,
    tag_destination: 'BAR',
    ...(pdv ? { etablissement_id: pdv.id } : {}),
  }))
  const r = await sb('recettes', {method:'POST', body:JSON.stringify(lignes)})
  console.log(`  → ${Array.isArray(r)?r.length:0} produit(s) créé(s)`)
}

const familles = {}
for (const [,c] of BAR) familles[c]=(familles[c]??0)+1
console.log('\n  familles :', Object.entries(familles).map(([k,v])=>`${k} ${v}`).join(' · '))
