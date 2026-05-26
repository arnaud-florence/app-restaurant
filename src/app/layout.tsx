import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ContextualHelp from "@/components/ContextualHelp";
import GlobalSearch from "@/components/GlobalSearch";
import OfflineIndicator from "@/components/OfflineIndicator";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Fraunces — police serif Display élégante (variable, axes opsz/SOFT/WONK).
// Pour titres éditoriaux, numéros, accents typographiques restaurant haut de gamme.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CASATASIA — Pilotage gérant",
  description: "CASATASIA — Gestion restaurant : caisse, hygiène, RH, finances, pilotage stratégique.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CASATASIA",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <OfflineIndicator />
        {children}
        <GlobalSearch />
        <ContextualHelp />
        <Script id="register-sw" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
              .then(reg => console.log('[SW] registered', reg.scope))
              .catch(err => console.warn('[SW] register error', err));
          }`}
        </Script>
      </body>
    </html>
  );
}
