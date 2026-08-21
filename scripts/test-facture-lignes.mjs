// Test d'intégration — lignes de facture fournisseur et chaîne des marges
// (migration 0125 + createFacture enrichi).
//
// Vérifie le maillon qui manquait au calcul des marges :
//   facture → lignes → rapprochement ingrédient → prix d'achat → historique
//
// La logique testée ici est celle de l'action serveur `createFacture`
// (rapprochement normalisé, mise à jour du prix, historique 'livraison').
// Le test rejoue le même parcours au niveau SQL : setup → assertions →
// cleanup dans l'ordre inverse des FK + restauration du prix d'origine.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

// ─── Setup ───────────────────────────────────────────────────────────
const { data: fours } = await sb.from('fournisseurs').select('id, nom').limit(1)
if (!fours?.length) { console.error('✗ aucun fournisseur en base'); process.exit(1) }
const fournisseurId = fours[0].id

const { data: ing } = await sb.from('ingredients')
  .select('id, nom, prix_achat_ht').eq('actif', true).limit(1)
if (!ing?.length) { console.error('✗ aucun ingrédient en base'); process.exit(1) }
const ingredient = ing[0]
const prixOrigine = Number(ingredient.prix_achat_ht)
const prixTest = Math.round((prixOrigine * 1.07 + 0.01) * 10000) / 10000

console.log(`Fournisseur : ${fours[0].nom} · Ingrédient : ${ingredient.nom} (${prixOrigine} €)\n`)

// ─── 1. Facture multi-pages avec lignes ──────────────────────────────
const numero = 'TEST-0125-' + Date.now()
const { data: facture, error: eF } = await sb.from('factures_fournisseurs').insert({
  fournisseur_id: fournisseurId, numero, date_emission: '2026-08-21',
  montant_ht: 100, montant_ttc: 105.5, statut: 'a_payer', nb_pages: 3,
}).select('id, nb_pages').single()
check('facture créée avec nb_pages = 3', !eF && facture?.nb_pages === 3)

const { error: eL } = await sb.from('facture_lignes').insert([
  { facture_id: facture.id, description: ingredient.nom,
    quantite: 10, unite: 'kg', prix_unitaire_ht: prixTest, total_ht: prixTest * 10,
    ingredient_id: ingredient.id },
  { facture_id: facture.id, description: 'Transport frigorifique',
    quantite: 1, unite: 'forfait', prix_unitaire_ht: 12, total_ht: 12,
    ingredient_id: null },
])
check('2 lignes insérées (1 rapprochée, 1 libre)', !eL)

const { data: lignes } = await sb.from('facture_lignes')
  .select('description, ingredient_id, prix_unitaire_ht').eq('facture_id', facture.id)
check('lignes relues : 2', lignes?.length === 2)
check('la ligne ingrédient porte son rattachement',
  lignes?.some(l => l.ingredient_id === ingredient.id))
check('la ligne transport reste sans rattachement',
  lignes?.some(l => l.description === 'Transport frigorifique' && l.ingredient_id === null))

// ─── 2. Chaîne prix : update + historique ────────────────────────────
const { error: eP } = await sb.from('ingredients')
  .update({ prix_achat_ht: prixTest }).eq('id', ingredient.id)
const { data: relu } = await sb.from('ingredients')
  .select('prix_achat_ht').eq('id', ingredient.id).single()
check('prix d\'achat mis à jour', !eP && Math.abs(Number(relu.prix_achat_ht) - prixTest) < 0.0001)

const { data: hist, error: eH } = await sb.from('historique_prix_ingredients').insert({
  ingredient_id: ingredient.id, prix_achat_ht: prixTest,
  source: 'livraison', note: `Facture ${numero} — test`,
}).select('id').single()
check('historique de prix tracé (source livraison)', !eH && !!hist)

// ─── 3. Cascade : supprimer la facture supprime ses lignes ───────────
await sb.from('factures_fournisseurs').delete().eq('id', facture.id)
const { count: restantes } = await sb.from('facture_lignes')
  .select('*', { count: 'exact', head: true }).eq('facture_id', facture.id)
check('cascade delete : 0 ligne orpheline', restantes === 0)

// ─── Cleanup ─────────────────────────────────────────────────────────
if (hist) await sb.from('historique_prix_ingredients').delete().eq('id', hist.id)
await sb.from('ingredients').update({ prix_achat_ht: prixOrigine }).eq('id', ingredient.id)
const { data: verif } = await sb.from('ingredients')
  .select('prix_achat_ht').eq('id', ingredient.id).single()
check('cleanup : prix d\'origine restauré', Math.abs(Number(verif.prix_achat_ht) - prixOrigine) < 0.0001)

// ─── Bilan ───────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
