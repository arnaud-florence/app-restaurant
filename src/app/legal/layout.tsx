// Layout commun aux pages légales (mentions, CGU, RGPD, CGV).
// Public, accessible sans connexion.

import Link from 'next/link'
import { ArrowLeft, FileText, Shield, ScrollText, Receipt } from 'lucide-react'

const NAV = [
  { href: '/legal/mentions-legales', label: 'Mentions légales',  icon: FileText },
  { href: '/legal/cgu',              label: 'CGU',                icon: ScrollText },
  { href: '/legal/cgv',              label: 'CGV',                icon: Receipt },
  { href: '/legal/rgpd',             label: 'RGPD / Vie privée', icon: Shield },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map(n => (
              <Link
                key={n.href}
                href={n.href}
                className="text-xs px-2 py-1 rounded hover:bg-zinc-100 text-zinc-700 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <n.icon className="h-3 w-3" />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="border-t bg-white mt-12 py-4">
        <div className="max-w-4xl mx-auto px-4 text-xs text-zinc-500 text-center">
          Document juridique — dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </div>
      </footer>
    </div>
  )
}
