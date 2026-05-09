'use client'

// Bouton cloche avec badge nb non-lues + drawer liste.
// Auto-refresh toutes les 30s.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TYPE_INFO, type Notification } from '@/lib/notifications-types'

export default function NotificationsBell({ inverse = false }: { inverse?: boolean }) {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [nbNonLues, setNbNonLues] = useState(0)

  async function reload() {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      setNotifs(data.notifications ?? [])
      setNbNonLues(data.non_lues ?? 0)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    reload()
    const t = setInterval(reload, 30_000)
    return () => clearInterval(t)
  }, [])

  async function marquerToutesLues() {
    try {
      await fetch('/api/notifications', { method: 'POST' })
      setNbNonLues(0)
      setNotifs(prev => prev.map(n => ({ ...n, lu: true })))
    } catch { /* ignore */ }
  }

  function fmtTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'maintenant'
    if (min < 60) return `il y a ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `il y a ${h} h`
    const d = Math.floor(h / 24)
    if (d < 7) return `il y a ${d} j`
    return new Date(iso).toLocaleDateString('fr-FR')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'relative inline-flex items-center justify-center w-10 h-10 rounded-md transition-colors',
          inverse
            ? 'text-stone-300 hover:bg-stone-800 hover:text-white'
            : 'text-zinc-600 hover:bg-zinc-100',
        )}
        aria-label={`${nbNonLues} notification${nbNonLues > 1 ? 's' : ''} non lue${nbNonLues > 1 ? 's' : ''}`}
      >
        <Bell className="h-5 w-5" />
        {nbNonLues > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {nbNonLues > 9 ? '9+' : nbNonLues}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} aria-hidden />
          <aside className={cn(
            'fixed inset-x-0 bottom-0 z-50 bg-white max-h-[85vh] overflow-y-auto transition-transform',
            'rounded-t-xl shadow-2xl',
            'md:max-w-md md:right-4 md:left-auto md:bottom-4 md:top-16 md:rounded-xl',
          )}>
            <div className="sticky top-0 bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                <h2 className="font-bold">Notifications</h2>
                {nbNonLues > 0 && <span className="text-xs bg-white/20 px-2 rounded-full">{nbNonLues} non lues</span>}
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-emerald-500 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 space-y-2">
              {nbNonLues > 0 && (
                <button
                  onClick={marquerToutesLues}
                  className="w-full flex items-center justify-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 py-1"
                >
                  <Check className="h-3 w-3" /> Marquer tout comme lu
                </button>
              )}

              {notifs.length === 0 ? (
                <p className="text-sm text-zinc-500 italic text-center py-6">Aucune notification.</p>
              ) : (
                <ul className="space-y-1.5">
                  {notifs.map(n => {
                    const info = TYPE_INFO[n.type]
                    return (
                      <li key={n.id}>
                        <Link
                          href={n.url_action ?? '#'}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'block rounded-md border p-3 transition-colors',
                            n.lu ? 'bg-white' : 'bg-emerald-50/50 border-emerald-200',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-lg shrink-0">{info.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-sm', !n.lu && 'font-bold')}>{n.titre}</p>
                              <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-zinc-400 mt-0.5">{fmtTime(n.created_at)}</p>
                            </div>
                            {!n.lu && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" />}
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
