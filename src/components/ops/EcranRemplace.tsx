// Page affichée à la place d'un écran de vente retiré au profit des caisses.
//
// Un 404 laisserait croire à une panne et ferait chercher l'écran ailleurs.
// Ici on nomme la décision, on dit où l'action se fait maintenant, et on
// propose les écrans qui restent utiles — pour que personne ne reste bloqué.

import Link from 'next/link'

export default function EcranRemplace({
  titre, remplacePar,
}: { titre: string; remplacePar: string }) {
  return (
    <div className="min-h-screen bg-[#0D0D0D] text-zinc-100 flex items-center justify-center px-5 py-12">
      <div className="max-w-lg w-full space-y-5 text-center">
        <p className="text-5xl">🧾</p>
        <h1 className="text-2xl font-bold">{titre} — sur la caisse désormais</h1>
        <p className="text-zinc-400 leading-relaxed">{remplacePar}</p>

        <div className="rounded-xl bg-zinc-900 ring-1 ring-zinc-800 p-4 text-left space-y-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">
            Pourquoi ce changement
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Deux systèmes qui prennent des commandes finissent toujours par se
            contredire. La caisse vend et encaisse — elle seule a la valeur
            légale. L&apos;outil reçoit ses tickets et sert au pilotage :
            marges, stock, achats.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/comptoir/fournil/kds"
            className="min-h-[52px] inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 font-bold text-sm px-4">
            🥖 Préparation
          </Link>
          <Link href="/admin/ventes"
            className="min-h-[52px] inline-flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-600 font-bold text-sm px-4">
            📊 Ventes du jour
          </Link>
        </div>
        <Link href="/admin/cat" className="inline-block text-sm text-zinc-500 hover:text-zinc-300">
          ← Tous les écrans
        </Link>
      </div>
    </div>
  )
}
