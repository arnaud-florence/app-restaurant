'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { JOURS, type Horaires, type Horaire, type Exception, newLocalId } from '../types'

const JOUR_LABELS: Record<typeof JOURS[number], string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

export default function Step2Horaires({
  horaires, exceptions, onChangeHoraires, onChangeExceptions,
}: {
  horaires: Horaires
  exceptions: Exception[]
  onChangeHoraires: (h: Horaires) => void
  onChangeExceptions: (ex: Exception[]) => void
}) {
  function setJour(jour: typeof JOURS[number], patch: Partial<Horaire>) {
    onChangeHoraires({ ...horaires, [jour]: { ...horaires[jour], ...patch } })
  }

  function ajouterException() {
    const today = new Date().toISOString().slice(0, 10)
    onChangeExceptions([...exceptions, { id: newLocalId(), date_debut: today, date_fin: today, motif: '' }])
  }

  function modifierException(id: string, patch: Partial<Exception>) {
    onChangeExceptions(exceptions.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function supprimerException(id: string) {
    onChangeExceptions(exceptions.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🕒 Horaires d&apos;ouverture</CardTitle>
          <CardDescription>
            Pour chaque jour, indique si tu es ouvert et tes plages horaires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {JOURS.map(jour => {
            const h = horaires[jour]
            return (
              <div key={jour} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Switch
                      id={`open-${jour}`}
                      checked={h.ouvert}
                      onCheckedChange={v => setJour(jour, { ouvert: v })}
                    />
                    <Label htmlFor={`open-${jour}`} className="cursor-pointer text-base">
                      {JOUR_LABELS[jour]}
                    </Label>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                    h.ouvert ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'
                  }`}>
                    {h.ouvert ? 'Ouvert' : 'Fermé'}
                  </span>
                </div>
                {h.ouvert && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-center">
                    <Label htmlFor={`from-${jour}`} className="text-xs text-muted-foreground sm:text-right">De</Label>
                    <Input
                      id={`from-${jour}`}
                      type="time"
                      value={h.ouverture}
                      onChange={e => setJour(jour, { ouverture: e.target.value })}
                    />
                    <Label htmlFor={`to-${jour}`} className="text-xs text-muted-foreground sm:text-right">À</Label>
                    <Input
                      id={`to-${jour}`}
                      type="time"
                      value={h.fermeture}
                      onChange={e => setJour(jour, { fermeture: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📅 Exceptions</CardTitle>
          <CardDescription>
            Jours fériés, congés annuels, fermetures exceptionnelles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exceptions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Aucune exception. Ajoute tes congés annuels et jours fériés.</p>
          )}
          {exceptions.map(ex => (
            <div key={ex.id} className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`debut-${ex.id}`} className="text-xs">Du</Label>
                  <Input
                    id={`debut-${ex.id}`}
                    type="date"
                    value={ex.date_debut}
                    onChange={e => modifierException(ex.id, { date_debut: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`fin-${ex.id}`} className="text-xs">Au</Label>
                  <Input
                    id={`fin-${ex.id}`}
                    type="date"
                    value={ex.date_fin}
                    min={ex.date_debut}
                    onChange={e => modifierException(ex.id, { date_fin: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`motif-${ex.id}`} className="text-xs">Motif</Label>
                  <Input
                    id={`motif-${ex.id}`}
                    value={ex.motif}
                    onChange={e => modifierException(ex.id, { motif: e.target.value })}
                    placeholder="Congés annuels, jour férié…"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => supprimerException(ex.id)}>
                  🗑 Supprimer
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={ajouterException} className="w-full">
            + Ajouter une exception
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
