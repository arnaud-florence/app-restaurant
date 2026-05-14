'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Check, ArrowLeft, Award } from 'lucide-react'
import { marked } from 'marked'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Guide, type Etape, type Progression, POSTE_INFO, STATUT_INFO } from '@/lib/formation'
import { marquerEtapeVue } from '../actions'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import PoserQuestion from '@/components/PoserQuestion'

marked.setOptions({ gfm: true, breaks: false })

export default function GuideClient({
  guide, etapes, progression, employe, nbQuestions, navProfil = null,
}: {
  guide: Guide
  etapes: Etape[]
  progression: Progression | null
  employe: { id: string; prenom: string; nom: string }
  nbQuestions: number
  navProfil?: OpsBottomNavProfil
}) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [pending, startTransition] = useTransition()
  const [vues, setVues] = useState<Set<string>>(new Set(progression?.etapes_vues_ids ?? []))

  const etape = etapes[idx]
  const total = etapes.length
  const toutesVues = etapes.every(e => vues.has(e.id))
  const etapeHtml = useMemo(
    () => (etape ? (marked.parse(etape.contenu) as string) : ''),
    [etape],
  )

  function valider(e: Etape, allerSuivant: boolean) {
    if (vues.has(e.id)) {
      if (allerSuivant && idx < total - 1) setIdx(idx + 1)
      return
    }
    startTransition(async () => {
      try {
        await marquerEtapeVue({ guide_id: guide.id, employe_id: employe.id, etape_id: e.id })
        setVues(prev => new Set(prev).add(e.id))
        if (allerSuivant && idx < total - 1) setIdx(idx + 1)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erreur')
      }
    })
  }

  if (etapes.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <Card className="p-6 max-w-md text-center">
          <h2 className="font-bold mb-2">Guide vide</h2>
          <p className="text-sm text-zinc-600 mb-4">Aucune étape n'a encore été ajoutée à ce guide.</p>
          <Link href="/formation"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Retour</Button></Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-mobile-nav">
      <OpsBottomNav profil={navProfil} />
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto p-3 flex items-center gap-3">
          <Link href="/formation" className="text-zinc-600 hover:text-emerald-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={POSTE_INFO[guide.poste].cls}>{POSTE_INFO[guide.poste].emoji} {POSTE_INFO[guide.poste].label}</Badge>
              <h1 className="font-semibold truncate">{guide.titre}</h1>
            </div>
            <div className="text-xs text-zinc-500">{employe.prenom} {employe.nom} · étape {idx + 1} / {total}</div>
          </div>
          {progression && <Badge variant="outline" className={STATUT_INFO[progression.statut].cls}>{STATUT_INFO[progression.statut].emoji} {STATUT_INFO[progression.statut].label}</Badge>}
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full bg-zinc-200">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(vues.size / total) * 100}%` }} />
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-2xl font-bold">{etape.ordre}. {etape.titre}</h2>
            {vues.has(etape.id) && <Badge className="bg-emerald-600 text-white">✓ Vu</Badge>}
          </div>
          {etape.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={etape.image_url} alt={etape.titre} className="rounded-md max-h-80 object-contain mb-4" />
          )}
          <div
            className="prose prose-zinc prose-emerald max-w-none text-zinc-800
                       prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-2
                       prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:font-bold
                       prose-table:text-sm prose-th:bg-zinc-50 prose-th:font-bold prose-th:text-left
                       prose-td:border prose-td:px-3 prose-td:py-2 prose-th:border prose-th:px-3 prose-th:py-2
                       prose-blockquote:border-emerald-500 prose-blockquote:bg-emerald-50/40 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:not-italic
                       prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-zinc-800 prose-code:before:content-none prose-code:after:content-none
                       prose-li:my-0.5
                       prose-a:text-emerald-700"
            dangerouslySetInnerHTML={{ __html: etapeHtml }}
          />
          {etape.video_url && (
            <div className="mt-4">
              <a href={etape.video_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline text-sm">🎥 Vidéo associée</a>
            </div>
          )}
        </Card>

        {/* Poser une question à l'IA sur cette étape */}
        <div className="flex justify-end">
          <PoserQuestion
            guideId={guide.id}
            etapeId={etape.id}
            employeId={employe.id}
            contexte="Pas clair ? Demande à l'IA — elle connaît ce module."
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(Math.max(0, idx - 1))} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Précédent
          </Button>

          <Button onClick={() => valider(etape, idx < total - 1)} disabled={pending} className="gap-1">
            {vues.has(etape.id)
              ? (idx < total - 1 ? <>Suivant <ChevronRight className="h-4 w-4" /></> : <>OK <Check className="h-4 w-4" /></>)
              : <>Marquer vu {idx < total - 1 ? <ChevronRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}</>
            }
          </Button>
        </div>

        {/* CTA quiz si toutes étapes vues */}
        {toutesVues && nbQuestions > 0 && (
          <Card className="p-4 bg-amber-50 border-amber-300">
            <div className="flex items-start gap-3">
              <Award className="h-6 w-6 text-amber-700 shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-bold text-amber-900">Bravo, toutes les étapes sont vues !</h3>
                <p className="text-sm text-amber-800 mt-1">Passez maintenant le quiz pour valider votre formation. Seuil de réussite : <strong>{guide.seuil_reussite_pct}%</strong>.</p>
              </div>
              <Link href={`/formation/${guide.id}/quiz?emp=${employe.id}`}>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white">Passer le quiz <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </Link>
            </div>
          </Card>
        )}
        {toutesVues && nbQuestions === 0 && (
          <Card className="p-4 bg-emerald-50 border-emerald-300">
            <h3 className="font-bold text-emerald-900">✅ Formation terminée</h3>
            <p className="text-sm text-emerald-800 mt-1">Pas de quiz pour ce guide. Le guide est validé dès toutes les étapes vues.</p>
          </Card>
        )}
      </main>
    </div>
  )
}
