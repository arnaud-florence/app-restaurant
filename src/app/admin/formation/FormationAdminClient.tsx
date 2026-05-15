'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, BookOpen, GraduationCap, Users, ExternalLink, Printer, RotateCcw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { PillTab, PillCount } from '@/components/ui/PillTab'
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

type CertifRow = {
  id: string; employe_id: string; poste: string; obtenue_le: string; score_pct: number
  employe?: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null
}
type QuestionIaRow = {
  id: string; question: string; reponse: string; poste: string | null; guide_id: string | null; created_at: string
  employe?: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null
}
type BadgeRow = { employe_id: string; badge_code: string; badge_titre: string; badge_emoji: string; obtenu_le: string }

export default function FormationAdminClient({
  guides, etapes, questions, progressions, employes,
  certifications = [], questionsIa = [], badges = [],
}: {
  guides: Guide[]; etapes: Etape[]; questions: Question[]
  progressions: ProgRow[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  certifications?: CertifRow[]
  questionsIa?: QuestionIaRow[]
  badges?: BadgeRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'guides' | 'progressions' | 'certifications' | 'questions_ia'>('guides')
  const [showGuideForm, setShowGuideForm] = useState<Guide | true | null>(null)
  const [openGuideId, setOpenGuideId] = useState<string | null>(guides[0]?.id ?? null)
  const [, startTransition] = useTransition()

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl shadow-lg shadow-emerald-500/30 shrink-0">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Équipe</p>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Formation</h1>
            <p className="text-xs text-zinc-500 mt-1">Guides interactifs par poste, quiz, suivi des progressions.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/allergenes" className="text-sm text-zinc-600 hover:text-emerald-700 inline-flex items-center gap-1 underline">
            🆘 Procédures urgence (Module 12)
          </Link>
          <Link href="/admin/formation/docs">
            <Button variant="outline" className="gap-2">📚 Manuels</Button>
          </Link>
          <Link href="/formation" target="_blank">
            <Button variant="outline" className="gap-2"><ExternalLink className="h-4 w-4" /> Vue employé</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <PillTab active={tab === 'guides'} onClick={() => setTab('guides')}>
          📖 Guides <PillCount n={guides.length} active={tab === 'guides'} />
        </PillTab>
        <PillTab active={tab === 'progressions'} onClick={() => setTab('progressions')}>
          👥 Progressions <PillCount n={progressions.length} active={tab === 'progressions'} />
        </PillTab>
        <PillTab active={tab === 'certifications'} onClick={() => setTab('certifications')}>
          🏆 Certifs <PillCount n={certifications.length} active={tab === 'certifications'} />
        </PillTab>
        <PillTab active={tab === 'questions_ia'} onClick={() => setTab('questions_ia')}>
          🤖 Questions IA <PillCount n={questionsIa.length} active={tab === 'questions_ia'} />
        </PillTab>
      </div>

      {tab === 'certifications' && (
        <CertificationsTab
          certifications={certifications}
          employes={employes}
          badges={badges}
        />
      )}

      {tab === 'questions_ia' && (
        <QuestionsIaTab questionsIa={questionsIa} />
      )}

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

// ─────────────────────────────────────────────────────────────
// Onglet CERTIFICATIONS — qui peut faire quoi le jour de l'ouverture
// ─────────────────────────────────────────────────────────────
function CertificationsTab({
  certifications, employes, badges,
}: {
  certifications: CertifRow[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  badges: BadgeRow[]
}) {
  // Matrice : pour chaque employé, quels postes sont certifiés
  const postesUniques = useMemo(
    () => [...new Set(certifications.map(c => c.poste))].sort(),
    [certifications],
  )
  const certifsByEmp = useMemo(() => {
    const m = new Map<string, Map<string, CertifRow>>()
    for (const c of certifications) {
      if (!m.has(c.employe_id)) m.set(c.employe_id, new Map())
      m.get(c.employe_id)!.set(c.poste, c)
    }
    return m
  }, [certifications])
  const badgesByEmp = useMemo(() => {
    const m = new Map<string, BadgeRow[]>()
    for (const b of badges) {
      const arr = m.get(b.employe_id) ?? []
      arr.push(b)
      m.set(b.employe_id, arr)
    }
    return m
  }, [badges])

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-bold text-zinc-900 mb-2">🏆 Qui peut faire quoi le jour de l'ouverture</h3>
        <p className="text-xs text-zinc-500 mb-3">Matrice employés × postes. Une coche = certifié.</p>
        {certifications.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucune certification émise. L'Agent Formateur attribue les certifs automatiquement quand un employé valide tous les guides de son poste.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="text-left px-2 py-1.5 font-bold">Employé</th>
                  {postesUniques.map(p => (
                    <th key={p} className="text-center px-2 py-1.5 font-bold">{p}</th>
                  ))}
                  <th className="text-center px-2 py-1.5 font-bold">Badges</th>
                </tr>
              </thead>
              <tbody>
                {employes.map(emp => {
                  const certifs = certifsByEmp.get(emp.id) ?? new Map()
                  const empBadges = badgesByEmp.get(emp.id) ?? []
                  return (
                    <tr key={emp.id} className="border-t hover:bg-zinc-50">
                      <td className="px-2 py-1.5 font-medium">
                        {emp.prenom} {emp.nom}
                        <span className="ml-1 text-[10px] text-zinc-500">({emp.poste})</span>
                      </td>
                      {postesUniques.map(p => {
                        const c = certifs.get(p)
                        return (
                          <td key={p} className="text-center px-2 py-1.5">
                            {c ? (
                              <span title={`Certifié le ${format(parseISO(c.obtenue_le), 'd MMM yyyy', { locale: fr })} · score ${c.score_pct}%`}>
                                ✅
                              </span>
                            ) : <span className="text-zinc-300">—</span>}
                          </td>
                        )
                      })}
                      <td className="text-center px-2 py-1.5">
                        {empBadges.length > 0 ? (
                          <span className="inline-flex gap-0.5" title={empBadges.map(b => b.badge_titre).join(' · ')}>
                            {empBadges.map(b => <span key={b.badge_code}>{b.badge_emoji}</span>)}
                          </span>
                        ) : <span className="text-zinc-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Détail certifications récentes */}
      {certifications.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-zinc-900 mb-2">📅 Dernières certifications obtenues</h3>
          <ul className="text-xs space-y-1">
            {certifications.slice(0, 20).map(c => {
              const emp = Array.isArray(c.employe) ? c.employe[0] : c.employe
              return (
                <li key={c.id} className="flex justify-between text-zinc-700 border-b py-1 last:border-0">
                  <span><b className="text-emerald-700">{emp?.prenom} {emp?.nom}</b> · {c.poste}</span>
                  <span className="text-zinc-500">
                    Score {c.score_pct}% · {format(parseISO(c.obtenue_le), 'd MMM yyyy', { locale: fr })}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Onglet QUESTIONS IA — top questions posées + analyse fréquence
// ─────────────────────────────────────────────────────────────
function QuestionsIaTab({ questionsIa }: { questionsIa: QuestionIaRow[] }) {
  // Agrégation : compte des questions par poste pour identifier où enrichir
  const parPoste = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of questionsIa) {
      const k = q.poste ?? '?'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [questionsIa])

  const [selected, setSelected] = useState<QuestionIaRow | null>(null)

  return (
    <div className="space-y-3">
      {questionsIa.length === 0 ? (
        <Card className="p-6 text-center text-zinc-500 italic">
          Aucune question posée à l'IA pour l'instant. Les employés peuvent poser des questions depuis chaque guide.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <h3 className="font-bold text-zinc-900 mb-2">📊 Questions par poste — où enrichir les modules</h3>
            <div className="flex flex-wrap gap-2">
              {parPoste.map(([p, n]) => (
                <span key={p} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-violet-100 text-violet-900 font-bold">
                  {p} · {n} question{n > 1 ? 's' : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2 italic">
              Les postes avec le plus de questions sont ceux où les modules manquent de clarté — bon angle pour les enrichir.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold text-zinc-900 mb-2">💬 100 dernières questions posées</h3>
            <ul className="divide-y text-xs">
              {questionsIa.slice(0, 100).map(q => {
                const emp = Array.isArray(q.employe) ? q.employe[0] : q.employe
                return (
                  <li key={q.id} className="py-1.5 flex items-center justify-between gap-2 hover:bg-zinc-50 cursor-pointer" onClick={() => setSelected(q)}>
                    <span className="min-w-0 truncate flex-1">
                      <b className="text-zinc-900">{emp?.prenom ?? '?'}</b> · {q.poste ?? '—'} ·{' '}
                      <span className="text-zinc-700">{q.question.slice(0, 90)}{q.question.length > 90 ? '…' : ''}</span>
                    </span>
                    <span className="text-zinc-400 shrink-0">{format(parseISO(q.created_at), 'd MMM HH:mm', { locale: fr })}</span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      {/* Modal détail Q/R */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4 space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="font-bold">💬 Question IA détaillée</h3>
              <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-zinc-900 text-2xl leading-none w-8 h-8 rounded-full hover:bg-zinc-100">×</button>
            </header>
            <div className="rounded-md bg-zinc-100 p-3 text-sm">
              <p className="text-xs font-bold text-zinc-500 mb-1">🙋 Question</p>
              <p>{selected.question}</p>
            </div>
            <div className="rounded-md bg-violet-50 border border-violet-200 p-3 text-sm">
              <p className="text-xs font-bold text-violet-600 mb-1">🤖 Réponse Claude</p>
              <p className="whitespace-pre-wrap">{selected.reponse}</p>
            </div>
            <p className="text-[10px] text-zinc-500">
              {selected.poste && <>Poste {selected.poste} · </>}
              {format(parseISO(selected.created_at), 'd MMM yyyy à HH:mm', { locale: fr })}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
