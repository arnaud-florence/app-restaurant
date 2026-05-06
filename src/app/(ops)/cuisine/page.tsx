import CuisineClient from './CuisineClient'
import { listCommandesActives } from '../actions'

export const metadata = { title: 'Cuisine — Service' }
export const dynamic = 'force-dynamic'

export default async function CuisinePage() {
  const commandes = await listCommandesActives()
  return <CuisineClient initial={commandes} />
}
