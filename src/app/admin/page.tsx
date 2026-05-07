// /admin sans sous-route : redirige vers le dashboard pilotage (10 KPIs).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminIndex() {
  redirect('/admin/pilotage')
}
