'use client'

import { useState, useTransition } from 'react'
import { toast } from '@/lib/toast'
import { Plus, X, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { demanderConge } from './actions'

export default function DemandeCongeForm({ employeId }: { employeId: string }) {
  const [open, setOpen]       = useState(false)
  const [debut, setDebut]     = useState('')
  const [fin, setFin]         = useState('')
  const [type, setType]       = useState<'conge' | 'absence' | 'maladie' | 'formation'>('conge')
  const [notes, setNotes]     = useState('')
  const [pending, startTransition] = useTransition()

  function envoyer() {
    if (!debut || !fin) { toast.error('Date de début et fin obligatoires'); return }
    if (new Date(fin) < new Date(debut)) { toast.error('Date fin avant date début'); return }
    startTransition(async () => {
      try {
        await demanderConge({ employe_id: employeId, date_debut: debut, date_fin: fin, type, notes: notes || null })
        setOpen(false); setDebut(''); setFin(''); setNotes(''); setType('conge')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium py-1"
      >
        <Plus className="h-3 w-3" /> Demander un congé
      </button>
    )
  }

  return (
    <div className="rounded-md border-2 border-emerald-200 bg-emerald-50/50 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">Nouvelle demande</p>
        <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-emerald-100 rounded"><X className="h-3 w-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[11px] block">Du</label>
          <Input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="text-xs h-8" />
        </div>
        <div>
          <label className="text-[11px] block">Au</label>
          <Input type="date" value={fin} onChange={e => setFin(e.target.value)} className="text-xs h-8" />
        </div>
      </div>
      <div>
        <label className="text-[11px] block">Type</label>
        <select value={type} onChange={e => setType(e.target.value as typeof type)} className="w-full text-xs border rounded h-8 px-2">
          <option value="conge">Congé payé</option>
          <option value="absence">Absence</option>
          <option value="maladie">Maladie</option>
          <option value="formation">Formation</option>
        </select>
      </div>
      <div>
        <label className="text-[11px] block">Notes (facultatif)</label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} className="text-xs h-8" placeholder="Mariage, voyage…" />
      </div>
      <Button onClick={envoyer} disabled={pending} size="sm" className="w-full h-8 gap-1 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Envoyer la demande
      </Button>
    </div>
  )
}
