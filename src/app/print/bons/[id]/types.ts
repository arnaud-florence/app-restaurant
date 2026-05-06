import type { TagDestination } from '@/lib/service'

export type BonArticle = {
  id: string
  recette_nom: string
  quantite: number
  tag_destination: TagDestination
  commentaire: string | null
}

export type BonsPrintData = {
  commande: {
    id: string
    numero: string
    source: 'ONLINE' | 'TABLE' | 'COMPTOIR'
    numero_table: string | null
    notes: string | null
    created_at: string
    serveur_nom: string | null
  }
  articles: BonArticle[]
}
