import { loadSetupData } from './actions'
import SetupWizard from './SetupWizard'

export const metadata = { title: 'Configuration initiale — app-restaurant' }
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const initial = await loadSetupData()
  return <SetupWizard initial={initial} />
}
