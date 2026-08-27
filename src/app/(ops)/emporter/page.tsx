// Écran de vente retiré : la prise de commande et l'encaissement se font sur
// les caisses (cf. src/lib/frontiere-caisse.ts). L'ancien code reste dans
// l'historique git — dossier _retire-emporter au moment du retrait.

import { notFound } from 'next/navigation'
import EcranRemplace from '@/components/ops/EcranRemplace'
import { infoRemplacement } from '@/lib/frontiere-caisse'

export const metadata = { title: 'Sur la caisse — Service' }
export const dynamic = 'force-dynamic'

export default function Page() {
  const info = infoRemplacement('/emporter')
  if (!info) notFound()
  return <EcranRemplace titre={info.titre} remplacePar={info.remplacePar} />
}
