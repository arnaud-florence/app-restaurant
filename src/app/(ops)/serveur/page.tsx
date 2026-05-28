import { createClient } from '@/lib/supabase/server'
import { listCommandesActives } from '../actions'
import ServeurClient from './ServeurClient'
import BriefingPoste from '@/components/BriefingPoste'
import AlertesAgentsOps from '@/components/ops/AlertesAgentsOps'
import { getProfile } from '@/lib/auth'
import { getBriefingForPoste } from '@/lib/briefing/poste'

export const metadata = { title: 'Serveur — Service' }
export const dynamic = 'force-dynamic'

export default async function ServeurPage() {
  const supabase = await createClient()

  const [commandes, tablesRes, recettesRes, employesRes] = await Promise.all([
    listCommandesActives(),
    supabase
      .from('tables_restaurant')
      .select('id, numero, capacite, zone, statut, commande_active_id')
      .order('zone')
      .order('numero'),
    supabase
      .from('recettes')
      .select('id, nom, categorie, tag_destination, prix_vente_ht, image_url, photo_url, favori')
      .eq('actif', true)
      .order('categorie')
      .order('nom'),
    supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .in('poste', ['salle', 'serveur', 'manager'])
      .order('prenom'),
  ])

  const tables = (tablesRes.data ?? []).map(t => ({
    id: t.id as string,
    numero: t.numero as string,
    capacite: Number(t.capacite ?? 2),
    zone: (t.zone as string) ?? 'salle',
    statut: t.statut as 'libre' | 'occupee' | 'reservee' | 'a_encaisser',
    commande_active_id: (t.commande_active_id as string) ?? null,
  }))
  const recettes = (recettesRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    image_url: (r.image_url as string) ?? null,
    photo_url: (r.photo_url as string) ?? null,
    favori: r.favori === true,
  }))
  const employes = (employesRes.data ?? []).map(e => ({
    id: e.id as string,
    prenom: e.prenom as string,
    nom: e.nom as string,
    poste: e.poste as string,
  }))

  // Profil de l'utilisateur connecté (pour la nav admin contextuelle).
  // Null si mode kiosk (tablette partagée sans login).
  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email,
    role: profil.role,
    poste: profil.poste,
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

  const briefing = await getBriefingForPoste(supabase, 'serveur', {
    prenom: profil?.prenom ?? null,
  })

  return (
    <>
      {/* Briefing du jour (réservations + allergies clients) + alertes agents —
          étaient calculés mais jamais rendus. Le serveur voit enfin son service. */}
      <BriefingPoste briefing={briefing} />
      <AlertesAgentsOps agentIds={['serveur_rt', 'stock']} />
      <ServeurClient
        initialCommandes={commandes}
        tables={tables}
        recettes={recettes}
        employes={employes}
        navProfil={navProfil}
        widgetEmployeId={employeId}
        widgetInitialDone={initialDone}
      />
    </>
  )
}
