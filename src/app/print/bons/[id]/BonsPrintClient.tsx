'use client'

import { useEffect, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { TagDestination } from '@/lib/service'
import type { BonsPrintData } from './types'

const DEST_INFO: Record<TagDestination, { label: string; emoji: string }> = {
  CUISINE:  { label: 'CUISINE',  emoji: '👨‍🍳' },
  SNACKING: { label: 'SNACKING', emoji: '🥪' },
  PIZZA:    { label: 'PIZZA',    emoji: '🍕' },
  BAR:      { label: 'BAR',      emoji: '🍷' },
}

const ORDRE: TagDestination[] = ['CUISINE', 'PIZZA', 'BAR']

export default function BonsPrintClient({ data, auto }: { data: BonsPrintData; auto: boolean }) {
  // Auto-print à l'ouverture si ?auto=1 (utilisé par l'iframe caché en cuisine/bar)
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => {
      try { window.print() } catch { /* ignore */ }
    }, 250)
    return () => clearTimeout(t)
  }, [auto])

  const { commande, articles } = data

  // Groupage par destination, conserver l'ordre CUISINE → PIZZA → BAR
  const groupes = useMemo(() => {
    const m = new Map<TagDestination, typeof articles>()
    for (const a of articles) {
      if (!m.has(a.tag_destination)) m.set(a.tag_destination, [])
      m.get(a.tag_destination)!.push(a)
    }
    return ORDRE.filter(d => m.has(d)).map(d => ({ dest: d, items: m.get(d)! }))
  }, [articles])

  if (articles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 p-8">
        <div className="text-center">
          <p className="text-base">Aucun article à imprimer pour cette commande.</p>
          <button onClick={() => window.history.back()} className="mt-4 h-10 px-4 rounded border border-zinc-300 text-sm">← Retour</button>
        </div>
      </div>
    )
  }

  const heure = format(parseISO(commande.created_at), 'HH:mm', { locale: fr })
  const dateCourte = format(parseISO(commande.created_at), 'dd/MM', { locale: fr })

  return (
    <div className="bg-zinc-100 min-h-screen text-zinc-900 print:bg-white">
      <style>{`
        @media screen {
          .ticket { margin: 1.25rem auto; box-shadow: 0 4px 16px rgba(0,0,0,.12); }
        }
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          html, body { background: white; }
          .no-print { display: none !important; }
          .ticket { box-shadow: none; margin: 0; page-break-after: always; }
          .ticket:last-child { page-break-after: auto; }
        }
      `}</style>

      {/* Toolbar à l'écran uniquement */}
      <div className="no-print sticky top-0 bg-white border-b border-zinc-200 px-4 py-2 flex items-center justify-between gap-2 z-10">
        <button
          onClick={() => window.history.back()}
          className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold"
        >← Retour</button>
        <div className="text-sm text-zinc-600">
          Commande <b className="font-mono">{commande.numero}</b>
          {commande.numero_table && <> — Table <b>T{commande.numero_table}</b></>}
        </div>
        <button
          onClick={() => window.print()}
          className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold"
        >🖨 Imprimer</button>
      </div>

      <div className="py-4">
        {groupes.map(({ dest, items }) => {
          const info = DEST_INFO[dest]
          return (
            <article
              key={dest}
              className="ticket bg-white px-3 py-3 font-mono text-[12px] leading-tight"
              style={{ width: '74mm' }}
            >
              {/* En-tête destination — ENORME pour repérage rapide en cuisine */}
              <header className="text-center border-b-2 border-dashed border-zinc-900 pb-2 mb-2">
                <div className="text-2xl font-black tracking-wider">{info.emoji} {info.label}</div>
                {commande.numero_table && (
                  <div className="text-3xl font-black mt-1">TABLE {commande.numero_table}</div>
                )}
              </header>

              {/* Méta : heure + numéro + serveur */}
              <div className="flex justify-between text-[11px] mb-2">
                <span><b>{heure}</b> · {dateCourte}</span>
                <span className="text-zinc-600">{commande.numero}</span>
              </div>
              {commande.serveur_nom && (
                <div className="text-[11px] mb-2">Serveur : <b>{commande.serveur_nom}</b></div>
              )}

              {/* Créneau de retrait — bien visible pour cuisine/snack/pizza */}
              {commande.creneau_retrait && (() => {
                const cr = parseISO(commande.creneau_retrait)
                const heureRetrait = format(cr, 'HH:mm', { locale: fr })
                const today = new Date()
                const sameDay = cr.toDateString() === today.toDateString()
                const dateRetrait = sameDay
                  ? "AUJOURD'HUI"
                  : format(cr, 'EEE dd/MM', { locale: fr }).toUpperCase()
                return (
                  <div className="my-2 px-2 py-1.5 border-2 border-zinc-900 bg-zinc-900 text-white text-center">
                    <div className="text-[10px] font-bold tracking-wider opacity-80">RETRAIT</div>
                    <div className="text-xl font-black leading-tight">🕒 {heureRetrait}</div>
                    <div className="text-[10px] font-bold">{dateRetrait}</div>
                  </div>
                )
              })()}

              {/* Articles : grosse quantité × nom */}
              <ul className="space-y-1.5 border-y-2 border-dashed border-zinc-900 py-2">
                {items.map(a => (
                  <li key={a.id}>
                    {a.allergenes_a_eviter.length > 0 && (
                      <div className="mb-1 px-1.5 py-1 border-2 border-zinc-900 bg-zinc-900 text-white text-[11px] font-black uppercase tracking-wider">
                        🚨 ALLERGIE — éviter : {a.allergenes_a_eviter.join(', ')}
                      </div>
                    )}
                    <div className="flex gap-2 items-baseline">
                      <span className="text-2xl font-black tabular-nums">×{a.quantite}</span>
                      <span className="text-base font-bold leading-tight uppercase">{a.recette_nom}</span>
                    </div>
                    {a.commentaire && (
                      <div className="ml-7 mt-0.5 text-[11px] font-bold uppercase border border-zinc-900 px-1.5 py-0.5 inline-block">
                        ⚠ {a.commentaire}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Notes commande */}
              {commande.notes && (
                <div className="mt-2 text-[11px] italic">
                  📝 {commande.notes}
                </div>
              )}

              {/* Pied : nb d'articles */}
              <footer className="text-center text-[10px] mt-2 text-zinc-600">
                {items.reduce((s, a) => s + a.quantite, 0)} pièce{items.reduce((s, a) => s + a.quantite, 0) > 1 ? 's' : ''} — {info.label}
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}
