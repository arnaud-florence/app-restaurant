'use client'

// Bouton client : appelle autoGenererBonsDepuisStock() (server action)
// pour créer en 1 clic des brouillons de bons de commande à partir des
// alertes de stock, regroupés par fournisseur principal.
// Affiche un toast de retour + lien vers /admin/fournisseurs.

import { useState, useTransition } from 'react'
import { autoGenererBonsDepuisStock } from '../fournisseurs/actions'
import { Button } from '@/components/ui/button'
import { FilePlus2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function AutoBdcButton() {
  const [isPending, startTransition] = useTransition()
  const [resultat, setResultat] = useState<{ bons_crees: number; message: string } | null>(null)
  const [erreur, setErreur] = useState('')

  function lancer() {
    setErreur('')
    setResultat(null)
    startTransition(async () => {
      try {
        const r = await autoGenererBonsDepuisStock()
        setResultat(r)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        type="button"
        size="sm"
        onClick={lancer}
        disabled={isPending}
        className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white"
      >
        <FilePlus2 className="h-4 w-4" />
        {isPending ? 'Génération…' : 'Créer les BDC en 1 clic'}
      </Button>

      {resultat && (
        <span className="text-xs flex items-center gap-2">
          <span className={resultat.bons_crees > 0 ? 'text-emerald-700 font-medium' : 'text-zinc-600'}>
            {resultat.message}
          </span>
          {resultat.bons_crees > 0 && (
            <Link
              href="/admin/fournisseurs"
              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 underline"
            >
              Voir les brouillons <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </span>
      )}
      {erreur && <span className="text-xs text-red-600">{erreur}</span>}
    </div>
  )
}
