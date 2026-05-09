'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { type CommandeService, fmtPrix } from '@/lib/service'
import { CONSOMMATION_INFO } from '@/lib/tva'
import { encaisserCommande, setConsommationCommande } from '../actions'
import { searchClients, creerClientRapide } from '@/app/admin/clients/actions'
import { NIVEAU_INFO, type NiveauFidelite } from '@/lib/clients'

type ClientChoisi = {
  id: string
  prenom: string | null
  nom: string
  email: string | null
  telephone: string | null
  niveau_fidelite: string
  nb_visites: number
  points_fidelite: number
}

type Methode = 'especes' | 'carte' | 'ticket_resto' | 'virement' | 'autre'
type ModePaiement = 'simple' | 'mixte' | 'parts_egales' | 'personnalise'

const METHODES: Array<{ key: Methode; label: string; emoji: string }> = [
  { key: 'especes',      label: 'Espèces',      emoji: '💵' },
  { key: 'carte',        label: 'Carte',        emoji: '💳' },
  { key: 'ticket_resto', label: 'Ticket resto', emoji: '🎫' },
  { key: 'virement',     label: 'Virement',     emoji: '🏦' },
]

type LignePaiement = {
  key: string
  methode: Methode
  montant: number
  pourboire: number
  reference: string
}

