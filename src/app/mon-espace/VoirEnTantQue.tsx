'use client'

// Sélecteur « Voir en tant que… » — réservé au gérant. Permet d'ouvrir le
// /mon-espace de n'importe quel salarié en LECTURE SEULE (via ?as=<id>), pour
// vérifier ce que chacun voit. Ne modifie jamais les données de l'employé :
// seul l'AFFICHAGE change ; les actions (pointage, congés) restent rattachées
// au compte connecté (le gérant).

import { Eye } from 'lucide-react'

export default function VoirEnTantQue({
  employes, current, soiMemeId,
}: {
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  /** Employé actuellement affiché (cible). */
  current: string | null
  /** Fiche employé du gérant lui-même (pour revenir à « mon espace »). */
  soiMemeId: string | null
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <Eye className="h-4 w-4 text-zinc-500 shrink-0" />
      <label htmlFor="voir-en-tant-que" className="text-xs font-bold text-zinc-600 shrink-0">Voir en tant que</label>
      <select
        id="voir-en-tant-que"
        value={current ?? ''}
        onChange={e => {
          const id = e.target.value
          // Routes cookie : l'aperçu persiste sur TOUTE l'app (onglets + pages).
          if (id && id === soiMemeId) window.location.href = '/api/apercu/stop'
          else if (id) window.location.href = `/api/apercu/start?emp=${id}`
        }}
        className="flex-1 min-w-0 h-10 px-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-medium text-zinc-800 outline-none focus:border-emerald-400"
      >
        {soiMemeId && <option value={soiMemeId}>👤 Moi</option>}
        {employes
          .filter(e => e.id !== soiMemeId)
          .map(e => (
            <option key={e.id} value={e.id}>{e.prenom} {e.nom} · {e.poste}</option>
          ))}
      </select>
    </div>
  )
}
