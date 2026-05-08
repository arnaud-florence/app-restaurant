import CuisineClient from './CuisineClient'
import { listCommandesActives } from '../actions'
import { getProfile } from '@/lib/auth'
import type { PosteWidget } from '@/lib/taches-du-jour'

export const metadata = { title: 'Cuisine — Service' }
export const dynamic = 'force-dynamic'

export default async function CuisinePage({ searchParams }: { searchParams: { role?: string } }) {
  const commandes = await listCommandesActives()
  // ?role=pizzaiolo → on n'affiche que la colonne PIZZA (vue dédiée pour le pizzaiolo
  // qui n'a accès qu'à ses commandes pizza). Sans ce paramètre = vue cuisinier complète.
  const role = searchParams.role === 'pizzaiolo' ? 'pizzaiolo' : 'cuisinier'

  // Détecte le poste de l'utilisateur connecté pour afficher le bon widget.
  // Si ?role=pizzaiolo : widget pizzaiolo (passe-droit URL).
  // Sinon si profil.poste = 'second' : widget second.
  // Sinon : widget cuisinier (défaut).
  const profil = await getProfile()
  let widgetPoste: PosteWidget = 'cuisinier'
  if (role === 'pizzaiolo') widgetPoste = 'pizzaiolo'
  else if (profil?.poste === 'second') widgetPoste = 'second'
  else if (profil?.poste === 'pizzaiolo') widgetPoste = 'pizzaiolo'

  return <CuisineClient initial={commandes} role={role} widgetPoste={widgetPoste} />
}
