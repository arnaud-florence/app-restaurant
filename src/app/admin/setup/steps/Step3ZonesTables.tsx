'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { type TableRow, newLocalId } from '../types'

export default function Step3ZonesTables({
  zones, tables, onChangeZones, onChangeTables,
}: {
  zones: string[]
  tables: TableRow[]
  onChangeZones: (z: string[]) => void
  onChangeTables: (t: TableRow[]) => void
}) {
  const [nouvelleZone, setNouvelleZone] = useState('')
  const [draftTable, setDraftTable] = useState<{ numero: string; capacite: number; zone: string }>({
    numero: '', capacite: 2, zone: zones[0] ?? 'Salle',
  })

  function ajouterZone() {
    const z = nouvelleZone.trim()
    if (!z || zones.includes(z)) return
    onChangeZones([...zones, z])
    setNouvelleZone('')
  }

  function supprimerZone(z: string) {
    if (tables.some(t => t.zone === z)) {
      alert(`Impossible de supprimer "${z}" : des tables y sont encore affectées.`)
      return
    }
    onChangeZones(zones.filter(x => x !== z))
  }

  function ajouterTable() {
    const numero = draftTable.numero.trim()
    if (!numero) return
    if (tables.some(t => t.numero.trim().toLowerCase() === numero.toLowerCase())) {
      alert(`Une table porte déjà le numéro "${numero}".`)
      return
    }
    onChangeTables([...tables, {
      id: newLocalId(),
      numero,
      capacite: Math.max(1, draftTable.capacite || 1),
      zone: draftTable.zone,
    }])
    setDraftTable(d => ({ ...d, numero: '' }))
  }

  function modifierTable(id: string, patch: Partial<TableRow>) {
    onChangeTables(tables.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  function supprimerTable(id: string) {
    onChangeTables(tables.filter(t => t.id !== id))
  }

  // Groupage par zone pour la visualisation
  const tablesParZone = zones.map(z => ({
    zone: z,
    items: tables.filter(t => t.zone === z),
  }))
  const orphelines = tables.filter(t => !zones.includes(t.zone))

  return (
    <div className="space-y-4">
      {/* Zones */}
      <Card>
        <CardHeader>
          <CardTitle>📍 Zones</CardTitle>
          <CardDescription>
            Salle, Terrasse, Bar, Privatif… ou tout ce que tu veux. Chaque table appartiendra à une zone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {zones.map(z => (
              <Badge key={z} variant="secondary" className="text-sm py-1 px-3 gap-2">
                {z}
                <button
                  onClick={() => supprimerZone(z)}
                  className="text-muted-foreground hover:text-destructive font-bold leading-none"
                  aria-label={`Supprimer ${z}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            {zones.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Aucune zone — ajoutes-en une ci-dessous.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={nouvelleZone}
              onChange={e => setNouvelleZone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterZone() } }}
              placeholder="Nom de la zone (ex. Mezzanine)"
            />
            <Button onClick={ajouterZone} variant="outline">+ Zone</Button>
          </div>
        </CardContent>
      </Card>

      {/* Ajout table */}
      <Card>
        <CardHeader>
          <CardTitle>🪑 Ajouter une table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto] gap-2 sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="t-numero" className="text-xs">Numéro</Label>
              <Input
                id="t-numero"
                value={draftTable.numero}
                onChange={e => setDraftTable(d => ({ ...d, numero: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterTable() } }}
                placeholder="T1, S2, B1…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cap" className="text-xs">Capacité</Label>
              <Input
                id="t-cap"
                type="number"
                min={1}
                max={20}
                value={draftTable.capacite}
                onChange={e => setDraftTable(d => ({ ...d, capacite: parseInt(e.target.value || '0', 10) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-zone" className="text-xs">Zone</Label>
              <Select
                id="t-zone"
                value={draftTable.zone}
                onChange={e => setDraftTable(d => ({ ...d, zone: e.target.value }))}
              >
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </Select>
            </div>
            <Button onClick={ajouterTable} disabled={!draftTable.numero.trim() || zones.length === 0} className="sm:self-end">
              + Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Plan de salle (grille temps réel) */}
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Plan de salle <span className="text-sm font-normal text-muted-foreground">({tables.length} table{tables.length > 1 ? 's' : ''})</span></CardTitle>
          <CardDescription>
            Aperçu en temps réel à mesure que tu ajoutes. Le drag-drop arrivera dans une étape ultérieure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {tablesParZone.map(({ zone, items }) => (
            <div key={zone}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {zone} <span className="text-muted-foreground/70 font-normal">· {items.length} table{items.length > 1 ? 's' : ''}</span>
              </p>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic ml-1">Aucune table dans cette zone.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {items.map(t => (
                    <TableCell key={t.id} t={t} zones={zones} onChange={p => modifierTable(t.id, p)} onDelete={() => supprimerTable(t.id)} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {orphelines.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
                ⚠ Orphelines ({orphelines.length}) — zone introuvable
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {orphelines.map(t => (
                  <TableCell key={t.id} t={t} zones={zones} onChange={p => modifierTable(t.id, p)} onDelete={() => supprimerTable(t.id)} />
                ))}
              </div>
            </div>
          )}
          {tables.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              Pas encore de tables. Ajoutes-en une ci-dessus.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TableCell({
  t, zones, onChange, onDelete,
}: {
  t: TableRow
  zones: string[]
  onChange: (p: Partial<TableRow>) => void
  onDelete: () => void
}) {
  const [edit, setEdit] = useState(false)
  if (!edit) {
    return (
      <button
        onClick={() => setEdit(true)}
        className="border rounded-lg p-3 text-center bg-muted/30 hover:bg-muted hover:shadow transition-all min-h-[88px] flex flex-col justify-center"
      >
        <p className="font-bold text-lg">{t.numero}</p>
        <p className="text-xs text-muted-foreground">{t.capacite} pers.</p>
      </button>
    )
  }
  return (
    <div className="border-2 border-primary rounded-lg p-2 space-y-1.5 bg-background min-h-[88px]">
      <Input
        value={t.numero}
        onChange={e => onChange({ numero: e.target.value })}
        className="h-8 text-center font-bold text-sm"
        autoFocus
      />
      <div className="flex gap-1">
        <Input
          type="number"
          min={1}
          max={20}
          value={t.capacite}
          onChange={e => onChange({ capacite: parseInt(e.target.value || '0', 10) || 0 })}
          className="h-7 text-xs w-12 px-1 text-center"
        />
        <Select
          value={t.zone}
          onChange={e => onChange({ zone: e.target.value })}
          className="h-7 text-xs flex-1 px-1"
        >
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </Select>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEdit(false)} className="flex-1 h-7 text-xs">OK</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 text-xs text-destructive">🗑</Button>
      </div>
    </div>
  )
}
