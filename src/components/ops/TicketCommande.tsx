'use client'

// Ticket de commande PARTAGÉ entre les écrans KDS Cuisine et Bar.
// Avant : chaque écran réimplémentait sa propre carte (~200 lignes quasi
// identiques) → incohérences + maintenance double. Désormais une seule source
// de vérité pour le rendu d'un ticket (entête source + minuteur, bandeau
// allergènes, liste d'articles avec transition de statut, action groupée).
//
// Les écrans gardent leurs spécificités (FIFO badge en cuisine, agenda, KPIs)
// dans leur propre fichier ; seule la CARTE est mutualisée.
//
// Deux réglages cosmétiques par écran :
//   - headerTone : 'plain' (fond sombre, cuisine) | 'source' (fond teinté par source, bar)
//   - subtitle   : ce qui s'affiche à côté du badge source (n° commande, nb lignes…)

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutArticle,
  STATUT_ARTICLE_LABEL, SOURCE_LABEL, TAG_DEST_LABEL,
  statutMinuteur, STATUT_MINUTEUR_STYLE, formatEcoule,
} from '@/lib/service'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'

export default function TicketCommande({
  commande,
  articles,
  now,
  onTransition,
  headerTone = 'source',
  subtitle,
  compact = false,
  cb = false,
  permetRemise = false,
}: {
  commande: CommandeService
  articles: CommandeService['articles']
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
  headerTone?: 'plain' | 'source'
  subtitle?: ReactNode
  compact?: boolean
  cb?: boolean
  /** Affiche « Remis au client » quand tout est prêt. Réservé aux postes qui
   *  remettent eux-mêmes la commande (comptoir du Fournil) : en cuisine ou au
   *  bar, c'est le serveur qui clôt, pas la brigade. */
  permetRemise?: boolean
}) {
  const min = statutMinuteur(commande.created_at, now)
  const minSty = STATUT_MINUTEUR_STYLE[min]
  // Mode daltonien : glyphe de forme distinct par état (lisible sans couleur).
  const cbGlyph = min === 'rouge' ? '■' : min === 'orange' ? '◆' : '●'
  const sourceSty = SOURCE_LABEL[commande.source]

  // Autres articles de la commande (autres postes) — coordination livraison
  const idsCePoste = new Set(articles.map(a => a.id))
  const autresArticles = commande.articles.filter(a => !idsCePoste.has(a.id))
  const tousLesAutresPrets = autresArticles.length > 0 && autresArticles.every(a => a.statut === 'pret' || a.statut === 'servi')

  // Statuts agrégés (bordure + bouton groupé)
  const tousEnAttente = articles.every(a => a.statut === 'en_attente')
  const tousPret = articles.every(a => a.statut === 'pret')

  // Allergènes agrégés (bandeau rouge si au moins un article concerné)
  const allergenes = Array.from(new Set(articles.flatMap(a => a.allergenes_a_eviter)))

  function avancerTous(cible: StatutArticle) {
    for (const a of articles) {
      if (a.statut !== cible && a.statut !== 'servi') onTransition(a.id, cible)
    }
  }

  // Bordure gauche épaisse selon source (repère visuel cohérent cuisine/bar)
  const sourceBorderL =
    commande.source === 'TABLE'    ? 'border-l-[6px] border-l-blue-500' :
    commande.source === 'COMPTOIR' ? 'border-l-[6px] border-l-violet-500' :
    commande.source === 'BORNE'    ? 'border-l-[6px] border-l-red-500' :
    'border-l-[6px] border-l-emerald-500'

  const sourceHeaderBg =
    commande.source === 'TABLE'    ? 'bg-blue-950/50' :
    commande.source === 'COMPTOIR' ? 'bg-violet-950/50' :
    commande.source === 'BORNE'    ? 'bg-red-950/50' :
    'bg-emerald-950/50'

  // Bandeau créneau retrait — créneau SPÉCIFIQUE au tag du ticket (multi-zones)
  const isOnline = commande.source === 'ONLINE'
  const tagDuTicket = articles[0]?.tag_destination
  const creneauTag = tagDuTicket ? commande.creneaux_par_tag?.[tagDuTicket] : null
  const creneauIso = creneauTag ?? commande.creneau_retrait ?? null
  const creneauTime = creneauIso ? new Date(creneauIso).getTime() : null
  const minutesRestantes = creneauTime ? Math.round((creneauTime - now) / 60000) : null
  const urgenceCls = !creneauTime || minutesRestantes === null ? null
    : minutesRestantes < 0 ? 'bg-red-600 animate-pulse'
    : minutesRestantes < 10 ? 'bg-amber-500'
    : minutesRestantes < 20 ? 'bg-blue-500'
    : 'bg-emerald-700'

  const headerBg = headerTone === 'plain' ? 'bg-zinc-950' : sourceHeaderBg
  const sousTitre = subtitle ?? `${articles.length} ligne${articles.length > 1 ? 's' : ''}`

  return (
    <div className={cn(
      'rounded-lg border-2 bg-zinc-900 overflow-hidden',
      sourceBorderL,
      tousPret      ? 'border-emerald-500/70' :
      tousEnAttente ? 'border-blue-500/50' :
                      'border-amber-500/50',
    )}>
      {/* Bandeau créneau retrait (ONLINE / COMPTOIR avec réservation) */}
      {creneauTime && (
        <div className={cn('px-3 py-2 text-white flex items-center justify-between gap-2', urgenceCls)}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isOnline ? '📦' : '🛒'}</span>
            <div>
              <p className="text-[11px] uppercase tracking-wider opacity-90 leading-none">
                Retrait {isOnline ? 'web' : 'comptoir'} à
              </p>
              <p className="text-base font-bold tabular-nums leading-tight">
                {new Date(creneauTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {minutesRestantes !== null && (
            <p className="text-xl font-bold tabular-nums">
              {minutesRestantes < 0 ? `+${Math.abs(minutesRestantes)} min` : `${minutesRestantes} min`}
            </p>
          )}
        </div>
      )}

      {/* Header : source + sous-titre + impression + minuteur */}
      <div className={cn('px-3 py-2 flex items-center justify-between gap-2', headerBg)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs font-black uppercase tracking-wide px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0', sourceSty.bg, sourceSty.text)}>
            <span className="text-sm">{sourceSty.emoji}</span> {commande.source === 'TABLE' && commande.numero_table ? `T${commande.numero_table}` : sourceSty.label}
          </span>
          <span className="text-xs text-zinc-400 truncate">{sousTitre}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/print/bons/${commande.id}?dest=${articles[0]?.tag_destination ?? ''}`}
            target="_blank"
            rel="noopener"
            className="text-base min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
            title="Réimprimer le bon de préparation"
          >🖨</a>
          <div className={cn('font-bold tabular-nums px-2.5 py-1 rounded-md', minSty.bg, minSty.text,
            min === 'rouge' ? 'text-lg animate-pulse ring-2 ring-red-300' : 'text-sm')}>
            {cb && <span className="mr-1 font-black">{cbGlyph}</span>}⏱ {formatEcoule(commande.created_at, now)}
          </div>
        </div>
      </div>

      {/* Allergènes agrégés (bandeau rouge pulsant) */}
      {allergenes.length > 0 && (
        <div className="px-3 py-2 bg-red-600 text-white border-y-4 border-yellow-300 animate-pulse">
          <p className="text-xs font-black uppercase tracking-wider">🚨 ALLERGIE CLIENT</p>
          <p className="text-base font-black mt-0.5">
            ⛔ Éviter : {allergenes.map(a => {
              const info = ALLERGENE_INFO[a as Allergene]
              return info ? `${info.emoji} ${info.label}` : a
            }).join(' · ')}
          </p>
        </div>
      )}

      {/* Liste des articles du poste avec leur statut individuel */}
      <ul className="divide-y divide-zinc-800">
        {articles.map(a => {
          const aSty = STATUT_ARTICLE_LABEL[a.statut]
          const next: StatutArticle | null =
            a.statut === 'en_attente' ? 'en_preparation' :
            a.statut === 'en_preparation' ? 'pret' :
            null
          return (
            <li key={a.id} className={cn('px-3', compact ? 'py-1.5' : 'py-2.5')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-lg font-black tabular-nums text-zinc-200 bg-zinc-800 rounded-md px-2 py-0.5 shrink-0">×{a.quantite}</span>
                  <p className="text-lg font-bold leading-tight break-words text-zinc-50">{a.recette_nom}</p>
                </div>
                <span className={cn('text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0', aSty.bg, aSty.text)}>
                  {aSty.emoji} <span className="hidden sm:inline">{aSty.label}</span>
                </span>
                {next && (
                  <button
                    onClick={() => onTransition(a.id, next)}
                    className={cn(
                      'min-h-[48px] min-w-[48px] px-3 text-base rounded-md font-bold transition-colors active:scale-95 shrink-0',
                      a.statut === 'en_attente' ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                    )}
                  >
                    {a.statut === 'en_attente' ? '🔥' : '✓'}
                  </button>
                )}
              </div>
              {a.commentaire && (
                <p className="mt-1.5 text-sm text-amber-200 bg-amber-900/40 border border-amber-700 rounded px-2 py-1 italic">
                  ⚠ {a.commentaire}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {/* Notes de commande + serveur (si présents) — masqué en vue compacte */}
      {!compact && (commande.notes || commande.serveur_nom) && (
        <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-400 space-y-1">
          {commande.notes && <p className="italic">📝 {commande.notes}</p>}
          {commande.serveur_nom && <p className="text-[11px] text-zinc-400">Serveur : {commande.serveur_nom}</p>}
        </div>
      )}

      {/* Autres articles de la même commande (autres postes) — masqué en vue compacte */}
      {!compact && autresArticles.length > 0 && (
        <div className="mx-3 mb-2 mt-2 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">
            📦 Aussi dans cette commande {tousLesAutresPrets && <span className="text-emerald-400">· tout est prêt</span>}
          </p>
          <ul className="space-y-1">
            {autresArticles.map(a => {
              const tagSty = TAG_DEST_LABEL[a.tag_destination] ?? { emoji: '·', label: a.tag_destination, cls: '' }
              const aSty = STATUT_ARTICLE_LABEL[a.statut]
              return (
                <li key={a.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate text-zinc-300">
                    <span className="opacity-70">{tagSty.emoji}</span> <b className="tabular-nums">×{a.quantite}</b> {a.recette_nom}
                  </span>
                  <span className={cn('text-[11px] px-1.5 py-0.5 rounded shrink-0', aSty.bg, aSty.text)}>
                    {aSty.emoji}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Remise au client : dernier geste d'une commande web au Fournil.
          Sans lui, le ticket reste bloqué à « prêt » — la chaîne d'états
          s'arrête à 'pret' et plus aucun bouton n'apparaît. Marquer tout
          'servi' clôt la commande en 'encaisse' (cf. estRetraitFournil). */}
      {tousPret && permetRemise && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-950/50">
          <button
            onClick={() => avancerTous('servi')}
            className={cn(
              'w-full rounded-md font-bold uppercase tracking-wider transition-colors active:scale-[0.98] bg-zinc-100 hover:bg-white text-zinc-900',
              compact ? 'min-h-[44px] text-sm' : 'min-h-[56px] text-base',
            )}
          >
            📦 Remis au client
          </button>
        </div>
      )}

      {/* Action groupée : avancer tous les articles d'un coup */}
      {!tousPret && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-950/50">
          <button
            onClick={() => avancerTous(tousEnAttente ? 'en_preparation' : 'pret')}
            className={cn(
              'w-full rounded-md font-bold uppercase tracking-wider transition-colors active:scale-[0.98]',
              compact ? 'min-h-[44px] text-sm' : 'min-h-[56px] text-base',
              tousEnAttente ? 'bg-amber-500 hover:bg-amber-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white'
            )}
          >
            {tousEnAttente ? '🔥 Prendre tout en préparation' : '✓ Marquer tout prêt'}
          </button>
        </div>
      )}
    </div>
  )
}
