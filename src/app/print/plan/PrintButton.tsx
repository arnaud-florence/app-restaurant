'use client'

import { Printer } from 'lucide-react'

// Bouton d'impression — extrait en client component (un Server Component ne
// peut pas porter d'onClick). Masqué à l'impression via la classe print:hidden.
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 h-11 px-4 rounded-full bg-zinc-900 text-white text-sm font-bold active:scale-95 transition"
    >
      <Printer className="h-4 w-4" strokeWidth={2.5} /> Imprimer le plan
    </button>
  )
}
