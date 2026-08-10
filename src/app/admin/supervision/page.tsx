// /admin/supervision — « Équipe en direct » (V1)
//
// Vue gérant : qui travaille maintenant (pointage), qui est connecté (comptes),
// activité service en temps réel (commandes), et récap d'activité par employé
// sur 7 jours. Données existantes uniquement — pas d'instrumentation lourde.
//
// Gérant-only : '/admin/supervision' n'est dans aucun poste employé → la matrice
// de permissions le réserve au manager ('*').

import SupervisionClient, { type RecapEmploye, type FeedCommande, type JournalEntry } from './SupervisionClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Équipe en direct — Admin' }
export const dynamic = 'force-dynamic'

export default async function SupervisionPage() {
  const sb = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString()

  const [empRes, ptRes, profRes, cmd7Res, feedRes, formRes, journalRes] = await Promise.all([
    sb.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    sb.from('pointage').select('employe_id, heure_arrivee, heure_depart, heures_travaillees').eq('date_pointage', today),
    sb.from('profils').select('employe_id, derniere_connexion, derniere_activite, derniere_zone, role, email').not('employe_id', 'is', null),
    sb.from('commandes').select('serveur_id, montant_total_ttc, statut, created_at').gte('created_at', since7),
    sb.from('commandes').select('id, numero, numero_table, serveur_id, statut, source, montant_total_ttc, created_at').order('created_at', { ascending: false }).limit(25),
    sb.from('progressions_formation').select('employe_id, statut'),
    sb.from('journal_activite').select('id, employe_nom, action, zone, cible, created_at').order('created_at', { ascending: false }).limit(40),
  ])

  const employes = empRes.data ?? []
  const pointages = ptRes.data ?? []
  const profils = profRes.data ?? []
  const cmd7 = cmd7Res.data ?? []
  const feed = (feedRes.data ?? []) as FeedCommande[]
  const progs = formRes.data ?? []
  const journal = (journalRes.data ?? []) as JournalEntry[]

  const recap: RecapEmploye[] = employes.map(e => {
    const pt = pointages.find(p => p.employe_id === e.id)
    const prof = profils.find(p => p.employe_id === e.id)
    const mesCmd = cmd7.filter(c => c.serveur_id === e.id)
    return {
      id: e.id as string,
      prenom: e.prenom as string,
      nom: (e.nom as string) ?? '',
      poste: (e.poste as string) ?? '—',
      present: Boolean(pt?.heure_arrivee) && !pt?.heure_depart,
      arrivee: (pt?.heure_arrivee as string) ?? null,
      heuresJour: Number(pt?.heures_travaillees ?? 0),
      aCompte: Boolean(prof),
      derniereConnexion: (prof?.derniere_connexion as string) ?? null,
      derniereActivite: (prof?.derniere_activite as string) ?? null,
      derniereZone: (prof?.derniere_zone as string) ?? null,
      caGenere: mesCmd.filter(c => c.statut === 'encaisse').reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0),
      nbCmd: mesCmd.length,
      formValidees: progs.filter(p => p.employe_id === e.id && p.statut === 'reussi').length,
    }
  })

  const empMap: Record<string, string> = Object.fromEntries(
    employes.map(e => [e.id as string, `${e.prenom}${e.nom ? ' ' + (e.nom as string).charAt(0) + '.' : ''}`]),
  )

  return <SupervisionClient recap={recap} feedInitial={feed} empMap={empMap} journalInitial={journal} />
}
