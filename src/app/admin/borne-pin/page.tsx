import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BornePinClient from './BornePinClient'

export const metadata = { title: 'PIN manager — Borne' }
export const dynamic = 'force-dynamic'

export default async function BornePinPage() {
  // Protection : middleware redirige déjà si non manager, mais on re-check
  const profil = await getProfile()
  if (!profil || profil.role !== 'manager') redirect('/login')

  const supabase = await createClient()
  const { data: managersData } = await supabase
    .from('employes')
    .select('id, prenom, nom, pin_hash')
    .eq('actif', true)
    .eq('poste', 'manager')
    .order('prenom')
  const managers = (managersData ?? []).map(m => ({
    id: m.id as string,
    prenom: m.prenom as string,
    nom: m.nom as string,
    hasPin: !!m.pin_hash,
  }))

  return <BornePinClient managers={managers} />
}
