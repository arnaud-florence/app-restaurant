'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, Clock, BookOpen, Award, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Guide, type Progression, POSTE_INFO, STATUT_INFO, pctEtapesVues, guideAccessibleAuPoste } from '@/lib/formation'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'

const STORAGE_KEY = 'formation_employe_id'

export default function FormationListClient({
  guides, employes, progressions, nbEtapesParGuide, nbQuestionsParGuide,
  lockedEmployeId = null, isManager = false, navProfil = null,
}: {
  guides: Guide[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  progressions: Progression[]
  nbEtapesParGuide: Record<string, number>
  nbQuestionsParGuide: Record<string, number>
  /** Employé verrouillé (ex: utilisateur connecté non-manager). Si défini, le dropdown est caché. */
  lockedEmployeId?: string | null
  /** Manager → voit tous les employés et tous les guides (kiosk-like sans contrainte). */
  isManager?: boolean
  /** Profil pour le drawer de navigation (Plus / Modules). */
  navProfil?: OpsBottomNavProfil
}) {
  const [employeId, setEmployeId] = useState<string>(lockedEmployeId ?? '')

  // Persistence du choix d'employé en localStorage (mode kiosk uniquement)
  useEffect(() => {
    if (lockedEmployeId) { setEmployeId(lockedEmployeId); return }
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setEmployeId(saved)
  }, [lockedEmployeId])
  useEffect(() => {
    if (!lockedEmployeId && employeId) localStorage.setItem(STORAGE_KEY, employeId)
  }, [employeId, lockedEmployeId])

  const employe = useMemo(() => employes.find(e => e.id === employeId), [employes, employeId])

  // Filtrage des guides par poste de l'employé (+ "tous"). Désactivé si manager.
  // Utilise guideAccessibleAuPoste (POSTE_ALIAS) pour gérer cuisine↔cuisinier,
  // bar↔barman, salle↔serveur, etc.
  const guidesAffiches = useMemo(() => {
    if (isManager) return guides
    if (!employe) return guides
    return guides.filter(g => guideAccessibleAuPoste(employe.poste, g.poste))
  }, [guides, employe, isManager])

  // Map progressions par guide pour cet employé
  const progParGuide = useMemo(() => {
    const m = new Map<string, Progression>()
    for (const p of progressions) {
      if (p.employe_id === employeId) m.set(p.guide_id, p)
    }
    return m
  }, [progressions, employeId])

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8 pb-mobile-nav">
      <OpsBottomNav profil={navProfil} />
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-emerald-600" /> Formation
          </h1>
          <p className="text-zinc-600">Guides interactifs et quiz de validation par poste.</p>
        </header>

        {/* Sélection employé : caché si verrouillé sur un employé connecté */}
        {lockedEmployeId ? (
          employe && (
            <Card className="p-4 bg-emerald-50 border-emerald-200">
              <p className="text-sm text-emerald-900">
                <span className="font-medium">Connecté en tant que :</span>{' '}
                {employe.prenom} {employe.nom} <span className="text-emerald-700">· {employe.poste}</span>
              </p>
            </Card>
          )
        ) : (
          <Card className="p-4">
            <label className="text-sm font-medium block mb-2">
              {isManager ? 'Sélectionner un employé (vue manager)' : 'Qui êtes-vous ?'}
            </label>
            <select
              value={employeId}
              onChange={e => setEmployeId(e.target.value)}
              className="w-full text-base rounded-md border px-3 py-2"
            >
              <option value="">— Sélectionner —</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom} · {e.poste}</option>
              ))}
            </select>
          </Card>
        )}

        {/* Liste guides */}
        {guidesAffiches.length === 0 ? (
          <Card className="p-6 text-center text-zinc-500 italic">
            {employeId ? 'Aucun guide pour votre poste.' : 'Sélectionnez votre nom ci-dessus pour voir vos guides.'}
          </Card>
        ) : (
          <div className="space-y-3">
            {guidesAffiches.map(g => {
              const prog = progParGuide.get(g.id) ?? null
              const nbEtapes = nbEtapesParGuide[g.id] ?? 0
              const nbQuestions = nbQuestionsParGuide[g.id] ?? 0
              const pct = pctEtapesVues(prog, nbEtapes)
              const statut = prog?.statut ?? 'non_commence'
              return (
                <Link
                  key={g.id}
                  href={employeId ? `/formation/${g.id}?emp=${employeId}` : '#'}
                  onClick={e => { if (!employeId) { e.preventDefault(); alert('Sélectionnez votre nom d\'abord.') } }}
                  className={cn(
                    'block transition-colors',
                    employeId ? 'hover:bg-emerald-50' : 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('rounded-md px-2 py-1 text-2xl border', POSTE_INFO[g.poste].cls)}>
                        {POSTE_INFO[g.poste].emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-lg">{g.titre}</h3>
                          <Badge variant="outline" className={STATUT_INFO[statut].cls}>
                            {STATUT_INFO[statut].emoji} {STATUT_INFO[statut].label}
                          </Badge>
                        </div>
                        {g.description && <p className="text-sm text-zinc-600 mt-1">{g.description}</p>}
                        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                          <span><BookOpen className="h-3 w-3 inline" /> {nbEtapes} étape{nbEtapes > 1 ? 's' : ''}</span>
                          {nbQuestions > 0 && <span><Award className="h-3 w-3 inline" /> {nbQuestions} question{nbQuestions > 1 ? 's' : ''}</span>}
                          {g.duree_minutes && <span><Clock className="h-3 w-3 inline" /> ~{g.duree_minutes} min</span>}
                          <span>Seuil {g.seuil_reussite_pct}%</span>
                        </div>
                        {prog && nbEtapes > 0 && (
                          <div className="mt-2">
                            <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between text-xs text-zinc-500 mt-1">
                              <span>{pct}% lu</span>
                              {prog.dernier_score_pct != null && <span>Dernier score : <strong>{prog.dernier_score_pct}%</strong></span>}
                            </div>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-400 mt-2" />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
