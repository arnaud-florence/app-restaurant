// Module Promotions — bannières publicitaires affichées sur le site web (outil 2).
// Configurables avec dates, CTA, visibilité.

import { createClient } from '@/lib/supabase/server'
import PromotionsClient from './PromotionsClient'

export const metadata = { title: 'Promotions — Admin' }
export const dynamic = 'force-dynamic'

export type Promotion = {
  id: string
  titre: string
  description: string | null
  image_url: string | null
  date_debut: string
  date_fin: string | null
  cta_label: string | null
  cta_url: string | null
  visible_site: boolean
  actif: boolean
  created_at: string
}

export default async function PromotionsPage() {
  const sb = await createClient()
  const { data } = await sb.from('promotions')
    .select('*')
    .order('actif', { ascending: false })
    .order('date_debut', { ascending: false })

  type Row = {
    id: string; titre: string; description: string | null; image_url: string | null;
    date_debut: string; date_fin: string | null;
    cta_label: string | null; cta_url: string | null;
    visible_site: boolean; actif: boolean;
    created_at: string;
  }
  const promotions: Promotion[] = ((data ?? []) as Row[]).map(r => ({
    id: r.id,
    titre: r.titre,
    description: r.description,
    image_url: r.image_url,
    date_debut: r.date_debut,
    date_fin: r.date_fin,
    cta_label: r.cta_label,
    cta_url: r.cta_url,
    visible_site: r.visible_site,
    actif: r.actif,
    created_at: r.created_at,
  }))

  return <PromotionsClient promotions={promotions} />
}
