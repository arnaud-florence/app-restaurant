// POST /api/operateur/logout → verrouille la session opérateur (fin de poste).
import { NextResponse } from 'next/server'
import { getOperateur, clearOperateurSession, logActivite } from '@/lib/operateur'

export const dynamic = 'force-dynamic'

export async function POST() {
  const op = await getOperateur()
  if (op) await logActivite({ action: 'fin_poste', employeId: op.id })
  await clearOperateurSession()
  return NextResponse.json({ ok: true })
}
