// Module 26 — Page client publique /table/[numero]/appel : appel serveur via QR.

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AppelClient from './AppelClient'

export const metadata = { title: 'Appel serveur' }
export const dynamic = 'force-dynamic'

export default async function AppelTablePage({ params }: { params: { numero: string } }) {
  const supabase = await createClient()
  const numero = decodeURIComponent(params.numero)

  const { data: table } = await supabase.from('tables_restaurant')
    .select('id, numero, zone, capacite').eq('numero', numero).maybeSingle()
  if (!table) notFound()

  // Param nom_restaurant pour habiller la page
  const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'nom_restaurant').maybeSingle()
  const nomResto = param?.valeur ?? 'Notre Restaurant'

  return <AppelClient table={table as { id: string; numero: string; zone: string; capacite: number }} nomResto={nomResto} />
}
