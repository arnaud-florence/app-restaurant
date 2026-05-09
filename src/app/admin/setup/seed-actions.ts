'use server'

// Server action pour installer le pack catalogue démarrage
// (5 fournisseurs + 50 ingrédients + 20 recettes).
// Idempotent : skip les éléments existants par nom.
// Manager only.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { FOURNISSEURS_SEED, INGREDIENTS_SEED, RECETTES_SEED } from '@/lib/catalogue-seed'

export async function installerCatalogueDemarrage(): Promise<{
  ok: true
  fournisseurs: { crees: number; existants: number }
  ingredients: { crees: number; existants: number }
  recettes: { crees: number; existants: number }
  details: string[]
}> {
  await requireManager()
  const sb = await createClient()
  const details: string[] = []

  // 1. Fournisseurs
  let fCrees = 0, fExistants = 0
  const { data: fExist } = await sb.from('fournisseurs').select('nom')
  const fournNoms = new Set((fExist ?? []).map(r => r.nom as string))
  for (const f of FOURNISSEURS_SEED) {
    if (fournNoms.has(f.nom)) { fExistants++; continue }
    const { error } = await sb.from('fournisseurs').insert({ ...f, actif: true })
    if (error) {
      details.push(`❌ Fournisseur ${f.nom} : ${error.message}`)
    } else {
      fCrees++
      details.push(`✓ Fournisseur ${f.nom}`)
    }
  }

  // 2. Ingrédients
  let iCrees = 0, iExistants = 0
  const { data: iExist } = await sb.from('ingredients').select('nom')
  const ingNoms = new Set((iExist ?? []).map(r => r.nom as string))
  for (const i of INGREDIENTS_SEED) {
    if (ingNoms.has(i.nom)) { iExistants++; continue }
    const { error } = await sb.from('ingredients').insert({
      nom: i.nom,
      categorie: i.categorie,
      unite: i.unite,
      prix_achat_ht: i.prix,
      fournisseur_principal: i.fournisseur,
      stock_actuel: 0,
      stock_minimum: 1,
      stock_maximum: 10,
      dlc_moyenne_jours: i.categorie === 'Légume' || i.categorie === 'Poisson' ? 3 : i.categorie === 'Viande' ? 5 : 30,
      allergenes: i.allergenes,
      actif: true,
    })
    if (error) {
      details.push(`❌ Ingrédient ${i.nom} : ${error.message}`)
    } else {
      iCrees++
      ingNoms.add(i.nom)
    }
  }
  details.push(`📦 ${iCrees} ingrédients créés, ${iExistants} déjà existants`)

  // 3. Recettes (avec ingrédients liés)
  let rCrees = 0, rExistants = 0
  const { data: rExist } = await sb.from('recettes').select('nom')
  const recNoms = new Set((rExist ?? []).map(r => r.nom as string))
  // Re-fetch IDs ingrédients après insertion
  const { data: ingsAll } = await sb.from('ingredients').select('id, nom, unite, prix_achat_ht')
  const ingByNom = new Map<string, { id: string; unite: string; prix: number }>()
  for (const i of (ingsAll ?? [])) {
    ingByNom.set(i.nom as string, { id: i.id as string, unite: i.unite as string, prix: Number(i.prix_achat_ht ?? 0) })
  }

  for (const r of RECETTES_SEED) {
    if (recNoms.has(r.nom)) { rExistants++; continue }

    // Insert recette
    const { data: recCree, error: errR } = await sb.from('recettes').insert({
      nom:                         r.nom,
      categorie:                   r.categorie,
      tag_destination:             r.tag,
      description:                 r.description,
      temps_preparation:           r.temps_prep,
      nb_portions:                 r.nb_portions,
      prix_vente_ht:               r.prix,
      tva:                         r.contient_alcool ? 20 : 10,
      contient_alcool:             r.contient_alcool,
      actif:                       true,
    }).select('id').single()
    if (errR || !recCree) {
      details.push(`❌ Recette ${r.nom} : ${errR?.message ?? 'erreur'}`)
      continue
    }

    // Insert ingrédients liés
    const recIngRows: Array<{ recette_id: string; ingredient_id: string; quantite: number; unite: string }> = []
    for (const ri of r.ingredients) {
      const ing = ingByNom.get(ri.nom)
      if (!ing) {
        details.push(`  ⚠ Ingrédient '${ri.nom}' introuvable pour ${r.nom}`)
        continue
      }
      recIngRows.push({
        recette_id: recCree.id as string,
        ingredient_id: ing.id,
        quantite: ri.q,
        unite: ri.u,
      })
    }
    if (recIngRows.length > 0) {
      const { error: errRi } = await sb.from('recette_ingredients').insert(recIngRows)
      if (errRi) details.push(`  ⚠ Lien ingrédients ${r.nom} : ${errRi.message}`)
    }
    rCrees++
  }
  details.push(`👨‍🍳 ${rCrees} recettes créées, ${rExistants} déjà existantes`)

  revalidatePath('/admin/recettes')
  revalidatePath('/admin/ingredients')
  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/setup')

  return {
    ok: true as const,
    fournisseurs: { crees: fCrees, existants: fExistants },
    ingredients:  { crees: iCrees, existants: iExistants },
    recettes:     { crees: rCrees, existants: rExistants },
    details,
  }
}

