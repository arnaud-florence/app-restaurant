import { createClient } from '@/lib/supabase/server'
import BonsPrintClient from './BonsPrintClient'
import type { TagDestination } from '@/lib/service'
import type { BonArticle, BonsPrintData } from './types'

export const metadata = { title: 'Bon de préparation', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function BonsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dest?: string; auto?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const dest = (sp.dest ?? '').toUpperCase()
  const auto = sp.auto === '1'
  const filterDest: TagDestination | null =
    dest === 'CUISINE' || dest === 'PIZZA' || dest === 'BAR' ? dest : null

  const supabase = await createClient()

  const { data: cmd } = await supabase
    .from('commandes')
    .select(`
      id, numero, source, numero_table, notes, created_at,
      serveur:employes!serveur_id(prenom, nom),
      commande_articles(id, quantite, tag_destination, commentaire, recette:recettes(nom))
    `)
    .eq('id', id)
    .maybeSingle()

  if (!cmd) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 p-8">
        <p className="text-center">Commande introuvable.</p>
      </div>
    )
  }

  const serv = cmd.serveur as { prenom?: string; nom?: string } | null
  type ArticleRow = {
    id: string
    quantite: number | null
    tag_destination: string
    commentaire: string | null
    recette?: { nom?: string } | null
  }
  const rawArticles = ((cmd.commande_articles ?? []) as ArticleRow[])
  const articles: BonArticle[] = rawArticles
    .map(a => ({
      id: a.id,
      recette_nom: a.recette?.nom ?? '— recette supprimée —',
      quantite: Number(a.quantite ?? 1),
      tag_destination: a.tag_destination as TagDestination,
      commentaire: a.commentaire ?? null,
    }))
    .filter(a => filterDest === null || a.tag_destination === filterDest)

  const data: BonsPrintData = {
    commande: {
      id: cmd.id as string,
      numero: cmd.numero as string,
      source: cmd.source as 'ONLINE' | 'TABLE' | 'COMPTOIR',
      numero_table: (cmd.numero_table as string) ?? null,
      notes: (cmd.notes as string) ?? null,
      created_at: cmd.created_at as string,
      serveur_nom: serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : null,
    },
    articles,
  }

  return <BonsPrintClient data={data} auto={auto} />
}
