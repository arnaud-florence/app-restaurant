// Types et constantes runtime pour pourboires (Client-safe).
// Les helpers serveur sont dans lib/pourboires.ts.

export type Methode = 'heures' | 'parts_egales' | 'manuel'

export const METHODE_LABEL: Record<Methode, { label: string; emoji: string; description: string }> = {
  heures:       { label: 'Pondéré heures',  emoji: '⏰', description: 'Chaque employé reçoit une part proportionnelle à ses heures travaillées sur le mois' },
  parts_egales: { label: 'Parts égales',    emoji: '⚖️', description: 'Le pool est divisé équitablement entre tous les employés actifs' },
  manuel:       { label: 'Manuel',           emoji: '✍️', description: 'Le manager saisit chaque montant à la main' },
}