// ============================================================
// SEED catalogue ONLINE — active vendable_online + crée recettes starter
// + ajoute photos placeholder pour le site web (outil 2).
// ============================================================
const ONLINE_STARTER = {
  SNACKING: [
    { nom: 'Croque-Monsieur',  cat: 'Snacking', prix_ttc: 9.50,  alcool: false, desc: 'Pain de mie, jambon, emmental fondu, béchamel maison.', img: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=800&q=80' },
    { nom: 'Salade César',     cat: 'Snacking', prix_ttc: 12.00, alcool: false, desc: 'Romaine, poulet grillé, parmesan, croûtons, sauce César.', img: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80' },
    { nom: 'Wrap Poulet',      cat: 'Snacking', prix_ttc: 10.50, alcool: false, desc: 'Tortilla, poulet, crudités, sauce yaourt.', img: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800&q=80' },
    { nom: 'Frites maison',    cat: 'Snacking', prix_ttc: 5.50,  alcool: false, desc: 'Pommes de terre fraîches, double cuisson.', img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80' },
    { nom: 'Tacos Mexicain',   cat: 'Snacking', prix_ttc: 11.00, alcool: false, desc: 'Galette, viande hachée, fromage, sauce piquante.', img: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80' },
  ],
  PIZZA: [
    { nom: 'Pizza Margherita', cat: 'Pizzas', prix_ttc: 11.00, alcool: false, desc: 'Tomate, mozzarella, basilic frais.', img: 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=800&q=80' },
    { nom: 'Pizza Reine',      cat: 'Pizzas', prix_ttc: 13.00, alcool: false, desc: 'Tomate, mozzarella, jambon, champignons.', img: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80' },
    { nom: 'Pizza 4 Fromages', cat: 'Pizzas', prix_ttc: 14.50, alcool: false, desc: 'Mozzarella, gorgonzola, chèvre, parmesan.', img: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80' },
    { nom: 'Pizza Diavola',    cat: 'Pizzas', prix_ttc: 14.00, alcool: false, desc: 'Tomate, mozzarella, chorizo, piments, olives.', img: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80' },
    { nom: 'Calzone',          cat: 'Pizzas', prix_ttc: 15.00, alcool: false, desc: 'Pizza fermée : jambon, champignons, mozzarella, ricotta.', img: 'https://images.unsplash.com/photo-1593504049359-74330189a345?w=800&q=80' },
  ],
  BAR: [
    { nom: 'Coca-Cola 33cl',     cat: 'Boissons',  prix_ttc: 3.50, alcool: false, desc: 'Bouteille verre fraîche.', img: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&q=80' },
    { nom: 'Eau plate 50cl',     cat: 'Boissons',  prix_ttc: 3.00, alcool: false, desc: 'Eau de source.', img: 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=800&q=80' },
    { nom: 'Bière 1664 (25cl)',  cat: 'Boissons',  prix_ttc: 4.50, alcool: true,  desc: 'Bière blonde pression.', img: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=80' },
    { nom: 'Verre de vin rouge', cat: 'Vins',      prix_ttc: 5.00, alcool: true,  desc: 'Sélection du chef, 12cl.', img: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80' },
    { nom: 'Mojito',             cat: 'Cocktails', prix_ttc: 8.50, alcool: true,  desc: 'Rhum, citron vert, menthe, sucre, eau gazeuse.', img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80' },
    { nom: 'Café',               cat: 'Boissons',  prix_ttc: 2.20, alcool: false, desc: 'Expresso italien.', img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80' },
  ],
} as const

const PHOTO_PLACEHOLDER: Record<'SNACKING' | 'PIZZA' | 'BAR', string> = {
  SNACKING: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  PIZZA:    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
  BAR:      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80',
}

export async function seedCatalogueOnline(): Promise<{
  ok: true
  activees: number
  creees: number
  photos_ajoutees: number
  total_online: number
  details: string[]
}> {
  await requireManager()
  const sb = await createClient()
  const details: string[] = []

  // 1. Active vendable_online sur recettes existantes
  const { data: existantes } = await sb.from('recettes')
    .select('id, nom, tag_destination, vendable_online')
    .eq('actif', true)
    .in('tag_destination', ['SNACKING', 'PIZZA', 'BAR'])

  let activees = 0
  for (const r of (existantes ?? []) as Array<{ id: string; nom: string; tag_destination: string; vendable_online: boolean }>) {
    if (r.vendable_online) continue
    const { error } = await sb.from('recettes').update({ vendable_online: true }).eq('id', r.id)
    if (!error) { activees++; details.push(`✓ Activé : ${r.nom} (${r.tag_destination})`) }
  }

  // 2. Crée recettes starter manquantes
  const nomsExistants = new Set((existantes ?? []).map(r => (r.nom as string).toLowerCase()))
  let creees = 0
  for (const tag of ['SNACKING', 'PIZZA', 'BAR'] as const) {
    for (const r of ONLINE_STARTER[tag]) {
      if (nomsExistants.has(r.nom.toLowerCase())) {
        details.push(`⏭ Skip (existe) : ${r.nom}`)
        continue
      }
      const tva = r.alcool ? 20 : 10
      const prix_ht = Math.round((r.prix_ttc / (1 + tva / 100)) * 100) / 100
      const { error } = await sb.from('recettes').insert({
        nom: r.nom,
        categorie: r.cat,
        tag_destination: tag,
        description: r.desc,
        temps_preparation: tag === 'PIZZA' ? 12 : tag === 'BAR' ? 2 : 8,
        nb_portions: 1,
        prix_vente_ht: prix_ht,
        tva,
        contient_alcool: r.alcool,
        vendable_online: true,
        image_url: r.img,
        actif: true,
      })
      if (!error) { creees++; details.push(`🆕 Créée : ${r.nom} (${tag}) ${r.prix_ttc}€`) }
      else details.push(`❌ ${r.nom} : ${error.message}`)
    }
  }

  // 3. Photo placeholder sur recettes online sans image
  const { data: sansPhoto } = await sb.from('recettes')
    .select('id, nom, tag_destination')
    .eq('actif', true)
    .eq('vendable_online', true)
    .or('image_url.is.null,image_url.eq.')

  let photos_ajoutees = 0
  for (const r of (sansPhoto ?? []) as Array<{ id: string; nom: string; tag_destination: string }>) {
    const url = PHOTO_PLACEHOLDER[r.tag_destination as 'SNACKING' | 'PIZZA' | 'BAR']
    if (!url) continue
    const { error } = await sb.from('recettes').update({ image_url: url }).eq('id', r.id)
    if (!error) { photos_ajoutees++; details.push(`🖼 Photo : ${r.nom}`) }
  }

  // Total final
  const { count } = await sb.from('recettes')
    .select('id', { count: 'exact', head: true })
    .eq('actif', true)
    .eq('vendable_online', true)

  revalidatePath('/admin/recettes')
  revalidatePath('/admin/setup')
  revalidatePath('/admin/plats-du-jour')

  return {
    ok: true as const,
    activees,
    creees,
    photos_ajoutees,
    total_online: count ?? 0,
    details,
  }
}
