'use client'

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="text-sm bg-emerald-600 text-white px-4 py-2 rounded">
      🖨️ Imprimer
    </button>
  )
}
