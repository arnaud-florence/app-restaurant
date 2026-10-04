import type { LigneComposition, Volume } from '@/lib/ardoise'

export type PlatCandidat = {
  id: string
  nom: string
  categorie: string
  carte: 'PIZZA' | 'CUISINE'
  /** Le prix affiché au client, pour juger la marge d'un coup d'œil. */
  prixTTC: number | null
  composition: LigneComposition[]
}

export type MatiereVue = {
  id: string
  nom: string
  unite: string
  prix_achat_ht: number | null
  /** ⚠️ 56 prix sur 62 sont des estimations : le total doit le dire. */
  prix_estime: boolean
}

/** Une ligne d'ardoise déjà posée — un plat de la semaine, ou un plat du jour. */
export type OccurrenceVue = {
  id: string
  recette_id: string
  /** Le nom du plat CE jour-là, quand il n'est pas de la carte. */
  titre: string | null
  date_debut: string
  date_fin: string | null
  composition: LigneComposition[]
}

export type { Volume }
