import BarClient from './BarClient'
import { listCommandesActives } from '../actions'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Bar — Service' }
export const dynamic = 'force-dynamic'

export default async function BarPage() {
  const supabase = await createClient()

  const [commandes, recettesRes, employesRes] = await Promise.all([
    listCommandesActives(),
    supabase
      .from('recettes')
      .select('id, nom, categorie, tag_destination, prix_vente_ht')
      .eq('actif', true)
      .order('categorie')
      .order('nom'),
    supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .in('poste', ['barman', 'salle', 'serveur', 'manager'])
      .order('prenom'),
  ])

  const recettes = (recettesRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
  }))
  const employes = (employesRes.data ?? []).map(e => ({
    id: e.id as string,
    prenom: e.prenom as string,
    nom: e.nom as string,
    poste: e.poste as string,
  }))

  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  const employeId = profil?.employe_id ?? null
  let initialDone: string[] = []
  if (employeId) {
    const { data } = await supabase.from('taches_completees')
      .select('tache_id')
      .eq('employe_id', employeId)
      .eq('date', new Date().toISOString().slice(0, 10))
    initialDone = (data ?? []).map(r => r.tache_id as string)
  }

  return (
    <BarClient
      initial={commandes}
      recettes={recettes}
      employes={employes}
      barmanId={employeId}
      navProfil={navProfil}
      widgetEmployeId={employeId}
      widgetInitialDone={initialDone}
    />
  )
}
