import { createClient } from '@/lib/supabase/server'
import BonCommandePrintClient from './BonCommandePrintClient'
import { listFournisseurs, listBonsCommande } from '../../../actions'

export const metadata = { title: 'Bon de commande — Impression' }
export const dynamic = 'force-dynamic'

export default async function BonCommandePrintPage({ params }: { params: { id: string } }) {
  // Charge le bon (avec ses lignes joinées) et le fournisseur
  const supabase = await createClient()
  const [bonsList, fournisseurs] = await Promise.all([
    listBonsCommande(),
    listFournisseurs(),
  ])
  const bon = bonsList.find(b => b.id === params.id)
  const fournisseur = bon ? (fournisseurs.find(f => f.id === bon.fournisseur_id) ?? null) : null

  // Lit aussi le nom de l'établissement depuis parametres (Module 2)
  const { data: params_data } = await supabase
    .from('parametres')
    .select('cle, valeur')
    .in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_telephone', 'etablissement_email', 'etablissement_siret', 'etablissement_tva_intra'])

  const etab: Record<string, string> = {}
  for (const p of params_data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  if (!bon) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-center text-muted-foreground">Bon de commande introuvable.</p>
      </div>
    )
  }

  return <BonCommandePrintClient bon={bon} fournisseur={fournisseur} etablissement={etab} />
}
