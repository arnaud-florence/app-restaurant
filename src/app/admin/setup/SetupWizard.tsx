'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type SetupData } from './types'
import {
  saveEtablissement, saveHoraires, saveZonesTables, saveTVA, saveLivraison, saveEmployes,
  finaliserSetup,
} from './actions'

import Step1Etablissement  from './steps/Step1Etablissement'
import Step2Horaires       from './steps/Step2Horaires'
import Step3ZonesTables    from './steps/Step3ZonesTables'
import Step4TVA            from './steps/Step4TVA'
import Step5Livraison      from './steps/Step5Livraison'
import Step6Employes       from './steps/Step6Employes'
import Step7Recap          from './steps/Step7Recap'

const STEPS = [
  { key: 'etablissement', label: 'Établissement', short: 'Infos',     icon: '🏛️' },
  { key: 'horaires',      label: 'Horaires',      short: 'Horaires',  icon: '🕒' },
  { key: 'zones',         label: 'Zones & tables',short: 'Tables',    icon: '🪑' },
  { key: 'tva',           label: 'Taux de TVA',   short: 'TVA',       icon: '🧾' },
  { key: 'livraison',     label: 'Livraison',     short: 'Livraison', icon: '🛵' },
  { key: 'employes',      label: 'Employés',      short: 'Employés',  icon: '👥' },
  { key: 'recap',         label: 'Récapitulatif', short: 'Recap',     icon: '✅' },
] as const

const LS_KEY = 'setup-wizard-draft-v1'

export default function SetupWizard({ initial }: { initial: SetupData }) {
  const [data, setData] = useState<SetupData>(initial)
  const [step, setStep]    = useState(0)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()
  const [hydrated, setHydrated] = useState(false)

  // Restaure un brouillon localStorage si le wizard n'a pas été finalisé
  useEffect(() => {
    setHydrated(true)
    if (initial.setup_completed) return
    try {
      const draft = localStorage.getItem(LS_KEY)
      if (draft) {
        const parsed = JSON.parse(draft)
        // On ne restaure que si plus récent qu'aujourd'hui (24h)
        if (parsed.savedAt && Date.now() - parsed.savedAt < 24 * 3600 * 1000) {
          setData(parsed.data)
        }
      }
    } catch { /* ignore */ }
  }, [initial.setup_completed])

  // Sauvegarde locale à chaque modif
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ data, savedAt: Date.now() }))
    } catch { /* quota probablement plein */ }
  }, [data, hydrated])

  const canGoNext = useMemo(() => {
    if (step === 0) {
      return data.etablissement.nom.trim().length > 0
    }
    return true
  }, [data, step])

  function update<K extends keyof SetupData>(key: K, value: SetupData[K]) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function flashOk(msg = 'Sauvegardé') {
    setErreur('')
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 1800)
  }

  async function persistStep(currentStep: number): Promise<boolean> {
    setErreur('')
    return await new Promise<boolean>(resolve => {
      startTransition(async () => {
        try {
          if (currentStep === 0) await saveEtablissement(data.etablissement)
          else if (currentStep === 1) await saveHoraires(data.horaires, data.exceptions)
          else if (currentStep === 2) await saveZonesTables(data.zones, data.tables)
          else if (currentStep === 3) await saveTVA(data.tva)
          else if (currentStep === 4) await saveLivraison(data.livraison)
          else if (currentStep === 5) await saveEmployes(data.employes)
          flashOk('Étape sauvegardée')
          resolve(true)
        } catch (e) {
          setErreur(e instanceof Error ? e.message : 'Erreur de sauvegarde')
          resolve(false)
        }
      })
    })
  }

  async function next() {
    if (step === STEPS.length - 1) return
    if (!canGoNext) {
      setErreur('Champ obligatoire manquant')
      return
    }
    if (step <= 5) {
      const ok = await persistStep(step)
      if (!ok) return
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function previous() {
    setStep(s => Math.max(0, s - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function gotoStep(i: number) {
    setStep(i)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function finaliser() {
    setErreur('')
    startTransition(async () => {
      try {
        // Re-persiste tout pour être sûr d'avoir la version la plus à jour
        await saveEtablissement(data.etablissement)
        await saveHoraires(data.horaires, data.exceptions)
        await saveZonesTables(data.zones, data.tables)
        await saveTVA(data.tva)
        await saveLivraison(data.livraison)
        await saveEmployes(data.employes)
        await finaliserSetup()
        update('setup_completed', true)
        try { localStorage.removeItem(LS_KEY) } catch {}
        flashOk('Configuration finalisée 🎉')
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur lors de la finalisation')
      }
    })
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100)

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      {/* Barre de progression sticky */}
      <header
        className="sticky top-0 z-20 bg-background border-b"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configuration initiale</p>
              <h1 className="text-lg font-bold truncate">
                Étape {step + 1} sur {STEPS.length} — {STEPS[step].label}
              </h1>
            </div>
            {data.setup_completed && (
              <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">
                ✓ Finalisée
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Step pills (clickable, scroll horizontal mobile) */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => gotoStep(i)}
                className={cn(
                  'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.short}</span>
                {i < step && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Contenu de l'étape — padding bottom pour ne pas être caché par la nav sticky */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
          {step === 0 && (
            <Step1Etablissement
              value={data.etablissement}
              onChange={v => update('etablissement', v)}
            />
          )}
          {step === 1 && (
            <Step2Horaires
              horaires={data.horaires}
              exceptions={data.exceptions}
              onChangeHoraires={v => update('horaires', v)}
              onChangeExceptions={v => update('exceptions', v)}
            />
          )}
          {step === 2 && (
            <Step3ZonesTables
              zones={data.zones}
              tables={data.tables}
              onChangeZones={v => update('zones', v)}
              onChangeTables={v => update('tables', v)}
            />
          )}
          {step === 3 && (
            <Step4TVA value={data.tva} onChange={v => update('tva', v)} />
          )}
          {step === 4 && (
            <Step5Livraison value={data.livraison} onChange={v => update('livraison', v)} />
          )}
          {step === 5 && (
            <Step6Employes value={data.employes} onChange={v => update('employes', v)} />
          )}
          {step === 6 && (
            <Step7Recap data={data} onGoto={gotoStep} />
          )}
        </div>
      </main>

      {/* Toasts erreur / succès */}
      {erreur && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center">
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}

      {/* Nav sticky en bas (thumb-reachable) */}
      <nav
        className="sticky bottom-0 z-20 bg-background border-t"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={previous}
            disabled={step === 0 || isPending}
            className="flex-1 sm:flex-none sm:min-w-32"
          >
            ← Précédent
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              onClick={next}
              disabled={isPending || !canGoNext}
              className="flex-1"
            >
              {isPending ? 'Sauvegarde…' : 'Suivant →'}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="success"
              onClick={finaliser}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? 'Finalisation…' : '✓ Tout valider'}
            </Button>
          )}
        </div>
      </nav>
    </div>
  )
}
