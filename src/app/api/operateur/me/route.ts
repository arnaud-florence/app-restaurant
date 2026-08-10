// GET /api/operateur/me → opérateur actuellement « au poste » (ou null).
import { NextResponse } from 'next/server'
import { getOperateur } from '@/lib/operateur'

export const dynamic = 'force-dynamic'

export async function GET() {
  const operateur = await getOperateur()
  return NextResponse.json({ operateur })
}
