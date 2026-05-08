import { createClient } from '@/lib/supabase/server'
import { listCommandesActives } from '../actions'
import ServeurClient from './ServeurClient'
import { getProfile } from '@/lib/auth'

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
      .select('id, nom, categorie, tag_destination, prix_vente_ht')
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
    tag_destination: r.tag_destination as 'CUISINE' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
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

  return (
    <ServeurClient
      initialCommandes={commandes}
      tables={tables}
      recettes={recettes}
      employes={employes}
      navProfil={navProfil}
    />
  )
}
