// Page 404 globale.

import Link from 'next/link'
import { Home, ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-emerald-50 flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="text-6xl font-black text-emerald-600 mb-2">404</div>
        <h1 className="text-2xl font-bold mb-2">Page introuvable</h1>
        <p className="text-sm text-zinc-600 mb-6">
          La page que tu cherches n&apos;existe pas, a été déplacée, ou tu n&apos;y as pas accès.
        </p>

        <div className="grid gap-2">
          <Link href="/">
            <Button className="w-full gap-2">
              <Home className="h-4 w-4" /> Retour à l&apos;accueil
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Aller à la connexion
            </Button>
          </Link>
        </div>

        <div className="mt-6 pt-4 border-t text-xs text-zinc-500">
          <p className="mb-2">Astuce : utilise la recherche globale</p>
          <p>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 border text-zinc-700 font-mono text-[11px]">Ctrl</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 border text-zinc-700 font-mono text-[11px]">K</kbd>
            {' '}depuis n&apos;importe quelle page connectée
            {' · ou tape '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 border text-zinc-700 font-mono text-[11px]">/</kbd>
            {' pour ouvrir la palette'}
          </p>
        </div>
      </Card>
    </div>
  )
}