export default function EncaissementModal({
  commande, serveurId, employes, onClose, onSuccess,
}: {
  commande: CommandeService
  serveurId: string
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  onClose: () => void
  onSuccess: () => void
}) {
  const router = useRouter()
  const totalHT = useMemo(
    () => commande.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0),
    [commande.articles]
  )
  // Total TTC = montant calculé serveur (TVA réelle multi-taux). Fallback 1.10 si pas encore migré.
  const totalTTC = Number(commande.montant_total_ttc ?? totalHT * 1.10)
  const tvaTotal = Number(commande.tva_total ?? totalTTC - totalHT)
  const consommation = commande.consommation ?? 'sur_place'

  const [conso, setConso] = useState<'sur_place' | 'emporter'>(consommation)
  const [pendingConso, setPendingConso] = useState(false)

  async function basculerConso(c: 'sur_place' | 'emporter') {
    if (c === conso) return
    setPendingConso(true)
    try {
      await setConsommationCommande({ commande_id: commande.id, consommation: c })
      setConso(c)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPendingConso(false)
    }
  }

  const [mode, setMode] = useState<ModePaiement>('simple')
  const [serveurChoisi, setServeurChoisi] = useState(serveurId)
  const [paiements, setPaiements] = useState<LignePaiement[]>([
    { key: 'p1', methode: 'carte', montant: totalTTC, pourboire: 0, reference: '' },
  ])
  const [parts, setParts] = useState(2)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  // ─── Sélection client (fidélité) ───
  const [client, setClient] = useState<ClientChoisi | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ClientChoisi[]>([])
  const [searchPending, startSearchTransition] = useTransition()
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [pointsCredites, setPointsCredites] = useState<number | null>(null)

  // Mode création client rapide
  const [showCreate, setShowCreate] = useState(false)
  const [createPrenom, setCreatePrenom] = useState('')
  const [createNom, setCreateNom] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createTel, setCreateTel] = useState('')
  const [createPending, startCreateTransition] = useTransition()
  const [createError, setCreateError] = useState('')

  function ouvrirCreationClient() {
    // Pré-remplit le nom depuis la query si plausible
    const q = searchQuery.trim()
    if (q) {
      const parts = q.split(/\s+/)
      if (parts.length >= 2) { setCreatePrenom(parts[0]); setCreateNom(parts.slice(1).join(' ')) }
      else { setCreateNom(q) }
    } else {
      setCreatePrenom(''); setCreateNom('')
    }
    setCreateEmail(''); setCreateTel(''); setCreateError('')
    setShowCreate(true)
    setShowSearchResults(false)
  }

  function annulerCreation() {
    setShowCreate(false)
    setCreateError('')
  }

  function validerCreation() {
    if (!createNom.trim()) { setCreateError('Nom obligatoire'); return }
    setCreateError('')
    startCreateTransition(async () => {
      try {
        const c = await creerClientRapide({
          prenom: createPrenom.trim() || null,
          nom: createNom.trim(),
          email: createEmail.trim() || null,
          telephone: createTel.trim() || null,
        })
        setClient({
          id: c.id, prenom: c.prenom, nom: c.nom,
          email: c.email, telephone: c.telephone,
          niveau_fidelite: c.niveau_fidelite,
          nb_visites: c.nb_visites,
          points_fidelite: c.points_fidelite,
        })
        setShowCreate(false)
        setSearchQuery('')
        setSearchResults([])
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  function rechercherClient(q: string) {
    setSearchQuery(q)
    if (q.trim().length < 2) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }
    setShowSearchResults(true)
    startSearchTransition(async () => {
      try {
        const r = await searchClients(q)
        setSearchResults(r)
      } catch { setSearchResults([]) }
    })
  }

  const totalPaye = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0)
  const totalTips = paiements.reduce((s, p) => s + (Number(p.pourboire) || 0), 0)
  const ecart = Math.round((totalPaye - totalTTC) * 100) / 100

  function setPaiementsForMode(m: ModePaiement) {
    setMode(m)
    setErreur('')
    if (m === 'simple') {
      setPaiements([{ key: 'p1', methode: 'carte', montant: totalTTC, pourboire: 0, reference: '' }])
    } else if (m === 'mixte') {
      setPaiements([
        { key: 'p1', methode: 'especes', montant: 0, pourboire: 0, reference: '' },
        { key: 'p2', methode: 'carte',   montant: totalTTC, pourboire: 0, reference: '' },
      ])
    } else if (m === 'parts_egales') {
      const part = Math.round((totalTTC / parts) * 100) / 100
      setPaiements(
        Array.from({ length: parts }, (_, i) => ({
          key: 'p' + (i + 1),
          methode: 'carte' as Methode,
          montant: i === parts - 1 ? Math.round((totalTTC - part * (parts - 1)) * 100) / 100 : part,
          pourboire: 0,
          reference: '',
        }))
      )
    } else if (m === 'personnalise') {
      setPaiements([
        { key: 'p1', methode: 'carte', montant: 0, pourboire: 0, reference: '' },
      ])
    }
  }

  // Recalc parts égales quand `parts` change
  function changeNbParts(n: number) {
    setParts(n)
    if (mode === 'parts_egales') {
      const part = Math.round((totalTTC / n) * 100) / 100
      setPaiements(
        Array.from({ length: n }, (_, i) => ({
          key: 'p' + (i + 1),
          methode: (paiements[i]?.methode ?? 'carte') as Methode,
          montant: i === n - 1 ? Math.round((totalTTC - part * (n - 1)) * 100) / 100 : part,
          pourboire: paiements[i]?.pourboire ?? 0,
          reference: paiements[i]?.reference ?? '',
        }))
      )
    }
  }

  function setPaiement(key: string, patch: Partial<LignePaiement>) {
    setPaiements(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }
  function ajouterPaiement() {
    setPaiements(prev => [...prev, { key: 'p' + Math.random().toString(36).slice(2, 6), methode: 'carte', montant: 0, pourboire: 0, reference: '' }])
  }
  function supprimerPaiement(key: string) {
    setPaiements(prev => prev.filter(p => p.key !== key))
  }

  function valider() {
    if (Math.abs(ecart) > 0.05) {
      setErreur(ecart > 0 ? `Trop perçu de ${fmtPrix(ecart)}` : `Manque ${fmtPrix(-ecart)} pour atteindre ${fmtPrix(totalTTC)}`)
      return
    }
    if (paiements.some(p => p.montant <= 0)) {
      setErreur('Toutes les lignes de paiement doivent avoir un montant > 0')
      return
    }
    setErreur('')
    startTransition(async () => {
      try {
        const r = await encaisserCommande({
          commande_id: commande.id,
          serveur_id: serveurChoisi || null,
          client_id: client?.id ?? null,
          paiements: paiements.map(p => ({
            methode: p.methode,
            montant: Number(p.montant),
            pourboire: Number(p.pourboire) || 0,
            reference: p.reference || null,
          })),
        })
        // Affiche bref retour fidélité avant fermeture
        if (r?.fidelite && r.fidelite.points > 0) {
          setPointsCredites(r.fidelite.points)
          setTimeout(onSuccess, 1500)
        } else {
          onSuccess()
        }
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !isPending && onClose()}>
      <div
        className="bg-zinc-900 text-zinc-100 w-full sm:max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Encaissement</p>
            <h2 className="text-2xl font-bold">
              {commande.numero_table ? `Table ${commande.numero_table}` : commande.numero}
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5">{commande.articles.length} article{commande.articles.length > 1 ? 's' : ''} · Total à encaisser : <b className="text-zinc-100">{fmtPrix(totalTTC)}</b></p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400">×</button>
        </div>

        {/* Toggle Sur place / À emporter (recalcule TVA) */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-zinc-400">
            <span className="uppercase tracking-wider font-bold">Mode consommation</span>
            <span className="block text-[10px] text-zinc-500">Recalcule la TVA · alcool toujours à 20%</span>
          </div>
          <div className="flex gap-1">
            {(['sur_place', 'emporter'] as const).map(c => {
              const info = CONSOMMATION_INFO[c]
              const active = conso === c
              return (
                <button
                  key={c}
                  onClick={() => basculerConso(c)}
                  disabled={pendingConso}
                  className={cn(
                    'px-3 py-2 rounded-md text-xs font-bold border transition-colors min-h-[40px]',
                    active
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700',
                    pendingConso && 'opacity-50',
                  )}
                >
                  {info.emoji} {info.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Récap TVA mini */}
        <div className="px-5 py-2 border-b border-zinc-800 grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <div><span className="text-zinc-500">HT </span><span className="text-zinc-200 font-bold tabular-nums">{fmtPrix(totalHT)}</span></div>
          <div><span className="text-zinc-500">TVA </span><span className="text-zinc-200 font-bold tabular-nums">{fmtPrix(tvaTotal)}</span></div>
          <div className="text-right"><span className="text-zinc-500">TTC </span><span className="text-emerald-400 font-bold tabular-nums">{fmtPrix(totalTTC)}</span></div>
        </div>

        {/* Sélection mode */}
        <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap gap-1.5">
          <ModeBtn active={mode === 'simple'} onClick={() => setPaiementsForMode('simple')}>1 — Simple</ModeBtn>
          <ModeBtn active={mode === 'mixte'} onClick={() => setPaiementsForMode('mixte')}>2 — Mixte</ModeBtn>
          <ModeBtn active={mode === 'parts_egales'} onClick={() => setPaiementsForMode('parts_egales')}>3 — Parts égales</ModeBtn>
          <ModeBtn active={mode === 'personnalise'} onClick={() => setPaiementsForMode('personnalise')}>4 — Perso</ModeBtn>
        </div>

        {/* Mode parts égales : sélecteur de nombre */}
        {mode === 'parts_egales' && (
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-center gap-3">
            <span className="text-sm">Nombre de personnes :</span>
            <button
              onClick={() => changeNbParts(Math.max(2, parts - 1))}
              className="min-h-[44px] min-w-[44px] rounded-md bg-zinc-800 hover:bg-zinc-700 text-xl font-bold"
            >−</button>
            <span className="text-2xl font-bold w-12 text-center tabular-nums">{parts}</span>
            <button
              onClick={() => changeNbParts(Math.min(20, parts + 1))}
              className="min-h-[44px] min-w-[44px] rounded-md bg-zinc-800 hover:bg-zinc-700 text-xl font-bold"
            >+</button>
            <span className="text-sm text-zinc-400 ml-2">≈ {fmtPrix(totalTTC / parts)} / pers.</span>
          </div>
        )}

        {/* Lignes de paiement */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {paiements.map((p, idx) => (
            <div key={p.key} className="rounded-md border border-zinc-800 bg-zinc-950 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {mode === 'parts_egales' || mode === 'personnalise' ? `Personne ${idx + 1}` : `Paiement ${idx + 1}`}
                </span>
                {(mode === 'mixte' || mode === 'personnalise') && paiements.length > 1 && (
                  <button onClick={() => supprimerPaiement(p.key)} className="text-xs text-red-400 hover:text-red-300">× retirer</button>
                )}
              </div>

              {/* Méthode */}
              <div className="grid grid-cols-4 gap-1">
                {METHODES.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setPaiement(p.key, { methode: m.key })}
                    className={cn(
                      'min-h-[44px] rounded-md border text-xs font-bold transition-colors',
                      p.methode === m.key
                        ? 'bg-emerald-500 border-emerald-400 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    )}
                  >
                    <span className="block">{m.emoji}</span>
                    <span className="block text-[10px] mt-0.5">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Montant + tip */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">Montant TTC (€)</label>
                  <input
                    type="number" step="0.01" min={0}
                    value={p.montant}
                    onChange={e => setPaiement(p.key, { montant: parseFloat(e.target.value) || 0 })}
                    className="w-full h-12 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 font-bold text-lg tabular-nums text-right outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">Pourboire (€)</label>
                  <input
                    type="number" step="0.01" min={0}
                    value={p.pourboire}
                    onChange={e => setPaiement(p.key, { pourboire: parseFloat(e.target.value) || 0 })}
                    className="w-full h-12 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-emerald-300 font-bold text-lg tabular-nums text-right outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Référence (TPE, etc.) */}
              {(p.methode === 'carte' || p.methode === 'virement') && (
                <input
                  type="text"
                  value={p.reference}
                  onChange={e => setPaiement(p.key, { reference: e.target.value })}
                  placeholder="Référence (n° transaction, optionnel)"
                  className="w-full h-10 px-2 text-xs rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 outline-none focus:border-zinc-600"
                />
              )}
            </div>
          ))}

          {(mode === 'mixte' || mode === 'personnalise') && (
            <button
              onClick={ajouterPaiement}
              className="w-full min-h-[48px] rounded-md border-2 border-dashed border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300 text-sm font-bold"
            >
              + Ajouter une ligne de paiement
            </button>
          )}
        </div>

        {/* Récap + serveur + valider */}
        <div className="border-t border-zinc-800 p-5 space-y-3">
          {/* Récap */}
          <div className="rounded-md bg-zinc-950 border border-zinc-800 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Total dû</span>
              <span className="font-bold tabular-nums">{fmtPrix(totalTTC)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Total saisi</span>
              <span className={cn('font-bold tabular-nums', Math.abs(ecart) < 0.01 ? 'text-emerald-300' : ecart > 0 ? 'text-amber-300' : 'text-red-400')}>
                {fmtPrix(totalPaye)}
              </span>
            </div>
            {Math.abs(ecart) > 0.01 && (
              <div className="flex justify-between">
                <span className="text-zinc-400">Écart</span>
                <span className={cn('font-bold tabular-nums', ecart > 0 ? 'text-amber-300' : 'text-red-400')}>
                  {ecart > 0 ? '+' : ''}{fmtPrix(ecart)}
                </span>
              </div>
            )}
            {totalTips > 0 && (
              <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1">
                <span className="text-emerald-400">Pourboire total</span>
                <span className="font-bold text-emerald-300 tabular-nums">{fmtPrix(totalTips)}</span>
              </div>
            )}
          </div>

          {/* Client fidélité */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wider text-zinc-400">Client (fidélité — optionnel)</label>
              {!client && !showCreate && (
                <button
                  type="button"
                  onClick={ouvrirCreationClient}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 underline"
                >
                  + Nouveau
                </button>
              )}
            </div>

            {client ? (
              <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-emerald-700/50 bg-emerald-950/40">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-emerald-100 truncate">
                      {client.prenom ? client.prenom + ' ' : ''}{client.nom}
                    </span>
                    {(() => {
                      const k = (client.niveau_fidelite as NiveauFidelite) ?? 'standard'
                      const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                      return <span className="text-xs px-1.5 py-0.5 rounded border border-emerald-700/60 bg-emerald-900/40 text-emerald-200">{ni.emoji} {ni.label}</span>
                    })()}
                  </div>
                  <p className="text-[11px] text-emerald-300/80">
                    {client.points_fidelite} pts · {client.nb_visites} visites
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClient(null)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                >
                  Retirer
                </button>
              </div>
            ) : showCreate ? (
              <div className="rounded-md border border-emerald-700/50 bg-zinc-950 p-3 space-y-2">
                <p className="text-[11px] text-emerald-300 mb-1">Nouveau client (visite + fidélité)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={createPrenom}
                    onChange={e => setCreatePrenom(e.target.value)}
                    placeholder="Prénom"
                    className="h-10 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={createNom}
                    onChange={e => setCreateNom(e.target.value)}
                    placeholder="Nom *"
                    className="h-10 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <input
                  type="email"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  placeholder="Email (optionnel)"
                  className="w-full h-10 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="tel"
                  value={createTel}
                  onChange={e => setCreateTel(e.target.value)}
                  placeholder="Téléphone (optionnel)"
                  className="w-full h-10 px-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500"
                />
                {createError && (
                  <p className="text-xs text-red-400">⚠️ {createError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={annulerCreation}
                    disabled={createPending}
                    className="flex-1 h-10 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={validerCreation}
                    disabled={createPending || !createNom.trim()}
                    className="flex-[2] h-10 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-bold"
                  >
                    {createPending ? 'Création…' : '✓ Créer & associer'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 italic">
                  Email/téléphone évite les doublons. Sans, doublon possible.
                </p>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => rechercherClient(e.target.value)}
                  placeholder="Nom, prénom, email, téléphone…"
                  className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 outline-none focus:border-emerald-500"
                />
                {showSearchResults && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950 border border-zinc-700 rounded-md shadow-xl z-50 max-h-72 overflow-y-auto">
                    {searchPending && <p className="text-xs text-zinc-400 p-3">Recherche…</p>}
                    {!searchPending && searchResults.length === 0 && (
                      <div className="p-3 space-y-2">
                        <p className="text-xs text-zinc-500">Aucun client trouvé pour « {searchQuery} »</p>
                        <button
                          type="button"
                          onClick={ouvrirCreationClient}
                          className="w-full text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md px-3 py-2"
                        >
                          + Créer ce client
                        </button>
                      </div>
                    )}
                    {!searchPending && searchResults.map(c => {
                      const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
                      const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setClient(c); setSearchQuery(''); setShowSearchResults(false) }}
                          className="w-full text-left p-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-zinc-100">
                              {c.prenom ? c.prenom + ' ' : ''}{c.nom}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300">
                              {ni.emoji} {ni.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            {c.points_fidelite} pts · {c.nb_visites} visites
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Serveur (pour suivi tips) */}
          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Serveur (suivi pourboires)</label>
            <select
              value={serveurChoisi}
              onChange={e => setServeurChoisi(e.target.value)}
              className="w-full h-12 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="">— Aucun —</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
              ))}
            </select>
          </div>

          {erreur && (
            <p className="text-sm bg-red-900/30 border border-red-800 text-red-300 rounded-md px-3 py-2">⚠️ {erreur}</p>
          )}

          {/* Boutons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isPending}
              className="min-h-[56px] flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase tracking-wider"
            >
              Annuler
            </button>
            <button
              onClick={valider}
              disabled={isPending || Math.abs(ecart) > 0.05}
              className="min-h-[56px] flex-[2] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider transition-colors"
            >
              {isPending ? 'Encaissement…' : `✓ Valider ${fmtPrix(totalTTC)}`}
            </button>
          </div>

          {/* Toast fidélité après validation */}
          {pointsCredites !== null && (
            <div className="rounded-md bg-emerald-900/50 border border-emerald-500 p-3 text-center">
              <p className="text-emerald-200 font-bold text-lg">⭐ +{pointsCredites} points crédités !</p>
              <p className="text-emerald-300/80 text-xs">Le solde du client est mis à jour.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-[40px] px-3 rounded-full text-xs font-bold transition-colors',
        active ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      )}
    >
      {children}
    </button>
  )
}
