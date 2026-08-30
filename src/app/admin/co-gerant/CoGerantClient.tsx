'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Check, X, Loader2, ChefHat, Settings2, ArrowRight, Sun, RefreshCw, MessageSquare, Minus, Plus, ClipboardList, Zap, TrendingUp, PenLine, Send, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { type Proposition, type ContexteResto, type FamilleId, type PlatAOptimiser, type BrouillonMessage, FAMILLES } from '@/lib/co-gerant/types'
import { type BriefDuJour } from '@/lib/co-gerant/brief'
import { type Completude } from '@/lib/co-gerant/completude'
import { genererCarteAction, genererFamilleAction, ajusterPrixAction, validerPropositionAction, rejeterPropositionAction, affinerPropositionAction, setContexteAction, genererBriefAction, chatArnaudAction, auditerChantiersAction, lancerChantierAction, appliquerPrixRecetteAction, preparerBrouillonAction, envoyerMessageEquipeAction } from './actions'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const CHAMPS: Array<{ cle: keyof ContexteResto; label: string; ph: string }> = [
  { cle: 'cg_concept',       label: 'Ton concept',          ph: 'ex : brasserie-pizzeria conviviale' },
  { cle: 'cg_style_cuisine', label: 'Style de cuisine',     ph: 'ex : cuisine maison, du marché' },
  { cle: 'cg_gamme_prix',    label: 'Gamme de prix',        ph: 'ex : plat 12-18 €' },
  { cle: 'cg_objectif',      label: 'Ton objectif',         ph: 'ex : +20 % de CA, remplir le midi' },
  { cle: 'cg_specialites',   label: 'Spécialités / signatures', ph: 'ex : pizza truffe, tiramisu maison' },
]

function feuFoodCost(resume: string | null): string {
  const m = resume?.match(/food cost\s+(\d+)/i)
  const v = m ? Number(m[1]) : null
  if (v == null) return ''
  return v < 28 ? '🟢' : v <= 32 ? '🟠' : '🔴'
}

// Famille d'une proposition (pour grouper l'affichage) — déduite du type/résumé.
function familleDe(p: Proposition): { key: FamilleId; label: string; emoji: string; order: number } {
  if (p.action_type === 'create_boisson') return { key: 'bar', label: 'Bar & boissons', emoji: '🍷', order: 6 }
  const cat = (p.resume ?? '').split('·')[0].trim().toLowerCase()
  if (cat.startsWith('entrée') || cat.startsWith('entree')) return { key: 'entrees', label: 'Entrées', emoji: '🥗', order: 1 }
  if (cat.startsWith('pizza'))   return { key: 'pizzas',   label: 'Pizzas',   emoji: '🍕', order: 3 }
  if (cat.startsWith('snack'))   return { key: 'snacking', label: 'Snacking', emoji: '🥪', order: 4 }
  if (cat.startsWith('dessert')) return { key: 'desserts', label: 'Desserts', emoji: '🍰', order: 5 }
  return { key: 'plats', label: 'Plats', emoji: '🍽️', order: 2 }
}

type ActionPayload = { recette?: { prix_vente_ht?: number }; boisson?: { prix_vente_ht_verre?: number } }
function prixDe(p: Proposition): number {
  const ap = (p.action_payload ?? {}) as ActionPayload
  return p.action_type === 'create_boisson'
    ? Number(ap.boisson?.prix_vente_ht_verre) || 0
    : Number(ap.recette?.prix_vente_ht) || 0
}

type Finding = { id: string; urgence: string; titre: string; message: string | null; action_label: string | null; action_url: string | null }

// Domaines de chantiers → libellé + emoji pour le regroupement.
const DOMAINE_INFO: Record<string, { label: string; emoji: string }> = {
  stock:       { label: 'Stock',          emoji: '📦' },
  ingredients: { label: 'Ingrédients',    emoji: '🧺' },
  recettes:    { label: 'Recettes',       emoji: '📖' },
  food_cost:   { label: 'Food cost',      emoji: '💰' },
  bar:         { label: 'Bar & boissons', emoji: '🍷' },
  hygiene:     { label: 'Hygiène',        emoji: '🌡️' },
  rh:          { label: 'Équipe',         emoji: '👥' },
  finances:    { label: 'Finances',       emoji: '💶' },
  securite:    { label: 'Sécurité',       emoji: '🛡️' },
  clients:     { label: 'Clients',        emoji: '🫶' },
  legal:       { label: 'Légal',          emoji: '📋' },
  energie:     { label: 'Énergie',        emoji: '⚡' },
}
function domaineInfo(d: string) { return DOMAINE_INFO[d] ?? { label: d, emoji: '🔧' } }

