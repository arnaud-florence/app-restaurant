'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Plus, Trash2, ExternalLink, AlertTriangle, ShoppingBag, Calendar } from 'lucide-react'
import { creerPlatDuJour, modifierPlatDuJour, togglePlatDuJour, supprimerPlatDuJour } from './actions'
import type { PlatDuJour, RecetteOnline } from './page'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function PlatsDuJourClient({
  plats, recettes,
}: {
  plats: PlatDuJour[]
  recettes: RecetteOnline[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<PlatDuJour | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<PlatDuJour | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  // Plats actifs aujourd'hui
  const aujourdhui = plats.filter(p => {
    if (!p.actif) return false
    const t = todayISO()
    if (p.date_debut > t) return false
    if (p.date_fin && p.date_fin < t) return false
    return true
  })

  function toggle(p: PlatDuJour) {
    setErreur('')
    startTransition(async () => {
      try {
        await togglePlatDuJour(p.id, !p.actif)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function supprimer() {
    if (!confirmDel) return
    setErreur('')
    startTransition(async () => {
      try {
        await supprimerPlatDuJour(confirmDel.id)
        setConfirmDel(null)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-500" />
            Plats du jour
          </h1>
          <p className="text-sm text-zinc-500">
            Mis en avant en hero du site web. {aujourdhui.length} actif{aujourdhui.length > 1 ? 's' : ''} aujourd&apos;hui.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={recettes.length === 0} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Ajouter un plat du jour
        </Button>
      </header>

      {/* Card explicative — flow CTA selon vendable_online */}
      <Card className="p-4 bg-emerald-50 border-emerald-200">
        <p className="text-xs uppercase tracking-wider text-emerald-700 font-bold mb-2">💡 Comment ça marche sur le site</p>
        <ul className="text-sm text-emerald-900 space-y-1.5">
          <li className="flex items-start gap-2">
            <Calendar className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span><strong>Toujours visible :</strong> bouton « Réserver une table » → le client peut venir le déguster sur place</span>
          </li>
          <li className="flex items-start gap-2">
            <ShoppingBag className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span><strong>Si la recette est aussi 🌐 vendable en ligne :</strong> bouton supplémentaire « Commander en ligne » (click & collect)</span>
          </li>
        </ul>
      </Card>

      {/* Pas de recette active du tout → guide */}
      {recettes.length === 0 && (
        <Card className="p-5 bg-amber-50 border-amber-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Aucune recette active</p>
              <p className="text-sm text-amber-800 mt-1">
                Crée tes recettes dans <Link href="/admin/recettes" className="underline">/admin/recettes</Link>,
                puis reviens ici pour les mettre en plat du jour.
              </p>
            </div>
          </div>
        </Card>
      )}

      {erreur && (
        <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>
      )}

      {/* Liste des plats du jour */}
      {plats.length === 0 ? (
        recettes.length > 0 && (
          <Card className="p-8 text-center text-zinc-500">
            <Sparkles className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
            <p className="text-base font-medium">Aucun plat du jour configuré</p>
            <p className="text-xs mt-1">Clique « Ajouter » pour mettre en avant ta première suggestion.</p>
          </Card>
        )
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plats.map(p => {
            const t = todayISO()
            const futur = p.date_debut > t
            const passe = p.date_fin && p.date_fin < t
            return (
              <Card key={p.id} className={`overflow-hidden ${!p.actif ? 'opacity-60' : ''}`}>
                {p.recette_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.recette_image_url}
                    alt={p.recette_nom}
                    className="w-full h-40 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center">
                    <Sparkles className="h-12 w-12 text-amber-500/50" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{p.recette_nom}</p>
                      <p className="text-[11px] text-zinc-500">
                        {p.date_debut} {p.date_fin ? `→ ${p.date_fin}` : '→ ∞'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {!p.actif && <Badge variant="secondary">inactif</Badge>}
                      {p.actif && futur && <Badge className="bg-blue-100 text-blue-800 border-blue-300">à venir</Badge>}
                      {p.actif && passe && <Badge className="bg-zinc-100 text-zinc-600 border-zinc-300">passé</Badge>}
                      {p.actif && !futur && !passe && <Badge className="bg-emerald-500 text-white">actif</Badge>}
                    </div>
                  </div>
                  {/* CTA disponibles sur le site */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge className="bg-violet-100 text-violet-800 border-violet-300 gap-1 text-[10px]">
                      <Calendar className="h-3 w-3" /> Réservation table
                    </Badge>
                    {p.recette_vendable_online ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-[10px]">
                        <ShoppingBag className="h-3 w-3" /> Commande en ligne
                      </Badge>
                    ) : (
                      <Badge className="bg-zinc-100 text-zinc-500 border-zinc-300 gap-1 text-[10px]">
                        Sur place uniquement
                      </Badge>
                    )}
                  </div>
                  {p.description_speciale && (
                    <p className="text-xs italic text-zinc-600 mt-2 line-clamp-2">« {p.description_speciale} »</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-3 text-sm">
                    <div>
                      {p.prix_special !== null ? (
                        <>
                          <span className="font-bold text-amber-700">{p.prix_special.toFixed(2)} €</span>
                          <span className="text-xs text-zinc-400 line-through ml-1.5">{p.recette_prix_ht.toFixed(2)} €</span>
                        </>
                      ) : (
                        <span className="font-bold">{p.recette_prix_ht.toFixed(2)} €</span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">ordre {p.ordre}</span>
                  </div>
                  <div className="flex gap-1 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)} className="flex-1">
                      Éditer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(p)} className="flex-1">
                      {p.actif ? 'Désactiver' : 'Activer'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDel(p)} className="text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal création / édition */}
      {(creating || editing) && (
        <PlatModal
          recettes={recettes}
          plat={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {/* Confirm suppression */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer « {confirmDel.recette_nom} » ?</p>
            <p className="text-sm text-zinc-600 mb-3">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={supprimer} className="flex-1 bg-red-600 hover:bg-red-700">Supprimer</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Modal création / édition ────────────────────────────────
function PlatModal({
  recettes, plat, onClose, onSaved,
}: {
  recettes: RecetteOnline[]
  plat: PlatDuJour | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!plat
  const [recetteId, setRecetteId] = useState(plat?.recette_id ?? recettes[0]?.id ?? '')
  const [dateDebut, setDateDebut] = useState(plat?.date_debut ?? todayISO())
  const [dateFin, setDateFin] = useState(plat?.date_fin ?? '')
  const [prixSpecial, setPrixSpecial] = useState<string>(plat?.prix_special?.toString() ?? '')
  const [description, setDescription] = useState(plat?.description_speciale ?? '')
  const [ordre, setOrdre] = useState<number>(plat?.ordre ?? 0)
  const [actif, setActif] = useState(plat?.actif ?? true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!recetteId) { setErreur('Sélectionne une recette'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          recette_id: recetteId,
          date_debut: dateDebut,
          date_fin: dateFin || null,
          prix_special: prixSpecial ? Number(prixSpecial) : null,
          description_speciale: description || null,
          ordre,
          actif,
        }
        if (isEdit) await modifierPlatDuJour({ ...payload, id: plat!.id })
        else await creerPlatDuJour(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {isEdit ? 'Modifier le plat du jour' : 'Nouveau plat du jour'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Recette à mettre en avant</label>
            <select
              value={recetteId}
              onChange={e => setRecetteId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {recettes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.vendable_online ? '🌐 ' : '📍 '}
                  {r.nom} · {r.categorie} · {r.prix_vente_ht.toFixed(2)} €
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              🌐 = aussi commandable en ligne · 📍 = sur place uniquement (toujours réservable via le site)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Date début</label>
              <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Date fin (optionnel)</label>
              <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
              <p className="text-[11px] text-zinc-500 mt-0.5">Vide = sans fin</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Prix spécial € (optionnel)</label>
            <Input
              type="number"
              step="0.10"
              min="0"
              placeholder="Laisse vide pour le prix normal"
              value={prixSpecial}
              onChange={e => setPrixSpecial(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Description spéciale (optionnel)</label>
            <Input
              type="text"
              placeholder="Ex : « Notre suggestion du chef ! »"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Ordre d&apos;affichage</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={ordre}
                onChange={e => setOrdre(Number(e.target.value) || 0)}
              />
              <p className="text-[11px] text-zinc-500 mt-0.5">0 = premier</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Actif</label>
              <div className="flex items-center gap-2 h-10">
                <input
                  type="checkbox"
                  id="actif"
                  checked={actif}
                  onChange={e => setActif(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="actif" className="text-sm cursor-pointer">{actif ? 'Visible sur le site' : 'Masqué'}</label>
              </div>
            </div>
          </div>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">
              Annuler
            </Button>
            <Button onClick={valider} disabled={isPending || !recetteId} className="flex-[2]">
              {isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 italic mt-3 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Ces plats apparaîtront en mise en avant sur le site web (outil 2 à venir).
          Boutons CTA : Réserver une table (toujours) + Commander en ligne (si recette 🌐).
        </p>
      </Card>
    </div>
  )
}
