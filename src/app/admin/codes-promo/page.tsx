// Module Codes promo — réductions appliquées au panier en ligne (outil 2).
// Configurables : type (% / €), montant min, dates, usage max, niveau fidélité requis.

import { createClient } from '@/lib/supabase/server'
import CodesPromoClient from './CodesPromoClient'

export const metadata = { title: 'Codes promo — Admin' }
export const dynamic = 'force-dynamic'

export type CodePromo = {
  id: string
  code: string
  type: 'pourcentage' | 'euros'
  valeur: number
  montant_min: number
  date_debut: string
  date_fin: string | null
  usage_max: number | null
  usage_actuel: number
  reserve_fidelite_niveau: string | null
  description: string | null
  actif: boolean
  created_at: string
}

export default async function CodesPromoPage() {
  const sb = await createClient()
  const { data } = await sb.from('codes_promo')
    .select('*')
    .order('actif', { ascending: false })
    .order('created_at', { ascending: false })

  type Row = {
    id: string; code: string; type: 'pourcentage' | 'euros';
    valeur: number | string; montant_min: number | string;
    date_debut: string; date_fin: string | null;
    usage_max: number | string | null; usage_actuel: number | string;
    reserve_fidelite_niveau: string | null;
    description: string | null; actif: boolean;
    created_at: string;
  }
  const codes: CodePromo[] = ((data ?? []) as Row[]).map(r => ({
    id: r.id,
    code: r.code,
    type: r.type,
    valeur: Number(r.valeur),
    montant_min: Number(r.montant_min ?? 0),
    date_debut: r.date_debut,
    date_fin: r.date_fin,
    usage_max: r.usage_max !== null ? Number(r.usage_max) : null,
    usage_actuel: Number(r.usage_actuel ?? 0),
    reserve_fidelite_niveau: r.reserve_fidelite_niveau,
    description: r.description,
    actif: r.actif,
    created_at: r.created_at,
  }))

  return <CodesPromoClient codes={codes} />
}
