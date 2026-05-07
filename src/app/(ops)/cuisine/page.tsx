import CuisineClient from './CuisineClient'
import { listCommandesActives } from '../actions'

export const metadata = { title: 'Cuisine — Service' }
export const dynamic = 'force-dynamic'

export default async function CuisinePage({ searchParams }: { searchParams: { role?: string } }) {
  const commandes = await listCommandesActives()
  // ?role=pizzaiolo → on n'affiche que la colonne PIZZA (vue dédiée pour le pizzaiolo
  // qui n'a accès qu'à ses commandes pizza). Sans ce paramètre = vue cuisinier complète.
  const role = searchParams.role === 'pizzaiolo' ? 'pizzaiolo' : 'cuisinier'
  return <CuisineClient initial={commandes} role={role} />
}
