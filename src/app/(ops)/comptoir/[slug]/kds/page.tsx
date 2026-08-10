// KDS de préparation d'un comptoir — /comptoir/[slug]/kds
import { notFound } from 'next/navigation'
import { listCommandesActives } from '../../../actions'
import { getComptoir } from '@/lib/comptoir/config'
import ComptoirKdsClient from './ComptoirKdsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cfg = getComptoir(params.slug)
  return { title: cfg ? `${cfg.label} — Préparation` : 'Préparation' }
}

export default async function ComptoirKdsPage({ params }: { params: { slug: string } }) {
  const cfg = getComptoir(params.slug)
  if (!cfg) notFound()
  const commandes = await listCommandesActives()
  return <ComptoirKdsClient config={cfg} initial={commandes} />
}
