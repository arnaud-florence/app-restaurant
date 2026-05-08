'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded inline-flex items-center gap-1"
    >
      <Printer className="h-4 w-4" /> Imprimer
    </button>
  )
}
