'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Bed, Plus, Trash2, Zap } from 'lucide-react'
import { creerChambre, modifierChambre, supprimerChambre, seedChambresStarter } from './actions'
import type { Chambre } from './page'

const EQUIPEMENTS = [
  { key: 'wifi', label: 'WiFi' },
  { key: 'tv', label: 'TV' },
  { key: 'petit_dejeuner', label: 'Petit-déj inclus' },
  { key: 'climatisation', label: 'Climatisation' },
  { key: 'salle_de_bain_privee', label: 'SdB privée' },
  { key: 'balcon', label: 'Balcon' },
  { key: 'baignoire', label: 'Baignoire' },
  { key: 'parking', label: 'Parking' },
]

export default function ChambresAdminClient({ chambres }: { chambres: Chambre[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Chambre | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Chambre | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  function exec(action: () => Promise<void>) {
    setErreur('')
    startTransition(async () => {
      try { await action(); router.refresh() }
      catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bed className="h-6 w-6 text-zinc-700" />
            Chambres d&apos;hôtes
          </h1>
          <p className="text-sm text-zinc-500">{chambres.length} chambre{chambres.length > 1 ? 's' : ''} configurée{chambres.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {chambres.length === 0 && (
            <Button variant="outline" onClick={() => exec(async () => { await seedChambresStarter() })} className="gap-1">
              <Zap className="h-4 w-4" /> 3 chambres starter
            </Button>
          )}
          <Button onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Nouvelle chambre
          </Button>
        </div>
      </header>

      {erreur && <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>}

      {chambres.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          <Bed className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
          <p className="text-base font-medium">Aucune chambre configurée</p>
          <p className="text-xs mt-1">Crée une chambre ou utilise « 3 chambres starter » pour démarrer.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {chambres.map(c => (
            <Card key={c.id} className={`overflow-hidden ${!c.actif ? 'opacity-60' : ''}`}>
              {c.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.photos[0]} alt={c.nom} className="w-full h-40 object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-5xl">🛏️</div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-bold">{c.nom}</p>
                    <p className="text-xs text-zinc-500">N° {c.numero} · {c.capacite} pers.</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-700 tabular-nums">{c.prix_nuit_ht.toFixed(0)} €</p>
                </div>
                {c.description && <p className="text-xs text-zinc-600 line-clamp-2 mt-1">{c.description}</p>}
                {c.equipements.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.equipements.slice(0, 4).map(e => (
                      <Badge key={e} variant="outline" className="text-[10px]">
                        {EQUIPEMENTS.find(x => x.key === e)?.label ?? e}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 mt-3">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)} className="flex-1">Éditer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ChambreModal
          chambre={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer « {confirmDel.nom} » ?</p>
            <p className="text-sm text-zinc-600 mb-3">
              Si la chambre a des réservations, préfère la désactiver.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={() => exec(async () => { await supprimerChambre(confirmDel.id); setConfirmDel(null) })} className="flex-1 bg-red-600 hover:bg-red-700">
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function ChambreModal({ chambre, onClose, onSaved }: { chambre: Chambre | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!chambre
  const [nom, setNom] = useState(chambre?.nom ?? '')
  const [numero, setNumero] = useState(chambre?.numero ?? '')
  const [capacite, setCapacite] = useState(chambre?.capacite ?? 2)
  const [prix, setPrix] = useState<number>(chambre?.prix_nuit_ht ?? 75)
  const [description, setDescription] = useState(chambre?.description ?? '')
  const [equipements, setEquipements] = useState<string[]>(chambre?.equipements ?? [])
  const [photos, setPhotos] = useState<string[]>(chambre?.photos ?? [''])
  const [video360, setVideo360] = useState(chambre?.video_360_url ?? '')
  const [actif, setActif] = useState(chambre?.actif ?? true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggleEq(k: string) {
    setEquipements(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  }

  function valider() {
    if (!nom.trim() || !numero.trim()) { setErreur('Nom et numéro obligatoires'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          nom: nom.trim(), numero: numero.trim(), capacite, prix_nuit_ht: prix,
          description: description.trim() || null, equipements,
          photos: photos.filter(p => p.trim()),
          video_360_url: video360.trim() || null,
          actif,
        }
        if (isEdit) await modifierChambre({ ...payload, id: chambre!.id })
        else await creerChambre(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2">{isEdit ? 'Modifier la chambre' : 'Nouvelle chambre'}</h2>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-bold block mb-1">Nom *</label>
            <Input value={nom} onChange={e => setNom(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Numéro *</label>
            <Input value={numero} onChange={e => setNumero(e.target.value)} maxLength={20} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-bold block mb-1">Capacité (pers.)</label>
            <Input type="number" min="1" max="20" value={capacite} onChange={e => setCapacite(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">Prix HT / nuit (€)</label>
            <Input type="number" min="0" step="5" value={prix} onChange={e => setPrix(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold block mb-1">Description</label>
          <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
        </div>

        <div>
          <label className="text-sm font-bold block mb-1">Équipements</label>
          <div className="grid grid-cols-2 gap-1">
            {EQUIPEMENTS.map(e => (
              <label key={e.key} className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer ${equipements.includes(e.key) ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-50'}`}>
                <input type="checkbox" checked={equipements.includes(e.key)} onChange={() => toggleEq(e.key)} className="h-4 w-4" />
                {e.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-bold block mb-1">Photos (URLs publiques, 1 par ligne)</label>
          <Textarea rows={3} value={photos.join('\n')} onChange={e => setPhotos(e.target.value.split('\n'))}
            placeholder="https://images.unsplash.com/..." />
          <p className="text-[11px] text-zinc-500 mt-0.5">Recommandé : 1200×800px. Première photo = image principale.</p>
        </div>

        <div>
          <label className="text-sm font-bold block mb-1">URL vidéo 360° (optionnel)</label>
          <Input value={video360} onChange={e => setVideo360(e.target.value)} placeholder="https://www.youtube.com/watch?v=XXXX" />
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Visite virtuelle YouTube/Vimeo. Coller l&apos;URL complète, on génère l&apos;embed auto.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2">
          <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="h-4 w-4" />
          <span className="font-medium">Active (visible sur le site)</span>
        </label>

        {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
          <Button onClick={valider} disabled={isPending} className="flex-[2]">
            {isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
