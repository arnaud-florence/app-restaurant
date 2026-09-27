// La carte des desserts du restaurant.
//
//   node scripts/desserts-restaurant.mjs [--ecrire]
//
// Constat du 28/09/2026 : la carte Restauration ne portait qu'UN dessert, le
// café gourmand. Une brasserie qui ouvre le 3 octobre sans dessert se prive
// du poste à plus forte marge du service du soir — et le Fournil a sept
// pâtisseries et quatre glaces à deux mètres de la salle.
//
// ⚠️⚠️ LE MÊME GÂTEAU, DEUX PRIX — ET C'EST LE SERVICE QUI LES SÉPARE, PAS
// L'HEURE. Exactement la règle des deux cafés (1,40 € au comptoir, 1,80 €
// servi à table) : un client qui emporte un tiramisu au comptoir paie 3,20 €,
// le même tiramisu servi à table avec couverts, débarrassage et café qui suit
// se vend 6,50 €. Ce sont deux produits de caisse distincts, donc deux
// boutons — un seul, et l'équipe tape au jugé.
//
// ⚠️⚠️ ET C'EST LE MÊME ACHAT. Chaque dessert reprend le `libelle_achat` de
// son jumeau du Fournil : `cleMatiere()` replie alors les deux en UNE ligne
// de réassort. Sans ça on commanderait les tiramisus deux fois — une fois
// pour la vitrine, une fois pour la salle — et le doublon ne se verrait
// nulle part, les deux lignes ayant l'air normales (0131).
//
// ⚠️ Ce que ça répare au passage : les pâtisseries du Fournil sont vendues
// à 43-76 % de food cost (moelleux 76 %, tiramisu 59 %, tartelette 54 %).
// Les mêmes servies à table reviennent à 21-30 %. Le problème du comptoir
// reste entier, mais la salle ne le reproduit pas.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const api = async (chemin, init) => {
  const r = await fetch(`${U}/rest/v1/${chemin}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } })
  const corps = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${corps}`)
  return corps ? JSON.parse(corps) : null
}

const TVA = 10          // servi à table
const SEUIL = 32        // au-delà, le food cost est trop haut (foodCost.ts)

// `jumeau` : le produit du Fournil dont ce dessert reprend l'achat.
// `ttc`    : le prix de la carte du soir.
const DESSERTS = [
  { nom: 'Tiramisu',                    jumeau: 'Tiramisu individuel',        ttc: 6.50,
    procedure: ['Sortir du froid 10 min avant : glacé, il n’a aucun goût.', 'Assiette, cacao tamisé au dernier moment, feuille de menthe.'] },
  { nom: 'Paris-Brest',                 jumeau: 'Paris-Brest',                ttc: 6.50,
    procedure: ['Assiette, sucre glace, quelques amandes effilées.'] },
  { nom: 'Moelleux au chocolat',        jumeau: 'Moelleux au chocolat',       ttc: 6.50,
    procedure: ['⚠️ Se sert TIÈDE : 40 s au micro-ondes, ou 6 min au four à 160 °C.', 'Le cœur doit couler à la cuillère — au-delà, c’est un gâteau ordinaire.', 'Assiette, sucre glace.'] },
  { nom: 'Tartelette citron meringuée', jumeau: 'Tartelette citron meringuée', ttc: 6.00,
    procedure: ['Assiette, zeste de citron frais.', 'Ne pas passer la meringue au chalumeau : elle est déjà dorée et elle retombe.'] },
  { nom: 'Éclair au chocolat',          jumeau: 'Éclair au chocolat',         ttc: 5.50,
    procedure: ['Assiette, trait de crème de balsamique ou de coulis.'] },
  { nom: 'Tropézienne',                 jumeau: 'Tropézienne individuelle',   ttc: 5.50,
    procedure: ['Sortir du froid 10 min avant.', 'Assiette, sucre glace.'] },
  { nom: 'Flan pâtissier',              jumeau: 'Part de flan pâtissier',     ttc: 5.00,
    procedure: ['Une part par personne, tranchée nette au couteau passé sous l’eau chaude.'] },
]

// La coupe de glace n'a pas de jumeau : elle se COMPOSE, trois boules
// prises au bac. C'est la seule du lot qui porte une composition.
const COUPE = { nom: 'Coupe de glace', ttc: 5.50, boules: 3, matiere: 'Glace (boule)',
  procedure: ['Trois boules, coupe froide sortie du congélateur.', 'Parfums du jour annoncés à la table — ils changent avec les bacs.', 'Chantilly et gaufrette selon l’arrivage.'] }

const [et] = await api('etablissements?nom=ilike.*estauration*&select=id,nom')
      || []
const etab = et ?? (await api('etablissements?select=id,nom')).find(e => /restaur/i.test(e.nom))
if (!etab) throw new Error('point de vente Restauration introuvable')

const rec = await api('recettes?select=id,nom,actif,categorie,tag_destination,prix_vente_ht,tva,cout_achat_ht,libelle_achat,unites_par_achat,image_url,nom_caisse,etablissement_id&limit=1000')
const ing = await api('ingredients?select=id,nom,unite,prix_achat_ht&limit=1000')

