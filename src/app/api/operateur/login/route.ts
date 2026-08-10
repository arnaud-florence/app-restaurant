// POST /api/operateur/login  { pin }  → ouvre une session opérateur.
import { NextResponse } from 'next/server'
import { verifierPinOperateur, setOperateurSession, logActivite } from '@/lib/operateur'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let pin = ''
  try { pin = String((await req.json())?.pin ?? '') } catch { /* */ }

  const res = await verifierPinOperateur(pin)
  if (!res.ok) {
    const msg = res.reason === 'locked' ? 'Trop d\'essais — réessaie dans 1 min.'
      : res.reason === 'format' ? 'PIN : 4 à 6 chiffres.'
      : 'PIN incorrect.'
    return NextResponse.json({ ok: false, error: msg }, { status: 200 })
  }
  await setOperateurSession(res.operateur.id)
  await logActivite({ action: 'prise_poste', employeId: res.operateur.id })
  return NextResponse.json({ ok: true, operateur: res.operateur })
}
