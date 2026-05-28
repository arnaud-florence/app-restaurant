// Carte tactile pour la sélection d'un produit dans les pickers de commande.
// Utilisé sur /serveur, /emporter (via ComptoirOrderModal) et /bar.
//
// Design :
//   - Aspect 1:1 sur la photo en haut (cover)
//   - Nom + prix en bas, badge destination top-left, compteur ×N top-right
//   - Fallback emoji destination si image absente ou erreur de chargement
//   - Tactile : min-height 160px, active:scale-95 pour feedback haptique visuel
//
// Performance :
//   - <img> natif (pas next/image) pour éviter la config remotePatterns
//   - loading="lazy" + decoding="async"
//   - State imgError local pour basculer sur le fallback emoji

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getRecettePhoto } from '@/lib/recettePhoto'

export type ProduitCardData = {
  id: string
  nom: string
  prix_vente_ht: number
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  image_url?: string | null
  photo_url?: string | null
  favori?: boolean
}

const FALLBACK_BY_DEST: Record<string, { emoji: string; bg: string }> = {
  CUISINE:  { emoji: '👨‍🍳', bg: 'bg-amber-950/40' },
  PIZZA:    { emoji: '🍕', bg: 'bg-red-950/40' },
  BAR:      { emoji: '🍷', bg: 'bg-violet-950/40' },
  SNACKING: { emoji: '🥪', bg: 'bg-emerald-950/40' },
}

const BADGE_BY_DEST: Record<string, string> = {
  CUISINE:  'bg-amber-500/90 text-amber-50',
  PIZZA:    'bg-red-500/90 text-red-50',
  BAR:      'bg-violet-500/90 text-violet-50',
  SNACKING: 'bg-emerald-500/90 text-emerald-50',
}

function fmtPrix(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export default function ProduitCard({
  produit, onClick, compteur = 0, disabled = false,
}: {
  produit: ProduitCardData
  onClick: () => void
  /** Quantité déjà dans le panier (affiche un badge ×N en top-right si > 0). */
  compteur?: number
  disabled?: boolean
}) {
  const [imgError, setImgError] = useState(false)
  // getRecettePhoto fournit un fallback Unsplash thématique par catégorie+tag
  // si aucune photo n'est définie en DB → on a TOUJOURS une photo à afficher.
  const src = getRecettePhoto({
    photo_url: produit.photo_url,
    image_url: produit.image_url,
    tag_destination: produit.tag_destination,
  })
  const fallback = FALLBACK_BY_DEST[produit.tag_destination] ?? { emoji: '🍽', bg: 'bg-zinc-900' }
  const badge = BADGE_BY_DEST[produit.tag_destination] ?? 'bg-zinc-700 text-white'
  const showImage = src && !imgError

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative rounded-xl overflow-hidden border-2 text-left transition-all',
        'active:scale-95 disabled:opacity-40 disabled:active:scale-100',
        compteur > 0
          ? 'border-emerald-500 bg-emerald-950/30 shadow-lg shadow-emerald-500/10'
          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600',
      )}
    >
      {/* Photo carrée 1:1 — ou fallback emoji */}
      <div className={cn('relative w-full aspect-square overflow-hidden', !showImage && fallback.bg)}>
        {showImage ? (
          <img
            src={src}
            alt={produit.nom}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl opacity-80">
            <span aria-hidden>{fallback.emoji}</span>
          </div>
        )}

        {/* Compteur ×N en top-right si déjà au panier */}
        {compteur > 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-emerald-500 text-white font-bold text-sm shadow-md">
            ×{compteur}
          </span>
        )}

        {/* Badge destination en top-left */}
        <span className={cn(
          'absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
          badge,
        )}>
          {fallback.emoji}
        </span>

        {/* Étoile favori en bottom-left si applicable */}
        {produit.favori && (
          <span
            className="absolute bottom-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/90 text-white shadow-md text-base"
            aria-label="Favori"
          >★</span>
        )}
      </div>

      {/* Footer : nom + prix */}
      <div className="px-2.5 py-2 bg-zinc-950">
        <p className="text-sm font-semibold text-white leading-tight line-clamp-2 min-h-[2.5em]">
          {produit.nom}
        </p>
        <p className="text-emerald-400 font-bold text-base tabular-nums mt-1">
          {fmtPrix(produit.prix_vente_ht)} <span className="text-[10px] font-medium text-emerald-400/60">HT</span>
        </p>
      </div>
    </button>
  )
}
