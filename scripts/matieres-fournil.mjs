// Déclare les MATIÈRES PREMIÈRES réellement stockées au Fournil, avec leurs
// prix relevés sur les factures Gineys/Brake du 12 au 22 août 2026.
//
// Ce sont elles qu'on compte à l'inventaire — pas les sandwichs et paninis,
// qui s'assemblent à la commande. La table `ingredients` contenait 100 lignes
// de démo héritées du restaurant : `stocke = true` sépare le réel du bruit.
//
// Idempotent : upsert par nom, relançable après chaque nouvelle facture.
// Usage : node scripts/matieres-fournil.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// [nom compté, catégorie, unité comptée, prix HT de l'unité, libellé facture]
const MATIERES = [
  // ── Charcuterie & traiteur ──
  ['Jambon blanc tranché',    'Charcuterie', 'barquette 1 kg',  9.053,  'JAMBON DECOUPE DEGRAISSE'],
  ['Rosette de Lyon',         'Charcuterie', 'barquette 500 g', 5.950,  'ROSETTE DE LYON'],
  ['Jambon cru Serrano',      'Charcuterie', 'barquette 500 g', 8.800,  'JAMBON CRU SERRANO'],
  ['Filet de poulet rôti',    'Charcuterie', 'kg',              7.990,  'TRANCHETTE DE FILET DE POULET'],
  ['Saumon fumé tranché',     'Poisson',     'plaque 500 g',   21.004,  'TRANCHETTE DE SAUMON FUME'],
  ['Thon listao',             'Poisson',     'sachet 1 kg',     7.984,  'BATON LISTAO'],
  // ── Crémerie ──
  ['Mozzarella râpée',        'Crémerie',    'sac 2 kg',        6.924,  'MOZZARELLA RAPEE'],
  ['Mozzarella en tranches',  'Crémerie',    'barquette 400 g', 4.294,  'TRANCHE DE MOZZARELLA'],
  ['Mozzarella cerise',       'Crémerie',    'barquette 1 kg',  9.990,  'MOZZARELLA CERISE'],
  ['Emmental râpé',           'Crémerie',    'sac 1 kg',        6.184,  'EMMENTAL RAPE'],
  ['Emmental en tranches',    'Crémerie',    'barquette 500 g', 4.885,  "TRANCHETTE D'EMMENTAL"],
  ['Bûchette de chèvre',      'Crémerie',    'pièce 180 g',     2.354,  'BUCHETTE CHEVRE'],
  ['Feta en dés',             'Crémerie',    'barquette 900 g',14.989,  'FETA GREQUE'],
  ['Crème fraîche épaisse',   'Crémerie',    'seau 1 L',        4.850,  'CREME FRAICHE EPAISSE'],
  ['Fromage à la crème',      'Crémerie',    'barquette 1 kg',  8.800,  'FROMAGES A LA CREME'],
  ['Beurre doux',             'Crémerie',    'rouleau 1 kg',    8.049,  'BEURRE DOUX ROULEAU'],
  // ── Épicerie ──
  ['Pesto alla genovese',     'Épicerie',    'seau 1 kg',      18.026,  'PESTO ALLA GENOVESE'],
  ['Sauce pizza',             'Épicerie',    'boîte 5/1',       7.001,  'SAUCE PIZZA AROMATISEE'],
  ['Olives noires',           'Épicerie',    'seau 2,5 kg',    10.300,  'OLIVE NOIRE A LA GRECQUE'],
  ['Miel liquide',            'Épicerie',    'boîte 1 kg',      8.454,  'MIEL DE FLEUR'],
  ['Huile d’olive',           'Épicerie',    'bidon 5 L',       4.133,  'HUILE GIDOLIVE'],
  ['Origan',                  'Épicerie',    'sac 750 g',      11.650,  'ORIGAN SPECIAL PIZZA'],
  ['Vinaigrette balsamique',  'Épicerie',    'bouteille 750 ml',4.990,  'SAUCE VINAIGRETTE AU VINAIGRE'],
  ['Sauce mayonnaise',        'Épicerie',    'bouteille 920 g', 5.360,  'SQUEEZ SAUCE MAYONNAISE'],
  ['Sauce burger',            'Épicerie',    'bouteille 950 g', 5.104,  'SQUEEZ SAUCE SUPREME BURGER'],
  ['Sauce moutarde',          'Épicerie',    'bouteille 950 g', 4.904,  'SQUEEZ SAUCE MOUTARDE'],
  ['Sauce kebab',             'Épicerie',    'bouteille 950 g', 4.454,  'SQUEEZ SAUCE KEBAB'],
  // ── Emballages : ça se compte et ça manque un dimanche matin ──
  ['Sachets à baguette',      'Emballage',   'colis 1000',     39.354,  'SACHET A BAGUETTE BLANC'],
  ['Sacs kraft baguette',     'Emballage',   'colis 1000',     35.804,  'SAC A BAGUETTE KRAFT'],
  ['Sacs sandwich',           'Emballage',   'colis 1000',     26.294,  'SAC SANDWICH KRAFT'],
  ['Sacs kraft à poignées',   'Emballage',   'colis 250',      31.850,  'SAC KRAFT BRUN A/POIGNEE'],
  ['Boîtes pâtissières 16',   'Emballage',   'sac 50',          7.840,  'BOITE PATISSIERE BLANCHE 16'],
  ['Boîtes pâtissières 22',   'Emballage',   'sac 50',         10.450,  'BOITE PATISSIERE BLANCHE 22'],
  ['Bols à salade',           'Emballage',   'sac 25',          6.150,  'BOL SALADE KRAFT'],
  ['Serviettes',              'Emballage',   'colis 3000',     38.104,  'SERVIETTE SNACK'],
  ['Kits couverts bois',      'Emballage',   'colis 250',      29.594,  'KIT COUVERT 3 PIECE'],
]

let crees = 0, majs = 0
for (const [nom, categorie, unite, prix, libelle] of MATIERES) {
  const { data: existe } = await sb.from('ingredients')
    .select('id').eq('nom', nom).maybeSingle()
  if (existe) {
    await sb.from('ingredients').update({
      categorie, unite, prix_achat_ht: prix, stocke: true, actif: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existe.id)
    majs++
  } else {
    const { error } = await sb.from('ingredients').insert({
      nom, categorie, unite, prix_achat_ht: prix, stocke: true, actif: true,
      stock_actuel: 0, stock_minimum: 0,
    })
    if (error) { console.log(`  ✗ ${nom} : ${error.message}`); continue }
    crees++
  }
  console.log(`  ✓ ${nom.padEnd(26)} ${unite.padEnd(18)} ${prix.toFixed(3).padStart(7)} €   ← ${libelle}`)
}

const { count } = await sb.from('ingredients')
  .select('*', { count: 'exact', head: true }).eq('stocke', true)
console.log(`\n── ${crees} créée(s), ${majs} mise(s) à jour · ${count} matière(s) comptée(s) à l'inventaire ──`)
