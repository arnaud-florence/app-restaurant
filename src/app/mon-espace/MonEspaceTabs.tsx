'use client'

// Navigation par onglets pour /mon-espace (façon Facebook/Instagram).
// L'en-tête (avatar + identité + CTA) reste dans page.tsx au-dessus.
// Ici : une barre d'onglets PillTab sticky + rendu conditionnel d'un seul
// groupe de sections à la fois (page.tsx compose les ReactNode par onglet).

import { useState } from 'react'
import { PillTab } from '@/components/ui/PillTab'

type Tab = 'vue' | 'presence' | 'conges' | 'paie'

export default function MonEspaceTabs({
  vueSections = null,
  presenceSections = null,
  congesSections = null,
  paieSections = null,
}: {
  /** Onglet "Vue d'ensemble" : pointage + ma formation + KPIs flash + historique 7j. */
  vueSections?: React.ReactNode
  /** Onglet "Présence & shifts" : shifts/briefing/alertes. */
  presenceSections?: React.ReactNode
  /** Onglet "Congés & perf" : performance/congés/météo. */
  congesSections?: React.ReactNode
  /** Onglet "Paie & récompenses" : rémunération estimée + challenges. */
  paieSections?: React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>('vue')

  return (
    <>
      {/* Onglets PillTab tactiles 44px — sticky : on change de sujet sans scroller */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 bg-zinc-50/90 backdrop-blur flex gap-1.5 overflow-x-auto">
        <PillTab active={tab === 'vue'} onClick={() => setTab('vue')}>🏠 Vue d&apos;ensemble</PillTab>
        <PillTab active={tab === 'presence'} onClick={() => setTab('presence')}>📅 Présence &amp; shifts</PillTab>
        <PillTab active={tab === 'conges'} onClick={() => setTab('conges')}>🏖 Congés &amp; perf</PillTab>
        <PillTab active={tab === 'paie'} onClick={() => setTab('paie')}>💰 Paie &amp; récompenses</PillTab>
      </div>

      {tab === 'vue' && <div className="space-y-6">{vueSections}</div>}
      {tab === 'presence' && <div className="space-y-6">{presenceSections}</div>}
      {tab === 'conges' && <div className="space-y-6">{congesSections}</div>}
      {tab === 'paie' && <div className="space-y-6">{paieSections}</div>}
    </>
  )
}
