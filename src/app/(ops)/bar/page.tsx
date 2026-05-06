import BarClient from './BarClient'
import { listCommandesActives } from '../actions'

export const metadata = { title: 'Bar — Service' }
export const dynamic = 'force-dynamic'

export default async function BarPage() {
  const commandes = await listCommandesActives()
  return <BarClient initial={commandes} />
}
