'use client'

// Autocomplete client réutilisable.
// Branché sur searchClients(query) — server action.
// Affiche niveau + nb visites + points pour aider le choix.

import { useState, useTransition } from 'react'
import { Search, X, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { searchClients } from '@/app/admin/clients/actions'
import { NIVEAU_INFO, type NiveauFidelite } from '@/lib/clients'

export type ClientChoisi = {
  id: string
  prenom: string | null
  nom: string
  email: string | null
  telephone: string | null
  niveau_fidelite: string
  nb_visites: number
  points_fidelite: number
}

export default function ClientPicker({
  value, onChange, label = 'Client (fidélité)',
}: {
  value: ClientChoisi | null
  onChange: (c: ClientChoisi | null) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [resultats, setResultats] = useState<ClientChoisi[]>([])
  const [isPending, startTransition] = useTransition()
  const [showResults, setShowResults] = useState(false)

  function rechercher(q: string) {
    setQuery(q)
    if (q.trim().length < 2) {
      setResultats([])
      setShowResults(false)
      return
    }
    setShowResults(true)
    startTransition(async () => {
      try {
        const r = await searchClients(q)
        setResultats(r)
      } catch {
        setResultats([])
      }
    })
  }

  function choisir(c: ClientChoisi) {
    onChange(c)
    setQuery('')
    setShowResults(false)
    setResultats([])
  }

  function retirer() {
    onChange(null)
  }

  const niveauKey = (value?.niveau_fidelite ?? 'standard') as NiveauFidelite
  const nivInfo = NIVEAU_INFO[niveauKey] ?? NIVEAU_INFO.standard

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-700">{label}</p>

      {value ? (
        <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-emerald-300 bg-emerald-50">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">
                {value.prenom ? value.prenom + ' ' : ''}{value.nom}
              </span>
              <Badge variant="outline" className={nivInfo.cls}>
                {nivInfo.emoji} {nivInfo.label}
              </Badge>
              <span className="text-xs text-zinc-600 inline-flex items-center gap-1">
                <Star className="h-3 w-3" /> {value.points_fidelite} pts · {value.nb_visites} visites
              </span>
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={retirer} className="text-red-600">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              value={query}
              onChange={e => rechercher(e.target.value)}
              placeholder="Nom, prénom, email, téléphone…"
              className="pl-8"
            />
          </div>

          {showResults && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-md shadow-lg z-50 max-h-72 overflow-y-auto">
              {isPending && (
                <p className="text-xs text-zinc-500 p-3">Recherche…</p>
              )}
              {!isPending && resultats.length === 0 && (
                <p className="text-xs text-zinc-500 p-3">Aucun client trouvé pour « {query} »</p>
              )}
              {!isPending && resultats.map(c => {
                const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
                const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => choisir(c)}
                    className="w-full text-left p-2 hover:bg-emerald-50 border-b border-zinc-100 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium">
                        {c.prenom ? c.prenom + ' ' : ''}{c.nom}
                      </span>
                      <Badge variant="outline" className={ni.cls + ' text-[10px]'}>
                        {ni.emoji} {ni.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {c.points_fidelite} pts · {c.nb_visites} visites
                      {c.email && ' · ' + c.email}
                      {c.telephone && ' · ' + c.telephone}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
