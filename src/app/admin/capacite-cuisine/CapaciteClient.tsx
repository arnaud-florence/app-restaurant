'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Clock, Plus, Trash2, Zap } from 'lucide-react'
import {
  creerCreneauCapacite, modifierCreneauCapacite, toggleCreneauCapacite,
  supprimerCreneauCapacite, appliquerPresetStandard,
} from './actions'
import type { CreneauCapacite } from './page'
import { TAG_DEST_LABEL, type TagDestination } from '@/lib/service'

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

// Zones concernées par les commandes ONLINE (pas CUISINE = restauration sur place)
const ZONES_ONLINE: TagDestination[] = ['SNACKING', 'PIZZA', 'BAR']

export default function CapaciteClient({ creneaux }: { creneaux: CreneauCapacite[] }) {
  const router = useRouter()
  const [zoneActive, setZoneActive] = useState<TagDestination>('SNACKING')
  const [editing, setEditing] = useState<CreneauCapacite | null>(null)
  const [creating, setCreating] = useState<{ jour: number; tag: TagDestination } | false>(false)
  const [confirmDel, setConfirmDel] = useState<CreneauCapacite | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  // Filtre + groupement par jour pour la zone active
  const creneauxZone = creneaux.filter(c => c.tag_destination === zoneActive)
  const parJour = new Map<number, CreneauCapacite[]>()
  for (let j = 0; j < 7; j++) parJour.set(j, [])
  creneauxZone.forEach(c => parJour.get(c.jour_semaine)!.push(c))

  // Compteurs par zone
  const compteursParZone: Record<TagDestination, number> = {
    CUISINE: 0, SNACKING: 0, PIZZA: 0, BAR: 0,
  }
  creneaux.forEach(c => { compteursParZone[c.tag_destination]++ })

  function exec(action: () => Promise<void>) {
    setErreur('')
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex items-center gap-3 min-w-0">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-xl shadow-lg shadow-blue-500/30 shrink-0">
          <Clock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Anti-rush</p>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Capacité cuisine</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Limite max de commandes ONLINE acceptées par créneau, <strong>par cuisine</strong>. Snacking / Pizza / Bar indépendants.
          </p>
        </div>
      </header>

      {/* Tabs zones */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-200">
        {ZONES_ONLINE.map(z => {
          const info = TAG_DEST_LABEL[z]
          const nb = compteursParZone[z]
          const active = zoneActive === z
          return (
            <button
              key={z}
              onClick={() => setZoneActive(z)}
              className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                active
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {info.emoji} {info.label}
              <span className="ml-1.5 text-xs text-zinc-400">({nb})</span>
            </button>
          )
        })}
      </div>

      {/* Action preset standard si zone vide */}
      {compteursParZone.SNACKING === 0 && zoneActive === 'SNACKING' && (
        <Button
          onClick={() => exec(async () => {
            const r = await appliquerPresetStandard()
            setErreur(`✓ ${r.nb} créneaux SNACKING créés (déjeuner + dîner lun-sam, déjeuner dim)`)
          })}
          variant="outline"
          className="gap-1.5"
        >
          <Zap className="h-4 w-4" />
          Appliquer preset standard SNACKING
        </Button>
      )}

      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-xs uppercase tracking-wider text-blue-700 font-bold mb-2">⚙️ Comment ça marche</p>
        <ul className="text-sm text-blue-900 space-y-1">
          <li>• Le site web découpe ta plage horaire en <strong>créneaux de 15 min</strong> (configurable par créneau)</li>
          <li>• Chaque créneau accepte <strong>max N commandes ONLINE</strong> simultanées</li>
          <li>• Quand un créneau est saturé : il apparaît <strong>grisé</strong> sur le tunnel de commande client</li>
          <li>• Les commandes sur place (table/comptoir) ne sont pas comptées dans cette limite</li>
        </ul>
      </Card>

      {erreur && (
        <Card className={`p-3 text-sm ${erreur.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {erreur}
        </Card>
      )}

      {creneauxZone.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          <Clock className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
          <p className="text-base font-medium">Aucun créneau {TAG_DEST_LABEL[zoneActive].label} configuré</p>
          <p className="text-xs mt-1">
            Sans créneau : pas de commande ONLINE acceptée pour cette zone.
          </p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6, 0].map(jour => {     // Lun → Sam → Dim
            const items = parJour.get(jour) ?? []
            return (
              <Card key={jour} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base">{JOURS[jour]}</h3>
                  <Button size="sm" variant="outline" onClick={() => setCreating({ jour, tag: zoneActive })} className="gap-1 text-xs">
                    <Plus className="h-3 w-3" /> Créneau
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic py-3 text-center">Aucun service ce jour</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map(c => (
                      <li key={c.id} className={`rounded-md border p-2.5 ${!c.actif ? 'opacity-50 bg-zinc-50' : 'bg-white'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-sm">
                              {c.heure_debut} → {c.heure_fin}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              <span className="font-medium text-zinc-700">{c.max_commandes}</span> cmd max / créneau de {c.duree_creneau_min}min
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {!c.actif && <Badge variant="secondary" className="text-[10px]">inactif</Badge>}
                            <Button size="sm" variant="ghost" onClick={() => setEditing(c)} className="text-xs">
                              Éditer
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => exec(async () => { await toggleCreneauCapacite(c.id, !c.actif) })} className="text-xs">
                              {c.actif ? 'Off' : 'On'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} className="text-red-600">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <CreneauModal
          jour={editing?.jour_semaine ?? (creating !== false ? creating.jour : 1)}
          tag={editing?.tag_destination ?? (creating !== false ? creating.tag : zoneActive)}
          creneau={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer le créneau {JOURS_COURTS[confirmDel.jour_semaine]} {confirmDel.heure_debut}-{confirmDel.heure_fin} ?</p>
            <p className="text-sm text-zinc-600 mb-3">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={() => exec(async () => { await supprimerCreneauCapacite(confirmDel.id); setConfirmDel(null) })} className="flex-1 bg-red-600 hover:bg-red-700">
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Modal création / édition ────────────────────────────────
function CreneauModal({
  jour: jourInit, tag: tagInit, creneau, onClose, onSaved,
}: {
  jour: number
  tag: TagDestination
  creneau: CreneauCapacite | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!creneau
  const [tag, setTag] = useState<TagDestination>(creneau?.tag_destination ?? tagInit)
  const [jour, setJour] = useState(creneau?.jour_semaine ?? jourInit)
  const [debut, setDebut] = useState(creneau?.heure_debut ?? '11:30')
  const [fin, setFin] = useState(creneau?.heure_fin ?? '14:00')
  const [duree, setDuree] = useState<number>(creneau?.duree_creneau_min ?? 15)
  const [max, setMax] = useState<number>(creneau?.max_commandes ?? 8)
  const [actif, setActif] = useState(creneau?.actif ?? true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (debut >= fin) { setErreur('Heure début doit être < heure fin'); return }
    if (max < 1) { setErreur('Max commandes ≥ 1'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          tag_destination: tag,
          jour_semaine: jour,
          heure_debut: debut,
          heure_fin: fin,
          duree_creneau_min: duree,
          max_commandes: max,
          actif,
        }
        if (isEdit) await modifierCreneauCapacite({ ...payload, id: creneau!.id })
        else await creerCreneauCapacite(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-md w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {isEdit ? 'Modifier le créneau' : 'Nouveau créneau'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Zone *</label>
            <select
              value={tag}
              onChange={e => setTag(e.target.value as TagDestination)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {ZONES_ONLINE.map(z => (
                <option key={z} value={z}>{TAG_DEST_LABEL[z].emoji} {TAG_DEST_LABEL[z].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Jour *</label>
            <select
              value={jour}
              onChange={e => setJour(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 0].map(j => (
                <option key={j} value={j}>{JOURS[j]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Début *</label>
              <Input type="time" step="900" value={debut} onChange={e => setDebut(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Fin *</label>
              <Input type="time" step="900" value={fin} onChange={e => setFin(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Durée créneau (min)</label>
              <Input
                type="number"
                min="5"
                max="120"
                step="5"
                value={duree}
                onChange={e => setDuree(Number(e.target.value) || 15)}
              />
              <p className="text-[11px] text-zinc-500 mt-0.5">Standard : 15 min</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Max commandes / créneau *</label>
              <Input
                type="number"
                min="1"
                max="500"
                value={max}
                onChange={e => setMax(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2">
            <input
              type="checkbox"
              checked={actif}
              onChange={e => setActif(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="font-medium">Actif</span>
          </label>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
            <Button onClick={valider} disabled={isPending} className="flex-[2]">
              {isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
