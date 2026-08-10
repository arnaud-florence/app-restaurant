// /fournil a été généralisé en /comptoir/[slug]. Redirection permanente pour
// conserver les anciens liens/favoris.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function FournilRedirect() {
  redirect('/comptoir/fournil')
}
