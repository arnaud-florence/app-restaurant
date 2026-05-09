// Module Réputation/Avis — collecte et gestion des avis clients
// (site web + Google + TripAdvisor + autres). Modération + brouillon
// réponse IA validé humainement.

import { createClient } from '@/lib/supabase/server'
import ReputationClient from './ReputationClient'

export const metadata = { title: 'Réputation — Admin' }
export const dynamic = 'force-dynamic'

export type AvisPublic = {
  id: string
  source: 'site' | 'google' | 'tripadvisor' | 'thefork' | 'autre'
  source_id_externe: string | null
  note: number
  titre: string | null
  contenu: string | null
  reponse: string | null
  reponse_date: string | null
  brouillon_reponse_ia: string | null
  statut: 'en_attente' | 'publie' | 'rejete' | 'signale'
  langue: string
  client_id: string | null
  commande_id: string | null
  client_nom: string | null
  created_at: string
}

export default async function ReputationPage() {
  const sb = await createClient()
  const { data } = await sb.from('avis_publics')
    .select('*, client:clients!client_id(prenom, nom)')
    .order('created_at', { ascending: false })
    .limit(500)

  type Row = {
    id: string;
    source: 'site' | 'google' | 'tripadvisor' | 'thefork' | 'autre';
    source_id_externe: string | null;
    note: number | string;
    titre: string | null; contenu: string | null;
    reponse: string | null; reponse_date: string | null;
    brouillon_reponse_ia: string | null;
    statut: 'en_attente' | 'publie' | 'rejete' | 'signale';
    langue: string;
    client_id: string | null; commande_id: string | null;
    client: { prenom?: string | null; nom?: string | null } | null;
    created_at: string;
  }

  const avis: AvisPublic[] = ((data ?? []) as Row[]).map(r => ({
    id: r.id,
    source: r.source,
    source_id_externe: r.source_id_externe,
    note: Number(r.note),
    titre: r.titre,
    contenu: r.contenu,
    reponse: r.reponse,
    reponse_date: r.reponse_date,
    brouillon_reponse_ia: r.brouillon_reponse_ia,
    statut: r.statut,
    langue: r.langue,
    client_id: r.client_id,
    commande_id: r.commande_id,
    client_nom: r.client
      ? `${(r.client.prenom as string) ?? ''} ${(r.client.nom as string) ?? ''}`.trim() || null
      : null,
    created_at: r.created_at,
  }))

  return <ReputationClient avis={avis} />
}
