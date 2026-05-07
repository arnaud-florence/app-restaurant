import { createClient } from '@/lib/supabase/server'
import WifiSignupClient from './WifiSignupClient'

export const metadata = {
  title: 'Connexion WiFi',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

export default async function WifiSignupPage() {
  const supabase = await createClient()
  const { data: paramsRes } = await supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom'])
  const params = Object.fromEntries((paramsRes ?? []).map(p => [p.cle as string, p.valeur as string]))

  return <WifiSignupClient nomEtablissement={params.etablissement_nom ?? 'Notre établissement'} />
}
