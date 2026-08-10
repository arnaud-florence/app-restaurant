'use client'

// Bouton « 🔔 Activer notifications » : demande la permission, souscrit le
// Service Worker au Push Manager, POST l'objet PushSubscription au backend.
//
// Affiché uniquement pour les employés connectés (employe_id rattaché).
// Auto-hide si :
//  - le navigateur ne supporte pas Notification ou PushManager
//  - aucune VAPID public key configurée

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Std)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// iOS (iPhone/iPad) — y compris iPadOS 13+ qui se fait passer pour un Mac.
function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
// L'app tourne-t-elle en PWA installée (écran d'accueil) plutôt qu'en onglet Safari ?
function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

export default function PushNotifSwitch() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [iosInstallHint, setIosInstallHint] = useState(false)

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'Notification' in window &&
      'PushManager' in window &&
      !!VAPID_PUBLIC_KEY
    setSupported(ok)
    if (!ok) {
      // Sur iPhone/iPad, le Push n'est exposé qu'une fois l'app installée sur
      // l'écran d'accueil (iOS ≥ 16.4). En onglet Safari, PushManager est absent
      // → on affiche une aide d'installation plutôt que de masquer le bouton.
      if (isIOS() && !isStandalone() && !!VAPID_PUBLIC_KEY) setIosInstallHint(true)
      return
    }

    // Vérifie si déjà souscrit ET si le backend connaît la souscription
    // (sinon : browser dit OK, mais DB peut être vide après login d'un nouvel
    // utilisateur ou perte de la table → on resync silencieusement).
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!sub) { setSubscribed(false); return }

        // Resync backend (idempotent UPSERT on endpoint)
        const json = sub.toJSON()
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          }),
        })
        setSubscribed(res.ok)
        if (!res.ok) {
          // Backend refuse : on retire la souscription browser-side pour
          // que le bouton montre l'état réel (désactivé) sans tromper.
          try { await sub.unsubscribe() } catch { /* ignore */ }
        }
      } catch {
        setSubscribed(false)
      }
    })()
  }, [])

  if (!supported) {
    if (iosInstallHint) {
      return (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Bell className="h-4 w-4" /> Notifications sur iPhone</p>
          <p>
            Pour recevoir les alertes, installe d&apos;abord l&apos;app : appuie sur <b>Partager</b> (le carré avec une flèche ↑) en bas de Safari, puis <b>« Sur l&apos;écran d&apos;accueil »</b>. Rouvre l&apos;app depuis sa nouvelle icône, puis reviens ici pour activer les notifications.
          </p>
        </div>
      )
    }
    return null
  }

  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout ${label} (${ms / 1000}s)`)), ms)
      p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
    })
  }

  async function subscribe() {
    // Garde-fou iOS : hors PWA installée, l'abonnement échoue en silence.
    if (isIOS() && !isStandalone()) {
      setError("Sur iPhone, installe d'abord l'app : Partager → « Sur l'écran d'accueil », puis rouvre-la depuis l'icône avant d'activer les notifications.")
      return
    }
    setBusy(true); setError(null); setStep('Démarrage…')
    try {
      // 1. Permission browser
      setStep('Demande de permission…')
      console.log('[Push] requestPermission')
      const perm = await Notification.requestPermission()
      console.log('[Push] permission =', perm)
      if (perm !== 'granted') {
        throw new Error("Permission refusée. Autorise les notifs dans les paramètres du navigateur.")
      }

      // 2. Enregistre le SW si pas déjà fait (ne dépend pas du <Script> du layout
      //    qui peut rater si l'utilisateur arrive en cours de navigation SPA).
      setStep('Enregistrement Service Worker…')
      console.log('[Push] register /sw.js')
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        console.log('[Push] register OK')
      } catch (e) {
        console.warn('[Push] register failed (peut-être déjà actif)', e)
      }

      // 3. Service worker ready (timeout 15 s)
      setStep('Service worker prêt…')
      console.log('[Push] navigator.serviceWorker.ready')
      const reg = await withTimeout(navigator.serviceWorker.ready, 15000, 'service worker')
      console.log('[Push] SW ready', reg)

      // 3. Subscription auprès du push service (FCM/Mozilla autopush) — timeout 15 s
      setStep('Souscription push service…')
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        console.log('[Push] pushManager.subscribe…')
        sub = await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }),
          15000,
          'push subscribe',
        )
        console.log('[Push] sub OK')
      }

      // 4. Enregistrement backend (timeout 10 s)
      setStep('Enregistrement serveur…')
      const json = sub.toJSON()
      console.log('[Push] POST /api/push/subscribe')
      const res = await withTimeout(
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          }),
        }),
        10000,
        'POST subscribe',
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      console.log('[Push] terminé')
      setSubscribed(true)
      setStep(null)
    } catch (e) {
      console.error('[Push] erreur', e)
      setError(e instanceof Error ? e.message : 'Erreur')
      setStep(null)
    } finally {
      setBusy(false)
    }
  }

  async function unsubscribe() {
    setBusy(true); setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium min-h-[44px] transition-colors',
          subscribed
            ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100'
            : 'bg-zinc-100 text-zinc-700 border border-zinc-300 hover:bg-zinc-200',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" />
          : subscribed ? <Bell className="h-4 w-4 text-emerald-600" />
          :              <BellOff className="h-4 w-4" />
        }
        {busy && step ? step : subscribed ? 'Notifications activées' : 'Activer les notifications'}
      </button>
      {error && (
        <p className="text-xs text-red-600 px-1">{error}</p>
      )}
    </div>
  )
}
