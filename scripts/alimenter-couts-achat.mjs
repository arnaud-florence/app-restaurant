// Alimente recettes.cout_achat_ht depuis les factures Gineys / Brake France
// scannées (semaine d'ouverture, 17-21 août 2026).
//
// Le rapprochement est fait À LA MAIN, ligne de facture par produit, parce
// que le rapprochement automatique par nom a produit un faux positif
// exemplaire : « BOL SALADE KRAFT 750ML SAC=25 » (l'emballage, 6,15 €)
// rattaché au produit « Salade » — soit un food cost affiché de 154 %.
//
// Coût à la pièce = prix du colis / conditionnement (C=N sur la facture).
// Pour les produits TRANSFORMÉS (focaccias, pizzas), le coût enregistré est
// celui de la BASE achetée (focaccia nature, pâton) : la garniture s'ajoute
// et le food cost réel est donc un peu plus haut que l'affiché — assumé et
// signalé dans l'audit.
//
// Relançable sans risque : écrase les valeurs avec celles des factures.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// [nom produit dans l'outil, coût unitaire HT, justification facture]
const COUTS = [
  // ── Pains & baguettes (prix colis / C=N) ──
  ['Baguette classique',        13.92 / 32,  'BAGUETTE PRECUITE 280G C=32'],
  ['Baguette Victoire',         17.361 / 28, 'BAGUETTE VICTOIRE 50CM C=28'],
  ['Campestre multicéréales',   20.308 / 25, 'BAGUETTE CAMPESTRE MULTI 51CM C=25'],
  ['Pain complet',              19.244 / 20, 'PAIN COMPLET PRECUIT 350G C=20'],
  ['Bâtard céréales',           23.869 / 20, 'BATARD CEREALE & GRAINE C=20'],
  ['Bâtard maïs et graines',    24.471 / 20, 'BATARD MAIS & GRAINE C=20'],
  ['Pain lin-tournesol',        38.644 / 22, 'BUCHE LIN TOURNESOL 450G C=22'],
  ['Pavé multicéréales',        35.988 / 20, 'PAIN AU CEREALE 400G C=20'],
  ['Pain restaurant',           16.20 / 20,  'PAIN PRECUIT 58CM 450G C=20 (BL Bormes)'],
  // ── Viennoiseries ──
  ['Croissant',                 28.84 / 96,  'CROISSANT PREPOUSSE 70G C=96'],
  ['Pain au chocolat',          33.299 / 90, 'PAIN AU CHOCOLAT PREPOUSSE 80G C=90'],
  ['Pain aux raisins',          32.623 / 60, 'PAIN AU RAISIN PAC 110G C=60'],
  ['Chausson aux pommes',       20.142 / 54, 'CHAUSSON AU POMME CRU 100G C=54'],
  ['Sacristain',                60.537 / 40, 'SACRISTAIN GLACE ROYALE CRU C=40'],
  // ── Pâtisseries ──
  ['Éclair au chocolat',        15.55 / 12,  'ECLAIR CHOCOLAT ARTISANAL C=12'],
  ['Tartelette citron meringuée', 1.486,     'TARTELETTE CITRON MERINGUEE (prix pièce)'],
  ['Tropézienne individuelle',  25.25 / 24,  'TROPEZIENNE ø8CM C=24'],
  ['Tiramisu individuel',       9.00 / 5,    'TIRAMISU INDIV 100G C=5'],
  ['Paris brest',               26.20 / 16,  'ECLAI PARIS BREST 13.2CM C=16 (BL Bormes)'],
  // ⚠️ Hypothèse : flan entier ø27cm 2 kg découpé en 10 parts.
  ['Part de flan pâtissier',    75.50 / 7 / 10, 'HAOU FLAN CRU ø27 2KG C=7, 10 parts/flan (hypothèse)'],
  // ── Gourmandises ──
  ['Madeleine chocolat-noisette', 43.361 / 64, 'MADELEINE FOURRE CHOC NOISETTE C=64'],
  ['Muffin chocolat-noisette',  19.617 / 12, 'MUFFIN CHOC NOISETTE 150G C=12'],
  ['Muffin citron',             19.608 / 12, 'MUFFIN CITRON 150G C=12'],
  ['Cannelé',                   14.881 / 30, 'CANELE DE BORDEAUX 60G C=30'],
  ['Cookie chocolat',           36.049 / 30, 'COOKIE FOURRE CHOC LAIT 80G C=30'],
  ['Donuts',                    26.83 / 48,  'BIG DONUT SUCRE 65G C=48 (BL Bormes)'],
  // ── Glaces (Suneo, BL Bormes) ──
  ['Fusee',                     18.00 / 30,  'FUZZEO 60ML C=30'],
  ['Sunroll',                   14.00 / 20,  'SUN ROLL 90ML C=20'],
  ['Mario',                     1.40,        '4B PUSH UP SUPER MARIO (prix pièce facturé)'],
  ['Cone vanille',              4.50 / 20,   'CORNET VANILLE 120ML C=20'],
  // ── Snacking acheté fini ──
  ['Croque monsieur',           19.80 / 26,  'CROQUE MONSIEUR JAMBON TOASTE C=26'],
  // ── Bases transformées (coût = base seule, garniture EN SUS — cf. audit) ──
  ['Focaccia crème fraîche-mozza', 25.124 / 36, 'FOCACCIA PRE-GRILLEE 90G C=36 (base seule)'],
  ['Focaccia reine blanche',       25.124 / 36, 'idem base'],
  ['Focaccia tomate-anchois',      25.124 / 36, 'idem base'],
  ['Focaccia tomates-mozza',       25.124 / 36, 'idem base'],
  // ── Cafés & boissons chaudes (Brake, kit capsule tout compris) ──
  ['Café expresso',             52.75 / 100, 'Kit Lavazza blue 100 capsules+gobelets+sucre'],
  ['Café allongé',              52.75 / 100, 'idem (même capsule)'],
  ['Café noisette',             52.75 / 100 + 0.03, 'capsule + nuage de lait'],
  ['Cappuccino',                52.75 / 100 + 0.15, 'capsule + lait mousse'],
  ['Chocolat chaud',            31.65 / 50,  'Dosette chocolat Blue C=50'],
  ['Thé',                       54.86 / 150, 'Dosette thé menthe C=150'],
]

