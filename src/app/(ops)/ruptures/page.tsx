// Ruptures du jour — « on n'en a plus » en un geste (0141).
//
// Le moment où l'on constate une rupture, c'est au comptoir, en plein service,
// une tablette à la main. Si le geste prend plus de deux secondes il ne sera
// pas fait, et on continuera de vendre en ligne ce qu'on n'a plus.
//
// La rupture coupe la vente EN LIGNE et se propage à la caisse
// (/api/cron/caisse/zelty/disponibilites). Elle ne touche jamais la vente au
// comptoir : ce qui reste peut encore se vendre à qui est devant vous.

import { createClient } from '@/lib/supabase/server'
import RupturesClient from './RupturesClient'

export const metadata = { title: 'Ruptures du jour' }
export const dynamic = 'force-dynamic'

export default async function RupturesPage() {
  const supabase = await createClient()
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const { data } = await supabase
    .from('recettes')
    .select('id, nom, categorie, rupture_le')
    .eq('actif', true)
    .order('categorie').order('nom')

  const produits = (data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    // Une rupture d'hier n'en est plus une : elle se périme seule, personne
    // n'a à penser à la lever le matin.
    enRupture: r.rupture_le === aujourdhui,
  }))

  return <RupturesClient produits={produits} />
}