// Libellé du bouton « lance » selon l'action automatique du chantier.
const CTA_CHANTIER: Record<string, string> = {
  preparer_reassort: 'Prépare les commandes',
  remplir_prix:      'Renseigne les prix',
  remplir_food_cost: 'Complète les recettes',
  generer_famille:   'Propose-moi ça',
}

export default function CoGerantClient({
  contexte, propositions, chantiers, platsAOptimiser, nbRecettes, brief, completude, findings,
  readOnly = false,
}: {
  contexte: ContexteResto
  propositions: Proposition[]
  chantiers: Proposition[]
  platsAOptimiser: PlatAOptimiser[]
  nbRecettes: number
  brief: BriefDuJour | null
  completude: Completude
  findings: Finding[]
  /** Lecture seule : on regarde comment une décision se construit, sans
   *  l'exécuter. Les server actions refuseraient de toute façon — masquer
   *  les boutons évite de proposer un geste qui finira en message d'erreur. */
  readOnly?: boolean
}) {
  const router = useRouter()
  // `pending` désactive déjà chaque bouton pendant un appel : on réutilise le
  // même levier plutôt que d'ajouter une condition sur chacun des quatorze.
  const verrouille = readOnly
  const [ctx, setCtx] = useState<Record<string, string>>(
    Object.fromEntries(CHAMPS.map(c => [c.cle, contexte[c.cle] ?? ''])),
  )
  const [nb, setNb] = useState(6)
  const [reglagesOuverts, setReglagesOuverts] = useState(!contexte.cg_concept)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [instr, setInstr] = useState<Record<string, string>>({})
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [carteProgress, setCarteProgress] = useState<{ running: boolean; doneIds: string[]; current: string | null }>({ running: false, doneIds: [], current: null })
  // Prix retenu par plat à optimiser (défaut = prix conseillé d'Arnaud)
  const [prixPlat, setPrixPlat] = useState<Record<string, number>>(() => Object.fromEntries(platsAOptimiser.map(p => [p.id, p.prixSuggere])))
  // Atelier message (mode C)
  const [msgDemande, setMsgDemande] = useState('')
  const [msgLoading, setMsgLoading] = useState(false)
  const [brouillon, setBrouillon] = useState<BrouillonMessage | null>(null)
  const [brouillonTexte, setBrouillonTexte] = useState('')
  const [brouillonCanal, setBrouillonCanal] = useState('tous')

  async function envoyer(texteArg?: string) {
    const texte = (texteArg ?? chatInput).trim()
    if (!texte || chatLoading) return
    const next: ChatMsg[] = [...chat, { role: 'user', content: texte }]
    setChat(next); setChatInput(''); setChatLoading(true)
    try {
      const r = await chatArnaudAction(next)
      setChat([...next, { role: 'assistant', content: r.reponse }])
      if (r.aAgi) router.refresh()
    } catch (e) {
      setChat([...next, { role: 'assistant', content: 'Erreur : ' + (e instanceof Error ? e.message : 'inconnue') }])
    } finally { setChatLoading(false) }
  }

  function sauverContexte() {
    startTransition(async () => {
      try { await setContexteAction(ctx); toast.success('Contexte enregistré — Arnaud te connaît mieux.') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      router.refresh()
    })
  }

  function genererCarte() {
    startTransition(async () => {
      try {
        const r = await genererCarteAction(nb)
        toast.success(`Arnaud a préparé ${r.propositionsCreees} plat${r.propositionsCreees > 1 ? 's' : ''}.`)
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      router.refresh()
    })
  }

  // La carte COMPLÈTE : on enchaîne chaque famille (1 requête courte chacune).
  async function genererCarteComplete() {
    if (carteProgress.running) return
    setCarteProgress({ running: true, doneIds: [], current: null })
    let total = 0
    for (const f of FAMILLES) {
      setCarteProgress(s => ({ ...s, current: f.label }))
      try { const r = await genererFamilleAction(f.id); total += r.items }
      catch (e) { toast.error(`${f.label} : ${e instanceof Error ? e.message : 'erreur'}`) }
      setCarteProgress(s => ({ ...s, doneIds: [...s.doneIds, f.id] }))
    }
    setCarteProgress({ running: false, doneIds: [], current: null })
    toast.success(`Ta carte complète est prête — ${total} proposition${total > 1 ? 's' : ''} à valider.`)
    router.refresh()
  }

  function genererBrief() {
    startTransition(async () => {
      try { await genererBriefAction(); toast.success('Ton brief est à jour.') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      router.refresh()
    })
  }

  function valider(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try { await validerPropositionAction(id); toast.success('Ajouté à ta carte ✅') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); router.refresh()
    })
  }
  function rejeter(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try { await rejeterPropositionAction(id); toast.success('Proposition écartée.') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); router.refresh()
    })
  }
  function affiner(id: string, texte: string) {
    if (!texte.trim()) return
    setBusyId(id)
    startTransition(async () => {
      try { const r = await affinerPropositionAction(id, texte); toast.success(`Arnaud : ${r.explication}`) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); setInstr(s => ({ ...s, [id]: '' })); router.refresh()
    })
  }
  function ajusterPrix(id: string, current: number, delta: number) {
    const np = Math.max(0, Math.round((current + delta) * 100) / 100)
    setBusyId(id)
    startTransition(async () => {
      try { const r = await ajusterPrixAction(id, np); toast.success(`Prix ${r.prix.toFixed(2)} € · food cost ${r.foodCost.toFixed(0)} %`) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); router.refresh()
    })
  }

  // ── Chantiers : Arnaud fait le tour du resto, puis lance ce que tu valides ──
  function auditerResto() {
    startTransition(async () => {
      try {
        const r = await auditerChantiersAction()
        toast.success(r.total > 0 ? `Arnaud a fait le tour — ${r.total} chantier${r.total > 1 ? 's' : ''} à voir.` : 'Tout est carré, rien à lancer pour l’instant.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      router.refresh()
    })
  }
  function lancerChantier(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try { const r = await lancerChantierAction(id); toast.success(`Arnaud : ${r.message}`) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); router.refresh()
    })
  }

  // ── Plats à optimiser : Arnaud applique un prix sur la VRAIE carte ──
  function setPrix(id: string, v: number) { setPrixPlat(s => ({ ...s, [id]: Math.max(0, Math.round(v * 100) / 100) })) }
  function appliquerPrix(id: string) {
    const prix = prixPlat[id]
    if (!prix || prix <= 0) { toast.error('Prix invalide'); return }
    setBusyId(id)
    startTransition(async () => {
      try { await appliquerPrixRecetteAction(id, prix); toast.success(`Prix appliqué : ${prix.toFixed(2)} € ✅`) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      setBusyId(null); router.refresh()
    })
  }

  // ── Atelier message (mode C) : il prépare, tu valides/envoies ──
  async function preparerMsg(demandeArg?: string) {
    const d = (demandeArg ?? msgDemande).trim()
    if (!d || msgLoading) return
    setMsgLoading(true)
    try {
      const b = await preparerBrouillonAction(d)
      setBrouillon(b); setBrouillonTexte(b.texte); setBrouillonCanal(b.canalSuggere)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
    finally { setMsgLoading(false) }
  }
  function envoyerEquipe() {
    const t = brouillonTexte.trim()
    if (!t) return
    startTransition(async () => {
      try { await envoyerMessageEquipeAction(t, brouillonCanal); toast.success('Message envoyé à l\'équipe ✅'); setBrouillon(null); setBrouillonTexte(''); setMsgDemande('') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
      router.refresh()
    })
  }
  async function copierBrouillon() {
    try { await navigator.clipboard.writeText(brouillonTexte); toast.success('Texte copié — à envoyer toi-même.') }
    catch { toast.error('Copie impossible — sélectionne le texte à la main.') }
  }

  // Regroupe les chantiers par domaine.
  const chantiersParDomaine = (() => {
    const m = new Map<string, Proposition[]>()
    for (const c of chantiers) { if (!m.has(c.domaine)) m.set(c.domaine, []); m.get(c.domaine)!.push(c) }
    return [...m.entries()]
  })()
  const URG_DOT: Record<string, string> = { rouge: 'bg-red-500', orange: 'bg-amber-500', jaune: 'bg-yellow-500', info: 'bg-blue-500', vert: 'bg-emerald-500' }

  // Regroupe les propositions par famille (ordre carte).
  const groupes = (() => {
    const m = new Map<string, { label: string; emoji: string; order: number; items: Proposition[] }>()
    for (const p of propositions) {
      const f = familleDe(p)
      if (!m.has(f.key)) m.set(f.key, { label: f.label, emoji: f.emoji, order: f.order, items: [] })
      m.get(f.key)!.items.push(p)
    }
    return [...m.values()].sort((a, b) => a.order - b.order)
  })()

  function CarteProposition({ p }: { p: Proposition }) {
    const conv = p.echanges ?? []
    const isDrink = p.action_type === 'create_boisson'
    const prix = prixDe(p)
    const titre = p.titre.replace(/^Ajouter « (.*) »$/, '$1')
    const busy = busyId === p.id && pending
    return (
      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
        <p className="font-bold text-zinc-900">{feuFoodCost(p.resume)} {titre}</p>
        {p.resume && <p className="text-xs text-zinc-500 mt-0.5">{p.resume}</p>}
        {p.details && <p className="text-sm text-zinc-600 mt-1.5 leading-snug whitespace-pre-line">{p.details}</p>}

        {/* Conversation (le peaufinage) */}
        {conv.length > 0 && (
          <div className="mt-3 space-y-1 border-l-2 border-emerald-100 pl-3">
            {conv.map((e, i) => (
              <p key={i} className={cn('text-xs leading-snug', e.role === 'arnaud' ? 'text-emerald-700' : 'text-zinc-500')}>
                <span className="font-bold">{e.role === 'arnaud' ? 'Arnaud' : 'Toi'} :</span> {e.texte}
              </p>
            ))}
          </div>
        )}

        {/* Prix à la hausse / à la baisse → food cost recalculé direct */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black uppercase tracking-wide text-zinc-400">Prix</span>
          <div className="inline-flex items-center gap-2">
            <button onClick={() => ajusterPrix(p.id, prix, -0.5)} disabled={pending || verrouille}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-zinc-100 text-zinc-700 active:scale-95 transition disabled:opacity-50">
              <Minus className="h-4 w-4" strokeWidth={3} />
            </button>
            <span className="min-w-[92px] text-center font-black tabular-nums text-zinc-900">
              {busy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <>{prix.toFixed(2)} €<span className="text-[11px] font-semibold text-zinc-400"> {isDrink ? '/verre' : 'HT'}</span></>}
            </span>
            <button onClick={() => ajusterPrix(p.id, prix, +0.5)} disabled={pending || verrouille}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-zinc-100 text-zinc-700 active:scale-95 transition disabled:opacity-50">
              <Plus className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
          <span className="text-[11px] text-zinc-400">monter le prix = food cost ↓</span>
        </div>

        {/* Affinage IA — uniquement pour les plats */}
        {!isDrink && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {['Moins cher', 'Plus copieux', 'Plus simple', 'Version végé'].map(chip => (
                <button key={chip} onClick={() => affiner(p.id, chip)} disabled={pending || verrouille}
                  className="h-8 px-2.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold active:scale-95 transition disabled:opacity-50">
                  {chip}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={instr[p.id] ?? ''}
                onChange={e => setInstr(s => ({ ...s, [p.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') affiner(p.id, instr[p.id] ?? '') }}
                placeholder="Dis à Arnaud quoi ajuster…"
                className="flex-1 h-10 px-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 focus:ring-2 focus:ring-zinc-900/15 outline-none text-sm"
              />
              <button onClick={() => affiner(p.id, instr[p.id] ?? '')} disabled={pending || verrouille}
                className="h-10 px-3.5 rounded-xl bg-zinc-900 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ajuster'}
              </button>
            </div>
          </div>
        )}

        {/* Valider / Rejeter */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100">
          <button onClick={() => valider(p.id)} disabled={pending || verrouille}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-emerald-600 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />} Valider
          </button>
          <button onClick={() => rejeter(p.id)} disabled={pending || verrouille}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white ring-1 ring-zinc-200 text-zinc-600 text-sm font-bold active:scale-95 transition disabled:opacity-50">
            <X className="h-4 w-4" strokeWidth={2.5} /> Non
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-5">
        {readOnly && (
          <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <strong>Lecture seule.</strong> Tu vois comment chaque décision est construite —
            le coût, la marge, le raisonnement — sans l&apos;exécuter. C&apos;est l&apos;écran
            qui apprend à arbitrer&nbsp;: lis les propositions et demande-toi ce que tu ferais,
            avant d&apos;en discuter.
          </p>
        )}
        {/* ☀️ Le mot d'Arnaud (pour toi) */}
        <section className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              <h2 className="font-black">Le mot d'Arnaud</h2>
            </div>
            <button onClick={genererBrief} disabled={pending || verrouille}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/20 text-white text-xs font-bold active:scale-95 transition disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {brief ? 'Rafraîchir' : 'Mon brief'}
            </button>
          </div>
          {brief ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-white/95"><span className="font-bold">Hier :</span> {brief.hier}</p>
              {brief.priorites.length > 0 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-white/80 mb-1">Tes priorités du jour</p>
                  <ol className="space-y-1">
                    {brief.priorites.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/25 text-[11px] font-black shrink-0">{i + 1}</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {brief.mot && <p className="text-sm italic text-white/90 pt-1">« {brief.mot} »</p>}
            </div>
          ) : (
            <p className="text-sm text-white/90 mt-2">Demande à Arnaud ton brief du jour : hier en 1 ligne + tes 3 priorités.</p>
          )}
        </section>

        {/* En-tête */}
        <header className="rounded-3xl bg-zinc-900 text-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/10 text-2xl shrink-0">🧑‍💼</span>
            <div className="min-w-0">
              <h1 className="font-black text-xl sm:text-2xl">Arnaud — ton co-gérant</h1>
              <p className="text-sm text-white/70">Il te propose, tu valides. {nbRecettes} plat{nbRecettes > 1 ? 's' : ''} à ta carte aujourd'hui.</p>
            </div>
          </div>
        </header>

        {/* ✅ Complétude — ton resto est prêt à X % */}
        <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-black text-zinc-900">Ton resto est prêt à {completude.score} %</h2>
              <p className="text-xs text-zinc-500">{completude.ok}/{completude.total} essentiels en place</p>
            </div>
            <span className={cn('text-3xl font-black tabular-nums shrink-0', completude.score >= 90 ? 'text-emerald-600' : completude.score >= 70 ? 'text-amber-600' : 'text-red-600')}>{completude.score}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', completude.score >= 90 ? 'bg-emerald-500' : completude.score >= 70 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${completude.score}%` }} />
          </div>
          {completude.manques.length === 0 ? (
            <p className="mt-3 text-sm font-bold text-emerald-700">✅ Tout est en place. Beau boulot.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">À compléter</p>
              {completude.manques.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{m.label}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{m.detail}</p>
                  </div>
                  {m.auto === 'carte' ? (
                    <span className="shrink-0 text-[11px] font-bold text-emerald-700">Arnaud peut le faire ↓</span>
                  ) : (
                    <Link href={m.cta_url} className="shrink-0 h-8 px-3 inline-flex items-center rounded-full bg-zinc-900 text-white text-xs font-bold active:scale-95 transition">Compléter</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 🔎 Ce qu'Arnaud a repéré (les 15 agents, dans sa voix) */}
        {findings.length > 0 && (
          <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
            <h2 className="font-black text-zinc-900 mb-2">🔎 Ce qu'Arnaud a repéré</h2>
            <div className="space-y-2.5">
              {findings.map(f => {
                const dot = f.urgence === 'rouge' ? 'bg-red-500' : f.urgence === 'orange' ? 'bg-amber-500' : f.urgence === 'jaune' ? 'bg-yellow-500' : 'bg-blue-500'
                return (
                  <div key={f.id} className="flex items-start gap-2.5">
                    <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', dot)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-zinc-900 leading-snug">{f.titre}</p>
                      {f.message && <p className="text-xs text-zinc-500 line-clamp-2 leading-snug">{f.message}</p>}
                    </div>
                    {f.action_url && (
                      <Link href={f.action_url} className="shrink-0 h-8 px-3 inline-flex items-center rounded-full bg-zinc-900 text-white text-xs font-bold active:scale-95 transition">{f.action_label || 'Voir'}</Link>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 🛠️ Les chantiers d'Arnaud — il fait le tour et te soumet quoi lancer */}
        <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-zinc-700" />
              <h2 className="font-black text-zinc-900">Les chantiers d'Arnaud</h2>
            </div>
            <button onClick={auditerResto} disabled={pending || verrouille}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-zinc-900 text-white text-xs font-bold active:scale-95 transition disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Fais le tour du resto
            </button>
          </div>
          <p className="text-sm text-zinc-500 mb-3">Ce qu'il propose d'attaquer, partout dans le resto. Tu valides, il le fait — ou tu l'ouvres pour t'en occuper.</p>

          {chantiers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100 p-6 text-center">
              <div className="text-3xl mb-1">✅</div>
              <p className="text-sm font-bold text-zinc-800">Rien en attente</p>
              <p className="text-xs text-zinc-500 mt-0.5">Clique « Fais le tour du resto » et Arnaud te remonte ce qu'il y a à faire.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chantiersParDomaine.map(([dom, items]) => {
                const info = domaineInfo(dom)
                return (
                  <div key={dom} className="space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-black text-zinc-700">
                      <span>{info.emoji}</span> {info.label}
                      <span className="text-xs font-bold text-zinc-400">({items.length})</span>
                    </h3>
                    {items.map(c => {
                      const busy = busyId === c.id && pending
                      const cta = c.action_type ? CTA_CHANTIER[c.action_type] : null
                      return (
                        <div key={c.id} className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100 p-4">
                          <div className="flex items-start gap-2.5">
                            <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', URG_DOT[c.urgence] ?? 'bg-blue-500')} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-zinc-900 leading-snug">{c.titre}</p>
                              {c.resume && <p className="text-xs font-semibold text-zinc-500">{c.resume}</p>}
                              {c.details && <p className="text-sm text-zinc-600 mt-1 leading-snug whitespace-pre-line">{c.details}</p>}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {cta && (
                              <button onClick={() => lancerChantier(c.id)} disabled={pending || verrouille}
                                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-emerald-600 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" strokeWidth={2.5} />} {cta}
                              </button>
                            )}
                            {c.cible_url && (
                              <Link href={c.cible_url}
                                className="inline-flex items-center gap-1 h-10 px-3.5 rounded-full bg-white ring-1 ring-zinc-200 text-zinc-700 text-sm font-bold active:scale-95 transition">
                                Ouvrir <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                              </Link>
                            )}
                            <button onClick={() => rejeter(c.id)} disabled={pending || verrouille}
                              className="inline-flex items-center gap-1 h-10 px-3.5 rounded-full text-zinc-500 text-sm font-bold active:scale-95 transition disabled:opacity-50">
                              <X className="h-4 w-4" strokeWidth={2.5} /> Plus tard
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 📈 Tes plats à optimiser — Arnaud agit sur la VRAIE carte */}
        {platsAOptimiser.length > 0 && (
          <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-5 w-5 text-zinc-700" />
              <h2 className="font-black text-zinc-900">Tes plats à optimiser</h2>
              <span className="text-xs font-bold text-zinc-400">({platsAOptimiser.length})</span>
            </div>
            <p className="text-sm text-zinc-500 mb-3">Food cost &gt; 32 %. Arnaud calcule le prix juste (cible 28 %). Tu ajustes, tu appliques — ça change le prix sur ta vraie carte.</p>
            <div className="space-y-2">
              {platsAOptimiser.map(p => {
                const busy = busyId === p.id && pending
                const choisi = prixPlat[p.id] ?? p.prixSuggere
                return (
                  <div key={p.id} className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 leading-snug">{p.nom}</p>
                        <p className="text-xs text-zinc-500">{p.categorie} · coût matière {p.coutPortion.toFixed(2)} €</p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-red-600 tabular-nums">{p.fcActuel.toFixed(0)} %</span>
                    </div>
                    <p className="text-sm text-zinc-600 mt-2 leading-snug">
                      Aujourd'hui <span className="font-bold">{p.prixActuel.toFixed(2)} €</span> ({p.fcActuel.toFixed(0)} %).{' '}
                      Arnaud conseille <span className="font-bold text-emerald-700">{p.prixSuggere.toFixed(2)} €</span> → food cost {p.fcSuggere.toFixed(0)} %.
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => setPrix(p.id, choisi - 0.5)} disabled={pending || verrouille}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 text-zinc-700 active:scale-95 transition disabled:opacity-50">
                          <Minus className="h-4 w-4" strokeWidth={3} />
                        </button>
                        <span className="min-w-[84px] text-center font-black tabular-nums text-zinc-900">{choisi.toFixed(2)} €</span>
                        <button onClick={() => setPrix(p.id, choisi + 0.5)} disabled={pending || verrouille}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 text-zinc-700 active:scale-95 transition disabled:opacity-50">
                          <Plus className="h-4 w-4" strokeWidth={3} />
                        </button>
                      </div>
                      <button onClick={() => appliquerPrix(p.id)} disabled={pending || verrouille}
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-emerald-600 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />} Appliquer {choisi.toFixed(2)} €
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 💬 Parle à Arnaud — il agit */}
        <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-5 w-5 text-zinc-700" />
            <h2 className="font-black text-zinc-900">Parle à Arnaud</h2>
          </div>
          {chat.length === 0 ? (
            <p className="text-sm text-zinc-500 mb-3">Dis-lui quoi faire — il agit. Ex&nbsp;: « remplis les food cost manquants », « refais ma carte », « où en est mon resto ? »</p>
          ) : (
            <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
              {chat.map((m, i) => (
                <div key={i} className={cn('text-sm rounded-2xl px-3 py-2 max-w-[85%] whitespace-pre-line', m.role === 'user' ? 'bg-zinc-900 text-white ml-auto' : 'bg-zinc-100 text-zinc-800')}>
                  {m.content}
                </div>
              ))}
              {chatLoading && (
                <div className="text-sm rounded-2xl px-3 py-2 bg-zinc-100 text-zinc-500 inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Arnaud réfléchit…
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {['Fais le réassort stock', 'Ajoute les prix manquants', 'Remplis les food cost', 'Refais ma carte', 'Où en est mon resto ?', "Dis bravo à l'équipe"].map(c => (
              <button key={c} onClick={() => envoyer(c)} disabled={chatLoading}
                className="h-8 px-2.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold active:scale-95 transition disabled:opacity-50">{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') envoyer() }}
              placeholder="Écris à Arnaud…"
              className="flex-1 h-11 px-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 focus:ring-2 focus:ring-zinc-900/15 outline-none text-base" />
            <button onClick={() => envoyer()} disabled={chatLoading}
              className="h-11 px-4 rounded-xl bg-zinc-900 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">
            Tu veux garder l&apos;historique de tes conversations ?{' '}
            <a href="/admin/assistant" className="text-zinc-700 underline font-semibold">Ouvrir l&apos;Assistant IA (chat complet) →</a>
          </p>
        </section>

        {/* ✍️ Messages à préparer — mode C : il prépare, tu valides/envoies */}
        <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <PenLine className="h-5 w-5 text-zinc-700" />
            <h2 className="font-black text-zinc-900">Messages à préparer</h2>
          </div>
          <p className="text-sm text-zinc-500 mb-3">Le sensible : Arnaud rédige, tu relis, tu envoies. Ex&nbsp;: « préviens l'équipe qu'on ferme mardi », « réponds à l'avis 2★ », « relance le fournisseur ».</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["Préviens l'équipe d'un changement d'horaire", 'Réponds à un avis client négatif', 'Relance un fournisseur en retard', "Mot d'encouragement à l'équipe"].map(c => (
              <button key={c} onClick={() => { setMsgDemande(c); preparerMsg(c) }} disabled={msgLoading}
                className="h-8 px-2.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold active:scale-95 transition disabled:opacity-50">{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input value={msgDemande} onChange={e => setMsgDemande(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') preparerMsg() }}
              placeholder="De quoi as-tu besoin&nbsp;?"
              className="flex-1 h-11 px-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 focus:ring-2 focus:ring-zinc-900/15 outline-none text-base" />
            <button onClick={() => preparerMsg()} disabled={msgLoading}
              className="h-11 px-4 rounded-xl bg-zinc-900 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
              {msgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Prépare'}
            </button>
          </div>
          {brouillon && (
            <div className="mt-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400 mb-1">Brouillon d'Arnaud — relis et ajuste</p>
              <textarea value={brouillonTexte} onChange={e => setBrouillonTexte(e.target.value)} rows={5}
                className="w-full rounded-xl bg-white ring-1 ring-zinc-200 p-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15 resize-y" />
              {brouillon.conseil && <p className="text-xs text-zinc-500 mt-1">💡 {brouillon.conseil}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {brouillon.interne ? (
                  <>
                    <select value={brouillonCanal} onChange={e => setBrouillonCanal(e.target.value)}
                      className="h-10 px-3 rounded-xl bg-white ring-1 ring-zinc-200 text-sm font-semibold outline-none">
                      <option value="tous">Toute l'équipe</option>
                      <option value="cuisine">Cuisine</option>
                      <option value="bar">Bar</option>
                      <option value="salle">Salle</option>
                      <option value="admin">Direction</option>
                    </select>
                    <button onClick={envoyerEquipe} disabled={pending || verrouille}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-emerald-600 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
                      <Send className="h-4 w-4" strokeWidth={2.5} /> Envoyer à l'équipe
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-amber-700">Message externe — à envoyer toi-même.</span>
                )}
                <button onClick={copierBrouillon}
                  className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white ring-1 ring-zinc-200 text-zinc-700 text-sm font-bold active:scale-95 transition">
                  <Copy className="h-4 w-4" strokeWidth={2.5} /> Copier
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Contexte (l'ADN qui guide Arnaud) */}
        <section className="rounded-3xl bg-white ring-1 ring-zinc-200 overflow-hidden">
          <button onClick={() => setReglagesOuverts(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left active:bg-zinc-50">
            <Settings2 className="h-4 w-4 text-zinc-500" />
            <span className="font-bold text-sm flex-1">Ton resto en bref {contexte.cg_concept ? '' : '· à remplir'}</span>
            <span className="text-xs text-zinc-400">{reglagesOuverts ? 'masquer' : 'modifier'}</span>
          </button>
          {reglagesOuverts && (
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
              {CHAMPS.map(c => (
                <label key={c.cle} className="block">
                  <span className="text-xs font-bold text-zinc-600">{c.label}</span>
                  <input
                    value={ctx[c.cle] ?? ''}
                    onChange={e => setCtx(s => ({ ...s, [c.cle]: e.target.value }))}
                    placeholder={c.ph}
                    className="mt-1 w-full h-11 px-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 focus:ring-2 focus:ring-zinc-900/20 outline-none text-base"
                  />
                </label>
              ))}
              <button onClick={sauverContexte} disabled={pending || verrouille}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-zinc-900 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
              </button>
            </div>
          )}
        </section>

        {/* Bâtir la carte complète avec Arnaud */}
        <section className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <ChefHat className="h-5 w-5" />
            <h2 className="font-black">Bâtir ta carte avec Arnaud</h2>
          </div>
          <p className="text-sm text-white/85 mb-3">Il te bâtit une carte complète — entrées, plats, pizzas, snacking, desserts, bar — food cost calculé sur chaque ligne. Tu valides ce que tu veux.</p>

          <button onClick={genererCarteComplete} disabled={pending || carteProgress.running}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-white text-emerald-700 font-black active:scale-95 transition disabled:opacity-60">
            {carteProgress.running
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Arnaud bâtit {carteProgress.current ?? '…'}…</>
              : <><Sparkles className="h-5 w-5" /> Génère ma carte complète</>}
          </button>

          {carteProgress.running && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {FAMILLES.map(f => {
                const done = carteProgress.doneIds.includes(f.id)
                const current = carteProgress.current === f.label && !done
                return (
                  <span key={f.id} className={cn('inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-bold',
                    done ? 'bg-white/90 text-emerald-700' : current ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70')}>
                    {done ? <Check className="h-3 w-3" strokeWidth={3} /> : current ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {f.emoji} {f.label}
                  </span>
                )
              })}
            </div>
          )}

          {/* Génération rapide d'une rubrique seule */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/20">
            <label className="text-sm text-white/90">Ou juste</label>
            <input type="number" min={1} max={10} value={nb}
              onChange={e => setNb(Number(e.target.value))}
              className="w-14 h-10 px-2 rounded-xl text-zinc-900 text-center text-base font-bold outline-none" />
            <button onClick={genererCarte} disabled={pending || carteProgress.running}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-full bg-white/15 text-white font-bold text-sm active:scale-95 transition disabled:opacity-60">
              {pending && !carteProgress.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} plats vite fait
            </button>
          </div>
        </section>

        {/* Les propositions, groupées par famille */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500">À valider ({propositions.length})</h2>
            {nbRecettes > 0 && (
              <Link href="/admin/recettes" className="text-[11px] font-bold text-zinc-500 inline-flex items-center gap-0.5">
                Voir ma carte <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </Link>
            )}
          </div>

          {propositions.length === 0 ? (
            <div className="rounded-3xl bg-white ring-1 ring-zinc-200 p-8 text-center">
              <div className="text-4xl mb-2">👨‍🍳</div>
              <p className="text-sm font-bold text-zinc-800">Aucune proposition en attente</p>
              <p className="text-xs text-zinc-500 mt-1">Clique sur « Génère ma carte complète » et Arnaud te bâtit toute la carte.</p>
            </div>
          ) : (
            groupes.map(g => (
              <div key={g.label} className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-black text-zinc-700 pt-1">
                  <span>{g.emoji}</span> {g.label}
                  <span className="text-xs font-bold text-zinc-400">({g.items.length})</span>
                </h3>
                <div className="space-y-2">
                  {g.items.map(p => <CarteProposition key={p.id} p={p} />)}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  )
}
