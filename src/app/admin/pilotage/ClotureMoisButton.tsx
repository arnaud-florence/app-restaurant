'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { askConfirm } from '@/lib/confirm'
import { cloturerMoisAction } from './actions'

export default function ClotureMoisButton({
  mois, dejaCloture,
}: {
  mois: string                       // ISO YYYY-MM-DD (1er du mois)
  dejaCloture: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [last, setLast] = useState<{ nb: number; total: number } | null>(null)

  async function handleClick() {
    const moisLabel = new Date(mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const msg = dejaCloture
      ? `Re-clôturer ${moisLabel} ? Les résultats actuels écraseront ceux déjà figés.`
      : `Clôturer ${moisLabel} ? Tous les résultats challenges seront persistés. Tu pourras toujours re-cliquer pour mettre à jour.`
    if (!(await askConfirm(msg))) return

    startTransition(async () => {
      try {
        const r = await cloturerMoisAction({ mois })
        setLast({ nb: r.nb_lignes_ecrites, total: r.total_primes_eur })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {last && (
        <span className="text-xs text-emerald-700 font-medium">
          ✓ {last.nb} lignes · {last.total.toFixed(2)} € primes
        </span>
      )}
      <Button
        size="sm"
        onClick={handleClick}
        disabled={pending}
        variant={dejaCloture ? 'outline' : 'default'}
        className="gap-1"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> :
          dejaCloture ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {dejaCloture ? 'Re-clôturer' : 'Clôturer le mois'}
      </Button>
    </div>
  )
}
