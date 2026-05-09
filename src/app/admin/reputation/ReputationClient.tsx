'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Star, Plus, Trash2, Sparkles, Send, Eye, Flag, X } from 'lucide-react'
import {
  creerAvisManuel, modererAvis, publierReponse, supprimerAvis,
} from './actions'
import type { AvisPublic } from './page'

const SOURCE_INFO: Record<AvisPublic['source'], { label: string; emoji: string; cls: string }> = {
  site:        { label: 'Site web',     emoji: '🌐', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  google:      { label: 'Google',       emoji: 'G',  cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  tripadvisor: { label: 'TripAdvisor',  emoji: '✈',  cls: 'bg-teal-100 text-teal-800 border-teal-300' },
  thefork:     { label: 'TheFork',      emoji: '🍴', cls: 'bg-rose-100 text-rose-800 border-rose-300' },
  autre:       { label: 'Autre',        emoji: '•',  cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
}

const STATUT_INFO: Record<AvisPublic['statut'], { label: string; cls: string }> = {
  en_attente: { label: 'À traiter', cls: 'bg-amber-500 text-white' },
  publie:     { label: 'Publié',    cls: 'bg-emerald-500 text-white' },
  rejete:     { label: 'Rejeté',    cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  signale:    { label: 'Signalé',   cls: 'bg-red-500 text-white' },
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Etoiles({ note }: { note: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={n <= note ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4 text-zinc-300'}
        />
      ))}
    </div>
  )
}

export default function ReputationClient({ avis }: { avis: AvisPublic[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [respondingTo, setRespondingTo] = useState<AvisPublic | null>(null)
  const [confirmDel, setConfirmDel] = useState<AvisPublic | null>(null)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | AvisPublic['statut']>('tous')
  const [filtreSource, setFiltreSource] = useState<'tous' | AvisPublic['source']>('tous')
  const [filtreNote, setFiltreNote] = useState<'tous' | '5' | '4' | '3' | '2' | '1'>('tous')
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    let r = avis
    if (filtreStatut !== 'tous') r = r.filter(a => a.statut === filtreStatut)
    if (filtreSource !== 'tous') r = r.filter(a => a.source === filtreSource)
    if (filtreNote !== 'tous') r = r.filter(a => a.note === Number(filtreNote))
    if (search.trim().length >= 2) {
      const q = search.toLowerCase()
      r = r.filter(a => (a.titre ?? '').toLowerCase().includes(q) ||
                        (a.contenu ?? '').toLowerCase().includes(q) ||
                        (a.client_nom ?? '').toLowerCase().includes(q))
    }
    return r
  }, [avis, filtreStatut, filtreSource, filtreNote, search])

  // KPIs
  const stats = useMemo(() => {
    const publies = avis.filter(a => a.statut === 'publie')
    const noteMoyenne = publies.length > 0
      ? publies.reduce((s, a) => s + a.note, 0) / publies.length
      : 0
    const enAttente = avis.filter(a => a.statut === 'en_attente').length
    const negatifs = publies.filter(a => a.note <= 2).length
    return {
      total: avis.length,
      publies: publies.length,
      noteMoyenne,
      enAttente,
      negatifs,
    }
  }, [avis])

  function exec(action: () => Promise<void>) {
    setErreur('')
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500" />
            Réputation / Avis clients
          </h1>
          <p className="text-sm text-zinc-500">
            {avis.length} avis collectés · {stats.enAttente} à traiter · note moyenne {stats.noteMoyenne.toFixed(1)}/5
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Saisir un avis externe
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-xs uppercase tracking-wider text-amber-700 font-bold">Note moyenne</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold tabular-nums">{stats.noteMoyenne.toFixed(1)}</span>
            <span className="text-sm text-zinc-500">/ 5</span>
          </div>
          <Etoiles note={Math.round(stats.noteMoyenne)} />
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Avis publiés</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{stats.publies}</p>
        </Card>
        <Card className={`p-4 ${stats.enAttente > 0 ? 'bg-amber-50 border-amber-200' : ''}`}>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">À traiter</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${stats.enAttente > 0 ? 'text-amber-700' : ''}`}>
            {stats.enAttente}
          </p>
        </Card>
        <Card className={`p-4 ${stats.negatifs > 0 ? 'bg-red-50 border-red-200' : ''}`}>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Négatifs (≤2★)</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${stats.negatifs > 0 ? 'text-red-700' : ''}`}>
            {stats.negatifs}
          </p>
        </Card>
      </div>

      {/* Filtres */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder="Rechercher contenu / client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] max-w-sm"
        />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value as typeof filtreStatut)} className="h-10 px-3 rounded-md border text-sm">
          <option value="tous">Tous statuts</option>
          <option value="en_attente">À traiter</option>
          <option value="publie">Publiés</option>
          <option value="rejete">Rejetés</option>
          <option value="signale">Signalés</option>
        </select>
        <select value={filtreSource} onChange={e => setFiltreSource(e.target.value as typeof filtreSource)} className="h-10 px-3 rounded-md border text-sm">
          <option value="tous">Toutes sources</option>
          {(Object.keys(SOURCE_INFO) as AvisPublic['source'][]).map(s => (
            <option key={s} value={s}>{SOURCE_INFO[s].label}</option>
          ))}
        </select>
        <select value={filtreNote} onChange={e => setFiltreNote(e.target.value as typeof filtreNote)} className="h-10 px-3 rounded-md border text-sm">
          <option value="tous">Toutes notes</option>
          {[5,4,3,2,1].map(n => <option key={n} value={n}>{n}★</option>)}
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
      </Card>

      {erreur && <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          <Star className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
          <p className="text-base font-medium">Aucun avis</p>
          <p className="text-xs mt-1">Saisis un avis externe ou attends les premiers via le site.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const sInfo = SOURCE_INFO[a.source]
            const stInfo = STATUT_INFO[a.statut]
            const negative = a.note <= 2
            return (
              <Card key={a.id} className={`p-4 ${negative && a.statut === 'en_attente' ? 'border-red-300 bg-red-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Etoiles note={a.note} />
                      <Badge variant="outline" className={sInfo.cls}>
                        {sInfo.emoji} {sInfo.label}
                      </Badge>
                      <Badge variant="outline" className={stInfo.cls}>{stInfo.label}</Badge>
                      {negative && <Badge className="bg-red-600 text-white">⚠ Négatif</Badge>}
                      <span className="text-xs text-zinc-500">{fmtDate(a.created_at)}</span>
                      {a.client_nom && <span className="text-xs text-zinc-600">· {a.client_nom}</span>}
                    </div>
                    {a.titre && <p className="font-bold text-sm">{a.titre}</p>}
                    {a.contenu && <p className="text-sm text-zinc-700 mt-1 whitespace-pre-line">{a.contenu}</p>}

                    {/* Réponse publiée */}
                    {a.reponse && (
                      <div className="mt-3 pl-3 border-l-4 border-emerald-500 bg-emerald-50 p-2 rounded-r">
                        <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold mb-1">
                          ↪ Notre réponse · {fmtDate(a.reponse_date)}
                        </p>
                        <p className="text-sm text-zinc-800 whitespace-pre-line">{a.reponse}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 items-end">
                    <Button size="sm" variant="outline" onClick={() => setRespondingTo(a)} className="gap-1">
                      <Send className="h-3 w-3" /> {a.reponse ? 'Modifier' : 'Répondre'}
                    </Button>
                    {a.statut === 'en_attente' && (
                      <Button size="sm" variant="outline" onClick={() => exec(async () => { await modererAvis({ id: a.id, statut: 'publie' }) })} className="text-emerald-700">
                        <Eye className="h-3 w-3" /> Publier
                      </Button>
                    )}
                    {a.statut !== 'rejete' && (
                      <Button size="sm" variant="ghost" onClick={() => exec(async () => { await modererAvis({ id: a.id, statut: 'rejete' }) })} className="text-zinc-600">
                        Rejeter
                      </Button>
                    )}
                    {a.statut !== 'signale' && (
                      <Button size="sm" variant="ghost" onClick={() => exec(async () => { await modererAvis({ id: a.id, statut: 'signale' }) })} className="text-red-600">
                        <Flag className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDel(a)} className="text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {creating && <CreerAvisModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh() }} />}

      {respondingTo && (
        <ReponseModal
          avis={respondingTo}
          onClose={() => setRespondingTo(null)}
          onSaved={() => { setRespondingTo(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer cet avis ?</p>
            <p className="text-sm text-zinc-600 mb-3">Action irréversible.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={() => exec(async () => { await supprimerAvis(confirmDel.id); setConfirmDel(null) })} className="flex-1 bg-red-600 hover:bg-red-700">
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Modal saisie avis externe ──────────────────────────────
function CreerAvisModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<AvisPublic['source']>('google')
  const [note, setNote] = useState(5)
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [externeId, setExterneId] = useState('')
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (note < 1 || note > 5) { setErreur('Note 1-5'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await creerAvisManuel({
          source,
          source_id_externe: externeId.trim() || null,
          note,
          titre: titre.trim() || null,
          contenu: contenu.trim() || null,
          langue: 'fr',
        })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Saisir un avis externe</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Source *</label>
            <select value={source} onChange={e => setSource(e.target.value as AvisPublic['source'])} className="w-full h-10 px-3 rounded-md border text-sm">
              {(Object.keys(SOURCE_INFO) as AvisPublic['source'][]).map(s => (
                <option key={s} value={s}>{SOURCE_INFO[s].emoji} {SOURCE_INFO[s].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Note *</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setNote(n)}
                  className={`p-2 rounded ${n <= note ? 'bg-amber-400 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                  <Star className={`h-5 w-5 ${n <= note ? 'fill-current' : ''}`} />
                </button>
              ))}
              <span className="ml-2 self-center font-bold text-zinc-700">{note}/5</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Titre (optionnel)</label>
            <Input type="text" value={titre} onChange={e => setTitre(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Contenu</label>
            <Textarea rows={4} maxLength={5000} value={contenu} onChange={e => setContenu(e.target.value)}
              placeholder="Copie-colle l'avis client tel qu'il apparaît sur la plateforme" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ID externe (optionnel)</label>
            <Input type="text" value={externeId} onChange={e => setExterneId(e.target.value)} maxLength={160}
              placeholder="ID Google review ou n° TripAdvisor pour traçabilité" />
          </div>
          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
            <Button onClick={valider} disabled={isPending} className="flex-[2]">
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Modal réponse (avec brouillon IA optionnel) ───────────
function ReponseModal({
  avis, onClose, onSaved,
}: {
  avis: AvisPublic
  onClose: () => void
  onSaved: () => void
}) {
  const [reponse, setReponse] = useState(avis.reponse ?? avis.brouillon_reponse_ia ?? '')
  const [generating, setGenerating] = useState(false)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  async function genererBrouillon() {
    setGenerating(true)
    setErreur('')
    try {
      const res = await fetch('/api/avis/brouillon-reponse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avis_id: avis.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Erreur génération')
      }
      const data = await res.json()
      setReponse(data.brouillon ?? '')
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    finally { setGenerating(false) }
  }

  function publier() {
    if (!reponse.trim()) { setErreur('Réponse vide'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await publierReponse({ id: avis.id, reponse: reponse.trim() })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  const sInfo = SOURCE_INFO[avis.source]

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-2xl w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Répondre à l&apos;avis</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>

        {/* Contexte avis */}
        <Card className="p-3 mb-3 bg-zinc-50">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Etoiles note={avis.note} />
            <Badge variant="outline" className={sInfo.cls}>{sInfo.emoji} {sInfo.label}</Badge>
            <span className="text-xs text-zinc-500">{fmtDate(avis.created_at)}</span>
          </div>
          {avis.titre && <p className="font-bold text-sm">{avis.titre}</p>}
          {avis.contenu && <p className="text-sm text-zinc-700 whitespace-pre-line mt-1">{avis.contenu}</p>}
        </Card>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Ta réponse</label>
            <Button size="sm" variant="outline" onClick={genererBrouillon} disabled={generating} className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              {generating ? 'Génération…' : '✨ Brouillon IA'}
            </Button>
          </div>
          <Textarea
            rows={6}
            maxLength={5000}
            value={reponse}
            onChange={e => setReponse(e.target.value)}
            placeholder="Rédige ta réponse OU clique « Brouillon IA » pour partir d'une suggestion…"
          />
          <p className="text-[11px] text-zinc-500">
            ⚠️ La réponse n&apos;est PAS publiée automatiquement sur Google/TripAdvisor.
            Tu dois la copier-coller manuellement sur la plateforme. Ici c&apos;est juste pour archiver ta réponse officielle.
          </p>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
            <Button onClick={publier} disabled={isPending || !reponse.trim()} className="flex-[2] gap-1">
              <Send className="h-4 w-4" />
              {isPending ? 'Enregistrement…' : avis.reponse ? 'Mettre à jour la réponse' : 'Enregistrer la réponse'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