const lignes = [], erreurs = []
for (const d of DESSERTS) {
  const j = rec.find(r => r.nom === d.jumeau && r.actif)
  if (!j) { erreurs.push(`jumeau introuvable au Fournil : ${d.jumeau}`); continue }
  // ⚠️ Sans coût ni libellé d'achat, le dessert naîtrait « coût inconnu » et
  // hors de toute commande : on REFUSE plutôt que de créer une fiche creuse.
  if (!j.cout_achat_ht) { erreurs.push(`${d.jumeau} n'a pas de coût d'achat`); continue }
  if (!j.libelle_achat) { erreurs.push(`${d.jumeau} n'a pas de libellé d'achat — le réassort ne saurait pas les regrouper`); continue }
  const cout = Number(j.cout_achat_ht)
  const ht = d.ttc / (1 + TVA / 100)
  lignes.push({ ...d, jum: j, cout, ht, fc: cout / ht * 100,
    charge: {
      nom: d.nom, categorie: 'Dessert', tag_destination: 'CUISINE',
      etablissement_id: etab.id, actif: true, tva: TVA,
      prix_vente_ht: Number(ht.toFixed(4)),
      cout_achat_ht: cout,
      // ⚠️ MÊME libellé d'achat que le jumeau : c'est ce qui fait UNE seule
      // ligne de commande pour les deux produits.
      libelle_achat: j.libelle_achat,
      unites_par_achat: j.unites_par_achat ?? 1,
      // ⚠️ Le libellé de CAISSE doit DIFFÉRER, lui : deux boutons portant le
      // même nom rendraient le rapprochement des tickets ambigu, et la vente
      // du soir se rattacherait au produit du comptoir.
      nom_caisse: `${d.nom} (salle)`,
      // Même gâteau, même photo.
      image_url: j.image_url,
      // La brasserie se sert sur place : rien en click & collect.
      vendable_online: false,
      procedure: d.procedure.join('\n'),
    } })
}

const mat = ing.find(i => i.nom === COUPE.matiere)
if (!mat) erreurs.push(`matière « ${COUPE.matiere} » introuvable`)
const coupe = mat ? (() => {
  const cout = COUPE.boules * Number(mat.prix_achat_ht)
  const ht = COUPE.ttc / (1 + TVA / 100)
  return { ...COUPE, mat, cout, ht, fc: cout / ht * 100,
    charge: { nom: COUPE.nom, categorie: 'Dessert', tag_destination: 'CUISINE',
      etablissement_id: etab.id, actif: true, tva: TVA,
      prix_vente_ht: Number(ht.toFixed(4)), nom_caisse: `${COUPE.nom} (salle)`,
      vendable_online: false, nb_portions: 1, procedure: COUPE.procedure.join('\n') } }
})() : null

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — point de vente « ${etab.nom} »\n`)
console.log(`── ${lignes.length + (coupe ? 1 : 0)} dessert(s) ──\n`)
const feu = fc => fc > SEUIL ? '🔴' : fc > 28 ? '🟡' : '🟢'
for (const l of lignes) {
  const jTtc = Number(l.jum.prix_vente_ht) * (1 + Number(l.jum.tva) / 100)
  console.log(`  ${feu(l.fc)} ${l.nom.padEnd(28)} ${l.ttc.toFixed(2)} € TTC  ·  coût ${l.cout.toFixed(3)} €  ·  food cost ${l.fc.toFixed(0)} %`)
  console.log(`      même achat que « ${l.jum.nom} » du Fournil (${jTtc.toFixed(2)} € à emporter, food cost ${Math.round(l.cout / Number(l.jum.prix_vente_ht) * 100)} %)`)
}
if (coupe) console.log(`  ${feu(coupe.fc)} ${coupe.nom.padEnd(28)} ${coupe.ttc.toFixed(2)} € TTC  ·  coût ${coupe.cout.toFixed(3)} €  ·  food cost ${coupe.fc.toFixed(0)} %\n      ${coupe.boules} boules × ${Number(coupe.mat.prix_achat_ht).toFixed(2)} € — composition, pas un achat-revente`)

const deja = lignes.filter(l => rec.some(r => r.nom === l.nom && r.etablissement_id === etab.id))
if (deja.length) console.log(`\n  (${deja.length} existe(nt) déjà côté Restauration — mise à jour)`)

if (erreurs.length) { console.log(`\n⚠️ ${erreurs.length} problème(s) :`); erreurs.forEach(e => console.log('  ·', e)) }
console.log(`\n⚠️ Les prix sont une PROPOSITION : ils tiennent la carte entre 21 et 30 % de`)
console.log(`   food cost, avec des pizzas à 12-17 €. Ils se changent dans ce fichier.`)
console.log(`⚠️ Après écriture, ces desserts ne sont PAS encore dans la caisse :`)
console.log(`   les pousser demande /api/cron/caisse/zelty/import (essai à blanc d'abord).`)

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(erreurs.length ? 1 : 0) }
if (erreurs.length) { console.error('\n⛔ Rien écrit.'); process.exit(1) }

let n = 0
for (const l of [...lignes, ...(coupe ? [coupe] : [])]) {
  const exist = rec.find(r => r.nom === l.nom && r.etablissement_id === etab.id)
  if (exist) await api(`recettes?id=eq.${exist.id}`, { method: 'PATCH', body: JSON.stringify(l.charge) })
  else {
    const [cree] = await api('recettes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(l.charge) })
    if (l === coupe) {
      await api('recette_ingredients', { method: 'POST', body: JSON.stringify(
        [{ recette_id: cree.id, ingredient_id: mat.id, quantite: COUPE.boules, unite: mat.unite }]) })
    }
  }
  n++
}
console.log(`\n✅ ${n} dessert(s) à la carte.`)
