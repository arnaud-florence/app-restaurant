// Module fidélité — types et constantes Client-safe (importable depuis composants client).
// Logique serveur : voir lib/fidelite.ts

export type TypeMouvementPoints = 'gain' | 'utilisation' | 'ajustement' | 'expiration'

export const TYPE_MOUVEMENT_INFO: Record<TypeMouvementPoints, { label: string; emoji: string; cls: string }> = {
  gain:        { label: 'Gain',        emoji: '➕', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  utilisation: { label: 'Utilisation', emoji: '➖', cls: 'bg-amber-100   text-amber-900   border-amber-300'   },
  ajustement:  { label: 'Ajustement',  emoji: '⚙️', cls: 'bg-zinc-100    text-zinc-800    border-zinc-300'    },
  expiration:  { label: 'Expiration',  emoji: '⌛', cls: 'bg-red-100     text-red-900     border-red-300'     },
}

export type MouvementPoints = {
  id: string
  client_id: string
  type: TypeMouvementPoints
  points: number                     // signé : positif si gain, négatif sinon
  motif: string | null
  commande_id: string | null
  employe_id: string | null
  employe_nom: string | null
  commande_numero: string | null
  created_at: string
}

// Paramètres modulables (clé table parametres → valeur string castée)
export type ConfigFidelite = {
  points_par_euro: number              // ex: 1 = 1pt par € HT
  auto_credit_encaissement: boolean    // si true, crédit auto à l'encaissement
  points_inscription: number           // bonus à la création de la fiche client
}

export const CONFIG_FIDELITE_DEFAULT: ConfigFidelite = {
  points_par_euro: 1,
  auto_credit_encaissement: true,
  points_inscription: 10,
}

// Calcule les points gagnés sur un montant HT donné.
export function pointsPourMontant(montantHt: number, ratio: number): number {
  if (montantHt <= 0) return 0
  return Math.floor(montantHt * ratio)
}
