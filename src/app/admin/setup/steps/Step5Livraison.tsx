'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { type Livraison, type FraisZone, newLocalId } from '../types'

export default function Step5Livraison({
  value, onChange,
}: {
  value: Livraison
  onChange: (v: Livraison) => void
}) {
  function set<K extends keyof Livraison>(k: K, v: Livraison[K]) {
    onChange({ ...value, [k]: v })
  }

  function ajouterZone() {
    const z: FraisZone = { id: newLocalId(), rayon_max_km: 5, frais: 3 }
    set('zones', [...value.zones, z])
  }
  function modifierZone(id: string, patch: Partial<FraisZone>) {
    set('zones', value.zones.map(z => z.id === id ? { ...z, ...patch } : z))
  }
  function supprimerZone(id: string) {
    set('zones', value.zones.filter(z => z.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🛵 Paramètres de livraison</CardTitle>
        <CardDescription>
          Active la livraison et configure ton rayon, ton minimum de commande et tes tarifs par zone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="liv-active" className="text-base cursor-pointer">Activer la livraison</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Si désactivée, le mode &laquo;&nbsp;Livraison&nbsp;&raquo; n&apos;apparaîtra pas pour le client.
            </p>
          </div>
          <Switch
            id="liv-active"
            checked={value.active}
            onCheckedChange={v => set('active', v)}
          />
        </div>

        <fieldset disabled={!value.active} className={value.active ? '' : 'opacity-50 pointer-events-none'}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rayon">Rayon max (km)</Label>
              <Input
                id="rayon"
                type="number"
                min={0}
                step="0.5"
                value={value.rayon_km}
                onChange={e => set('rayon_km', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min">Minimum commande (€)</Label>
              <Input
                id="min"
                type="number"
                min={0}
                step="0.5"
                value={value.minimum}
                onChange={e => set('minimum', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delai">Délai préparation (min)</Label>
              <Input
                id="delai"
                type="number"
                min={0}
                step={5}
                value={value.delai_min}
                onChange={e => set('delai_min', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Frais par zone</Label>
              <span className="text-xs text-muted-foreground">Tarif appliqué selon le rayon max atteint</span>
            </div>
            {value.zones.length === 0 && (
              <p className="text-sm text-muted-foreground italic mb-3">
                Aucune zone tarifaire — la livraison sera gratuite jusqu&apos;au rayon max.
              </p>
            )}
            <div className="space-y-2">
              {value.zones.map(z => (
                <div key={z.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`r-${z.id}`} className="text-xs">Jusqu&apos;à (km)</Label>
                    <Input
                      id={`r-${z.id}`}
                      type="number"
                      min={0}
                      step="0.5"
                      value={z.rayon_max_km}
                      onChange={e => modifierZone(z.id, { rayon_max_km: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`f-${z.id}`} className="text-xs">Frais (€)</Label>
                    <Input
                      id={`f-${z.id}`}
                      type="number"
                      min={0}
                      step="0.5"
                      value={z.frais}
                      onChange={e => modifierZone(z.id, { frais: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => supprimerZone(z.id)} aria-label="Supprimer">🗑</Button>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={ajouterZone} className="w-full mt-2">
              + Ajouter une zone tarifaire
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}
