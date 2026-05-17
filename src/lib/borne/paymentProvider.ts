/**
 * paymentProvider — Abstraction du paiement NFC pour la borne.
 *
 * Détecte l'environnement et délègue à la bonne implémentation :
 *   - `native`  : Capacitor wrapper + plugin Stripe Terminal Tap to Pay
 *   - `mock`    : simulation en navigateur (3 sec succès / on peut forcer un échec)
 *                  → utilisé en dev/preview/web
 *   - `unavailable` : NFC explicitement indisponible (tablette web sans
 *                  bridge natif, ou détection a échoué)
 *
 * USAGE :
 *   const provider = await getPaymentProvider()
 *   if (!provider.supportsTapToPay) { ... fallback comptoir ... }
 *   const result = await provider.collectPayment({ amount, currency, commandeId })
 *
 * BRANCHEMENT NATIF (à faire après wrap Capacitor — voir BORNE_NATIVE.md) :
 *   import { StripeTerminal } from '@capacitor-community/stripe-terminal'
 *   → remplacer NATIVE_TODO par un appel à StripeTerminal.collectPayment(...)
 */

export type PaymentResult =
  | { status: 'succeeded'; paymentIntentId: string; brand?: string; last4?: string }
  | { status: 'declined'; reason: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export type CollectPaymentInput = {
  amount: number       // en cents
  currency: string     // 'eur'
  commandeId: string
  /** Si true et qu'on est en mock, simule un refus (utile pour QA) */
  simulateDecline?: boolean
}

export interface PaymentProvider {
  /** Indique si la plateforme actuelle supporte Tap to Pay sur écran */
  readonly supportsTapToPay: boolean
  readonly environment: 'native' | 'mock' | 'unavailable'
  /** Initialise le SDK / récupère le connection token. À appeler 1x au montage. */
  initialize(): Promise<void>
  /** Démarre une collecte de paiement NFC. Resolve quand transaction terminée. */
  collectPayment(input: CollectPaymentInput): Promise<PaymentResult>
  /** Annule la collecte en cours (timeout 60s, ou bouton retour). */
  cancel(): Promise<void>
}

// ─── Détection runtime ─────────────────────────────────────────────────
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean
      Plugins?: Record<string, unknown>
    }
  }
}

function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.Capacitor?.isNativePlatform?.()
}

// ─── Implémentation NATIVE (slot pour Capacitor + Stripe Terminal) ─────
class NativeStripeTerminalProvider implements PaymentProvider {
  readonly supportsTapToPay = true
  readonly environment = 'native' as const
  private initialized = false

  async initialize() {
    if (this.initialized) return
    // TODO NATIVE_TODO :
    //   import { StripeTerminal } from '@capacitor-community/stripe-terminal'
    //   const token = await fetch('/api/borne/stripe/connection-token').then(r => r.json())
    //   await StripeTerminal.initialize({ tokenProvider: () => token.secret })
    //   await StripeTerminal.connectReader({ readerType: 'tap_to_pay' })
    this.initialized = true
  }

  async collectPayment(_input: CollectPaymentInput): Promise<PaymentResult> {
    // TODO NATIVE_TODO :
    //   const intent = await fetch('/api/borne/stripe/payment-intent', { method:'POST', body: JSON.stringify(_input) }).then(r => r.json())
    //   const result = await StripeTerminal.collectPaymentMethod({ paymentIntentId: intent.id })
    //   const processed = await StripeTerminal.processPayment()
    //   return mapStripeToResult(processed)
    return { status: 'error', message: 'Native bridge non câblé (voir BORNE_NATIVE.md)' }
  }

  async cancel() {
    // TODO NATIVE_TODO : await StripeTerminal.cancelCollectPaymentMethod()
  }
}

// ─── Implémentation MOCK (dev / web preview) ───────────────────────────
class MockTapToPayProvider implements PaymentProvider {
  readonly supportsTapToPay = true // simulé : laisse l'UI tester le flux
  readonly environment = 'mock' as const
  private cancelled = false
  private timer: ReturnType<typeof setTimeout> | null = null

  async initialize() { /* no-op */ }

  collectPayment(input: CollectPaymentInput): Promise<PaymentResult> {
    this.cancelled = false
    return new Promise<PaymentResult>(resolve => {
      this.timer = setTimeout(() => {
        if (this.cancelled) return
        if (input.simulateDecline) {
          resolve({ status: 'declined', reason: 'Simulated decline (mode mock)' })
        } else {
          resolve({
            status: 'succeeded',
            paymentIntentId: `mock_pi_${Date.now()}`,
            brand: 'Visa',
            last4: '4242',
          })
        }
      }, 2500)
    })
  }

  async cancel() {
    this.cancelled = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }
}

// ─── Implémentation UNAVAILABLE ───────────────────────────────────────
class UnavailableProvider implements PaymentProvider {
  readonly supportsTapToPay = false
  readonly environment = 'unavailable' as const
  async initialize() { /* no-op */ }
  async collectPayment(): Promise<PaymentResult> {
    return { status: 'error', message: 'Tap to Pay non disponible sur cette plateforme' }
  }
  async cancel() { /* no-op */ }
}

// ─── Factory ───────────────────────────────────────────────────────────
let _provider: PaymentProvider | null = null

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (_provider) return _provider
  if (isNativeCapacitor()) {
    _provider = new NativeStripeTerminalProvider()
  } else if (process.env.NEXT_PUBLIC_BORNE_MOCK_NFC === '1') {
    _provider = new MockTapToPayProvider()
  } else {
    // Web sans bridge natif et sans flag mock → pas de NFC réel
    // (Tap to Pay impossible en navigateur Stripe Terminal). Fallback comptoir uniquement.
    _provider = new UnavailableProvider()
  }
  await _provider.initialize()
  return _provider
}

/** Pour les tests : reset le singleton */
export function _resetPaymentProvider() { _provider = null }
