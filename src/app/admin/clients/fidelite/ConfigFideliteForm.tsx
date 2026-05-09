'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sauverConfigFidelite } from './actions'
import type { ConfigFidelite } from '@/lib/fidelite-types'

export default function ConfigFideliteForm({ config }: { config: ConfigFidelite }) {
  const [pts, setPts] = useState(config.points_par_euro)
  const [auto, setAuto] = useState(config.auto_credit_encaissement)
  const [inscr, setInscr] = useState(config.points_inscription)
  const [ratioRemise, setRatioRemise] = useState(config.points_par_euro_remise)
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  function sauver() {
    setMsg('')
    setErr('')
    startTransition(async () => {
      try {
        await sauverConfigFidelite({
          points_par_euro: Number(pts) || 0,
          auto_credit_encaissement: auto,
          points_inscription: Number(inscr) || 0,
          points_par_euro_remise: Number(ratioRemise) || 100,
        })
        setMsg('✓ Configuration enregistrée.')
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <div>
        <Label>Points par € HT</Label>
        <Input
          type="number"
          step="0.1"
          min="0"
          value={pts}
          onChange={e => setPts(Number(e.target.value))}
        />
        <p className="text-[11px] text-zinc-500 mt-1">
          Ex : 1 = 1 pt par € HT. Mis à 0 pour désactiver le crédit auto.
        </p>
      </div>
      <div>
        <Label>Bonus à l&apos;inscription</Label>
        <Input
          type="number"
          step="1"
          min="0"
          value={inscr}
          onChange={e => setInscr(Number(e.target.value))}
        />
        <p className="text-[11px] text-zinc-500 mt-1">
          Points offerts à la création d&apos;une fiche client.
        </p>
      </div>
      <div>
        <Label>Crédit auto à l&apos;encaissement</Label>
        <div className="flex items-center gap-2 h-10">
          <input
            type="checkbox"
            id="auto-credit"
            checked={auto}
            onChange={e => setAuto(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="auto-credit" className="text-sm">
            {auto ? 'Activé' : 'Désactivé'}
          </label>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Si actif, l&apos;encaissement crée auto le mouvement de gain.
        </p>
      </div>

      <div>
        <Label>Points pour 1 € de remise</Label>
        <Input
          type="number"
          step="1"
          min="1"
          value={ratioRemise}
          onChange={e => setRatioRemise(Number(e.target.value))}
        />
        <p className="text-[11px] text-zinc-500 mt-1">
          Ex : 100 = 100 pts donnent 1 € de réduction à l&apos;encaissement.
        </p>
      </div>

      <div className="md:col-span-4 flex items-center gap-3">
        <Button onClick={sauver} disabled={isPending}>
          {isPending ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </div>
  )
}
