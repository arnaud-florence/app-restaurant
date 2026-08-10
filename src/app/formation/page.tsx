// Module 27 — Page /formation : liste des guides accessibles à l'employé connecté.
//
// Comportement RBAC :
// - Manager connecté → voit TOUS les employés + TOUS les guides (suivi équipe).
// - Employé connecté → verrouillé sur son propre profil + guides de son poste (+ "tous").
// - Kiosk (non connecté) → dropdown libre (mode tablette partagée).

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import FormationListClient from './FormationListClient'
import MonProfilFormation from '@/components/MonProfilFormation'
import { guideAccessibleAuPoste, type Guide, type Progression } from '@/lib/formation'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import TopActionBar from '@/components/TopActionBar'
import BackToCategoryButton from '@/components/BackToCategoryButton'
import StoriesNavServer from '@/components/StoriesNavServer'

export const metadata = { title: 'Formation' }
export const dynamic = 'force-dynamic'

export default async function FormationListPage() {
  const supabase = await createClient()
  const profil = await getProfile()
  // Mode « aperçu employé » (gérant) : on affiche la formation comme la verrait
  // le salarié visé — mode employé, verrouillé sur lui, guides filtrés par poste.
  const ap = profil?.apercu ?? null
  const isManager = !ap && profil?.role === 'manager'
  const employeIdEff = ap ? ap.cibleId : (profil?.employe_id ?? null)
  const posteEff = ap ? ap.ciblePoste : (profil?.poste ?? null)

  // Détermine quels employés sont visibles
  let employesQuery = supabase
    .from('employes')
    .select('id, prenom, nom, poste')
    .eq('actif', true)
    .order('prenom')

  if (!isManager && employeIdEff) {
    // Employé (ou aperçu) : verrouillé sur cet employé
    employesQuery = supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('id', employeIdEff)
  }

  const [guidesRes, employesRes, progRes, etapesCountRes, quizCountRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('actif', true).order('poste').order('ordre'),
    employesQuery,
    supabase.from('progressions_formation').select('*'),
    supabase.from('etapes_formation').select('guide_id'),
    supabase.from('quiz_questions').select('guide_id'),
  ])

  // Filtrage des guides par poste si employé connecté (non manager)
  let guides = (guidesRes.data ?? []) as Guide[]
  if (!isManager && posteEff) {
    guides = guides.filter(g => guideAccessibleAuPoste(posteEff, g.poste))
  }

  // Aggrégat nb étapes / nb questions par guide
  const nbEtapesParGuide = new Map<string, number>()
  for (const e of (etapesCountRes.data ?? [])) {
    const k = e.guide_id as string
    nbEtapesParGuide.set(k, (nbEtapesParGuide.get(k) ?? 0) + 1)
  }
  const nbQuestionsParGuide = new Map<string, number>()
  for (const q of (quizCountRes.data ?? [])) {
    const k = q.guide_id as string
    nbQuestionsParGuide.set(k, (nbQuestionsParGuide.get(k) ?? 0) + 1)
  }

  const employes = (employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>

  // Mode "verrouillé" : employé connecté → on auto-sélectionne son employe et on cache le dropdown
  const lockedEmployeId = (!isManager && employeIdEff) ? employeIdEff : null

  const navProfil: OpsBottomNavProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
        apercu: profil.apercu,
  } : null

  return (
    <>
      <TopActionBar theme="light" profil={navProfil} />
      <BackToCategoryButton theme="light" />
      <StoriesNavServer />
      {lockedEmployeId && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <MonProfilFormation employeId={lockedEmployeId} />
        </div>
      )}
      {/* Encart polyvalence — replié sur mobile par défaut pour que le titre reste visible.
          L'utilisateur le déploie s'il veut découvrir comment devenir polyvalent. */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <details className="rounded-xl border border-emerald-200 bg-emerald-50/60 group" open={false}>
          <summary className="font-bold text-emerald-900 flex items-center justify-between gap-2 cursor-pointer list-none p-3 sm:p-4 select-none">
            <span className="flex items-center gap-2">🎓 Pourquoi devenir polyvalent ?</span>
            <span className="text-emerald-700 text-xs font-normal transition-transform group-open:rotate-180" aria-hidden>▾</span>
          </summary>
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 -mt-1">
            <p className="text-sm text-emerald-800/90">
              Apprends d&apos;autres postes : plus d&apos;heures possibles, plus de valeur, et tu aides l&apos;équipe quand un poste est débordé. Chaque poste maîtrisé = un badge.
            </p>
            <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white/70 border border-emerald-100 p-2">
                <p className="font-semibold text-emerald-900">👨‍🍳 Cuisine</p>
                <p className="text-emerald-700/80">Cuisinier · Pizzaïolo · Snacking se complètent</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-emerald-100 p-2">
                <p className="font-semibold text-emerald-900">🍽️ Salle &amp; caisse</p>
                <p className="text-emerald-700/80">Serveur · Barman · Encaissement Snacking</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-emerald-100 p-2">
                <p className="font-semibold text-emerald-900">🏅 Tes badges</p>
                <p className="text-emerald-700/80">1 certif = 🎯 · 3 certifs = 🔪 Couteau suisse</p>
              </div>
            </div>
            <p className="text-xs text-emerald-700/70 mt-2">
              Comment : choisis un poste ci-dessous → lis le manuel → pratique → passe le quiz (80 %) → badge obtenu 🎉
            </p>
          </div>
        </details>
      </div>
      <FormationListClient
        guides={guides}
        employes={employes}
        progressions={(progRes.data ?? []) as unknown as Progression[]}
        nbEtapesParGuide={Object.fromEntries(nbEtapesParGuide)}
        nbQuestionsParGuide={Object.fromEntries(nbQuestionsParGuide)}
        lockedEmployeId={lockedEmployeId}
        isManager={isManager}
        navProfil={navProfil}
      />
    </>
  )
}
