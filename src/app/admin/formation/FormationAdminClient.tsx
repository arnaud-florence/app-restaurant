'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, BookOpen, GraduationCap, Users, ExternalLink, Printer, RotateCcw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  type Guide, type Etape, type Question, type Progression, type Poste, type StatutFormation,
  POSTE_INFO, STATUT_INFO,
} from '@/lib/formation'
import {
  creerGuide, updateGuide, supprimerGuide,
  creerEtape, updateEtape, supprimerEtape,
  creerQuestion, updateQuestion, supprimerQuestion,
  resetProgression,
} from './actions'

type ProgRow = Progression & { employes?: { prenom: string; nom: string; poste: string } }

export default function FormationAdminClient({
  guides, etapes, questions, progressions, employes,
}: {
  guides: Guide[]; etapes: Etape[]; questions: Question[]
  progressions: ProgRow[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'guides' | 'progressions'>('guides')
  const [showGuideForm, setShowGuideForm] = useState<Guide | true | null>(null)
  const [openGuideId, setOpenGuideId] = useState<string | null>(guides[0]?.id ?? null)
  const [, startTransition] = useTransition()

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-600" /> Formation des équipes
          </h1>
          <p className="text-sm text-zinc-500">Guides interactifs par poste, quiz, suivi des progressions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/allergenes" className="text-sm text-zinc-600 hover:text-emerald-700 inline-flex items-center gap-1 underline">
            🆘 Procédures urgence (Module 12)
          </Link>
          <Link href="/formation" target="_blank">
            <Button variant="outline" className="gap-2"><ExternalLink className="h-4 w-4" /> Vue employé</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <TabBtn active={tab === 'guides'}       onClick={() => setTab('guides')}><BookOpen className="h-4 w-4 inline mr-1" /> Guides ({guides.length})</TabBtn>
        <TabBtn active={tab === 'progressions'} onClick={() => setTab('progressions')}><Users className="h-4 w-4 inline mr-1" /> Progressions ({progressions.length})</TabBtn>
      </div>

      {tab === 'guides' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowGuideForm(true)} className="gap-1"><Plus className="h-4 w-4" /> Nouveau guide</Button>
          </div>
          {guides.length === 0 && <Card className="p-6 text-center text-zinc-500 italic">Aucun guide. Créez-en un pour commencer.</Card>}
          {guides.map(g => (
            <GuideAccordion
              key={g.id}
              guide={g}
              etapes={etapes.filter(e => e.guide_id === g.id)}
              questions={questions.filter(q => q.guide_id === g.id)}
              open={openGuideId === g.id}
              onToggle={() => setOpenGuideId(openGuideId === g.id ? null : g.id)}
              onEdit={() => setShowGuideForm(g)}
              onDelete={() => {
                if (!confirm(`Supprimer le guide "${g.titre}" et toutes ses étapes/questions ?`)) return
                startTransition(() => supprimerGuide(g.id).then(() => router.refresh()))
              }}
            />
          ))}
        </div>
      )}

      {tab === 'progressions' && (
        <ProgressionsPanel progressions={progressions} guides={guides} employes={employes} />
      )}

      {showGuideForm && (
        <GuideModal
          guide={showGuideForm === true ? null : showGuideForm}
          onClose={() => setShowGuideForm(null)}
          onSaved={() => { setShowGuideForm(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
      active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-zinc-600 hover:text-zinc-900',
    )}>{children}</button>
  )
}

// ─── Guide accordion ──────────────────────────────────────────────
function GuideAccordion({ guide, etapes, questions, open, onToggle, onEdit, onDelete }: {
  guide: Guide; etapes: Etape[]; questions: Question[]; open: boolean
  onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <Card className={cn('overflow-hidden', !guide.actif && 'opacity-60')}>
      <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-zinc-50" onClick={onToggle}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Badge variant="outline" className={POSTE_INFO[guide.poste].cls}>
          {POSTE_INFO[guide.poste].emoji} {POSTE_INFO[guide.poste].label}
        </Badge>
        <h3 className="font-semibold flex-1">{guide.titre}</h3>
        <span className="text-xs text-zinc-500">{etapes.length} étape{etapes.length > 1 ? 's' : ''} · {questions.length} question{questions.length > 1 ? 's' : ''}</span>
        {guide.duree_minutes && <span className="text-xs text-zinc-500">⏱ {guide.duree_minutes} min</span>}
        <Link href={`/print/fiche-poste/${guide.id}`} target="_blank" onClick={e => e.stopPropagation()}
          className="text-zinc-500 hover:text-emerald-700" title="Fiche de poste imprimable">
          <Printer className="h-4 w-4" />
        </Link>
        <button onClick={e => { e.stopPropagation(); onEdit() }} className="text-zinc-500 hover:text-zinc-900 p-1"><Pencil className="h-4 w-4" /></button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="text-red-600 hover:bg-red-50 p-1"><Trash2 className="h-4 w-4" /></button>
      </div>

      {open && (
        <div className="border-t p-3 space-y-4 bg-zinc-50/50">
          {guide.description && <p className="text-sm text-zinc-700 italic">{guide.description}</p>}
          <EtapesPanel guide_id={guide.id} etapes={etapes} />
          <QuestionsPanel guide_id={guide.id} questions={questions} seuil={guide.seuil_reussite_pct} />
        </div>
      )}
    </Card>
  )
}

// ─── Étapes ──────────────────────────────────────────────────────
function EtapesPanel({ guide_id, etapes }: { guide_id: string; etapes: Etape[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState<Etape | true | null>(null)
  const [, startTransition] = useTransition()

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm">📚 Étapes du guide</h4>
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" /> Ajouter</Button>
      </div>
      {etapes.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">Aucune étape. Ajoutez-en pour rendre le guide consultable.</p>
      ) : (
        <ol className="space-y-1">
          {etapes.map(e => (
            <li key={e.id} className="flex items-start gap-2 text-sm bg-white border rounded p-2 group">
              <span className="font-bold text-emerald-700 shrink-0">{e.ordre}.</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{e.titre}</div>
                <div className="text-xs text-zinc-600 line-clamp-2">{e.contenu}</div>
                {e.image_url && <span className="text-xs text-zinc-500">🖼 image</span>}
                {e.video_url && <span className="text-xs text-zinc-500"> 🎥 vidéo</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => setShowForm(e)} className="text-zinc-500 hover:text-zinc-900 p-1"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => { if (confirm('Supprimer ?')) startTransition(() => supprimerEtape(e.id).then(() => router.refresh())) }}
                  className="text-red-600 hover:bg-red-50 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {showForm && (
        <EtapeModal
          guide_id={guide_id}
          etape={showForm === true ? null : showForm}
          ordreSuivant={Math.max(0, ...etapes.map(e => e.ordre)) + 1}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Quiz ────────────────────────────────────────────────────────
function QuestionsPanel({ guide_id, questions, seuil }: { guide_id: string; questions: Question[]; seuil: number }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState<Question | true | null>(null)
  const [, startTransition] = useTransition()

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm">📝 Quiz <span className="font-normal text-zinc-500">(seuil réussite {seuil}%)</span></h4>
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" /> Question</Button>
      </div>
      {questions.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">Aucune question. Sans questions, le guide est validé dès toutes les étapes vues.</p>
      ) : (
        <ol className="space-y-1">
          {questions.map(q => (
            <li key={q.id} className="flex items-start gap-2 text-sm bg-white border rounded p-2 group">
              <span className="font-bold text-amber-700 shrink-0">Q{q.ordre}.</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{q.question}</div>
                <ul className="text-xs text-zinc-600 mt-1">
                  {q.choix.map((c, i) => (
                    <li key={i} className={cn(i === q.bonne_reponse_idx && 'text-emerald-700 font-semibold')}>
                      {String.fromCharCode(65 + i)}. {c} {i === q.bonne_reponse_idx && '✓'}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => setShowForm(q)} className="text-zinc-500 hover:text-zinc-900 p-1"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => { if (confirm('Supprimer ?')) startTransition(() => supprimerQuestion(q.id).then(() => router.refresh())) }}
                  className="text-red-600 hover:bg-red-50 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {showForm && (
        <QuestionModal
          guide_id={guide_id}
          question={showForm === true ? null : showForm}
          ordreSuivant={Math.max(0, ...questions.map(q => q.ordre)) + 1}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Progressions panel ──────────────────────────────────────────
function ProgressionsPanel({ progressions, guides, employes }: {
  progressions: ProgRow[]
  guides: Guide[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filtreEmp, setFiltreEmp] = useState<string>('')
  const [filtreStatut, setFiltreStatut] = useState<StatutFormation | ''>('')

  const guidesById = useMemo(() => new Map(guides.map(g => [g.id, g])), [guides])

  const list = progressions.filter(p =>
    (!filtreEmp    || p.employe_id === filtreEmp) &&
    (!filtreStatut || p.statut === filtreStatut),
  )

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filtreEmp} onChange={e => setFiltreEmp(e.target.value)} className="text-sm rounded-md border px-3 py-2">
          <option value="">— Tous employés —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value as StatutFormation | '')} className="text-sm rounded-md border px-3 py-2">
          <option value="">— Tous statuts —</option>
          {(Object.keys(STATUT_INFO) as StatutFormation[]).map(s => <option key={s} value={s}>{STATUT_INFO[s].label}</option>)}
        </select>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">Aucune progression.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left bg-zinc-50">
            <tr>
              <th className="px-3 py-2">Employé</th>
              <th className="px-3 py-2">Guide</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">Mis à jour</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => {
              const g = guidesById.get(p.guide_id)
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{p.employes?.prenom} {p.employes?.nom}</td>
                  <td className="px-3 py-2">{g?.titre ?? '?'}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className={STATUT_INFO[p.statut].cls}>{STATUT_INFO[p.statut].emoji} {STATUT_INFO[p.statut].label}</Badge></td>
                  <td className="px-3 py-2 text-right">{p.dernier_score_pct != null ? `${p.dernier_score_pct} %` : '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{p.derniere_tentative_le ? format(parseISO(p.derniere_tentative_le), 'd MMM HH:mm', { locale: fr }) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => { if (confirm('Réinitialiser cette progression ?')) startTransition(() => resetProgression(p.guide_id, p.employe_id).then(() => router.refresh())) }}
                      className="text-amber-700 hover:bg-amber-50 p-1 rounded inline-flex" title="Reset">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

// ─── Modales ─────────────────────────────────────────────────────
function GuideModal({ guide, onClose, onSaved }: { guide: Guide | null; onClose: () => void; onSaved: () => void }) {
  const [titre, setTitre] = useState(guide?.titre ?? '')
  const [description, setDescription] = useState(guide?.description ?? '')
  const [poste, setPoste] = useState<Poste>(guide?.poste ?? 'tous')
  const [seuil, setSeuil] = useState<string>(String(guide?.seuil_reussite_pct ?? 80))
  const [duree, setDuree] = useState<string>(guide?.duree_minutes != null ? String(guide.duree_minutes) : '')
  const [actif, setActif] = useState(guide?.actif ?? true)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!titre.trim()) return alert('Titre obligatoire')
    const payload = {
      titre: titre.trim(),
      description: description || null,
      poste, ordre: guide?.ordre ?? 0,
      actif,
      seuil_reussite_pct: Math.max(0, Math.min(100, Number(seuil) || 80)),
      duree_minutes: duree ? Number(duree) : null,
    }
    startTransition(() => {
      const p = guide ? updateGuide({ id: guide.id, ...payload }) : creerGuide(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{guide ? '✏️ Modifier' : '➕ Nouveau'} guide</h3>
        <div className="space-y-3">
          <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" autoFocus />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description courte"
            className="w-full text-sm rounded-md border px-3 py-2 min-h-[60px]" />
          <select value={poste} onChange={e => setPoste(e.target.value as Poste)} className="w-full text-sm rounded-md border px-3 py-2">
            {(Object.keys(POSTE_INFO) as Poste[]).map(p => <option key={p} value={p}>{POSTE_INFO[p].emoji} {POSTE_INFO[p].label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs">Seuil réussite (%)</label>
              <Input type="number" value={seuil} onChange={e => setSeuil(e.target.value)} min={0} max={100} />
            </div>
            <div>
              <label className="text-xs">Durée (min)</label>
              <Input type="number" value={duree} onChange={e => setDuree(e.target.value)} min={1} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} /> Actif
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !titre.trim()}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}

function EtapeModal({ guide_id, etape, ordreSuivant, onClose, onSaved }: {
  guide_id: string; etape: Etape | null; ordreSuivant: number
  onClose: () => void; onSaved: () => void
}) {
  const [titre, setTitre] = useState(etape?.titre ?? '')
  const [contenu, setContenu] = useState(etape?.contenu ?? '')
  const [imageUrl, setImageUrl] = useState(etape?.image_url ?? '')
  const [videoUrl, setVideoUrl] = useState(etape?.video_url ?? '')
  const [ordre, setOrdre] = useState<string>(String(etape?.ordre ?? ordreSuivant))
  const [pending, startTransition] = useTransition()

  function save() {
    if (!titre.trim() || !contenu.trim()) return alert('Titre et contenu obligatoires')
    const payload = {
      guide_id,
      ordre: Number(ordre) || 1,
      titre: titre.trim(),
      contenu: contenu.trim(),
      image_url: imageUrl || null,
      video_url: videoUrl || null,
    }
    startTransition(() => {
      const p = etape ? updateEtape({ id: etape.id, ...payload }) : creerEtape(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{etape ? '✏️ Modifier' : '➕ Nouvelle'} étape</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className="text-xs">Ordre</label><Input type="number" value={ordre} onChange={e => setOrdre(e.target.value)} min={1} /></div>
            <div><label className="text-xs">Titre</label><Input value={titre} onChange={e => setTitre(e.target.value)} autoFocus /></div>
          </div>
          <div>
            <label className="text-xs">Contenu (texte/markdown — sauts de ligne préservés)</label>
            <textarea value={contenu} onChange={e => setContenu(e.target.value)}
              className="w-full text-sm rounded-md border px-3 py-2 min-h-[200px] font-mono" />
          </div>
          <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL image (optionnel)" />
          <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="URL vidéo YouTube/Vimeo (optionnel)" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !titre.trim() || !contenu.trim()}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}

function QuestionModal({ guide_id, question, ordreSuivant, onClose, onSaved }: {
  guide_id: string; question: Question | null; ordreSuivant: number
  onClose: () => void; onSaved: () => void
}) {
  const [questionTxt, setQuestionTxt] = useState(question?.question ?? '')
  const [choix, setChoix] = useState<string[]>(question?.choix ?? ['', ''])
  const [bonneIdx, setBonneIdx] = useState<number>(question?.bonne_reponse_idx ?? 0)
  const [explication, setExplication] = useState(question?.explication ?? '')
  const [ordre, setOrdre] = useState<string>(String(question?.ordre ?? ordreSuivant))
  const [pending, startTransition] = useTransition()

  function save() {
    const choixClean = choix.map(c => c.trim()).filter(Boolean)
    if (choixClean.length < 2) return alert('Au moins 2 choix')
    if (!questionTxt.trim()) return alert('Question obligatoire')
    if (bonneIdx >= choixClean.length) return alert('Bonne réponse hors plage')
    const payload = {
      guide_id, ordre: Number(ordre) || 1,
      question: questionTxt.trim(),
      choix: choixClean,
      bonne_reponse_idx: bonneIdx,
      explication: explication || null,
    }
    startTransition(() => {
      const p = question ? updateQuestion({ id: question.id, ...payload }) : creerQuestion(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{question ? '✏️ Modifier' : '➕ Nouvelle'} question</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className="text-xs">Ordre</label><Input type="number" value={ordre} onChange={e => setOrdre(e.target.value)} min={1} /></div>
            <div><label className="text-xs">Question</label><Input value={questionTxt} onChange={e => setQuestionTxt(e.target.value)} autoFocus /></div>
          </div>
          <div>
            <label className="text-xs flex justify-between items-center">Choix (radio = bonne réponse) {choix.length < 6 && <button type="button" onClick={() => setChoix([...choix, ''])} className="text-emerald-600 text-xs">+ ajouter</button>}</label>
            <div className="space-y-1 mt-1">
              {choix.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="bonne" checked={bonneIdx === i} onChange={() => setBonneIdx(i)} />
                  <Input value={c} onChange={e => setChoix(choix.map((x, j) => j === i ? e.target.value : x))} placeholder={`Choix ${String.fromCharCode(65 + i)}`} className="flex-1" />
                  {choix.length > 2 && <button type="button" onClick={() => { setChoix(choix.filter((_, j) => j !== i)); if (bonneIdx >= choix.length - 1) setBonneIdx(0) }} className="text-red-600 text-xs">×</button>}
                </div>
              ))}
            </div>
          </div>
          <textarea value={explication} onChange={e => setExplication(e.target.value)} placeholder="Explication (optionnelle)"
            className="w-full text-sm rounded-md border px-3 py-2 min-h-[60px]" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !questionTxt.trim()}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}
