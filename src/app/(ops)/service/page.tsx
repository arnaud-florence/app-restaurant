import { getCentreOperationnel } from '@/lib/centre-operationnel'
import CentreOperationnelClient from './CentreOperationnelClient'

export const metadata = { title: 'Centre opérationnel', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ServicePage() {
  const data = await getCentreOperationnel()
  return <CentreOperationnelClient initial={data} />
}
