// Vue /emporter — staff dédié aux commandes ONLINE en cours.
// Affiche les commandes source='ONLINE' avec créneau retrait + suivi statut.
// Statuts du flow ONLINE :
//   en_attente → en_preparation → pret_pour_retrait → retire_par_client

import { listCommandesActives } from '../actions'
import EmporterClient from './EmporterClient'
import BriefingPoste from '@/components/BriefingPoste'
import AlertesAgentsOps from '@/components/ops/AlertesAgentsOps'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getBriefingForPoste } from '@/lib/briefing/poste'

export const metadata = { title: 'Emporter — Service ONLINE' }
export const dynamic = 'force-dynamic'

export default async function EmporterPage() {
  const supabase = await createClient()

  // Recettes pour le bouton "Nouvelle commande" sur Snack :
  //   - SNACKING / PIZZA / BAR (cœur du poste snack rapide)
  //   - + desserts (catégorie commençant par "dessert", insensible à la casse)
  // Les plats CUISINE principaux sont exclus (pas pertinent ici).
  const [commandes, recettesRes, employesRes] = await Promise.all([
    listCommandesActives(),
    supabase
      .from('recettes')
      .select('id, nom, categorie, tag_destination, prix_vente_ht, image_url, photo_url')
      .eq('actif', true)
      .or('tag_destination.in.(SNACKING,PIZZA,BAR),categorie.ilike.dessert%')
      .order('categorie')
      .order('nom'),
    // Pour EncaissementModal (besoin de la liste pour tip / part / etc.)
    supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .order('prenom'),
  ])

  const recettes = (recettesRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    image_url: (r.image_url as string) ?? null,
    photo_url: (r.photo_url as string) ?? null,
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

  const briefing = await getBriefingForPoste(supabase, 'caisse_snacking', {
    prenom: profil?.prenom ?? null,
  })

  return (
    <>
      <BriefingPoste briefing={briefing} />
      <AlertesAgentsOps agentIds={['stock', 'haccp', 'snack_rt']} />
      <EmporterClient
        initial={commandes}
        recettes={recettes}
        employes={employes}
        operateurId={employeId}
        navProfil={navProfil}
        widgetEmployeId={employeId}
        widgetInitialDone={initialDone}
      />
    </>
  )
}
