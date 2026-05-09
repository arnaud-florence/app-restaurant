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
    tva_total: number
    ventilation_tva: Record<string, number>          // { "5.5": 12.00, "10": 35.50, "20": 8.40 }
    consommation: 'sur_place' | 'emporter'
    pourboire_total: number
    serveur_nom: string | null
    client_id: string | null
    points_credites: number | null
  }
  articles: Array<{
    id: string
    recette_nom: string
    quantite: number
    prix_unitaire_ht: number
    tva_taux: number
    tva_eur: number
    prix_unitaire_ttc: number
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
