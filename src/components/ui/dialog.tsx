'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

export function Dialog({
  open, onClose, children, className, panelClassName,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  panelClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = orig
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in duration-150',
        className
      )}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'bg-background w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden',
          'rounded-t-3xl sm:rounded-2xl',
          'animate-in slide-in-from-bottom sm:zoom-in-95 duration-200',
          panelClassName
        )}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-5 border-b shrink-0">
      <div className="min-w-0 flex-1">
        <div className="w-10 h-1 bg-muted rounded-full mb-3 sm:hidden mx-auto" />
        {children}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground shrink-0"
          aria-label="Fermer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-xl font-bold leading-tight', className)}>{children}</h2>
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mt-0.5">{children}</p>
}

export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 overflow-y-auto p-5', className)} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>{children}</div>
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('border-t p-3 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0 bg-background', className)}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      {children}
    </div>
  )
}
