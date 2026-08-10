'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import Link from 'next/link'
import { GraduationCap, Clock, BookOpen, Award, ChevronRight, ChevronDown, Trophy, CheckCircle2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  type Guide, type Progression, STATUT_INFO, pctEtapesVues, guideAccessibleAuPoste,
  posteFamille, FAMILLE_INFO, FAMILLE_ORDRE, niveauGuide, NIVEAU_INFO,
} from '@/lib/formation'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'

const STORAGE_KEY = 'formation_employe_id'

// Accès libellé/emoji par FAMILLE de poste (manuel + pratique + certif regroupés).
function familleMeta(f: string): { label: string; emoji: string; cls: string } {
  return FAMILLE_INFO[f] ?? { label: f, emoji: '•', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' }
}

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
  const [posteFiltre, setPosteFiltre] = useState<string | null>(null)
  // Familles repliables : fermées par défaut (on scrolle moins). `null` = état
  // initial → on applique la règle par défaut (ouvert : « À commencer » + la
  // famille du poste de l'employé). Dès qu'on touche, on matérialise un Set.
  const [groupesOuverts, setGroupesOuverts] = useState<Set<string> | null>(null)

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
    const base = (isManager || !employe)
      ? guides
      : guides.filter(g => guideAccessibleAuPoste(employe.poste, g.poste))
    // Le guide d'accueil (poste 'tous') passe toujours en premier.
    return [...base].sort((a, b) => Number(b.poste === 'tous') - Number(a.poste === 'tous'))
  }, [guides, employe, isManager])

  // Map progressions par guide pour cet employé
  const progParGuide = useMemo(() => {
    const m = new Map<string, Progression>()
    for (const p of progressions) {
      if (p.employe_id === employeId) m.set(p.guide_id, p)
    }
    return m
  }, [progressions, employeId])

  // Stats de progression globale (sur les guides affichés pour cet employé).
  const estValide = (g: Guide) => progParGuide.get(g.id)?.statut === 'reussi'
  const stats = useMemo(() => {
    const total = guidesAffiches.length
    const valides = guidesAffiches.filter(estValide).length
    const enCours = guidesAffiches.filter(g => {
      const s = progParGuide.get(g.id)?.statut
      return s === 'en_cours' || s === 'quiz_a_passer' || s === 'echoue'
    }).length
    return { total, valides, enCours, pct: total ? Math.round((valides / total) * 100) : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidesAffiches, progParGuide])

  // Regroupement des guides par FAMILLE de poste (Cuisine, Bar, Salle…), pour
  // afficher le parcours complet d'un poste ensemble : Manuel → Pratique → Certif.
  // Tri interne par niveau (1→2→3) puis ordre puis titre.
  const groupes = useMemo(() => {
    const m = new Map<string, Guide[]>()
    for (const g of guidesAffiches) {
      const fam = posteFamille(g.poste)
      if (!m.has(fam)) m.set(fam, [])
      m.get(fam)!.push(g)
    }
    for (const [, gs] of m) {
      gs.sort((a, b) =>
        (niveauGuide(a) - niveauGuide(b)) ||
        ((a.ordre ?? 0) - (b.ordre ?? 0)) ||
        a.titre.localeCompare(b.titre))
    }
    const idx = (f: string) => { const i = FAMILLE_ORDRE.indexOf(f); return i < 0 ? 999 : i }
    return Array.from(m.entries()).sort((a, b) => idx(a[0]) - idx(b[0]))
  }, [guidesAffiches])

  // Familles (hors guide d'accueil 'tous') pour les filtres rapides.
  const famillesAvecGuides = useMemo(() => groupes.map(([f]) => f).filter(f => f !== 'tous'), [groupes])

  // Repli des familles : par défaut « À commencer » + la famille du poste de
  // l'employé sont ouvertes, le reste fermé (moins de scroll).
  const familleEmploye = employe ? posteFamille(employe.poste) : null
  const ouvertsDefaut = useMemo(() => {
    const s = new Set<string>(['tous'])
    if (familleEmploye) s.add(familleEmploye)
    return s
  }, [familleEmploye])
  const estGroupeOuvert = (f: string) => (groupesOuverts ?? ouvertsDefaut).has(f)
  function toggleGroupe(f: string) {
    setGroupesOuverts(prev => {
      const next = new Set(prev ?? ouvertsDefaut)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
  }

  // Gating « Manuel → Pratique → Certification » : pour chaque famille, on note
  // les niveaux présents et ceux dont AU MOINS un guide est validé.
  const familleData = useMemo(() => {
    const m = new Map<string, { presents: Set<number>; valides: Set<number> }>()
    for (const g of guidesAffiches) {
      const fam = posteFamille(g.poste)
      const n = niveauGuide(g)
      const fd = m.get(fam) ?? { presents: new Set<number>(), valides: new Set<number>() }
      fd.presents.add(n)
      if (estValide(g)) fd.valides.add(n)
      m.set(fam, fd)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidesAffiches, progParGuide])

  // Un guide de niveau ≥ 2 est verrouillé tant que le niveau précédent présent
  // dans sa famille n'a pas été validé. Jamais verrouillé pour le manager.
  function lockInfo(g: Guide): { locked: boolean; prereqNiveau: number | null } {
    if (isManager) return { locked: false, prereqNiveau: null }
    const n = niveauGuide(g)
    if (n <= 1) return { locked: false, prereqNiveau: null }
    const fd = familleData.get(posteFamille(g.poste))
    if (!fd) return { locked: false, prereqNiveau: null }
    const prereq = [...fd.presents].filter(x => x < n).sort((a, b) => b - a)[0]
    if (prereq === undefined) return { locked: false, prereqNiveau: null }
    return { locked: !fd.valides.has(prereq), prereqNiveau: prereq }
  }

  return (
    <div className={cn('min-h-screen bg-stone-50 p-4 md:p-8', navProfil?.apercu ? 'pb-mobile-nav-apercu' : 'pb-mobile-nav')}>
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

        {/* Bandeau de progression globale — gamifié */}
        {employeId && stats.total > 0 && (
          <Card className={cn(
            'p-5 border-2 transition-colors',
            stats.pct === 100 ? 'bg-gradient-to-br from-emerald-50 to-amber-50 border-emerald-300' : 'bg-white border-emerald-200',
          )}>
            <div className="flex items-center gap-4">
              <div className={cn(
                'flex items-center justify-center rounded-full h-16 w-16 shrink-0 text-3xl font-black border-2',
                stats.pct === 100 ? 'bg-amber-100 border-amber-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700',
              )}>
                {stats.pct === 100 ? <Trophy className="h-8 w-8 text-amber-600" /> : `${stats.pct}%`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h2 className="font-bold text-lg">
                    {stats.pct === 100
                      ? '🎉 Toutes tes formations sont validées !'
                      : stats.valides === 0 ? 'En route pour ta formation 🚀' : 'Continue, tu avances bien 💪'}
                  </h2>
                  <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                    {stats.valides} / {stats.total} validée{stats.valides > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="h-3 w-full bg-zinc-200 rounded-full overflow-hidden mt-2">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700', stats.pct === 100 ? 'bg-amber-500' : 'bg-emerald-500')}
                    style={{ width: `${stats.pct}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">
                  {stats.pct === 100
                    ? 'Bravo ! Tu es prêt·e pour le service. 🏆'
                    : <>{stats.enCours > 0 && <span className="text-blue-600 font-medium">{stats.enCours} en cours · </span>}{stats.total - stats.valides} restante{stats.total - stats.valides > 1 ? 's' : ''} à valider</>}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Filtres rapides par famille de poste (si plusieurs familles accessibles) */}
        {famillesAvecGuides.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <FiltreChip active={posteFiltre === null} onClick={() => setPosteFiltre(null)}>
              👀 Tout voir
            </FiltreChip>
            {famillesAvecGuides.map(f => (
              <FiltreChip key={f} active={posteFiltre === f} onClick={() => setPosteFiltre(f)}>
                {familleMeta(f).emoji} {familleMeta(f).label}
              </FiltreChip>
            ))}
          </div>
        )}

        {/* Guides regroupés par poste */}
        {guidesAffiches.length === 0 ? (
          <Card className="p-6 text-center text-zinc-500 italic">
            {employeId ? 'Aucun guide pour votre poste.' : 'Sélectionnez votre nom ci-dessus pour voir vos guides.'}
          </Card>
        ) : (
          <div className="space-y-6">
            {groupes.map(([famille, gs]) => {
              // Le guide d'accueil ('tous') reste toujours visible. Les autres
              // sections sont masquées si un filtre de famille est actif.
              if (famille !== 'tous' && posteFiltre && posteFiltre !== famille) return null
              const info = familleMeta(famille)
              const nbValides = gs.filter(estValide).length
              const sectionComplete = employeId && nbValides === gs.length
              const sectionPct = gs.length ? Math.round((nbValides / gs.length) * 100) : 0
              return (
                <section key={famille} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleGroupe(famille)}
                    className="w-full flex items-center gap-2 sticky top-0 bg-stone-50/95 backdrop-blur py-1.5 z-10 text-left active:opacity-70"
                  >
                    <span className={cn('inline-flex items-center justify-center rounded-md px-2 py-0.5 text-lg border', info.cls)}>{info.emoji}</span>
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-700">
                      {famille === 'tous' ? 'À commencer' : info.label}
                    </h2>
                    {employeId ? (
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs font-bold tabular-nums rounded-full px-2 py-0.5',
                        sectionComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500',
                      )}>
                        {sectionComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {nbValides}/{gs.length}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">{gs.length} guide{gs.length > 1 ? 's' : ''}</span>
                    )}
                    {employeId && !sectionComplete && (
                      <div className="flex-1 max-w-[120px] h-1.5 bg-zinc-200 rounded-full overflow-hidden ml-1">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${sectionPct}%` }} />
                      </div>
                    )}
                    <ChevronDown className={cn('h-4 w-4 text-zinc-400 shrink-0 ml-auto transition-transform', estGroupeOuvert(famille) ? 'rotate-180' : '')} />
                  </button>
                  {estGroupeOuvert(famille) && (
                  <div className="space-y-3">
                    {gs.map(g => (
                      <GuideCard
                        key={g.id} g={g} employeId={employeId}
                        prog={progParGuide.get(g.id) ?? null}
                        nbEtapes={nbEtapesParGuide[g.id] ?? 0}
                        nbQuestions={nbQuestionsParGuide[g.id] ?? 0}
                        lock={lockInfo(g)}
                      />
                    ))}
                  </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FiltreChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 min-h-[40px] px-3 rounded-full text-sm font-semibold border transition-colors',
        active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-300',
      )}
    >
      {children}
    </button>
  )
}

function GuideCard({
  g, employeId, prog, nbEtapes, nbQuestions, lock,
}: {
  g: Guide
  employeId: string
  prog: Progression | null
  nbEtapes: number
  nbQuestions: number
  lock: { locked: boolean; prereqNiveau: number | null }
}) {
  const pct = pctEtapesVues(prog, nbEtapes)
  const statut = prog?.statut ?? 'non_commence'
  const valide = statut === 'reussi'
  const niveau = niveauGuide(g)
  const niveauInfo = NIVEAU_INFO[niveau] ?? NIVEAU_INFO[1]
  const estSim = !!g.simulation_config

  // ── Carte VERROUILLÉE : niveau supérieur non encore débloqué ──
  if (lock.locked) {
    const prereqInfo = lock.prereqNiveau ? NIVEAU_INFO[lock.prereqNiveau] : null
    return (
      <Card className="p-4 bg-zinc-50 border-dashed opacity-90 cursor-not-allowed select-none">
        <div className="flex items-start gap-3">
          <div className="relative rounded-md px-2 py-1 text-2xl border shrink-0 bg-zinc-100 border-zinc-200 grayscale">
            {niveauInfo.emoji}
            <span className="absolute -top-1.5 -right-1.5 bg-zinc-400 text-white rounded-full p-0.5 border-2 border-white">
              <Lock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-semibold text-lg text-zinc-500">{g.titre}</h3>
              <Badge variant="outline" className="bg-zinc-100 text-zinc-500 border-zinc-300">🔒 Verrouillé</Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              {prereqInfo
                ? <>Débloque cette étape en validant d&apos;abord <strong>{prereqInfo.emoji} {prereqInfo.court}</strong>.</>
                : 'Termine l\'étape précédente pour débloquer.'}
            </p>
            <span className={cn('inline-flex items-center gap-1 mt-2 text-[11px] font-bold rounded-full px-2 py-0.5 border', niveauInfo.cls)}>
              {niveauInfo.emoji} {niveauInfo.label}
            </span>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Link
      href={employeId ? `/formation/${g.id}?emp=${employeId}` : '#'}
      onClick={e => { if (!employeId) { e.preventDefault(); toast.error('Sélectionnez votre nom d\'abord.') } }}
      className={cn('block transition-colors', employeId ? 'hover:bg-emerald-50' : 'opacity-60 cursor-not-allowed')}
    >
      <Card className={cn('p-4 transition-colors', valide && 'bg-emerald-50/60 border-l-4 border-l-emerald-500')}>
        <div className="flex items-start gap-3">
          <div className={cn('relative rounded-md px-2 py-1 text-2xl border shrink-0', niveauInfo.cls)}>
            {niveauInfo.emoji}
            {valide && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white rounded-full p-0.5 border-2 border-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-semibold text-lg">{g.titre}</h3>
              <Badge variant="outline" className={STATUT_INFO[statut].cls}>
                {STATUT_INFO[statut].emoji} {STATUT_INFO[statut].label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 border', niveauInfo.cls)}>
                {niveauInfo.emoji} {niveauInfo.label}
              </span>
              {estSim && <span className="text-[11px] font-semibold text-amber-700">· mise en situation interactive</span>}
            </div>
            {g.description && <p className="text-sm text-zinc-600 mt-1">{g.description}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
              <span><BookOpen className="h-3 w-3 inline" /> {nbEtapes} étape{nbEtapes > 1 ? 's' : ''}</span>
              {nbQuestions > 0 && <span><Award className="h-3 w-3 inline" /> {nbQuestions} question{nbQuestions > 1 ? 's' : ''}</span>}
              {g.duree_minutes && <span><Clock className="h-3 w-3 inline" /> ~{g.duree_minutes} min</span>}
              {(nbQuestions > 0 || estSim) && <span>Seuil {g.seuil_reussite_pct}%</span>}
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
          <ChevronRight className="h-5 w-5 text-zinc-400 mt-2 shrink-0" />
        </div>
      </Card>
    </Link>
  )
}
