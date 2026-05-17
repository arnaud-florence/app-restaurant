# Borne Kiosk — Wrap natif Capacitor pour Stripe Tap to Pay

L'app actuelle est une PWA Next.js. **Tap to Pay** (NFC sur écran tactile sans
lecteur physique) **n'existe pas en web** — c'est une API native exclusive aux
SDK iOS et Android de Stripe Terminal.

Ce document explique comment wrapper l'interface `/borne` dans une app native
afin d'activer Tap to Pay sur iPhone et Android.

---

## TL;DR du flux paiement

```
┌─────────────────────────────────────────────────────────────────┐
│ Le Relais — Borne (Capacitor)                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Webview Next.js (PWA /borne) — UI 100% web                │ │
│  └──────────────────┬────────────────────────────────────────┘ │
│                     │ via plugin Capacitor                       │
│  ┌──────────────────▼──────────────────┐                        │
│  │ Stripe Terminal SDK (Swift/Kotlin)  │ ──── NFC EMV ────► 💳  │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

`src/lib/borne/paymentProvider.ts` détecte automatiquement Capacitor :
- **Native** → délègue à `@capacitor-community/stripe-terminal` (Tap to Pay)
- **Web** → mode mock (dev) ou unavailable (prod web, fallback comptoir)

---

## Pré-requis

| Compte | Coût | Lien |
|---|---|---|
| **Apple Developer Program** | 99 $/an | https://developer.apple.com/programs |
| **Google Play Console** | 25 $ une fois | https://play.google.com/console |
| **Stripe Tap to Pay on iPhone** (whitelist requis) | gratuit | https://stripe.com/docs/terminal/payments/setup-reader/tap-to-pay |
| **Tap to Pay on Android** | gratuit | https://stripe.com/docs/terminal/payments/setup-reader/tap-to-pay-android |

**Hardware** :
- iPad iOS 16.4+ (Tap to Pay on iPad supporté à partir d'iPadOS 16.4) — A12 Bionic ou plus
- OU iPhone XS ou plus récent, iOS 16.4+
- OU tablette Android NFC, Android 11+

---

## Étapes complètes

### 1. Installer Capacitor + plugins

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm install @capacitor-community/stripe-terminal
npx cap init "Le Relais — Borne" app.lerelais.borne
```

### 2. Configurer Next pour l'export statique de la page /borne

Option A — **export complet** (le plus simple si Next 14 le supporte avec ton schéma) :
```js
// next.config.js
module.exports = { output: 'export', images: { unoptimized: true } }
```
Mais ça casse les routes API et SSR du reste de l'app.

Option B — **mode serveur live** (recommandé) :
- L'app Capacitor pointe vers `https://app-restaurant-livid.vercel.app/borne`
- Décommenter `server.url` dans `capacitor.config.ts`
- Inconvénient : la borne a besoin d'internet (mais c'est déjà le cas)

### 3. Activer Tap to Pay côté Apple

1. Ouvrir un ticket à `tap-to-pay-on-iphone@stripe.com` avec ton Stripe Account ID
2. Apple ajoute l'entitlement `com.apple.developer.proximity-reader.payment.acceptance` à ton App ID
3. Régénérer le provisioning profile dans developer.apple.com
4. Dans Xcode : Project → Signing & Capabilities → ajouter la capability

### 4. Activer Tap to Pay côté Stripe (Android)

1. Account Settings → Terminal → activer "Tap to Pay on Android"
2. Vérifier que le plugin Capacitor utilise bien `TapToPayReader.discoverReaders()`

### 5. Câbler le paymentProvider

Dans `src/lib/borne/paymentProvider.ts`, remplacer les `// TODO NATIVE_TODO`
par :

```ts
import { StripeTerminal } from '@capacitor-community/stripe-terminal'

async initialize() {
  await StripeTerminal.initialize({
    tokenProviderEndpoint: '/api/borne/stripe/connection-token',
  })
  await StripeTerminal.connectReader({ readerType: 'tap_to_pay' })
}

async collectPayment(input: CollectPaymentInput) {
  const intent = await fetch('/api/borne/stripe/payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      commande_id: input.commandeId,
    }),
  }).then(r => r.json())

  try {
    await StripeTerminal.collectPaymentMethod({ paymentIntentId: intent.id })
    const processed = await StripeTerminal.processPayment()
    if (processed.status === 'succeeded') {
      return { status: 'succeeded', paymentIntentId: processed.id, brand: processed.charges?.[0]?.payment_method_details?.card_present?.brand }
    }
    return { status: 'declined', reason: processed.last_payment_error?.message ?? 'Refusé' }
  } catch (e) {
    if ((e as { code?: string }).code === 'Canceled') return { status: 'cancelled' }
    return { status: 'error', message: e instanceof Error ? e.message : 'Erreur' }
  }
}
```

### 6. Build natif

```bash
# iOS (sur Mac uniquement)
npx cap add ios
npx cap sync ios
npx cap open ios       # Xcode → Archive → Distribute App → App Store

# Android
npx cap add android
npx cap sync android
npx cap open android   # Android Studio → Build → Generate Signed Bundle → Play Console
```

### 7. Tests sur device physique

| Test | Méthode |
|---|---|
| NFC succès | Carte VISA contactless réelle sur écran |
| NFC refusé | Carte test Stripe `4000 0000 0000 0002` (decline) |
| Timeout 60s | Ne rien présenter, vérifier retour écran |
| Échec → retry → comptoir | Cliquer "Réessayer" puis "Payer au comptoir" |
| Reset après succès | Auto retour catalogue 8 s |
| Apple Pay | iPhone face à l'écran de la borne |
| Hors ligne | Couper WiFi → message rassurant + sync auto au retour |

---

## Mode dev (sans build natif)

Pour développer la UI sans wrapper :

```bash
# .env.local
NEXT_PUBLIC_BORNE_MOCK_NFC=1
```

Puis `npm run dev` → `/borne` simule le NFC en 2,5 s.
Pour tester un refus, ajouter dans BorneClient `simulateDecline: true`.

---

## Variables d'environnement requises (Vercel)

```
STRIPE_SECRET_KEY=sk_live_...
CRON_SECRET=...
```

Côté app native : le secret Stripe **reste côté serveur**. Le SDK Terminal
récupère un `connection_token` éphémère via `/api/borne/stripe/connection-token`.

---

## Limitations connues

1. **Web Tap to Pay** n'existe pas chez Stripe → la PWA web reste en
   "comptoir uniquement" si on ouvre `/borne` dans un navigateur normal.
2. **Tap to Pay on iPhone** : iPhone XS+ exclusivement (pas iPhone X et avant).
3. **Tap to Pay on Android** : NFC requis + plus de 99 % des tablettes Android
   l'ont, mais quelques entrées de gamme à vérifier.
4. **Apple review** : 5-7 jours pour la 1ère soumission, ~2 jours pour les MAJ.

---

## TODO restants pour la mise en prod

- [ ] Ouvrir Apple Developer Program (99 $/an)
- [ ] Demander entitlement Tap to Pay à `tap-to-pay-on-iphone@stripe.com`
- [ ] Acheter iPad ou tablette Android NFC dédié
- [ ] `npm install` Capacitor + plugin (cf. étape 1)
- [ ] Décider option A (export statique) ou B (live URL)
- [ ] Remplacer `TODO NATIVE_TODO` dans `paymentProvider.ts`
- [ ] Build + signing + soumission App Store + Play Console
- [ ] Tests sur device physique avec carte test Stripe
