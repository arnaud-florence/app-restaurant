export type TicketData = {
  commande: {
    id: string
    numero: string
    source: 'ONLINE' | 'TABLE' | 'COMPTOIR'
    numero_table: string | null
    statut: string
    notes: string | null
    created_at: string
    montant_total_ht: number
    montant_total_ttc: number
    pourboire_total: number
    serveur_nom: string | null
  }
  articles: Array<{
    id: string
    recette_nom: string
    quantite: number
    prix_unitaire_ht: number
  }>
  paiements: Array<{
    id: string
    methode: string
    montant: number
    pourboire: number
    reference: string | null
    encaisse_at: string
  }>
  etablissement: Record<string, string>
}
