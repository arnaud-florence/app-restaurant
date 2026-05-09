'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, ExternalLink } from 'lucide-react'
import { NIVEAU_INFO, type NiveauFidelite } from '@/lib/clients'

type ClientRecap = {
  id: string; prenom: string | null; nom: string;
  points_fidelite: number; niveau_fidelite: string;
  nb_visites: number; total_depense: number;
  derniere_visite: string | null;
  email: string | null; telephone: string | null;
}

type SortKey = 'points' | 'visites' | 'ca' | 'derniere' | 'nom'

const NIVEAUX_FILTRE: Array<{ key: 'tous' | NiveauFidelite; label: string }> = [
  { key: 'tous',     label: 'Tous' },
  { key: 'standard', label: '👤 Standard' },
  { key: 'bronze',   label: '🥉 Bronze' },
  { key: 'argent',   label: '🥈 Argent' },
  { key: 'or',       label: '🥇 Or' },
  { key: 'platine',  label: '💎 Platine' },
]

export default function TableClientsFideliteClient({ clients }: { clients: ClientRecap[] }) {
  const [query, setQuery] = useState('')
  const [niveau, setNiveau] = useState<'tous' | NiveauFidelite>('tous')
  const [sortBy, setSortBy] = useState<SortKey>('points')

  const filteredAndSorted = useMemo(() => {
    let r = clients
    if (niveau !== 'tous') r = r.filter(c => c.niveau_fidelite === niveau)
    if (query.trim().length >= 2) {
      const q = query.toLowerCase().trim()
      r = r.filter(c =>
        (c.prenom ?? '').toLowerCase().includes(q) ||
        c.nom.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.telephone ?? '').toLowerCase().includes(q)
      )
    }
    r = [...r].sort((a, b) => {
      switch (sortBy) {
        case 'points':   return b.points_fidelite - a.points_fidelite
        case 'visites':  return b.nb_visites - a.nb_visites
        case 'ca':       return b.total_depense - a.total_depense
        case 'derniere': return (b.derniere_visite ?? '').localeCompare(a.derniere_visite ?? '')
        case 'nom':      return a.nom.localeCompare(b.nom)
      }
    })
    return r
  }, [clients, niveau, query, sortBy])

  function visitesPourProchainPalier(c: ClientRecap): { label: string; restantes: number } | null {
    const ordre: NiveauFidelite[] = ['standard', 'bronze', 'argent', 'or', 'platine']
    const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
    const idx = ordre.indexOf(k)
    if (idx < 0 || idx >= ordre.length - 1) return null
    const prochain = ordre[idx + 1]
    const info = NIVEAU_INFO[prochain]
    return { label: info.label, restantes: Math.max(0, info.min_visites - c.nb_visites) }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div>
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher nom, prénom, email, téléphone…"
            className="pl-8"
          />
        </div>
        <select
          value={niveau}
          onChange={e => setNiveau(e.target.value as typeof niveau)}
          className="h-10 px-3 rounded-md border border-zinc-200 bg-white text-sm"
        >
          {NIVEAUX_FILTRE.map(n => (
            <option key={n.key} value={n.key}>{n.label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortKey)}
          className="h-10 px-3 rounded-md border border-zinc-200 bg-white text-sm"
        >
          <option value="points">Tri : points ↓</option>
          <option value="visites">Tri : visites ↓</option>
          <option value="ca">Tri : CA ↓</option>
          <option value="derniere">Tri : dernière visite</option>
          <option value="nom">Tri : nom A→Z</option>
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{filteredAndSorted.length} résultat{filteredAndSorted.length > 1 ? 's' : ''}</span>
      </div>

      {/* Tableau */}
      {filteredAndSorted.length === 0 ? (
        <p className="text-sm text-zinc-500 italic py-4 text-center">
          Aucun client {niveau !== 'tous' && `de niveau ${niveau} `}
          {query && `pour « ${query} »`}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase border-b border-zinc-200">
              <tr>
                <th className="text-left py-2">Client</th>
                <th className="text-left">Niveau</th>
                <th className="text-right">Points</th>
                <th className="text-right">Visites</th>
                <th className="text-right">CA</th>
                <th className="text-left">Dernière visite</th>
                <th className="text-left">Prochain palier</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map(c => {
                const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
                const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                const prochain = visitesPourProchainPalier(c)
                return (
                  <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2">
                      <p className="font-medium">{c.prenom ? c.prenom + ' ' : ''}{c.nom}</p>
                      {c.email && <p className="text-[11px] text-zinc-500">{c.email}</p>}
                    </td>
                    <td>
                      <Badge variant="outline" className={ni.cls + ' text-[10px] whitespace-nowrap'}>
                        {ni.emoji} {ni.label}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums font-bold">{c.points_fidelite}</td>
                    <td className="text-right tabular-nums">{c.nb_visites}</td>
                    <td className="text-right tabular-nums">{c.total_depense.toFixed(0)} €</td>
                    <td className="text-zinc-600 text-xs">{fmtDate(c.derniere_visite)}</td>
                    <td className="text-xs text-zinc-600">
                      {prochain ? (
                        <span>
                          → <span className="font-medium">{prochain.label}</span>{' '}
                          <span className="text-zinc-500">({prochain.restantes} visite{prochain.restantes > 1 ? 's' : ''})</span>
                        </span>
                      ) : (
                        <span className="text-violet-700 font-medium">Niveau max</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/client/${c.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 underline"
                      >
                        Voir <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
