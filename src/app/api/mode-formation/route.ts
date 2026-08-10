// Renvoie l'état du « mode formation » (flag global parametres.mode_formation).
// Utilisé par le bandeau client <FormationBanner/> pour s'afficher/se masquer.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('parametres').select('valeur').eq('cle', 'mode_formation').maybeSingle()
    return NextResponse.json({ active: data?.valeur === 'true' })
  } catch {
    return NextResponse.json({ active: false })
  }
}
