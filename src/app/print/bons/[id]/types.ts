import type { TagDestination } from '@/lib/service'

export type BonArticle = {
  id: string
  recette_nom: string
  quantite: number
  tag_destination: TagDestination
  commentaire: string | null
  allergenes_a_eviter: string[]   // Module 12 — alerte cuisine sur le bon imprimé
}

export type BonsPrintData = {
  commande: {
    id: string
    numero: string
    source: 'ONLINE' | 'TABLE' | 'COMPTOIR'
    numero_table: string | null
    notes: string | null
    created_at: string
    creneau_retrait: string | null   // ISO datetime — créneau de retrait choisi (snack/pizza/online)
    serveur_nom: string | null
  }
  articles: BonArticle[]
}
