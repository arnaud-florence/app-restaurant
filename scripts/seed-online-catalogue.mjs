// Script seed catalogue ONLINE.
// 1. Active vendable_online=true sur TOUTES les recettes SNACKING/PIZZA/BAR existantes.
// 2. Si une catégorie a < 5 recettes, crée des recettes starter manquantes.
// 3. Ajoute une image_url Unsplash si la recette n'en a pas déjà une.
//
// Usage : depuis app-restaurant/
//   node scripts/seed-online-catalogue.mjs
//
// Variables requises (.env.local) :
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Charge .env.local
try {
  const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch (e) {
  console.error('❌ .env.local introuvable :', e.message)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

// ─── Catalogue starter (images Unsplash libres) ───
const STARTER = {
  SNACKING: [
    { nom: 'Croque-Monsieur', categorie: 'Snacking', prix: 9.50, desc: 'Pain de mie, jambon, emmental fondu, béchamel maison.',
      img: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=800&q=80' },
    { nom: 'Salade César', categorie: 'Snacking', prix: 12.00, desc: 'Romaine, poulet grillé, parmesan, croûtons, sauce César.',
      img: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80' },
    { nom: 'Wrap Poulet', categorie: 'Snacking', prix: 10.50, desc: 'Tortilla, poulet, crudités, sauce yaourt.',
      img: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800&q=80' },
    { nom: 'Frites maison', categorie: 'Snacking', prix: 5.50, desc: 'Pommes de terre fraîches, double cuisson.',
      img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80' },
    { nom: 'Tacos Mexicain', categorie: 'Snacking', prix: 11.00, desc: 'Galette, viande hachée, fromage, sauce piquante.',
      img: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80' },
  ],
  PIZZA: [
    { nom: 'Pizza Margherita', categorie: 'Pizzas', prix: 11.00, desc: 'Tomate, mozzarella, basilic frais.',
      img: 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=800&q=80' },
    { nom: 'Pizza Reine', categorie: 'Pizzas', prix: 13.00, desc: 'Tomate, mozzarella, jambon, champignons.',
      img: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80' },
    { nom: 'Pizza 4 Fromages', categorie: 'Pizzas', prix: 14.50, desc: 'Mozzarella, gorgonzola, chèvre, parmesan.',
      img: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80' },
    { nom: 'Pizza Diavola', categorie: 'Pizzas', prix: 14.00, desc: 'Tomate, mozzarella, chorizo, piments, olives.',
      img: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80' },
    { nom: 'Calzone', categorie: 'Pizzas', prix: 15.00, desc: 'Pizza fermée : jambon, champignons, mozzarella, ricotta.',
      img: 'https://images.unsplash.com/photo-1593504049359-74330189a345?w=800&q=80' },
  ],
  BAR: [
    { nom: 'Coca-Cola 33cl', categorie: 'Boissons', prix: 3.50, desc: 'Bouteille verre fraîche.', alcool: false,
      img: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&q=80' },
    { nom: 'Eau plate 50cl', categorie: 'Boissons', prix: 3.00, desc: 'Eau de source.', alcool: false,
      img: 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=800&q=80' },
    { nom: 'Bière 1664 (25cl)', categorie: 'Boissons', prix: 4.50, desc: 'Bière blonde pression.', alcool: true,
      img: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=80' },
    { nom: 'Verre de vin rouge', categorie: 'Vins', prix: 5.00, desc: 'Sélection du chef, 12cl.', alcool: true,
      img: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80' },
    { nom: 'Mojito', categorie: 'Cocktails', prix: 8.50, desc: 'Rhum, citron vert, menthe, sucre, eau gazeuse.', alcool: true,
      img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80' },
    { nom: 'Café', categorie: 'Boissons', prix: 2.20, desc: 'Expresso italien.', alcool: false,
      img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80' },
  ],
}

const TVA_DEFAUT = { CUISINE: 10, SNACKING: 10, PIZZA: 10, BAR: 10 }

console.log('🍽️  Seed catalogue ONLINE — démarrage\n')

// ─── ÉTAPE 1 : active vendable_online sur recettes existantes ───
console.log('📋 Étape 1 : activation vendable_online sur recettes existantes...')
const { data: existantes, error: errFetch } = await sb.from('recettes')
  .select('id, nom, tag_destination, vendable_online, image_url')
  .in('tag_destination', ['SNACKING', 'PIZZA', 'BAR'])
  .eq('actif', true)

if (errFetch) {
  console.error('❌ Erreur fetch existantes :', errFetch.message)
  process.exit(1)
}

let activees = 0
let dejaActives = 0
for (const r of existantes ?? []) {
  if (r.vendable_online) { dejaActives++; continue }
  const { error } = await sb.from('recettes').update({ vendable_online: true }).eq('id', r.id)
  if (error) console.error(`  ❌ ${r.nom} : ${error.message}`)
  else { activees++; console.log(`  ✓ ${r.nom} (${r.tag_destination})`) }
}
console.log(`  → ${activees} activées, ${dejaActives} déjà actives\n`)

// ─── ÉTAPE 2 : crée recettes starter manquantes ───
console.log('🆕 Étape 2 : création recettes starter manquantes...')
const noms = new Set((existantes ?? []).map(r => r.nom.toLowerCase()))

let creees = 0
for (const tag of ['SNACKING', 'PIZZA', 'BAR']) {
  for (const r of STARTER[tag]) {
    if (noms.has(r.nom.toLowerCase())) {
      console.log(`  ⏭ ${r.nom} (existe déjà, skip)`)
      continue
    }
    const { error } = await sb.from('recettes').insert({
      nom: r.nom,
      categorie: r.categorie,
      tag_destination: tag,
      description: r.desc,
      temps_preparation: tag === 'PIZZA' ? 12 : tag === 'BAR' ? 2 : 8,
      nb_portions: 1,
      prix_vente_ht: Math.round((r.prix / (1 + TVA_DEFAUT[tag] / 100)) * 100) / 100,
      tva: TVA_DEFAUT[tag],
      contient_alcool: !!r.alcool,
      vendable_online: true,
      image_url: r.img,
      actif: true,
    })
    if (error) console.error(`  ❌ ${r.nom} : ${error.message}`)
    else { creees++; console.log(`  ✓ ${r.nom} (${tag}) ${r.prix}€`) }
  }
}
console.log(`  → ${creees} recettes créées\n`)

// ─── ÉTAPE 3 : ajoute image_url sur recettes online sans photo ───
console.log('🖼  Étape 3 : ajout image_url placeholder sur recettes sans photo...')
const { data: sansPhoto } = await sb.from('recettes')
  .select('id, nom, tag_destination')
  .in('tag_destination', ['SNACKING', 'PIZZA', 'BAR'])
  .eq('vendable_online', true)
  .or('image_url.is.null,image_url.eq.')

const PLACEHOLDERS = {
  SNACKING: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  PIZZA:    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
  BAR:      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80',
}

let ajoutees = 0
for (const r of sansPhoto ?? []) {
  const url = PLACEHOLDERS[r.tag_destination]
  const { error } = await sb.from('recettes').update({ image_url: url }).eq('id', r.id)
  if (error) console.error(`  ❌ ${r.nom} : ${error.message}`)
  else { ajoutees++; console.log(`  ✓ ${r.nom} → photo générique ${r.tag_destination}`) }
}
console.log(`  → ${ajoutees} photos placeholder ajoutées\n`)

// ─── Diagnostic final ───
const { count: totalOnline } = await sb.from('recettes')
  .select('id', { count: 'exact', head: true })
  .eq('vendable_online', true)
  .eq('actif', true)

console.log('═══════════════════════════════════════')
console.log(`✅ TERMINÉ — ${totalOnline} recettes vendables en ligne`)
console.log('═══════════════════════════════════════')
console.log('\nTu peux vérifier sur :')
console.log('  → https://app-restaurant-livid.vercel.app/admin/recettes (filtre 🌐 Vente en ligne)')
console.log('  → https://site-restaurant-beta.vercel.app/menu')
console.log('  → https://site-restaurant-beta.vercel.app/commander')
