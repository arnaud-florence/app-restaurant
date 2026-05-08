import BarClient from './BarClient'
import { listCommandesActives } from '../actions'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Bar — Service' }
export const dynamic = 'force-dynamic'

export default async function BarPage() {
  const commandes = await listCommandesActives()
  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null
  return <BarClient initial={commandes} navProfil={navProfil} />
}
