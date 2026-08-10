'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 h-9 rounded-md inline-flex items-center gap-1.5 font-bold"
    >
      <Printer className="h-4 w-4" /> Imprimer / PDF
    </button>
  )
}
