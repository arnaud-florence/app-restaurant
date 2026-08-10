'use client'

// Bouton « 📲 Installer l'app » pour Android/Chrome.
// Capte l'event `beforeinstallprompt` (Chromium uniquement) et propose un CTA
// d'installation. Se masque si l'app est déjà installée (standalone) ou si le
// navigateur n'émet pas l'event (iOS Safari : voir l'aide d'install dans
// PushNotifSwitch ; l'installation y passe par Partager → écran d'accueil).

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return }
    const onPrompt = (e: Event) => {
      e.preventDefault() // empêche la mini-infobar Chrome, on gère le CTA nous-mêmes
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !deferred) return null

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt()
        const { outcome } = await deferred.userChoice
        if (outcome === 'accepted') setInstalled(true)
        setDeferred(null)
      }}
      className="w-full flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
    >
      <Download className="h-4 w-4" />
      Installer l&apos;app sur l&apos;écran d&apos;accueil
    </button>
  )
}
