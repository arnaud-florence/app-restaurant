// Avancement de la visite guidée.
//
// Une route API plutôt qu'une server action : le panneau est monté dans les
// layouts (admin ET ops), il doit pouvoir écrire depuis n'importe quelle page
// sans que chacune ait à exposer une action. Et l'écriture ne doit JAMAIS
// provoquer de revalidation de la page en cours — la personne est en train de
// lire, un rafraîchissement sous ses yeux lui ferait perdre le fil.

import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const profil = await getProfile()
  if (!profil) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  let etape: number
  try {
    const body = await req.json() as { etape?: unknown }
    etape = Number(body.etape)
  } catch {
    return NextResponse.json({ error: 'JSON attendu : { etape }' }, { status: 400 })
  }
  // -1 = terminée ou passée ; 1..200 = étape en cours. Tout le reste est une
  // erreur d'appel, et on préfère refuser qu'écrire une valeur qui ferait
  // reprendre la visite à un endroit absurde.
  if (!Number.isInteger(etape) || etape < -1 || etape > 200 || etape === 0) {
    return NextResponse.json({ error: 'Étape invalide' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profils')
    .update({ visite_guidee_etape: etape, updated_at: new Date().toISOString() })
    .eq('id', profil.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, etape })
}
