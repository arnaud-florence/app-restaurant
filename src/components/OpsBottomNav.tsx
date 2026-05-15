'use client'

// DEPRECATED — remplacé par <TopActionBar> (src/components/TopActionBar.tsx)
// qui est fixed bottom sur mobile et static top sur desktop.
// Ce composant retourne null pour préserver les imports existants.
// À supprimer définitivement quand toutes les pages auront retiré la référence.

import type { CustomPermissions } from '@/lib/permissions'

export type OpsBottomNavProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
} | null

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function OpsBottomNav(_props: { profil?: OpsBottomNavProfil }) {
  return null
}
