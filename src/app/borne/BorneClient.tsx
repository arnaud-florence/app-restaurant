'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getPaymentProvider, type PaymentProvider, type PaymentResult } from '@/lib/borne/paymentProvider'
import {
  creerCommandeBorne, marquerBornePayee, annulerCommandeBorne,
  incrementerEchecsNFC, heartbeatBorne, logBorneEvenement,
  type PanierBorneItem,
} from './actions'
import QRCode from 'qrcode'

// ─── Types ─────────────────────────────────────────────────────────────
type Produit = {
  type: 'recette'
  id: string
  nom: string
  categorie: string
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  prix_vente_ht: number
  image_url: string | null
  favori: boolean
}

type Etape = 'catalogue' | 'consommation' | 'prenom' | 'choix-paiement' | 'nfc' | 'comptoir' | 'succes' | 'echec'
type Consommation = 'sur_place' | 'emporter'

type LignePanier = {
  produit: Produit
  quantite: number
}

const TVA = 0.10
const NFC_TIMEOUT_S = 60
const COMPTOIR_TIMEOUT_S = 10 * 60
const HEARTBEAT_MS = 60_000

const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

// ─── Borne ID stable (localStorage) ────────────────────────────────────
function getBorneId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = localStorage.getItem('borne_id')
  if (!id) {
    id = 'borne-' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('borne_id', id)
  }
  return id
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function BorneClient({ produits }: { produits: Produit[] }) {
  const router = useRouter()
  const [etape, setEtape] = useState<Etape>('catalogue')
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [cat, setCat] = useState<string | 'tous'>('tous')
  const [provider, setProvider] = useState<PaymentProvider | null>(null)
  const [commande, setCommande] = useState<{ id: string; numero: string; expire_at: string | null } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [borneId] = useState(getBorneId)
  // Options choisies entre catalogue et paiement
  const [consommation, setConsommation] = useState<Consommation>('sur_place')
  const [prenomClient, setPrenomClient] = useState<string>('')

  // ─── Init provider de paiement + heartbeat ───────────────────────────
  useEffect(() => {
    let active = true
    getPaymentProvider().then(p => {
      if (active) setProvider(p)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    void heartbeatBorne({ borne_id: borneId, user_agent: navigator.userAgent })
    void logBorneEvenement({ borne_id: borneId, type: 'session_open' })
    const t = setInterval(() => {
      void heartbeatBorne({ borne_id: borneId })
    }, HEARTBEAT_MS)
    return () => { clearInterval(t) }
  }, [borneId])

  // ─── Catégories ──────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const set = new Set<string>()
    produits.forEach(p => set.add(p.categorie))
    return ['tous', ...Array.from(set).sort()]
  }, [produits])

  const produitsFiltres = useMemo(() => {
    if (cat === 'tous') return produits
    return produits.filter(p => p.categorie === cat)
  }, [produits, cat])

  // ─── Panier ──────────────────────────────────────────────────────────
  const totalTTC = useMemo(
    () => panier.reduce((s, l) => s + l.produit.prix_vente_ht * l.quantite * (1 + TVA), 0),
    [panier],
  )
  const nbArticles = useMemo(() => panier.reduce((s, l) => s + l.quantite, 0), [panier])

  const ajouter = useCallback((p: Produit) => {
    setPanier(prev => {
      const exist = prev.find(l => l.produit.id === p.id)
      if (exist) return prev.map(l => l.produit.id === p.id ? { ...l, quantite: l.quantite + 1 } : l)
      return [...prev, { produit: p, quantite: 1 }]
    })
    void logBorneEvenement({ borne_id: borneId, type: 'panier_ajout', details: { produit_id: p.id, nom: p.nom } })
  }, [borneId])

  const retirer = useCallback((p: Produit) => {
    setPanier(prev => {
      const exist = prev.find(l => l.produit.id === p.id)
      if (!exist) return prev
      if (exist.quantite <= 1) return prev.filter(l => l.produit.id !== p.id)
      return prev.map(l => l.produit.id === p.id ? { ...l, quantite: l.quantite - 1 } : l)
    })
  }, [])

  const viderPanier = useCallback(() => {
    setPanier([])
    void logBorneEvenement({ borne_id: borneId, type: 'panier_vide' })
  }, [borneId])

  // ─── Création commande + lancement paiement ──────────────────────────
  const allerCaisse = useCallback(() => {
    if (panier.length === 0) return
    // Flow : catalogue → consommation → prénom → choix paiement
    setEtape('consommation')
  }, [panier.length])

  // commande_articles n'a que recette_id ; on filtre donc le panier sur les
  // produits qui ont une vraie recette_id côté DB (les "boissons" pures sans
  // recette miroir sont ignorées — l'app actuelle les stocke en recettes
  // avec tag_destination='BAR', cf. ComptoirOrderModal).
  const panierToItems = useCallback((): PanierBorneItem[] => {
    return panier.map(l => ({
      recette_id: l.produit.id,
      nom: l.produit.nom,
      quantite: l.quantite,
      prix_unitaire_ht: l.produit.prix_vente_ht,
      tag_destination: l.produit.tag_destination,
    }))
  }, [panier])

  const lancerNFC = useCallback(async () => {
    setErreur(null)
    try {
      const items = panierToItems()
      if (items.length === 0) throw new Error('Panier vide ou contient uniquement des boissons sans recette miroir')
      const cmd = await creerCommandeBorne({
        borne_id: borneId,
        panier: items,
        mode_paiement: 'nfc',
        consommation,
        client_prenom: prenomClient.trim() || null,
      })
      setCommande(cmd)
      setEtape('nfc')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur création commande')
    }
  }, [panierToItems, borneId, consommation, prenomClient])

  const lancerComptoir = useCallback(async () => {
    setErreur(null)
    try {
      const items = panierToItems()
      if (items.length === 0) throw new Error('Panier vide ou contient uniquement des boissons sans recette miroir')
      const cmd = await creerCommandeBorne({
        borne_id: borneId,
        panier: items,
        mode_paiement: 'comptoir',
        consommation,
        client_prenom: prenomClient.trim() || null,
      })
      setCommande(cmd)
      setEtape('comptoir')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur création commande')
    }
  }, [panierToItems, borneId, consommation, prenomClient])

  // ─── Reset complet (retour catalogue) ────────────────────────────────
  const reset = useCallback(() => {
    setEtape('catalogue')
    setPanier([])
    setCommande(null)
    setErreur(null)
    setConsommation('sur_place')
    setPrenomClient('')
  }, [])

  // ─── Annulation depuis NFC/Comptoir ──────────────────────────────────
  const annuler = useCallback(async (raison: 'expiration' | 'retour_client' | 'nfc_echec') => {
    if (commande) {
      try { await annulerCommandeBorne({ commande_id: commande.id, raison, borne_id: borneId }) } catch { /* ignore */ }
    }
    reset()
  }, [commande, borneId, reset])

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <>
      {etape === 'catalogue' && (
        <EcranCatalogue
          produits={produitsFiltres}
          categories={categories}
          cat={cat}
          setCat={setCat}
          panier={panier}
          nbArticles={nbArticles}
          totalTTC={totalTTC}
          onAjouter={ajouter}
          onRetirer={retirer}
          onVider={viderPanier}
          onAllerCaisse={allerCaisse}
        />
      )}
      {etape === 'consommation' && (
        <EcranConsommation
          totalTTC={totalTTC}
          consommation={consommation}
          onChoix={(c) => { setConsommation(c); setEtape('prenom') }}
          onRetour={() => setEtape('catalogue')}
        />
      )}
      {etape === 'prenom' && (
        <EcranPrenom
          totalTTC={totalTTC}
          prenom={prenomClient}
          onChange={setPrenomClient}
          onSuivant={() => setEtape('choix-paiement')}
          onIgnorer={() => { setPrenomClient(''); setEtape('choix-paiement') }}
          onRetour={() => setEtape('consommation')}
        />
      )}
      {etape === 'choix-paiement' && (
        <EcranChoixPaiement
          totalTTC={totalTTC}
          nbArticles={nbArticles}
          supportNFC={provider?.supportsTapToPay ?? false}
          onNFC={lancerNFC}
          onComptoir={lancerComptoir}
          onRetour={() => setEtape('prenom')}
        />
      )}
      {etape === 'nfc' && commande && provider && (
        <EcranNFC
          commande={commande}
          totalTTC={totalTTC}
          provider={provider}
          borneId={borneId}
          onSucces={async (result) => {
            const piId = result.status === 'succeeded' ? result.paymentIntentId : null
            await marquerBornePayee({ commande_id: commande.id, payment_intent_id: piId, via: 'nfc' })
            setEtape('succes')
          }}
          onEchec={async () => {
            await incrementerEchecsNFC({ commande_id: commande.id, borne_id: borneId })
            setEtape('echec')
          }}
          onAnnuler={() => annuler('retour_client')}
        />
      )}
      {etape === 'comptoir' && commande && (
        <EcranComptoir
          commande={commande}
          prenom={prenomClient}
          totalTTC={totalTTC}
          onExpire={() => annuler('expiration')}
          onRetour={() => annuler('retour_client')}
        />
      )}
      {etape === 'succes' && commande && (
        <EcranSucces commande={commande} prenom={prenomClient} onTermine={reset} />
      )}
      {etape === 'echec' && commande && (
        <EcranEchec
          totalTTC={totalTTC}
          onReessayer={() => setEtape('nfc')}
          onComptoir={async () => {
            await annulerCommandeBorne({ commande_id: commande.id, raison: 'nfc_echec', borne_id: borneId })
            await lancerComptoir()
          }}
          onAnnuler={() => annuler('nfc_echec')}
        />
      )}

      {/* Affichage non-bloquant des erreurs serveur */}
      {erreur && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md bg-red-600 text-white px-5 py-3 rounded-xl shadow-2xl font-bold cursor-pointer"
             onClick={() => setErreur(null)}>
          ⚠ {erreur} <span className="opacity-70 text-sm">(tap pour fermer)</span>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 1 — CATALOGUE
// ═══════════════════════════════════════════════════════════════════════
function EcranCatalogue({
  produits, categories, cat, setCat, panier, nbArticles, totalTTC,
  onAjouter, onRetirer, onVider, onAllerCaisse,
}: {
  produits: Produit[]
  categories: string[]
  cat: string
  setCat: (c: string) => void
  panier: LignePanier[]
  nbArticles: number
  totalTTC: number
  onAjouter: (p: Produit) => void
  onRetirer: (p: Produit) => void
  onVider: () => void
  onAllerCaisse: () => void
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 h-16 flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xl shadow-md">🛍</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 leading-none">Borne self-service</p>
            <h1 className="font-display italic text-xl font-medium text-white tracking-tight leading-none mt-0.5">Composez votre commande</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Total</p>
          <p className="text-2xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </div>
      </header>

      {/* Onglets catégories */}
      <div className="shrink-0 px-4 py-3 bg-zinc-950 border-b border-zinc-800 overflow-x-auto scroll-visible-dark">
        <div className="flex items-center gap-2 min-w-max">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'inline-flex items-center px-4 h-10 rounded-xl text-sm font-black tracking-wide whitespace-nowrap transition-all',
                cat === c
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
              )}
            >
              {c === 'tous' ? '⭐ Tous' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Catalogue grid + Panier */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden min-h-0">
        {/* Produits */}
        <div className="overflow-y-auto scroll-visible-dark p-4">
          {produits.length === 0 ? (
            <p className="text-center text-zinc-500 italic py-20">Aucun produit dans cette catégorie.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {produits.map(p => {
                const enPanier = panier.find(l => l.produit.id === p.id)?.quantite ?? 0
                return (
                  <button
                    key={p.id}
                    onClick={() => onAjouter(p)}
                    className={cn(
                      'group relative rounded-2xl bg-zinc-900 border-2 overflow-hidden text-left transition-all active:scale-95',
                      enPanier > 0 ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-zinc-800 hover:border-zinc-600',
                    )}
                  >
                    {/* Image */}
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.nom} className="w-full aspect-[4/3] object-cover bg-zinc-950" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-zinc-800 flex items-center justify-center text-4xl">
                        {p.tag_destination === 'BAR' ? '🥤' : '🍽'}
                      </div>
                    )}
                    {enPanier > 0 && (
                      <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-emerald-500 text-white text-sm font-black tabular-nums shadow-lg">
                        ×{enPanier}
                      </span>
                    )}
                    {p.favori && (
                      <span className="absolute top-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-sm shadow">⭐</span>
                    )}
                    <div className="p-3">
                      <p className="font-display italic text-base font-medium text-white line-clamp-2 leading-tight">{p.nom}</p>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{p.categorie}</p>
                      <p className="font-black tabular-nums text-emerald-400 mt-2">{fmtPrix(p.prix_vente_ht * (1 + TVA))}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Panier sticky */}
        <aside className="hidden lg:flex flex-col border-l-2 border-zinc-800 bg-zinc-950">
          <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <p className="font-display italic text-lg font-medium text-white">Panier</p>
            {panier.length > 0 && (
              <button onClick={onVider} className="text-xs text-zinc-500 hover:text-red-400 underline">Vider</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto scroll-visible-dark p-3 space-y-2">
            {panier.length === 0 ? (
              <p className="text-center text-zinc-600 italic mt-12 text-sm">Tapez sur un produit pour l&apos;ajouter</p>
            ) : panier.map(l => (
              <div key={l.produit.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
                <p className="text-sm font-medium text-white line-clamp-1">{l.produit.nom}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onRetirer(l.produit)} className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-white font-bold text-xl">−</button>
                    <span className="w-9 text-center font-black tabular-nums">{l.quantite}</span>
                    <button onClick={() => onAjouter(l.produit)} className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-white font-bold text-xl">+</button>
                  </div>
                  <p className="text-sm font-black tabular-nums text-emerald-400">{fmtPrix(l.produit.prix_vente_ht * l.quantite * (1 + TVA))}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="shrink-0 p-3 border-t-2 border-zinc-800 bg-zinc-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>
              <span className="font-display italic text-2xl font-medium tabular-nums text-white">{fmtPrix(totalTTC)}</span>
            </div>
            <button
              onClick={onAllerCaisse}
              disabled={panier.length === 0}
              className={cn(
                'w-full h-16 rounded-xl font-black text-lg uppercase tracking-wider transition-all',
                panier.length === 0
                  ? 'bg-zinc-800 text-zinc-600'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 active:scale-95',
              )}
            >
              ✓ Payer {fmtPrix(totalTTC)}
            </button>
          </div>
        </aside>
      </div>

      {/* MOBILE bottom bar */}
      <div className="lg:hidden shrink-0 border-t-2 border-zinc-800 bg-zinc-950 p-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{nbArticles} article{nbArticles > 1 ? 's' : ''}</p>
          <p className="font-display italic text-xl font-medium tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </div>
        <button
          onClick={onAllerCaisse}
          disabled={panier.length === 0}
          className={cn(
            'h-14 px-6 rounded-xl font-black text-base uppercase tracking-wider',
            panier.length === 0 ? 'bg-zinc-800 text-zinc-600' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 active:scale-95',
          )}
        >
          Payer →
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 1.5 — SUR PLACE OU À EMPORTER
// ═══════════════════════════════════════════════════════════════════════
function EcranConsommation({
  totalTTC, consommation, onChoix, onRetour,
}: {
  totalTTC: number
  consommation: 'sur_place' | 'emporter'
  onChoix: (c: 'sur_place' | 'emporter') => void
  onRetour: () => void
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-4 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Modifier
        </button>
        <p className="text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
      </header>
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-5xl">
          <h2 className="font-display italic text-3xl sm:text-5xl text-center text-white mb-2">Vous mangez ici ou à emporter ?</h2>
          <p className="text-center text-zinc-400 mb-10">Choisissez votre option</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <button
              onClick={() => onChoix('sur_place')}
              className={cn(
                'group relative aspect-square sm:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-4 p-6 transition-all active:scale-95 shadow-2xl',
                consommation === 'sur_place'
                  ? 'bg-amber-500 ring-4 ring-amber-300/50 shadow-amber-500/40'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
              )}
            >
              <span className="text-8xl sm:text-9xl">🍽</span>
              <p className="font-display italic text-3xl sm:text-5xl font-medium text-white">Sur place</p>
              <p className="text-sm sm:text-base text-amber-100 opacity-90">Je mange ici</p>
            </button>
            <button
              onClick={() => onChoix('emporter')}
              className={cn(
                'group relative aspect-square sm:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-4 p-6 transition-all active:scale-95 shadow-2xl',
                consommation === 'emporter'
                  ? 'bg-blue-500 ring-4 ring-blue-300/50 shadow-blue-500/40'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30',
              )}
            >
              <span className="text-8xl sm:text-9xl">📦</span>
              <p className="font-display italic text-3xl sm:text-5xl font-medium text-white">À emporter</p>
              <p className="text-sm sm:text-base text-blue-100 opacity-90">J&apos;emporte ma commande</p>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 1.8 — SAISIE PRÉNOM CLIENT (facultatif)
// ═══════════════════════════════════════════════════════════════════════
function EcranPrenom({
  totalTTC, prenom, onChange, onSuivant, onIgnorer, onRetour,
}: {
  totalTTC: number
  prenom: string
  onChange: (s: string) => void
  onSuivant: () => void
  onIgnorer: () => void
  onRetour: () => void
}) {
  const PREN_MAX = 12
  const ROWS = [
    ['A','Z','E','R','T','Y','U','I','O','P'],
    ['Q','S','D','F','G','H','J','K','L','M'],
    ['W','X','C','V','B','N',' ','-','\'','⌫'],
  ]
  function tap(ch: string) {
    if (ch === '⌫') { onChange(prenom.slice(0, -1)); return }
    if (prenom.length >= PREN_MAX) return
    // Première lettre majuscule, suite minuscule (style prénom)
    const nv = prenom.length === 0 ? ch.toUpperCase() : ch.toLowerCase()
    onChange(prenom + nv)
  }
  return (
    <div className="flex-1 flex flex-col">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-4 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Retour
        </button>
        <p className="text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-2">
        <h2 className="font-display italic text-3xl sm:text-5xl text-center text-white mt-2">Votre prénom ?</h2>
        <p className="text-center text-zinc-400 text-sm sm:text-base mt-2 max-w-md">
          Pour qu&apos;on puisse vous appeler quand votre commande est prête. <span className="text-zinc-500 italic">Facultatif.</span>
        </p>

        {/* Affichage prénom saisi */}
        <div className="mt-6 mb-4 w-full max-w-md">
          <div className="h-20 rounded-2xl bg-zinc-900 ring-2 ring-zinc-800 flex items-center justify-center px-6">
            <p className={cn(
              'font-display italic text-4xl sm:text-5xl font-medium tabular-nums tracking-wide',
              prenom ? 'text-emerald-300' : 'text-zinc-600',
            )}>
              {prenom || '—'}
              <span className="inline-block w-1 h-10 bg-emerald-400 ml-1 align-middle animate-pulse" />
            </p>
          </div>
        </div>

        {/* Clavier AZERTY simplifié */}
        <div className="w-full max-w-2xl space-y-1.5 sm:space-y-2">
          {ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1.5 sm:gap-2">
              {row.map((ch, ci) => {
                const isWide = ch === ' ' || ch === '⌫'
                return (
                  <button
                    key={ci}
                    onClick={() => tap(ch)}
                    className={cn(
                      'h-12 sm:h-14 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white font-bold text-xl sm:text-2xl transition-all active:scale-95 border border-zinc-800',
                      isWide ? 'flex-[2]' : 'flex-1',
                      ch === '⌫' && 'bg-red-950/40 border-red-900 hover:bg-red-900/40',
                    )}
                  >
                    {ch === ' ' ? '␣' : ch}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3 w-full max-w-md">
          <button
            onClick={onIgnorer}
            className="flex-1 h-14 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase tracking-wider text-sm"
          >
            Ignorer
          </button>
          <button
            onClick={onSuivant}
            className="flex-1 h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-emerald-500/30 active:scale-95"
          >
            Suivant →
          </button>
        </div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 2 — CHOIX MODE DE PAIEMENT
// ═══════════════════════════════════════════════════════════════════════
function EcranChoixPaiement({
  totalTTC, nbArticles, supportNFC, onNFC, onComptoir, onRetour,
}: {
  totalTTC: number
  nbArticles: number
  supportNFC: boolean
  onNFC: () => void
  onComptoir: () => void
  onRetour: () => void
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-4 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Modifier la commande
        </button>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{nbArticles} article{nbArticles > 1 ? 's' : ''}</p>
          <p className="text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl">
          <h2 className="font-display italic text-3xl sm:text-4xl text-center text-white mb-2">Choisissez votre mode de paiement</h2>
          <p className="text-center text-zinc-400 mb-8">Sélectionnez l&apos;option qui vous convient</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Bouton NFC */}
            <button
              onClick={onNFC}
              disabled={!supportNFC}
              className={cn(
                'group relative aspect-square sm:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-4 p-6 transition-all',
                supportNFC
                  ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-2xl shadow-emerald-500/40'
                  : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed',
              )}
            >
              <NFCOndes active={supportNFC} />
              <div className="text-center mt-2">
                <p className="font-display italic text-2xl sm:text-3xl font-medium text-white">Sans contact</p>
                <p className="text-sm sm:text-base text-emerald-100 mt-2">
                  Carte ou téléphone<br />
                  <span className="opacity-80 text-xs">Approchez de l&apos;écran</span>
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2 text-2xl">
                <span title="Visa">💳</span><span title="Apple Pay">🍎</span><span title="Google Pay">G</span>
              </div>
              {!supportNFC && (
                <p className="absolute bottom-3 text-xs text-zinc-500 italic">Indisponible sur cette tablette</p>
              )}
            </button>

            {/* Bouton Comptoir */}
            <button
              onClick={onComptoir}
              className="group relative aspect-square sm:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-4 p-6 bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-2xl shadow-blue-500/40 transition-all"
            >
              <span className="text-7xl sm:text-8xl">🏪</span>
              <div className="text-center">
                <p className="font-display italic text-2xl sm:text-3xl font-medium text-white">Au comptoir</p>
                <p className="text-sm sm:text-base text-blue-100 mt-2">
                  Carte à insérer<br />
                  <span className="opacity-80 text-xs">ou espèces</span>
                </p>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 3 — NFC EN COURS
// ═══════════════════════════════════════════════════════════════════════
function EcranNFC({
  commande, totalTTC, provider, borneId, onSucces, onEchec, onAnnuler,
}: {
  commande: { id: string; numero: string }
  totalTTC: number
  provider: PaymentProvider
  borneId: string
  onSucces: (r: PaymentResult) => void
  onEchec: () => void
  onAnnuler: () => void
}) {
  const [timeLeft, setTimeLeft] = useState(NFC_TIMEOUT_S)
  const [status, setStatus] = useState<'idle' | 'detecting' | 'processing'>('idle')
  const launched = useRef(false)

  // Compte à rebours
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); onAnnuler(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onAnnuler])

  // Lance la collecte une seule fois au montage
  useEffect(() => {
    if (launched.current) return
    launched.current = true
    void logBorneEvenement({ borne_id: borneId, type: 'nfc_init', commande_id: commande.id, details: { total: totalTTC } })
    setStatus('detecting')
    void provider.collectPayment({
      amount: Math.round(totalTTC * 100),
      currency: 'eur',
      commandeId: commande.id,
    }).then(result => {
      setStatus('processing')
      setTimeout(() => {
        if (result.status === 'succeeded') onSucces(result)
        else onEchec()
      }, 800)
    })
    return () => { void provider.cancel() }
  }, [provider, totalTTC, commande.id, borneId, onSucces, onEchec])

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-emerald-950 via-zinc-950 to-emerald-950">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between">
        <button onClick={onAnnuler} className="inline-flex items-center gap-2 px-4 h-12 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 font-black text-sm backdrop-blur">
          ← Annuler
        </button>
        <span className={cn(
          'inline-flex items-center gap-2 px-4 h-12 rounded-xl backdrop-blur font-black tabular-nums text-sm',
          timeLeft < 10 ? 'bg-red-600/80 text-white animate-pulse' : 'bg-zinc-800/80 text-zinc-200',
        )}>
          ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Montant */}
        <p className="font-display italic text-5xl sm:text-7xl font-medium tabular-nums text-white drop-shadow-lg">
          {fmtPrix(totalTTC)}
        </p>
        <p className="text-emerald-200 mt-2 text-sm uppercase tracking-widest font-bold">Commande #{commande.numero?.slice(-6)}</p>

        {/* Cercle NFC pulsant */}
        <div className="relative my-12 w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          <span className="absolute inset-6 rounded-full bg-emerald-500/30 animate-ping" style={{ animationDelay: '0.3s' }} />
          <span className="absolute inset-12 rounded-full bg-emerald-500/40 animate-ping" style={{ animationDelay: '0.6s' }} />
          <div className="relative z-10 w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/60">
            <span className="text-8xl sm:text-9xl">
              {status === 'processing' ? '⏳' : '📡'}
            </span>
          </div>
        </div>

        <p className="font-display italic text-2xl sm:text-3xl text-white text-center">
          {status === 'processing'
            ? 'Vérification du paiement…'
            : 'Approchez votre carte ou téléphone'}
        </p>
        <p className="text-emerald-200 mt-2 text-sm">Visa · Mastercard · Amex · Apple Pay · Google Pay</p>

        {provider.environment === 'mock' && (
          <p className="text-amber-300 text-xs mt-6 italic">⚠ Mode démo (mock NFC) — paiement simulé en 2,5 s</p>
        )}
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 4 — COMPTOIR (numéro + QR + minuteur)
// ═══════════════════════════════════════════════════════════════════════
function EcranComptoir({
  commande, prenom, totalTTC, onExpire, onRetour,
}: {
  commande: { id: string; numero: string; expire_at: string | null }
  prenom: string
  totalTTC: number
  onExpire: () => void
  onRetour: () => void
}) {
  const expireMs = commande.expire_at ? new Date(commande.expire_at).getTime() : Date.now() + COMPTOIR_TIMEOUT_S * 1000
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const timeLeft = Math.max(0, Math.round((expireMs - now) / 1000))
  useEffect(() => { if (timeLeft === 0) onExpire() }, [timeLeft, onExpire])

  // QR de la commande
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(commande.id, { width: 260, margin: 2, color: { dark: '#0D0D0D', light: '#FFFFFF' } })
      .then(setQrUrl)
      .catch(() => setQrUrl(null))
  }, [commande.id])

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-blue-950 via-zinc-950 to-blue-950">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-4 h-12 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 font-black text-sm backdrop-blur">
          ← Annuler
        </button>
        <span className={cn(
          'inline-flex items-center gap-2 px-4 h-12 rounded-xl backdrop-blur font-black tabular-nums text-sm',
          timeLeft < 60 ? 'bg-red-600/80 text-white animate-pulse' : 'bg-zinc-800/80 text-zinc-200',
        )}>
          ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
        {prenom && (
          <p className="font-display italic text-3xl sm:text-4xl text-blue-100 mb-2">Bonjour {prenom} 👋</p>
        )}
        <p className="font-display italic text-2xl sm:text-3xl text-blue-200 mb-4">Rendez-vous à la caisse</p>
        <p className="text-zinc-400 mb-8 max-w-md">Présentez ce numéro au comptoir pour régler votre commande (carte ou espèces).</p>

        <div className="bg-white rounded-3xl px-8 py-6 shadow-2xl">
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-black">
            {prenom ? `Numéro de ${prenom}` : 'Votre numéro de commande'}
          </p>
          <p className="font-display italic text-7xl sm:text-9xl font-bold tabular-nums text-zinc-900 leading-tight">
            #{commande.numero?.slice(-4)}
          </p>
        </div>

        {qrUrl && (
          <div className="bg-white rounded-2xl p-3 mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR code" className="w-40 h-40 sm:w-52 sm:h-52" />
          </div>
        )}

        <p className="text-blue-200 mt-6 font-display italic text-xl tabular-nums">{fmtPrix(totalTTC)}</p>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 5 — SUCCÈS
// ═══════════════════════════════════════════════════════════════════════
function EcranSucces({
  commande, prenom, onTermine,
}: {
  commande: { numero: string }
  prenom: string
  onTermine: () => void
}) {
  // Confettis CSS via pseudo-particules
  const [confettis] = useState(() => Array.from({ length: 40 }).map(() => ({
    x: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 1.8 + Math.random() * 1.5,
    color: ['#10B981', '#34D399', '#6EE7B7', '#FBBF24'][Math.floor(Math.random() * 4)],
  })))

  // Auto retour après 8s
  useEffect(() => {
    const t = setTimeout(onTermine, 8000)
    return () => clearTimeout(t)
  }, [onTermine])

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 to-zinc-950 relative overflow-hidden">
      {/* Confettis */}
      {confettis.map((c, i) => (
        <span
          key={i}
          className="absolute top-[-20px] w-2 h-3 rounded-sm"
          style={{
            left: `${c.x}%`,
            backgroundColor: c.color,
            animation: `borneConfetti ${c.dur}s linear ${c.delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes borneConfetti {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
        }
      `}</style>

      <span className="text-9xl mb-6 animate-bounce">✅</span>
      <h2 className="font-display italic text-5xl sm:text-6xl font-medium text-white text-center">
        Merci {prenom ? prenom : ''} !
      </h2>
      <p className="text-emerald-200 mt-4 text-xl text-center max-w-md">
        Votre commande est en préparation.
        {prenom && <span className="block text-sm opacity-80 mt-2">On vous appelle dès qu&apos;elle est prête.</span>}
      </p>
      <div className="bg-white rounded-3xl px-10 py-6 mt-8 shadow-2xl">
        <p className="text-zinc-500 text-xs uppercase tracking-widest font-black text-center">Numéro</p>
        <p className="font-display italic text-7xl font-bold tabular-nums text-emerald-600 leading-tight">#{commande.numero?.slice(-4)}</p>
      </div>
      <button onClick={onTermine} className="mt-10 h-14 px-8 rounded-xl bg-zinc-800/80 backdrop-blur text-white font-black uppercase tracking-wider">
        Terminer
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN 6 — ÉCHEC NFC
// ═══════════════════════════════════════════════════════════════════════
function EcranEchec({
  totalTTC, onReessayer, onComptoir, onAnnuler,
}: {
  totalTTC: number
  onReessayer: () => void
  onComptoir: () => void
  onAnnuler: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 to-red-950 p-6">
      <span className="text-8xl mb-6">😕</span>
      <h2 className="font-display italic text-4xl sm:text-5xl font-medium text-white text-center">Paiement non abouti</h2>
      <p className="text-zinc-400 mt-3 text-center max-w-md">Pas de panique — vous pouvez réessayer ou choisir de payer au comptoir.</p>
      <p className="font-display italic text-3xl tabular-nums text-white mt-6">{fmtPrix(totalTTC)}</p>

      <div className="mt-10 flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <button onClick={onReessayer} className="flex-1 h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-wider shadow-lg shadow-emerald-500/30 active:scale-95">
          Réessayer NFC
        </button>
        <button onClick={onComptoir} className="flex-1 h-14 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-black uppercase tracking-wider shadow-lg shadow-blue-500/30 active:scale-95">
          Payer au comptoir
        </button>
      </div>
      <button onClick={onAnnuler} className="mt-4 text-zinc-500 hover:text-zinc-300 text-sm underline">
        Annuler la commande
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// NFC ondes animées (utilisé dans EcranChoixPaiement)
// ═══════════════════════════════════════════════════════════════════════
function NFCOndes({ active }: { active: boolean }) {
  return (
    <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
      {active && (
        <>
          <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
          <span className="absolute inset-4 rounded-full bg-white/30 animate-ping" style={{ animationDelay: '0.4s' }} />
        </>
      )}
      <span className="relative text-6xl sm:text-7xl">📡</span>
    </div>
  )
}