// ── 1. Corriger le faux positif « Salade » ──
const { error: eS } = await sb.from('recettes')
  .update({ cout_achat_ht: null })
  .eq('nom', 'Salade').eq('tag_destination', 'FOURNIL')
console.log(eS ? `✗ Salade : ${eS.message}`
  : '✓ Salade : faux coût retiré (était le BOL kraft d\'emballage à 6,15 €)')

// ── 2. Écrire les coûts ──
let ok = 0; const absents = []
for (const [nom, cout, justif] of COUTS) {
  const arrondi = Math.round(cout * 10000) / 10000
  const { data, error } = await sb.from('recettes')
    .update({ cout_achat_ht: arrondi })
    .eq('nom', nom).eq('tag_destination', 'FOURNIL')
    .select('nom, prix_vente_ht, tva')
  if (error || !data?.length) { absents.push(nom); continue }
  const pv = Number(data[0].prix_vente_ht)
  const fc = pv > 0 ? (arrondi / pv * 100).toFixed(0) : '—'
  console.log(`  ✓ ${nom.padEnd(30)} ${arrondi.toFixed(4).padStart(7)} €  FC ${String(fc).padStart(3)}%  (${justif.slice(0, 40)})`)
  ok++
}
if (absents.length) console.log(`  · introuvables : ${absents.join(', ')}`)

const { count: avec } = await sb.from('recettes')
  .select('*', { count: 'exact', head: true })
  .eq('tag_destination', 'FOURNIL').eq('actif', true).gt('cout_achat_ht', 0)
console.log(`\n── ${ok} coût(s) écrit(s) · ${avec} produit(s) actif(s) avec coût d'achat ──`)
