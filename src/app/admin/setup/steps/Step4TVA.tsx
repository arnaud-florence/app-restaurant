'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type TVA } from '../types'

const RATES = [
  { key: 'sur_place', label: 'Restauration sur place', defaut: 10,  hint: 'Repas servi à table dans l\'établissement.' },
  { key: 'emporter',  label: 'Vente à emporter',       defaut: 5.5, hint: 'Click & collect, livraison de plats.' },
  { key: 'alcool',    label: 'Boissons alcoolisées',   defaut: 20,  hint: 'Vins, bières, spiritueux — quel que soit le mode.' },
] as const

export default function Step4TVA({
  value, onChange,
}: {
  value: TVA
  onChange: (v: TVA) => void
}) {
  function set(k: keyof TVA, n: number) {
    onChange({ ...value, [k]: isFinite(n) && n >= 0 ? n : 0 })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🧾 Taux de TVA</CardTitle>
        <CardDescription>
          Taux par défaut français (mai 2024). Tu peux les ajuster si ta situation est particulière.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {RATES.map(r => (
          <div key={r.key} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`tva-${r.key}`} className="text-base">{r.label}</Label>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                défaut : {r.defaut}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{r.hint}</p>
            <div className="flex items-center gap-2">
              <Input
                id={`tva-${r.key}`}
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={value[r.key]}
                onChange={e => set(r.key, parseFloat(e.target.value))}
                className="max-w-32 font-bold text-lg"
              />
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
