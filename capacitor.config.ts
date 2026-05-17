// @ts-expect-error : @capacitor/cli installé uniquement quand on wrappe (cf. BORNE_NATIVE.md)
import type { CapacitorConfig } from '@capacitor/cli'

// Configuration Capacitor pour wrapper la PWA Next.js dans une app native
// iOS + Android afin d'activer Stripe Terminal Tap to Pay.
//
// Build natif :
//   1. npm run build:borne-native  (export Next statique vers ./out)
//   2. npx cap sync                (copie ./out dans iOS/Android)
//   3. npx cap open ios            (Xcode pour signer + push App Store)
//   4. npx cap open android        (Android Studio pour signer + push Play)
//
// Voir BORNE_NATIVE.md pour les étapes complètes (Apple Developer Program,
// génération certs, configuration entitlement Tap to Pay on iPhone, etc.)

const config: CapacitorConfig = {
  appId: 'app.lerelais.borne',
  appName: 'Le Relais — Borne',
  // Webview pointe par défaut sur les fichiers statiques exportés.
  // Pour un mode "kiosque sur serveur" (recommandé en prod pour live update),
  // décommenter `server.url` et pointer sur l'URL prod.
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // url: 'https://app-restaurant-livid.vercel.app/borne',
    // cleartext: false,
  },
  ios: {
    contentInset: 'never',
    // Tap to Pay on iPhone requiert l'entitlement com.apple.developer.proximity-reader.payment.acceptance
    // (à demander à Apple via le programme Tap to Pay on iPhone).
  },
  android: {
    allowMixedContent: false,
    // Tap to Pay on Android nécessite NFC + Stripe Terminal Android SDK
    // (autoconfiguré par le plugin @capacitor-community/stripe-terminal).
  },
  plugins: {
    // SplashScreen, StatusBar, etc. à configurer si besoin
  },
}

export default config
