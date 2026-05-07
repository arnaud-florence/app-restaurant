import { createClient } from '@/lib/supabase/server'
import JournalClient from './JournalClient'
import { type Entree, type Humeur, analyser6Mois } from '@/lib/journal'

export const metadata = { title: 'Journal de bord — Admin' }
export const dynamic = 'force-dynamic'

export default async function JournalPage() {
  const supabase = await createClient()
  const il_y_a_6_mois = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)

  const [entreesRes, empRes] = await Promise.all([
    supabase.from('journal_entrees')
      .select('*, redacteur:employes!redacteur_id(prenom, nom)')
      .gte('date_entree', il_y_a_6_mois)
      .order('date_entree', { ascending: false }),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
  ])

  type Row = {
    id: string; date_entree: string; titre: string | null; contenu: string;
    humeur: string; photos_urls: string[] | null; tags: string[] | null;
    faits_marquants: string | null; ca_jour_snap: number | string | null;
    nb_couverts_snap: number | null; meteo_snap: string | null;
    redacteur_id: string | null; created_at: string;
    redacteur?: { prenom?: string; nom?: string } | null;
  }
  const entrees: Entree[] = ((entreesRes.data ?? []) as Row[]).map(e => ({
    id: e.id,
    date_entree: e.date_entree,
    titre: e.titre,
    contenu: e.contenu,
    humeur: e.humeur as Humeur,
    photos_urls: e.photos_urls ?? [],
    tags: e.tags ?? [],
    faits_marquants: e.faits_marquants,
    ca_jour_snap: e.ca_jour_snap != null ? Number(e.ca_jour_snap) : null,
    nb_couverts_snap: e.nb_couverts_snap,
    meteo_snap: e.meteo_snap,
    redacteur_id: e.redacteur_id,
    redacteur_nom: e.redacteur ? `${e.redacteur.prenom ?? ''} ${e.redacteur.nom ?? ''}`.trim() : null,
    created_at: e.created_at,
  }))

  const employes = (empRes.data ?? []).map(e => ({ id: e.id as string, prenom: e.prenom as string, nom: e.nom as string }))
  const analyses = analyser6Mois(entrees)

  return <JournalClient entrees={entrees} employes={employes} analyses={analyses} />
}
