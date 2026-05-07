// Module 27 — Fiche de poste imprimable A4 : /print/fiche-poste/[guideId]

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { POSTE_INFO } from '@/lib/formation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'

export default async function FichePostePage({ params }: { params: { guideId: string } }) {
  const supabase = await createClient()
  const [guideRes, etapesRes, questionsRes, paramsRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('id', params.guideId).maybeSingle(),
    supabase.from('etapes_formation').select('id, ordre, titre, contenu').eq('guide_id', params.guideId).order('ordre'),
    supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('guide_id', params.guideId),
    supabase.from('parametres').select('cle, valeur').in('cle', ['nom_restaurant']),
  ])
  if (!guideRes.data) notFound()

  const guide = guideRes.data
  const etapes = etapesRes.data ?? []
  const nbQuestions = questionsRes.count ?? 0
  const nomResto = (paramsRes.data ?? []).find(p => p.cle === 'nom_restaurant')?.valeur ?? 'Restaurant'

  return (
    <div className="bg-white text-zinc-900 print:m-0">
      <style>{`@page { size: A4; margin: 1.5cm; } @media print { .no-print { display: none } }`}</style>

      <div className="max-w-[18cm] mx-auto p-6 print:p-0">
        <div className="no-print mb-4 flex justify-between items-center">
          <a href={`/admin/formation`} className="text-sm text-zinc-600 hover:underline">← Retour admin</a>
          <PrintButton />
        </div>

        {/* En-tête fiche */}
        <header className="border-b-4 border-emerald-600 pb-3 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">{nomResto} · Fiche de poste</p>
              <h1 className="text-3xl font-bold mt-1">{guide.titre}</h1>
            </div>
            <div className="text-right text-sm">
              <div className="inline-block px-3 py-1 rounded-md border bg-zinc-50">
                {POSTE_INFO[guide.poste as keyof typeof POSTE_INFO]?.emoji} <strong>{POSTE_INFO[guide.poste as keyof typeof POSTE_INFO]?.label}</strong>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMMM yyyy', { locale: fr })}</p>
            </div>
          </div>
        </header>

        {guide.description && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 mb-2">Description du poste</h2>
            <p className="text-sm leading-relaxed">{guide.description}</p>
          </section>
        )}

        {/* Méta */}
        <section className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="border rounded-md p-3">
            <p className="text-xs text-zinc-500">Durée formation</p>
            <p className="font-semibold">{guide.duree_minutes ? `~${guide.duree_minutes} min` : '—'}</p>
          </div>
          <div className="border rounded-md p-3">
            <p className="text-xs text-zinc-500">Étapes</p>
            <p className="font-semibold">{etapes.length}</p>
          </div>
          <div className="border rounded-md p-3">
            <p className="text-xs text-zinc-500">Quiz · seuil</p>
            <p className="font-semibold">{nbQuestions} question{nbQuestions > 1 ? 's' : ''} · {guide.seuil_reussite_pct}%</p>
          </div>
        </section>

        {/* Étapes */}
        {etapes.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 mb-3">Étapes du guide</h2>
            <ol className="space-y-3">
              {etapes.map(e => (
                <li key={e.id} className="border-l-4 border-emerald-300 pl-3">
                  <p className="font-semibold">{e.ordre}. {e.titre}</p>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap mt-1">{e.contenu}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Footer signature */}
        <section className="mt-12 grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="text-zinc-500 mb-12">Signature employé</p>
            <div className="border-t border-zinc-400 pt-1">Date · Nom · Signature</div>
          </div>
          <div>
            <p className="text-zinc-500 mb-12">Signature responsable</p>
            <div className="border-t border-zinc-400 pt-1">Date · Nom · Signature</div>
          </div>
        </section>
      </div>
    </div>
  )
}
