'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  type Entree, type Humeur, type Analyses,
  HUMEUR_INFO, fmtPrix, fmtDate, fmtDateCourt,
} from '@/lib/journal'
import { creerEntree, updateEntree, supprimerEntree } from './actions'

export default function JournalClient({
  entrees, employes, analyses,
}: {
  entrees: Entree[]
  employes: { id: string; prenom: string; nom: string }[]
  analyses: Analyses
}) {
  const [search, setSearch] = useState('')
  const [filtreHumeur, setFiltreHumeur] = useState<Humeur | ''>('')
  const [showForm, setShowForm] = useState<Entree | true | null>(null)
  const [openId, setOpenId] = useState<string | null>(entrees[0]?.id ?? null)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entrees.filter(e => {
      if (filtreHumeur && e.humeur !== filtreHumeur) return false
      if (q && !`${e.titre ?? ''} ${e.contenu} ${e.tags.join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [entrees, search, filtreHumeur])

  const courante = entrees.find(e => e.id === openId)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold whitespace-nowrap">← Accueil</Link>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xl shadow-lg shadow-amber-500/30 shrink-0">📔</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Journal de bord (6 mois)</p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Journal</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Entrées" value={String(analyses.total)} />
            <KPI label="Score moyen" value={`${analyses.score_moyen}/5`} accent={analyses.score_moyen >= 3.5 ? 'vert' : analyses.score_moyen >= 2.5 ? 'zinc' : 'rouge'} />
            <KPI label="Tendance" value={analyses.tendance === 'amelioration' ? '📈 Mieux' : analyses.tendance === 'degradation' ? '📉 Moins bien' : analyses.tendance === 'stable' ? '➡️ Stable' : '— Inconnu'}
              accent={analyses.tendance === 'amelioration' ? 'vert' : analyses.tendance === 'degradation' ? 'rouge' : 'zinc'} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Analyses */}
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-3">📊 Analyses corrélations 6 mois</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Répartition humeurs</p>
              <ul className="space-y-1">
                {analyses.par_humeur.map(h => {
                  const i = HUMEUR_INFO[h.humeur]
                  return (
                    <li key={h.humeur} className="flex items-center justify-between text-xs">
                      <span>{i.emoji} {i.label}</span>
                      <span className="tabular-nums"><b>{h.nb}</b> ({h.pct.toFixed(0)}%)</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">CA moyen par humeur</p>
              <ul className="space-y-1">
                {analyses.ca_moyen_par_humeur.map(h => {
                  const i = HUMEUR_INFO[h.humeur]
                  return (
                    <li key={h.humeur} className="flex items-center justify-between text-xs">
                      <span>{i.emoji} {i.label}</span>
                      <span className="tabular-nums font-bold">{fmtPrix(h.ca_moyen)}</span>
                    </li>
                  )
                })}
                {analyses.ca_moyen_par_humeur.length === 0 && <li className="text-xs text-zinc-400 italic">Pas de données CA snapshotées</li>}
              </ul>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Top tags</p>
              <div className="flex flex-wrap gap-1">
                {analyses.top_tags.length === 0 ? (
                  <span className="text-xs text-zinc-400 italic">Aucun tag utilisé</span>
                ) : analyses.top_tags.map(t => (
                  <span key={t.tag} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200">
                    #{t.tag} <b className="ml-1 text-zinc-600">{t.nb}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Layout : liste à gauche, détail à droite */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <aside className="rounded-lg border border-zinc-200 bg-white">
            <div className="p-3 border-b border-zinc-200 space-y-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher titre, contenu, tag…"
                className="w-full h-10 px-3 rounded-md border border-zinc-300 text-sm" />
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setFiltreHumeur('')} className={cn(
                  'px-2 h-7 rounded-full text-[10px] font-bold border',
                  filtreHumeur === '' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300'
                )}>Toutes</button>
                {(Object.keys(HUMEUR_INFO) as Humeur[]).map(h => {
                  const i = HUMEUR_INFO[h]
                  return (
                    <button key={h} onClick={() => setFiltreHumeur(filtreHumeur === h ? '' : h)} className={cn(
                      'px-2 h-7 rounded-full text-[10px] font-bold border',
                      filtreHumeur === h ? i.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200'
                    )} title={i.label}>{i.emoji}</button>
                  )
                })}
              </div>
              <button onClick={() => setShowForm(true)} className="w-full min-h-[40px] rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle entrée</button>
            </div>
            <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-zinc-400">{entrees.length === 0 ? 'Aucune entrée. Crée la première !' : 'Aucun résultat.'}</li>
              ) : filtered.map(e => {
                const info = HUMEUR_INFO[e.humeur]
                const isOpen = openId === e.id
                return (
                  <li key={e.id}>
                    <button onClick={() => setOpenId(e.id)} className={cn(
                      'w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors',
                      isOpen && 'bg-blue-50 border-l-4 border-blue-500'
                    )}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span>{info.emoji}</span>
                        <span className="text-[11px] text-zinc-500 capitalize">{fmtDateCourt(e.date_entree)}</span>
                      </div>
                      <p className="font-bold text-sm truncate">{e.titre ?? '(sans titre)'}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{e.contenu.slice(0, 80)}</p>
                      {e.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {e.tags.slice(0, 3).map(t => <span key={t} className="text-[9px] px-1 rounded bg-zinc-100 text-zinc-600">#{t}</span>)}
                          {e.tags.length > 3 && <span className="text-[9px] text-zinc-400">+{e.tags.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Détail */}
          <div className="rounded-lg border border-zinc-200 bg-white">
            {courante ? (
              <DetailEntree entree={courante} onEdit={() => setShowForm(courante)} onError={flashKo} onOk={flashOk} />
            ) : (
              <p className="px-4 py-12 text-center text-zinc-400">Sélectionne une entrée à gauche, ou crée-en une.</p>
            )}
          </div>
        </div>
      </main>

      {showForm && (
        <EntreeModal entree={showForm === true ? null : showForm} employes={employes}
          onClose={() => setShowForm(null)} onError={flashKo}
          onSuccess={(msg) => { setShowForm(null); flashOk(msg) }} />
      )}

      {erreur && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 cursor-pointer" onClick={() => setErreur('')}>⚠️ {erreur}</div>}
      {success && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">✓ {success}</div>}
    </div>
  )
}

function KPI({ label, value, accent = 'zinc' }: { label: string; value: string; accent?: 'zinc' | 'vert' | 'rouge' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    vert: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

function DetailEntree({ entree, onEdit, onError, onOk }: { entree: Entree; onEdit: () => void; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const info = HUMEUR_INFO[entree.humeur]
  const router = useRouter()
  return (
    <article>
      <header className="px-5 py-4 border-b border-zinc-200">
        <p className="text-xs uppercase tracking-wider text-zinc-500 capitalize">{fmtDate(entree.date_entree)}</p>
        <h2 className="text-2xl font-bold mt-1">{entree.titre ?? '(sans titre)'}</h2>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
          {entree.meteo_snap && <span className="text-xs text-zinc-600">🌤️ {entree.meteo_snap}</span>}
          {entree.ca_jour_snap !== null && entree.ca_jour_snap > 0 && <span className="text-xs text-zinc-600 tabular-nums">💶 {fmtPrix(entree.ca_jour_snap)}</span>}
          {entree.nb_couverts_snap !== null && entree.nb_couverts_snap > 0 && <span className="text-xs text-zinc-600 tabular-nums">🍽️ {entree.nb_couverts_snap} couverts</span>}
          {entree.redacteur_nom && <span className="text-[11px] text-zinc-500">par {entree.redacteur_nom}</span>}
        </div>
      </header>
      <div className="p-5 space-y-4">
        <div className="text-sm whitespace-pre-line">{entree.contenu}</div>

        {entree.faits_marquants && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-1">⭐ Faits marquants</p>
            <p className="text-sm whitespace-pre-line">{entree.faits_marquants}</p>
          </div>
        )}

        {entree.photos_urls.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">📷 Photos</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {entree.photos_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener" className="block rounded-md border border-zinc-200 overflow-hidden hover:border-zinc-400">
                  <img src={url} alt={`Photo ${i+1}`} className="w-full h-32 object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {entree.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entree.tags.map(t => <span key={t} className="text-xs px-2 py-1 rounded-full bg-zinc-100 border border-zinc-200">#{t}</span>)}
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t border-zinc-200">
          <button onClick={onEdit} className="text-xs h-9 px-3 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">✏️ Modifier</button>
          <button onClick={async () => {
            if (!confirm('Supprimer définitivement cette entrée ?')) return
            try { await supprimerEntree(entree.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
          }} className="text-xs h-9 px-3 text-zinc-500 hover:text-red-700">🗑 Supprimer</button>
        </div>
      </div>
    </article>
  )
}

function EntreeModal({ entree, employes, onClose, onError, onSuccess }: { entree: Entree | null; employes: { id: string; prenom: string; nom: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const isEdit = !!entree
  const [date, setDate] = useState(entree?.date_entree ?? new Date().toISOString().slice(0, 10))
  const [titre, setTitre] = useState(entree?.titre ?? '')
  const [contenu, setContenu] = useState(entree?.contenu ?? '')
  const [humeur, setHumeur] = useState<Humeur>(entree?.humeur ?? 'normale')
  const [photos, setPhotos] = useState(entree?.photos_urls.join('\n') ?? '')
  const [tags, setTags] = useState(entree?.tags.join(', ') ?? '')
  const [faits, setFaits] = useState(entree?.faits_marquants ?? '')
  const [redactId, setRedactId] = useState(entree?.redacteur_id ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!contenu.trim()) { onError(new Error('Contenu obligatoire')); return }
    startTransition(async () => {
      try {
        const payload = {
          date_entree: date,
          titre: titre.trim() || null,
          contenu: contenu.trim(),
          humeur,
          photos_urls: photos.split('\n').map(s => s.trim()).filter(Boolean),
          tags: tags.split(',').map(s => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean),
          faits_marquants: faits.trim() || null,
          redacteur_id: redactId || null,
        }
        if (isEdit && entree) await updateEntree({ ...payload, id: entree.id })
        else await creerEntree(payload)
        onSuccess(isEdit ? 'Entrée mise à jour' : 'Entrée créée (météo + CA snapshotés auto)')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Modifier l\'entrée' : 'Nouvelle entrée du journal'}</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
            <Field label="Rédacteur">
              <select value={redactId} onChange={e => setRedactId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
                <option value="">— Aucun —</option>
                {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Titre (optionnel)"><input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Service midi compliqué" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="Humeur de la journée">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(HUMEUR_INFO) as Humeur[]).map(h => {
                const i = HUMEUR_INFO[h]
                return (
                  <button key={h} onClick={() => setHumeur(h)} className={cn(
                    'flex-1 min-w-[110px] min-h-[60px] rounded-md border-2 text-sm font-bold',
                    humeur === h ? i.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
                  )}>
                    <p className="text-2xl">{i.emoji}</p>
                    <p className="text-[10px]">{i.label}</p>
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Contenu"><textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={8} placeholder="Comment s'est passée la journée ? Ce qui a marché, ce qui a coincé, les idées pour demain..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
          <Field label="Faits marquants (optionnel)"><textarea value={faits} onChange={e => setFaits(e.target.value)} rows={2} placeholder="Événement particulier, incident, succès..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
          <Field label="Tags (séparés par virgule)"><input value={tags} onChange={e => setTags(e.target.value)} placeholder="cuisine, équipe, fournisseur..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="URLs photos (une par ligne, optionnel)"><textarea value={photos} onChange={e => setPhotos(e.target.value)} rows={3} placeholder="https://drive.google.com/..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-xs font-mono" /></Field>
          {!isEdit && (
            <p className="text-[11px] text-zinc-500 italic">ℹ Le CA du jour, nb de couverts et la météo seront snapshotés automatiquement à la création.</p>
          )}
          <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
            <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
            <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : (isEdit ? '✓ Mettre à jour' : '+ Créer')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
