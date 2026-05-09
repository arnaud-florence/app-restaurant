import { createClient } from '@/lib/supabase/server'
import ChambresAdminClient from './ChambresAdminClient'

export const metadata = { title: 'Chambres — Admin' }
export const dynamic = 'force-dynamic'

export type Chambre = {
  id: string
  nom: string
  numero: string
  capacite: number
  prix_nuit_ht: number
  description: string | null
  equipements: string[]
  photos: string[]
  video_360_url: string | null
  actif: boolean
}

export default async function ChambresAdminPage() {
  const sb = await createClient()
  const { data } = await sb.from('chambres').select('*').order('numero')
  const chambres: Chambre[] = (data ?? []).map(c => ({
    id: c.id as string,
    nom: c.nom as string,
    numero: c.numero as string,
    capacite: Number(c.capacite ?? 2),
    prix_nuit_ht: Number(c.prix_nuit_ht ?? 0),
    description: (c.description as string) ?? null,
    equipements: (c.equipements as string[]) ?? [],
    photos: (c.photos as string[]) ?? [],
    video_360_url: (c.video_360_url as string) ?? null,
    actif: c.actif as boolean,
  }))
  return <ChambresAdminClient chambres={chambres} />
}
