import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LegalIndexPage() {
  redirect('/legal/mentions-legales')
}
