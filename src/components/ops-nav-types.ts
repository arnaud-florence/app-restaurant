import type { CustomPermissions } from '@/lib/permissions'

export type OpsBottomNavProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
  apercu?: {
    ciblePoste: string | null
    ciblePerms: CustomPermissions | null
    ciblePrenom: string
    cibleNom: string
  } | null
} | null
