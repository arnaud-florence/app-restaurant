// Battement de présence employé. Appelé périodiquement (~60 s) par
// <PresenceHeartbeat/> avec le chemin courant. Met à jour, pour l'utilisateur
// CONNECTÉ, derniere_activite + derniere_zone (écran où il se trouve).
// No-op silencieux si personne n'est connecté (tablette partagée / public).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Mappe un chemin → libellé de zone lisible.
function zoneFromPath(path: string): string {
  const p = (path || '').split('?')[0]
  const table: Array<[string, string]> = [
    ['/cuisine', 'Cuisine'],
    ['/pizza', 'Pizza'],
    ['/bar', 'Bar'],
    ['/caisse', 'Caisse'],
    ['/serveur', 'Salle'],
    ['/emporter', 'Comptoir'],
    ['/livreur', 'Livraison'],
    ['/reception', 'Réception'],
    ['/equipes', 'Équipes'],
    ['/mon-espace', 'Mon espace'],
    ['/formation', 'Formation'],
    ['/admin/supervision', 'Supervision'],
    ['/admin', 'Back-office'],
  ]
  for (const [prefix, label] of table) {
    if (p === prefix || p.startsWith(prefix + '/') || p === prefix) return label
  }
  return p === '/' ? 'Accueil' : 'App'
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    let user = null
    try { user = (await supabase.auth.getUser()).data.user } catch { user = null }
    if (!user) return NextResponse.json({ ok: false }, { status: 200 })

    let path = '/'
    try { path = (await req.json())?.path ?? '/' } catch { /* body optionnel */ }

    await supabase.from('profils').update({
      derniere_activite: new Date().toISOString(),
      derniere_zone: zoneFromPath(path),
    }).eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
