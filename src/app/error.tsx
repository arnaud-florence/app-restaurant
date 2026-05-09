'use client'

// Page erreur 500 globale (Next.js convention : src/app/error.tsx).
// Rendu quand un Server Component throw une erreur non interceptée.

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function ErrorPage({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log côté client. À l'avenir : envoyer à Sentry.
    console.error('[App error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-red-50 flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-3" />
        <h1 className="text-2xl font-bold mb-2">Oups, une erreur s&apos;est produite</h1>
        <p className="text-sm text-zinc-600 mb-1">
          La page n&apos;a pas pu charger correctement. Notre équipe a été notifiée.
        </p>
        {error.digest && (
          <p className="text-[10px] text-zinc-400 font-mono mb-4">
            Référence : {error.digest}
          </p>
        )}

        <div className="grid gap-2 mt-4">
          <Button onClick={reset} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
          <Link href="/">
            <Button variant="outline" className="w-full gap-2">
              <Home className="h-4 w-4" /> Retour à l&apos;accueil
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-xs text-zinc-500">
          Si le problème persiste, déconnecte-toi puis reconnecte-toi.
          Reste bloqué ? Contacte le support.
        </p>
      </Card>
    </div>
  )
}
