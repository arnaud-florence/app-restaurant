import { createClient } from '@/lib/supabase/server'
import { listRecettesAvecIngredients } from '../actions'
import { synthese } from '@/lib/foodCost'
import { type ArticleVente, type RecetteCalc } from '@/lib/menuEngineering'
import EngineeringClient from './EngineeringClient'

export const metadata = { title: 'Menu engineering — Admin' }
export const dynamic = 'force-dynamic'

// On charge 90 jours d'historique et on filtrera côté client par période
// (7 / 30 / 90 jours). Pour des volumes plus gros, on bougera ce filtre
// côté serveur via un searchParam ?periode=N.
const FENETRE_JOURS = 90

export default async function EngineeringPage() {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - FENETRE_JOURS * 86400000).toISOString()

  const [recettesRaw, cmdsRes] = await Promise.all([
    listRecettesAvecIngredients(),
    supabase
      .from('commandes')
      .select('id, created_at')
      .eq('statut', 'encaisse')
      .gte('created_at', cutoff),
  ])

  const cmds = cmdsRes.data ?? []
  const cmdById = new Map<string, string>()
  cmds.forEach(c => cmdById.set(c.id as string, c.created_at as string))

  let articles: ArticleVente[] = []
  if (cmds.length > 0) {
    const { data: art } = await supabase
      .from('commande_articles')
      .select('commande_id, recette_id, quantite, prix_unitaire_ht')
      .in('commande_id', Array.from(cmdById.keys()))

    articles = (art ?? [])
      .filter(a => a.recette_id && cmdById.has(a.commande_id as string))
      .map(a => ({
        recette_id: a.recette_id as string,
        quantite: Number(a.quantite ?? 0),
        prix_unitaire_ht: Number(a.prix_unitaire_ht ?? 0),
        created_at: cmdById.get(a.commande_id as string)!,
      }))
  }

  // On pré-calcule les coûts de chaque recette (single source of truth =
  // prix actuel des ingrédients). Le client n'aura plus qu'à filtrer les
  // articles par période et appeler calculerMatrice().
  const recettesActives = recettesRaw
    .filter(r => r.actif)
    .map<RecetteCalc>(r => {
      const synth = synthese(
        r.ingredients.map(li => ({ quantite: li.quantite, prix_achat_ht: li.ingredient_prix_achat_ht })),
        r.nb_portions,
        r.prix_vente_ht,
      )
      return {
        recette_id: r.id,
        nom: r.nom,
        categorie: r.categorie,
        tag_destination: r.tag_destination,
        prix_vente_ht: r.prix_vente_ht,
        cout_portion: synth.cout_portion,
        marge_par_portion: synth.marge_eur,
        marge_pct: synth.marge_pct,
        food_cost_pct: synth.food_cost_pct,
      }
    })

  return (
    <EngineeringClient
      recettes={recettesActives}
      articles={articles}
      fenetreJours={FENETRE_JOURS}
    />
  )
}
