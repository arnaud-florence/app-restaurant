// Wrapper client : navigation par onglets pour le dashboard fidélité.
// La page reste un Server Component ; chaque groupe de sections est passé en ReactNode.

'use client'

import { useState, type ReactNode } from 'react'
import { PillTab } from '@/components/ui/PillTab'

type TabKey = 'clients' | 'parametres' | 'analytics' | 'historique'

export default function FideliteTabs({
  clients,
  parametres,
  analytics,
  historique,
}: {
  clients: ReactNode
  parametres: ReactNode
  analytics: ReactNode
  historique: ReactNode
}) {
  const [tab, setTab] = useState<TabKey>('clients')

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-zinc-50/90 backdrop-blur flex gap-1.5 overflow-x-auto">
        <PillTab active={tab === 'clients'} onClick={() => setTab('clients')}>🧑 Clients</PillTab>
        <PillTab active={tab === 'parametres'} onClick={() => setTab('parametres')}>⚙️ Paramètres</PillTab>
        <PillTab active={tab === 'analytics'} onClick={() => setTab('analytics')}>📈 Analytics</PillTab>
        <PillTab active={tab === 'historique'} onClick={() => setTab('historique')}>📜 Historique</PillTab>
      </div>

      <div className="space-y-6">
        {tab === 'clients' && clients}
        {tab === 'parametres' && parametres}
        {tab === 'analytics' && analytics}
        {tab === 'historique' && historique}
      </div>
    </>
  )
}
