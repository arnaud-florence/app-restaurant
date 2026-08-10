// Co-gérant « Arnaud » — types du socle de la boucle (table `propositions`).
// La boucle : audit → idée → options → discussion → validation → action → résultat.

export type PropositionStatut =
  | 'proposee' | 'en_discussion' | 'acceptee' | 'rejetee' | 'faite' | 'annulee'

export type PropositionType =
  | 'completer'        // remplir une case vide
  | 'ameliorer'        // optimiser l'existant
  | 'mettre_en_place'  // installer une bonne pratique manquante
  | 'evolution_app'    // proposer une évolution du logiciel (construite par le dev)
  | 'alerte'           // signalement nécessitant attention

export type PropositionUrgence = 'rouge' | 'orange' | 'jaune' | 'info' | 'vert'

/** Un échange du peaufinage (la conversation sur une proposition). */
export type PropositionEchange = { role: 'arnaud' | 'gerant'; texte: string; at: string }

/** Une variante proposée (« il déroule des options »). */
export type PropositionOption = { id: string; titre: string; details?: string; action_payload?: unknown }

export type Proposition = {
  id: string
  domaine: string
  type: PropositionType
  titre: string
  resume: string | null
  details: string | null
  options: PropositionOption[]
  action_type: string | null
  action_payload: unknown | null
  statut: PropositionStatut
  urgence: PropositionUrgence
  source: string
  cible_url: string | null
  echanges: PropositionEchange[]
  resultat: string | null
  validee_par: string | null
  validee_at: string | null
  faite_at: string | null
  created_at: string
  updated_at: string
}

/** Les clés du contexte établissement (stockées dans `parametres`). */
export const CONTEXTE_CLES = [
  'cg_concept', 'cg_style_cuisine', 'cg_gamme_prix', 'cg_objectif', 'cg_specialites',
] as const
export type ContexteCle = typeof CONTEXTE_CLES[number]
export type ContexteResto = Partial<Record<ContexteCle, string | null>>

// ── Familles de la carte (données pures, importables côté client ET serveur) ──
// Arnaud bâtit une carte complète : il génère chaque famille l'une après l'autre.
export type FamilleId = 'entrees' | 'plats' | 'desserts' | 'pizzas' | 'snacking' | 'bar'

export const FAMILLES: ReadonlyArray<{ id: FamilleId; label: string; emoji: string; kind: 'food' | 'drink' }> = [
  { id: 'entrees',  label: 'Entrées',         emoji: '🥗', kind: 'food'  },
  { id: 'plats',    label: 'Plats',           emoji: '🍽️', kind: 'food'  },
  { id: 'pizzas',   label: 'Pizzas',          emoji: '🍕', kind: 'food'  },
  { id: 'snacking', label: 'Snacking',        emoji: '🥪', kind: 'food'  },
  { id: 'desserts', label: 'Desserts',        emoji: '🍰', kind: 'food'  },
  { id: 'bar',      label: 'Bar & boissons',  emoji: '🍷', kind: 'drink' },
] as const

// Un plat existant de la carte que le food cost rend trop cher (Arnaud agit dessus).
export type PlatAOptimiser = {
  id: string
  nom: string
  categorie: string
  prixActuel: number
  coutPortion: number
  fcActuel: number
  prixSuggere: number
  fcSuggere: number
}

// Un brouillon de message préparé par Arnaud (mode C : il prépare, tu valides/envoies).
export type BrouillonMessage = {
  texte: string
  canalSuggere: string
  interne: boolean
  conseil: string
}

// ── Arnaud côté SALARIÉ — « Arnaud t'aide aujourd'hui » (rappels perso) ──
export type RappelUrgence = 'rouge' | 'orange' | 'info'
export type RappelSalarie = {
  id: string
  emoji: string
  titre: string
  detail?: string | null
  urgence: RappelUrgence
  cta_url?: string | null
  cta_label?: string | null
}
export type RappelsSalarie = { rappels: RappelSalarie[] }
