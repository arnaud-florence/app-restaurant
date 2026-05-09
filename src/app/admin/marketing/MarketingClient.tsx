'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Megaphone, Sparkles, Plus, Trash2, Copy, Check, Eye, Calendar } from 'lucide-react'
import { creerPost, modifierPost, changerStatutPost, supprimerPost } from './actions'
import type { PostMarketing } from './page'

const CANAL_INFO: Record<PostMarketing['canal'], { label: string; emoji: string; cls: string }> = {
  instagram:           { label: 'Instagram',     emoji: '📷', cls: 'bg-pink-100 text-pink-800 border-pink-300' },
  facebook:            { label: 'Facebook',      emoji: '📘', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  google_my_business:  { label: 'Google MB',     emoji: 'G',  cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  linkedin:            { label: 'LinkedIn',      emoji: '💼', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  tiktok:              { label: 'TikTok',        emoji: '🎵', cls: 'bg-zinc-900 text-white border-zinc-700' },
  autre:               { label: 'Autre',         emoji: '•',  cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
}

const STATUT_INFO: Record<PostMarketing['statut'], { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  prevu:     { label: 'Programmé', cls: 'bg-blue-500 text-white' },
  publie:    { label: 'Publié',    cls: 'bg-emerald-500 text-white' },
  rejete:    { label: 'Rejeté',    cls: 'bg-red-100 text-red-800 border-red-300' },
  archive:   { label: 'Archivé',   cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
}

export default function MarketingClient({
  posts, recettes, evenements,
}: {
  posts: PostMarketing[]
  recettes: Array<{ id: string; nom: string; image_url: string | null; prix_vente_ht: number; tag_destination: string }>
  evenements: Array<{ id: string; nom: string; type: string; date_evenement: string }>
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PostMarketing | null>(null)
  const [confirmDel, setConfirmDel] = useState<PostMarketing | null>(null)
  const [filterStatut, setFilterStatut] = useState<'tous' | PostMarketing['statut']>('tous')
  const [filterCanal, setFilterCanal] = useState<'tous' | PostMarketing['canal']>('tous')
  const [erreur, setErreur] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = posts.filter(p => {
    if (filterStatut !== 'tous' && p.statut !== filterStatut) return false
    if (filterCanal !== 'tous' && p.canal !== filterCanal) return false
    return true
  })

  function copier(p: PostMarketing) {
    const txt = (p.titre ? p.titre + '\n\n' : '') + p.contenu +
                (p.hashtags.length > 0 ? '\n\n' + p.hashtags.map(h => '#' + h).join(' ') : '')
    navigator.clipboard.writeText(txt).catch(() => {})
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  function exec(action: () => Promise<void>) {
    setErreur('')
    startTransition(async () => {
      try { await action(); router.refresh() }
      catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  // KPIs
  const stats = {
    brouillon: posts.filter(p => p.statut === 'brouillon').length,
    prevu: posts.filter(p => p.statut === 'prevu').length,
    publie: posts.filter(p => p.statut === 'publie').length,
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-pink-500" />
            Marketing & communication
          </h1>
          <p className="text-sm text-zinc-500">Génération posts IA pour Instagram, Facebook, Google My Business…</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5 bg-pink-600 hover:bg-pink-700">
          <Sparkles className="h-4 w-4" /> Générer un post IA
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 bg-zinc-50">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Brouillons</p>
          <p className="text-3xl font-bold">{stats.brouillon}</p>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-xs uppercase tracking-wider text-blue-700 font-bold">Programmés</p>
          <p className="text-3xl font-bold text-blue-700">{stats.prevu}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <p className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Publiés</p>
          <p className="text-3xl font-bold text-emerald-700">{stats.publie}</p>
        </Card>
      </div>

      {/* Card guide */}
      <Card className="p-4 bg-pink-50 border-pink-200">
        <p className="text-xs uppercase tracking-wider text-pink-700 font-bold mb-2">📣 Comment ça marche</p>
        <ul className="text-sm text-pink-900 space-y-1">
          <li>• Clique « ✨ Générer un post IA » → Claude rédige un post adapté au canal choisi</li>
          <li>• Optionnel : lie le post à un plat ou un événement → l&apos;IA en parle naturellement</li>
          <li>• Édite si besoin, puis clique « 📋 Copier » et colle dans Instagram/Facebook/GMB</li>
          <li>• Marque comme « Publié » avec l&apos;URL du post pour suivre les stats</li>
        </ul>
      </Card>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as typeof filterStatut)}
          className="h-10 px-3 rounded-md border text-sm">
          <option value="tous">Tous statuts</option>
          {(Object.keys(STATUT_INFO) as PostMarketing['statut'][]).map(s => (
            <option key={s} value={s}>{STATUT_INFO[s].label}</option>
          ))}
        </select>
        <select value={filterCanal} onChange={e => setFilterCanal(e.target.value as typeof filterCanal)}
          className="h-10 px-3 rounded-md border text-sm">
          <option value="tous">Tous canaux</option>
          {(Object.keys(CANAL_INFO) as PostMarketing['canal'][]).map(c => (
            <option key={c} value={c}>{CANAL_INFO[c].label}</option>
          ))}
        </select>
        <span className="ml-auto self-center text-xs text-zinc-500">{filtered.length} post{filtered.length > 1 ? 's' : ''}</span>
      </div>

      {erreur && <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          <Megaphone className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
          <p className="text-base font-medium">Aucun post {filterStatut !== 'tous' ? STATUT_INFO[filterStatut].label.toLowerCase() : ''}</p>
          <p className="text-xs mt-1">Clique « Générer un post IA » pour démarrer.</p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {filtered.map(p => {
            const ci = CANAL_INFO[p.canal]
            const si = STATUT_INFO[p.statut]
            return (
              <Card key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={ci.cls}>{ci.emoji} {ci.label}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                    <Badge variant="outline" className={si.cls}>{si.label}</Badge>
                    {p.genere_par_ia && <Badge className="bg-purple-100 text-purple-800 border-purple-300 gap-1">
                      <Sparkles className="h-3 w-3" /> IA
                    </Badge>}
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {p.titre && <p className="font-bold">{p.titre}</p>}
                <p className="text-sm whitespace-pre-line line-clamp-4">{p.contenu}</p>

                {p.hashtags.length > 0 && (
                  <p className="text-xs text-blue-600 line-clamp-1">
                    {p.hashtags.map(h => '#' + h).join(' ')}
                  </p>
                )}

                {p.call_to_action && (
                  <p className="text-xs text-emerald-700 font-medium">→ {p.call_to_action}</p>
                )}

                <div className="flex gap-1 pt-2 border-t flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => copier(p)} className="gap-1 text-xs">
                    {copiedId === p.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copiedId === p.id ? 'Copié !' : 'Copier'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)} className="text-xs">Éditer</Button>
                  {p.statut === 'brouillon' && (
                    <Button size="sm" variant="outline" onClick={() => exec(async () => { await changerStatutPost(p.id, 'publie') })} className="text-xs text-emerald-700">
                      <Eye className="h-3 w-3" /> Publié
                    </Button>
                  )}
                  {p.statut === 'publie' && (
                    <Button size="sm" variant="ghost" onClick={() => exec(async () => { await changerStatutPost(p.id, 'archive') })} className="text-xs">Archiver</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(p)} className="text-red-600 ml-auto">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <PostModal
          post={editing}
          recettes={recettes}
          evenements={evenements}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer ce post ?</p>
            <p className="text-sm text-zinc-600 mb-3">Action irréversible.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={() => exec(async () => { await supprimerPost(confirmDel.id); setConfirmDel(null) })} className="flex-1 bg-red-600 hover:bg-red-700">Supprimer</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Modal génération + édition ──────────────────────────────
function PostModal({
  post, recettes, evenements, onClose, onSaved,
}: {
  post: PostMarketing | null
  recettes: Array<{ id: string; nom: string; image_url: string | null; prix_vente_ht: number; tag_destination: string }>
  evenements: Array<{ id: string; nom: string; type: string; date_evenement: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!post
  const [canal, setCanal] = useState<PostMarketing['canal']>(post?.canal ?? 'instagram')
  const [type, setType] = useState<PostMarketing['type']>(post?.type ?? 'post')
  const [titre, setTitre] = useState(post?.titre ?? '')
  const [contenu, setContenu] = useState(post?.contenu ?? '')
  const [hashtagsStr, setHashtagsStr] = useState((post?.hashtags ?? []).join(' '))
  const [imageUrl, setImageUrl] = useState(post?.image_url ?? '')
  const [cta, setCta] = useState(post?.call_to_action ?? '')
  const [ctaUrl, setCtaUrl] = useState(post?.cta_url ?? '')
  const [recetteId, setRecetteId] = useState(post?.recette_id ?? '')
  const [evtId, setEvtId] = useState(post?.evenement_id ?? '')
  const [datePrevue, setDatePrevue] = useState(post?.date_programmee?.slice(0, 16) ?? '')
  const [statut, setStatut] = useState<PostMarketing['statut']>(post?.statut ?? 'brouillon')
  const [contexte, setContexte] = useState('')
  const [generating, setGenerating] = useState(false)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  async function genererIA() {
    setGenerating(true)
    setErreur('')
    try {
      const res = await fetch('/api/marketing/generer-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal, type, contexte, recette_id: recetteId || null, evenement_id: evtId || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Erreur génération')
      }
      const data = await res.json()
      setTitre(data.titre ?? '')
      setContenu(data.contenu ?? '')
      setHashtagsStr((data.hashtags ?? []).join(' '))
      setCta(data.call_to_action ?? '')
      setCtaUrl(data.cta_url ?? '')
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    finally { setGenerating(false) }
  }

  function valider() {
    if (!contenu.trim()) { setErreur('Contenu obligatoire'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          canal, type,
          titre: titre || null, contenu,
          hashtags: hashtagsStr.split(/\s+/).filter(h => h.startsWith('#') ? h.slice(1) : h).filter(Boolean).map(h => h.replace(/^#/, '')),
          image_url: imageUrl || null,
          call_to_action: cta || null, cta_url: ctaUrl || null,
          recette_id: recetteId || null, evenement_id: evtId || null,
          date_programmee: datePrevue ? new Date(datePrevue).toISOString() : null,
          statut,
          genere_par_ia: !!post?.genere_par_ia || !isEdit,
        }
        if (isEdit) await modifierPost(post!.id, payload)
        else await creerPost(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-2xl w-full p-5 my-8 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2">
          {isEdit ? 'Éditer le post' : '✨ Générer un post IA'}
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-bold block mb-1">Canal *</label>
            <select value={canal} onChange={e => setCanal(e.target.value as PostMarketing['canal'])}
              className="w-full h-10 px-3 rounded-md border text-sm">
              {(Object.keys(CANAL_INFO) as PostMarketing['canal'][]).map(c => (
                <option key={c} value={c}>{CANAL_INFO[c].emoji} {CANAL_INFO[c].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as PostMarketing['type'])}
              className="w-full h-10 px-3 rounded-md border text-sm">
              <option value="post">Post</option>
              <option value="story">Story</option>
              <option value="reel">Reel / Vidéo</option>
              <option value="annonce_gmb">Annonce GMB</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-bold block mb-1">Plat à promouvoir</label>
            <select value={recetteId} onChange={e => setRecetteId(e.target.value)} className="w-full h-10 px-3 rounded-md border text-sm">
              <option value="">— aucun —</option>
              {recettes.map(r => <option key={r.id} value={r.id}>{r.nom} ({r.prix_vente_ht}€)</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Événement lié</label>
            <select value={evtId} onChange={e => setEvtId(e.target.value)} className="w-full h-10 px-3 rounded-md border text-sm">
              <option value="">— aucun —</option>
              {evenements.map(e => <option key={e.id} value={e.id}>{e.nom} · {e.date_evenement}</option>)}
            </select>
          </div>
        </div>

        {!isEdit && (
          <>
            <div>
              <label className="text-sm font-bold block mb-1">Contexte additionnel (optionnel)</label>
              <Input value={contexte} onChange={e => setContexte(e.target.value)}
                placeholder="Ex: weekend, soirée musique, anniversaire client" />
            </div>
            <Button onClick={genererIA} disabled={generating} className="w-full bg-purple-600 hover:bg-purple-700 gap-1">
              <Sparkles className="h-4 w-4" />
              {generating ? 'Génération en cours…' : '✨ Générer le post avec Claude'}
            </Button>
          </>
        )}

        <div className="border-t pt-3 space-y-2">
          <div>
            <label className="text-sm font-bold block mb-1">Titre</label>
            <Input value={titre} onChange={e => setTitre(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Contenu *</label>
            <Textarea rows={6} value={contenu} onChange={e => setContenu(e.target.value)} maxLength={5000} />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Hashtags (espace-séparés, sans #)</label>
            <Input value={hashtagsStr} onChange={e => setHashtagsStr(e.target.value)}
              placeholder="restaurant pizza foodlover" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-bold block mb-1">CTA</label>
              <Input value={cta} onChange={e => setCta(e.target.value)} maxLength={100} placeholder="Réserver une table" />
            </div>
            <div>
              <label className="text-sm font-bold block mb-1">URL CTA</label>
              <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="/reserver" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-bold block mb-1">Image URL</label>
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="text-sm font-bold block mb-1">Date programmée</label>
              <Input type="datetime-local" value={datePrevue} onChange={e => setDatePrevue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Statut</label>
            <select value={statut} onChange={e => setStatut(e.target.value as PostMarketing['statut'])}
              className="w-full h-10 px-3 rounded-md border text-sm">
              {(Object.keys(STATUT_INFO) as PostMarketing['statut'][]).map(s => (
                <option key={s} value={s}>{STATUT_INFO[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
          <Button onClick={valider} disabled={isPending || !contenu.trim()} className="flex-[2]">
            {isPending ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer le post'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
