'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getPaymentProvider, type PaymentProvider, type PaymentResult } from '@/lib/borne/paymentProvider'
import {
  creerCommandeBorne, marquerBornePayee, annulerCommandeBorne,
  incrementerEchecsNFC, heartbeatBorne, logBorneEvenement,
  chercherClientFideliteParTel, creerClientFideliteBorne,
  type PanierBorneItem, type ClientFidelite,
} from './actions'
import QRCode from 'qrcode'

// ─── Types ─────────────────────────────────────────────────────────────
type Produit = {
  type: 'recette'
  id: string
  nom: string
  categorie: string
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  description: string | null
  prix_vente_ht: number
  image_url: string | null
  favori: boolean
}

type Etape = 'catalogue' | 'consommation' | 'prenom' | 'fidelite' | 'choix-paiement' | 'nfc' | 'comptoir' | 'succes' | 'echec'
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
  // null = écran "choisis ta catégorie" en grand / sinon = grille produits de la cat
  const [cat, setCat] = useState<string | null>(null)
  // null = aucune fiche produit ouverte / sinon = fiche détaillée d'un produit
  const [ficheProduit, setFicheProduit] = useState<Produit | null>(null)
  const [provider, setProvider] = useState<PaymentProvider | null>(null)
  const [commande, setCommande] = useState<{ id: string; numero: string; expire_at: string | null } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [borneId] = useState(getBorneId)
  // Options choisies entre catalogue et paiement
  const [consommation, setConsommation] = useState<Consommation>('sur_place')
  const [prenomClient, setPrenomClient] = useState<string>('')
  // Compte fidélité — null si client a skippé / pas trouvé
  const [clientFidelite, setClientFidelite] = useState<ClientFidelite | null>(null)

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
  // Groupées avec compteur + 1er image url pour l'aperçu carte.
  const categoriesAvecMeta = useMemo(() => {
    const map = new Map<string, { count: number; firstImage: string | null; firstProduit: Produit }>()
    for (const p of produits) {
      if (!map.has(p.categorie)) {
        map.set(p.categorie, { count: 1, firstImage: p.image_url, firstProduit: p })
      } else {
        const v = map.get(p.categorie)!
        v.count++
        if (!v.firstImage && p.image_url) v.firstImage = p.image_url
      }
    }
    return Array.from(map.entries())
      .map(([nom, meta]) => ({ nom, ...meta }))
      .sort((a, b) => a.nom.localeCompare(b.nom))
  }, [produits])

  const produitsFiltres = useMemo(() => {
    if (!cat) return []
    return produits.filter(p => p.categorie === cat)
  }, [produits, cat])

  // ─── Panier ──────────────────────────────────────────────────────────
  const totalTTC = useMemo(
    () => panier.reduce((s, l) => s + l.produit.prix_vente_ht * l.quantite * (1 + TVA), 0),
    [panier],
  )
  const nbArticles = useMemo(() => panier.reduce((s, l) => s + l.quantite, 0), [panier])

  // ─── Actions panier ──────────────────────────────────────────────────
  // ajouter(p, qty?) : ajoute qty (défaut +1) à p. Si déjà au panier → cumul.
  const ajouter = useCallback((p: Produit, qty: number = 1) => {
    if (qty <= 0) return
    setPanier(prev => {
      const exist = prev.find(l => l.produit.id === p.id)
      if (exist) return prev.map(l => l.produit.id === p.id ? { ...l, quantite: l.quantite + qty } : l)
      return [...prev, { produit: p, quantite: qty }]
    })
    void logBorneEvenement({ borne_id: borneId, type: 'panier_ajout', details: { produit_id: p.id, nom: p.nom, qty } })
  }, [borneId])

  // retirer(p) : décrémente de 1, supprime si quantité tombe à 0
  const retirer = useCallback((p: Produit) => {
    setPanier(prev => {
      const exist = prev.find(l => l.produit.id === p.id)
      if (!exist) return prev
      if (exist.quantite <= 1) return prev.filter(l => l.produit.id !== p.id)
      return prev.map(l => l.produit.id === p.id ? { ...l, quantite: l.quantite - 1 } : l)
    })
  }, [])

  // setQuantite(p, qty) : remplace la quantité d'un produit (utilisé dans la fiche)
  const setQuantite = useCallback((p: Produit, qty: number) => {
    if (qty <= 0) { setPanier(prev => prev.filter(l => l.produit.id !== p.id)); return }
    setPanier(prev => {
      const exist = prev.find(l => l.produit.id === p.id)
      if (exist) return prev.map(l => l.produit.id === p.id ? { ...l, quantite: qty } : l)
      return [...prev, { produit: p, quantite: qty }]
    })
  }, [])

  // supprimer(p) : retire complètement la ligne du panier (bouton 🗑)
  const supprimer = useCallback((p: Produit) => {
    setPanier(prev => prev.filter(l => l.produit.id !== p.id))
    void logBorneEvenement({ borne_id: borneId, type: 'panier_retire', details: { produit_id: p.id, nom: p.nom } })
  }, [borneId])

  const viderPanier = useCallback(() => {
    setPanier([])
    void logBorneEvenement({ borne_id: borneId, type: 'panier_vide' })
  }, [borneId])

  // Tap sur un produit du catalogue → ouvre la fiche détaillée (style McDo)
  const ouvrirFiche = useCallback((p: Produit) => setFicheProduit(p), [])

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
        client_prenom: prenomClient.trim() || clientFidelite?.prenom || null,
        client_id: clientFidelite?.id ?? null,
      })
      setCommande(cmd)
      setEtape('nfc')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur création commande')
    }
  }, [panierToItems, borneId, consommation, prenomClient, clientFidelite])

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
        client_prenom: prenomClient.trim() || clientFidelite?.prenom || null,
        client_id: clientFidelite?.id ?? null,
      })
      setCommande(cmd)
      setEtape('comptoir')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur création commande')
    }
  }, [panierToItems, borneId, consommation, prenomClient, clientFidelite])

  // ─── Reset complet (retour catalogue) ────────────────────────────────
  const reset = useCallback(() => {
    setEtape('catalogue')
    setPanier([])
    setCommande(null)
    setErreur(null)
    setConsommation('sur_place')
    setPrenomClient('')
    setClientFidelite(null)
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
          produitsFiltres={produitsFiltres}
          categoriesAvecMeta={categoriesAvecMeta}
          cat={cat}
          setCat={setCat}
          panier={panier}
          nbArticles={nbArticles}
          totalTTC={totalTTC}
          onOuvrirFiche={ouvrirFiche}
          onAjouter={ajouter}
          onRetirer={retirer}
          onSupprimer={supprimer}
          onVider={viderPanier}
          onAllerCaisse={allerCaisse}
        />
      )}

      {/* Modal fiche produit (McDo-style) — superposée sur le catalogue */}
      {ficheProduit && (
        <FicheProduitModal
          produit={ficheProduit}
          quantiteActuelle={panier.find(l => l.produit.id === ficheProduit.id)?.quantite ?? 0}
          onClose={() => setFicheProduit(null)}
          onAjouter={(qty) => {
            // Si déjà au panier : on remplace la quantité (pas cumul) car
            // la fiche s'ouvre avec la valeur actuelle.
            setQuantite(ficheProduit, qty)
            setFicheProduit(null)
          }}
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
          onSuivant={() => setEtape('fidelite')}
          onIgnorer={() => { setPrenomClient(''); setEtape('fidelite') }}
          onRetour={() => setEtape('consommation')}
        />
      )}
      {etape === 'fidelite' && (
        <EcranFidelite
          totalTTC={totalTTC}
          clientFidelite={clientFidelite}
          prenomClient={prenomClient}
          onTrouve={(c) => {
            setClientFidelite(c)
            // Si l'utilisateur n'a pas saisi de prénom, on prend celui du compte
            if (!prenomClient && c.prenom) setPrenomClient(c.prenom)
          }}
          onContinuer={() => setEtape('choix-paiement')}
          onIgnorer={() => { setClientFidelite(null); setEtape('choix-paiement') }}
          onRetour={() => setEtape('prenom')}
        />
      )}
      {etape === 'choix-paiement' && (
        <EcranChoixPaiement
          totalTTC={totalTTC}
          nbArticles={nbArticles}
          supportNFC={provider?.supportsTapToPay ?? false}
          onNFC={lancerNFC}
          onComptoir={lancerComptoir}
          onRetour={() => setEtape('fidelite')}
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
  produitsFiltres, categoriesAvecMeta, cat, setCat, panier, nbArticles, totalTTC,
  onOuvrirFiche, onAjouter, onRetirer, onSupprimer, onVider, onAllerCaisse,
}: {
  produitsFiltres: Produit[]
  categoriesAvecMeta: Array<{ nom: string; count: number; firstImage: string | null; firstProduit: Produit }>
  cat: string | null
  setCat: (c: string | null) => void
  panier: LignePanier[]
  nbArticles: number
  totalTTC: number
  onOuvrirFiche: (p: Produit) => void
  onAjouter: (p: Produit, qty?: number) => void
  onRetirer: (p: Produit) => void
  onSupprimer: (p: Produit) => void
  onVider: () => void
  onAllerCaisse: () => void
}) {
  const [showPanierMobile, setShowPanierMobile] = useState(false)
  // Icône par catégorie (mapping le plus large possible)
  const iconeCat = (nom: string): string => {
    const n = nom.toLowerCase()
    if (n.includes('snack') || n.includes('sandwich') || n.includes('burger')) return '🥪'
    if (n.includes('pizza')) return '🍕'
    if (n.includes('salade')) return '🥗'
    if (n.includes('frite')) return '🍟'
    if (n.includes('tacos')) return '🌮'
    if (n.includes('menu')) return '🍱'
    if (n.includes('boisson') || n.includes('soft') || n.includes('drink')) return '🥤'
    if (n.includes('bière') || n.includes('biere')) return '🍺'
    if (n.includes('café') || n.includes('cafe')) return '☕'
    if (n.includes('dessert')) return '🍰'
    return '🍽'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 h-16 flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {cat && (
            <button
              onClick={() => setCat(null)}
              className="inline-flex items-center gap-1 h-10 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-black"
            >
              ← Catégories
            </button>
          )}
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xl shadow-md">🛍</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 leading-none">Borne self-service</p>
            <h1 className="font-display italic text-xl font-medium text-white tracking-tight leading-none mt-0.5">
              {cat ? `${iconeCat(cat)} ${cat}` : 'Choisissez une catégorie'}
            </h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Total</p>
          <p className="text-2xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </div>
      </header>

      {/* Body : catégories (cat=null) OU produits (cat=...) + Panier */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden min-h-0">
        {/* Colonne principale */}
        <div className="overflow-y-auto scroll-visible-dark p-4 sm:p-6">
          {cat === null ? (
            /* ═══ ÉTAPE A : Grille de catégories en grand ═══ */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {categoriesAvecMeta.map(c => (
                <button
                  key={c.nom}
                  onClick={() => setCat(c.nom)}
                  className="group relative aspect-square rounded-3xl bg-zinc-900 border-2 border-zinc-800 overflow-hidden transition-all active:scale-95 hover:border-emerald-500 shadow-xl"
                >
                  {/* Image de fond */}
                  {c.firstImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.firstImage} alt={c.nom} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-8xl bg-zinc-800">
                      {iconeCat(c.nom)}
                    </div>
                  )}
                  {/* Overlay texte */}
                  <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
                    <span className="text-4xl sm:text-5xl mb-2">{iconeCat(c.nom)}</span>
                    <h3 className="font-display italic text-2xl sm:text-3xl font-medium text-white drop-shadow-lg">
                      {c.nom}
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-200 mt-1 opacity-90">
                      {c.count} produit{c.count > 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : produitsFiltres.length === 0 ? (
            <p className="text-center text-zinc-500 italic py-20">Aucun produit dans cette catégorie.</p>
          ) : (
            /* ═══ ÉTAPE B : Grille de produits de la cat ═══ */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {produitsFiltres.map(p => {
                const enPanier = panier.find(l => l.produit.id === p.id)?.quantite ?? 0
                return (
                  <button
                    key={p.id}
                    onClick={() => onOuvrirFiche(p)}
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

        {/* Panier sticky desktop (lg+) */}
        <aside className="hidden lg:flex flex-col border-l-2 border-zinc-800 bg-zinc-950">
          <PanierContenu
            panier={panier}
            nbArticles={nbArticles}
            totalTTC={totalTTC}
            onAjouter={onAjouter}
            onRetirer={onRetirer}
            onSupprimer={onSupprimer}
            onVider={onVider}
            onAllerCaisse={onAllerCaisse}
          />
        </aside>
      </div>

      {/* MOBILE bottom bar — bouton qui ouvre le panier en bottom-sheet */}
      <div className="lg:hidden shrink-0 border-t-2 border-zinc-800 bg-zinc-950 p-3 flex items-center gap-3">
        <button
          onClick={() => setShowPanierMobile(true)}
          disabled={panier.length === 0}
          className={cn(
            'flex-1 h-14 px-4 rounded-xl flex items-center justify-between gap-2 font-black uppercase tracking-wider text-sm active:scale-95 transition-all',
            panier.length === 0
              ? 'bg-zinc-800 text-zinc-600'
              : 'bg-zinc-900 border-2 border-emerald-500 text-white shadow-lg',
          )}
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <span className="text-xs">{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>
          </span>
          <span className="font-display italic text-base font-medium tabular-nums normal-case">{fmtPrix(totalTTC)}</span>
        </button>
        <button
          onClick={onAllerCaisse}
          disabled={panier.length === 0}
          className={cn(
            'h-14 px-4 rounded-xl font-black text-base uppercase tracking-wider',
            panier.length === 0 ? 'bg-zinc-800 text-zinc-600' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 active:scale-95',
          )}
        >
          Payer →
        </button>
      </div>

      {/* MOBILE bottom-sheet panier détaillé */}
      {showPanierMobile && (
        <div
          className="lg:hidden fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-end"
          onClick={() => setShowPanierMobile(false)}
        >
          <div
            className="w-full max-h-[88vh] bg-zinc-950 rounded-t-3xl flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 p-3 flex items-center justify-center">
              <span className="w-12 h-1.5 rounded-full bg-zinc-700" />
            </div>
            <PanierContenu
              panier={panier}
              nbArticles={nbArticles}
              totalTTC={totalTTC}
              onAjouter={onAjouter}
              onRetirer={onRetirer}
              onSupprimer={onSupprimer}
              onVider={onVider}
              onAllerCaisse={() => { setShowPanierMobile(false); onAllerCaisse() }}
              onClose={() => setShowPanierMobile(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Contenu du panier (extrait pour partage desktop/mobile bottom-sheet) ──
function PanierContenu({
  panier, nbArticles, totalTTC,
  onAjouter, onRetirer, onSupprimer, onVider, onAllerCaisse, onClose,
}: {
  panier: LignePanier[]
  nbArticles: number
  totalTTC: number
  onAjouter: (p: Produit, qty?: number) => void
  onRetirer: (p: Produit) => void
  onSupprimer: (p: Produit) => void
  onVider: () => void
  onAllerCaisse: () => void
  onClose?: () => void
}) {
  return (
    <>
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <p className="font-display italic text-lg font-medium text-white">
          Panier {panier.length > 0 && <span className="text-zinc-500 text-sm">· {nbArticles} article{nbArticles > 1 ? 's' : ''}</span>}
        </p>
        <div className="flex items-center gap-2">
          {panier.length > 0 && (
            <button onClick={onVider} className="text-xs text-zinc-500 hover:text-red-400 underline">Vider</button>
          )}
          {onClose && (
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-lg">×</button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-visible-dark p-3 space-y-2 min-h-0">
        {panier.length === 0 ? (
          <p className="text-center text-zinc-600 italic mt-12 text-sm">Tapez sur un produit pour l&apos;ajouter</p>
        ) : panier.map(l => (
          <div key={l.produit.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-2.5 flex gap-2.5">
            {/* Miniature */}
            {l.produit.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.produit.image_url} alt={l.produit.nom} className="w-14 h-14 rounded-lg object-cover bg-zinc-950 shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center text-2xl shrink-0">🍽</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-medium text-white line-clamp-2 leading-tight">{l.produit.nom}</p>
                <button
                  onClick={() => onSupprimer(l.produit)}
                  className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white text-sm shrink-0 transition-colors active:scale-90"
                  title="Supprimer du panier"
                >🗑</button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => onRetirer(l.produit)} className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-white font-bold text-lg">−</button>
                  <span className="w-8 text-center font-black tabular-nums text-base">{l.quantite}</span>
                  <button onClick={() => onAjouter(l.produit, 1)} className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-white font-bold text-lg">+</button>
                </div>
                <p className="text-sm font-black tabular-nums text-emerald-400">{fmtPrix(l.produit.prix_vente_ht * l.quantite * (1 + TVA))}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 p-3 border-t-2 border-zinc-800 bg-zinc-950 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Total</span>
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
    </>
  )
}

// ─── Indicateur de progression d'étape (haut écran) ──────────────────
function StepBadge({ courant, total }: { courant: number; total: number }) {
  return (
    <div className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i < courant ? 'w-3 bg-emerald-500' : i === courant ? 'w-6 bg-emerald-400' : 'w-3 bg-zinc-700',
            )}
          />
        ))}
      </div>
      <span className="text-[10px] uppercase tracking-widest font-black text-zinc-400 tabular-nums">
        {courant + 1}/{total}
      </span>
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
      <header className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Modifier
        </button>
        <StepBadge courant={0} total={4} />
        <p className="text-2xl sm:text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
      </header>
      <main className="flex-1 overflow-y-auto scroll-visible-dark">
        <div className="min-h-full flex items-center justify-center p-4 sm:p-10">
          <div className="w-full max-w-5xl">
            <h2 className="font-display italic text-2xl sm:text-5xl text-center text-white mb-2">Vous mangez ici ou à emporter ?</h2>
            <p className="text-center text-zinc-400 mb-6 sm:mb-10 text-sm sm:text-base">Choisissez votre option</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <button
                onClick={() => onChoix('sur_place')}
                className={cn(
                  'group relative aspect-[3/2] md:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-3 p-4 sm:p-6 transition-all active:scale-95 shadow-2xl',
                  consommation === 'sur_place'
                    ? 'bg-amber-500 ring-4 ring-amber-300/50 shadow-amber-500/40'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
                )}
              >
                <span className="text-6xl sm:text-9xl">🍽</span>
                <p className="font-display italic text-2xl sm:text-5xl font-medium text-white">Sur place</p>
                <p className="text-xs sm:text-base text-amber-100 opacity-90">Je mange ici</p>
              </button>
              <button
                onClick={() => onChoix('emporter')}
                className={cn(
                  'group relative aspect-[3/2] md:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-3 p-4 sm:p-6 transition-all active:scale-95 shadow-2xl',
                  consommation === 'emporter'
                    ? 'bg-blue-500 ring-4 ring-blue-300/50 shadow-blue-500/40'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30',
                )}
              >
                <span className="text-6xl sm:text-9xl">📦</span>
                <p className="font-display italic text-2xl sm:text-5xl font-medium text-white">À emporter</p>
                <p className="text-xs sm:text-base text-blue-100 opacity-90">J&apos;emporte ma commande</p>
              </button>
            </div>
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
      <header className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Retour
        </button>
        <StepBadge courant={1} total={4} />
        <p className="text-2xl sm:text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
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
// ÉCRAN 1.9 — COMPTE FIDÉLITÉ (saisie téléphone)
// ═══════════════════════════════════════════════════════════════════════
function EcranFidelite({
  totalTTC, clientFidelite, prenomClient, onTrouve, onContinuer, onIgnorer, onRetour,
}: {
  totalTTC: number
  clientFidelite: ClientFidelite | null
  prenomClient: string  // pour préfill création compte
  onTrouve: (c: ClientFidelite) => void
  onContinuer: () => void
  onIgnorer: () => void
  onRetour: () => void
}) {
  const [tel, setTel] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Si pas trouvé → propose création (true = "non trouvé pour ce tel")
  const [proposerCreation, setProposerCreation] = useState(false)

  function tap(d: string) {
    if (d === '⌫') { setTel(prev => prev.slice(0, -1)); setErr(null); setProposerCreation(false); return }
    if (tel.length >= 12) return
    setTel(prev => prev + d)
    setErr(null)
    setProposerCreation(false)
  }

  async function rechercher() {
    if (tel.length < 9) { setErr('Numéro trop court'); return }
    setBusy(true); setErr(null); setProposerCreation(false)
    try {
      const c = await chercherClientFideliteParTel(tel)
      if (c) onTrouve(c)
      else setProposerCreation(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function creerCompte() {
    if (!prenomClient.trim()) {
      setErr('Prénom requis pour créer le compte (étape précédente)')
      return
    }
    setBusy(true); setErr(null)
    try {
      const c = await creerClientFideliteBorne({ prenom: prenomClient, telephone: tel })
      onTrouve(c)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur création')
    } finally {
      setBusy(false)
    }
  }

  // Si client trouvé → écran de confirmation (skip saisie)
  if (clientFidelite) {
    const niveauEmoji: Record<string, string> = { standard: '⭐', or: '🥇', argent: '🥈', bronze: '🥉', platine: '💎', vip: '👑' }
    const emoji = niveauEmoji[clientFidelite.niveau_fidelite.toLowerCase()] ?? '⭐'
    return (
      <div className="flex-1 flex flex-col">
        <header className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <button onClick={onRetour} className="inline-flex items-center gap-2 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
            ← Retour
          </button>
          <StepBadge courant={2} total={4} />
          <p className="text-2xl sm:text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </header>
        <main className="flex-1 overflow-y-auto scroll-visible-dark">
          <div className="min-h-full flex items-center justify-center p-4 sm:p-10">
            <div className="w-full max-w-md text-center">
              <span className="text-7xl sm:text-8xl">{emoji}</span>
              <h2 className="font-display italic text-3xl sm:text-5xl text-white mt-4">
                Bonjour {clientFidelite.prenom ?? clientFidelite.nom ?? ''} !
              </h2>
              <div className="mt-6 rounded-3xl bg-gradient-to-br from-amber-500/10 to-amber-700/10 border-2 border-amber-500/40 p-6 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-amber-300 font-black">Niveau</p>
                  <p className="font-display italic text-2xl text-white capitalize">{clientFidelite.niveau_fidelite}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-amber-300 font-black">Points cumulés</p>
                  <p className="font-display italic text-5xl tabular-nums text-amber-400">{clientFidelite.points_fidelite}</p>
                </div>
                <p className="text-xs text-zinc-400">Visites : {clientFidelite.nb_visites}</p>
              </div>
              <p className="text-sm text-emerald-300 mt-6">
                ✓ Cette commande sera créditée sur votre compte
              </p>
              <button
                onClick={onContinuer}
                className="w-full h-16 mt-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-wider text-base shadow-lg shadow-emerald-500/30 active:scale-95"
              >
                Continuer → paiement
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Sinon : saisie téléphone
  return (
    <div className="flex-1 flex flex-col">
      <header className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← Retour
        </button>
        <StepBadge courant={2} total={4} />
        <p className="text-2xl sm:text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
      </header>
      <main className="flex-1 overflow-y-auto scroll-visible-dark">
        <div className="min-h-full flex flex-col items-center p-4 sm:p-6 py-3">
          <span className="text-5xl sm:text-6xl">🎁</span>
          <h2 className="font-display italic text-2xl sm:text-4xl text-center text-white mt-2">Compte fidélité ?</h2>
          <p className="text-center text-zinc-400 text-sm sm:text-base mt-2 max-w-md">
            Cumulez des points à chaque commande. Tapez votre numéro de téléphone.
          </p>

          {/* Affichage tel */}
          <div className="mt-4 w-full max-w-md">
            <div className="h-16 sm:h-20 rounded-2xl bg-zinc-900 ring-2 ring-zinc-800 flex items-center justify-center px-6">
              <p className={cn(
                'font-display italic text-3xl sm:text-4xl font-medium tabular-nums tracking-widest',
                tel ? 'text-amber-300' : 'text-zinc-600',
              )}>
                {tel || '06 ── ── ── ──'}
              </p>
            </div>
            {err && <p className="text-red-400 text-sm font-bold mt-2 text-center">{err}</p>}
            {/* Proposition de création si pas trouvé */}
            {proposerCreation && !err && (
              <div className="mt-3 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 p-3 sm:p-4 text-center space-y-2">
                <p className="text-amber-300 font-bold text-sm">📭 Aucun compte pour ce numéro</p>
                {prenomClient ? (
                  <>
                    <p className="text-zinc-300 text-xs">
                      Créer un compte fidélité pour <strong className="text-amber-300">{prenomClient}</strong> avec ce numéro ?
                    </p>
                    <button
                      onClick={creerCompte}
                      disabled={busy}
                      className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black uppercase tracking-wider text-xs shadow disabled:opacity-50 active:scale-95"
                    >
                      {busy ? '⏳ Création…' : '🎁 Créer mon compte fidélité'}
                    </button>
                  </>
                ) : (
                  <p className="text-zinc-400 text-xs italic">
                    Reviens en arrière pour saisir un prénom afin de créer un compte.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Clavier numérique */}
          <div className="mt-4 grid grid-cols-3 gap-2 w-full max-w-sm">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                onClick={() => tap(d)}
                disabled={busy}
                className="h-14 sm:h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white font-display italic text-2xl sm:text-3xl font-medium tabular-nums transition-all active:scale-95 border border-zinc-800 disabled:opacity-40"
              >{d}</button>
            ))}
            <button
              onClick={() => tap('⌫')}
              disabled={busy}
              className="h-14 sm:h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xl disabled:opacity-40"
            >⌫</button>
            <button
              onClick={() => tap('0')}
              disabled={busy}
              className="h-14 sm:h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white font-display italic text-2xl sm:text-3xl font-medium tabular-nums transition-all active:scale-95 border border-zinc-800 disabled:opacity-40"
            >0</button>
            <button
              onClick={rechercher}
              disabled={busy || tel.length < 9}
              className={cn(
                'h-14 sm:h-16 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-95',
                busy || tel.length < 9
                  ? 'bg-zinc-800 text-zinc-600'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30',
              )}
            >{busy ? '…' : 'OK'}</button>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-col w-full max-w-sm gap-2">
            <button
              onClick={onIgnorer}
              className="h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase tracking-wider text-xs"
            >
              Continuer sans compte
            </button>
          </div>
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
      <header className="shrink-0 px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <button onClick={onRetour} className="inline-flex items-center gap-2 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-sm">
          ← <span className="hidden sm:inline">Modifier</span>
        </button>
        <StepBadge courant={3} total={4} />
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{nbArticles} article{nbArticles > 1 ? 's' : ''}</p>
          <p className="text-3xl font-black tabular-nums text-white">{fmtPrix(totalTTC)}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-visible-dark">
        <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-5xl">
            <h2 className="font-display italic text-2xl sm:text-4xl text-center text-white mb-2">Choisissez votre mode de paiement</h2>
            <p className="text-center text-zinc-400 mb-6 sm:mb-8 text-sm sm:text-base">Sélectionnez l&apos;option qui vous convient</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Bouton NFC */}
              <button
                onClick={onNFC}
                disabled={!supportNFC}
                className={cn(
                  'group relative aspect-[3/2] md:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-3 p-4 sm:p-6 transition-all',
                  supportNFC
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-2xl shadow-emerald-500/40'
                    : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed',
                )}
              >
                <NFCOndes active={supportNFC} />
                <div className="text-center mt-1">
                  <p className="font-display italic text-xl sm:text-3xl font-medium text-white">Sans contact</p>
                  <p className="text-xs sm:text-base text-emerald-100 mt-1 sm:mt-2">
                    Carte ou téléphone<br />
                    <span className="opacity-80 text-[10px] sm:text-xs">Approchez de l&apos;écran</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xl sm:text-2xl">
                  <span title="Visa">💳</span><span title="Apple Pay">🍎</span><span title="Google Pay">G</span>
                </div>
                {!supportNFC && (
                  <p className="absolute bottom-2 text-[10px] text-zinc-500 italic">Indisponible sur cette tablette</p>
                )}
              </button>

              {/* Bouton Comptoir */}
              <button
                onClick={onComptoir}
                className="group relative aspect-[3/2] md:aspect-[4/5] rounded-3xl flex flex-col items-center justify-center gap-3 p-4 sm:p-6 bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-2xl shadow-blue-500/40 transition-all"
              >
                <span className="text-5xl sm:text-8xl">🏪</span>
                <div className="text-center">
                  <p className="font-display italic text-xl sm:text-3xl font-medium text-white">Au comptoir</p>
                  <p className="text-xs sm:text-base text-blue-100 mt-1 sm:mt-2">
                    Carte à insérer<br />
                    <span className="opacity-80 text-[10px] sm:text-xs">ou espèces</span>
                  </p>
                </div>
              </button>
            </div>
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
// ═══════════════════════════════════════════════════════════════════════
// MODAL FICHE PRODUIT (McDo-style)
// ═══════════════════════════════════════════════════════════════════════
// S'ouvre au tap sur un produit du catalogue : image en grand, nom,
// description, prix, sélecteur quantité +/-, bouton "Ajouter X au panier".
// Si déjà au panier : la quantité initiale = celle au panier, validation
// remplace (pas cumul) — comme McDo.
function FicheProduitModal({
  produit, quantiteActuelle, onClose, onAjouter,
}: {
  produit: Produit
  quantiteActuelle: number
  onClose: () => void
  onAjouter: (qty: number) => void
}) {
  const initial = quantiteActuelle > 0 ? quantiteActuelle : 1
  const [qty, setQty] = useState<number>(initial)
  const prixUnit = produit.prix_vente_ht * (1 + TVA)
  const prixTotal = prixUnit * qty
  const dejaPresent = quantiteActuelle > 0

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-stretch justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-zinc-950 rounded-3xl border-2 border-zinc-800 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Image header */}
        <div className="relative shrink-0">
          {produit.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={produit.image_url} alt={produit.nom} className="w-full h-56 sm:h-72 object-cover bg-zinc-900" />
          ) : (
            <div className="w-full h-56 sm:h-72 bg-zinc-800 flex items-center justify-center text-8xl">
              {produit.tag_destination === 'BAR' ? '🥤' : '🍽'}
            </div>
          )}
          {/* Close X */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white text-2xl flex items-center justify-center shadow-lg"
          >×</button>
          {/* Favori */}
          {produit.favori && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-500 text-white text-xs font-black shadow-lg">
              ⭐ Favori
            </span>
          )}
          {/* Gradient bottom pour le titre */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-black">{produit.categorie}</p>
            <h2 className="font-display italic text-3xl sm:text-4xl font-medium text-white mt-1 leading-tight">{produit.nom}</h2>
          </div>

          {produit.description && (
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">{produit.description}</p>
          )}

          <div className="flex items-baseline gap-2 pt-2 border-t border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Prix unitaire</span>
            <span className="font-display italic text-2xl font-medium tabular-nums text-emerald-400">{fmtPrix(prixUnit)}</span>
          </div>

          {dejaPresent && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300">
              ⓘ Déjà dans le panier (×{quantiteActuelle}). La validation remplacera la quantité.
            </div>
          )}

          {/* Quantité */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center justify-between gap-4">
            <span className="text-sm font-black uppercase tracking-widest text-zinc-400">Quantité</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(q => Math.max(0, q - 1))}
                className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-3xl font-black"
              >−</button>
              <span className="font-display italic text-4xl font-medium tabular-nums w-14 text-center text-white">{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-3xl font-black"
              >+</button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 p-4 border-t-2 border-zinc-800 bg-zinc-950 flex flex-col gap-2">
          <button
            onClick={() => onAjouter(qty)}
            disabled={qty < 0}
            className={cn(
              'w-full h-16 rounded-2xl font-black uppercase tracking-wider text-base transition-all active:scale-95',
              qty === 0
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/40',
            )}
          >
            {qty === 0
              ? dejaPresent ? '🗑 Retirer du panier' : 'Annuler'
              : <>✓ {dejaPresent ? 'Modifier' : 'Ajouter'} · {fmtPrix(prixTotal)}</>}
          </button>
          <button
            onClick={onClose}
            className="h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase tracking-wider text-xs"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

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
