// ─── Scanner de traçabilité ─────────────────────────────────────────
// POST /api/agents/scanner-lots : photos (étiquettes produit, page du
// cahier de traçabilité manuscrite, ou les deux) → Claude Vision extrait
// la liste des lots : produit, DLC/DLU, n° de lot, marque.
//
// Contrairement au scanner de factures (un document = un résultat), une
// seule photo peut porter PLUSIEURS lots — la page de cahier du Fournil en
// aligne neuf. La réponse est donc un tableau, et le front fait valider
// chaque ligne avant de créer les lots.
//
// Même transport que le scanner de factures : jusqu'à 8 images en un seul
// appel, réduites côté client (~1600 px).
//
// Coût : ~0,01 $ par scan (claude-haiku-4-5). Auth manager.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProfile } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'

type LotExtrait = {
  produit: string
  dlc: string | null          // YYYY-MM-DD
  lot_numero: string | null
  marque: string | null
  format: string | null       // « 280 g », « 5×100 g »…
  confiance: number           // 0..1
}

export async function POST(req: Request) {
  const profil = await getProfile()
  if (!profil) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (profil.role !== 'manager') return NextResponse.json({ error: 'Accès manager requis' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  type Page = { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  const pages: Page[] = []
  try {
    const body = await req.json() as { images?: Array<{ image_base64: string; media_type?: string }> }
    for (const im of body.images ?? []) {
      if (!im?.image_base64) continue
      pages.push({
        data: im.image_base64.replace(/^data:image\/[a-z]+;base64,/, ''),
        mediaType: im.media_type === 'image/png' || im.media_type === 'image/webp' ? im.media_type : 'image/jpeg',
      })
    }
  } catch {
    return NextResponse.json({ error: 'JSON attendu : { images: [{ image_base64 }] }' }, { status: 400 })
  }
  if (pages.length === 0) return NextResponse.json({ error: 'images[] requis' }, { status: 400 })
  if (pages.length > 8) return NextResponse.json({ error: `${pages.length} photos : maximum 8.` }, { status: 413 })
  const tailleKo = Math.ceil(pages.reduce((s, p) => s + p.data.length, 0) / 1024 * 0.75)
  if (tailleKo > 6000) return NextResponse.json({ error: `Photos trop volumineuses (${tailleKo} Ko > 6 Mo).` }, { status: 413 })

  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `Tu lis des documents de traçabilité alimentaire d'une boulangerie française : étiquettes de produits (imprimées) et pages de cahier manuscrites listant produit / DLC ou DLU / numéro de lot.
Tu extrais TOUS les lots visibles, au format JSON STRICT, sans préambule ni commentaire.
Dates en YYYY-MM-DD (une DLU « 18/06/27 » = 2027-06-18 ; « 31/07/2027 » = 2027-07-31).
Si une valeur est illisible ou absente : null. "confiance" = ta certitude 0..1 sur la ligne.`,
    messages: [{
      role: 'user',
      content: [
        ...pages.map(p => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: p.mediaType, data: p.data },
        })),
        {
          type: 'text' as const,
          text: `Extrais tous les lots de ces ${pages.length} photo(s) (étiquettes et/ou lignes manuscrites). Renvoie UNIQUEMENT :
{
  "lots": [
    { "produit": string, "dlc": "YYYY-MM-DD" | null, "lot_numero": string | null, "marque": string | null, "format": string | null, "confiance": number }
  ]
}
Une ligne manuscrite « Baguette victoire 280g / DLU 31/07/2027 / lot 333JG211 » = un lot. Une étiquette collée (avec code-barres, DLC et L./lot imprimés) = un lot aussi. Ne fusionne jamais deux produits différents.`,
        },
      ],
    }],
  })

  const textBlock = resp.content.find(c => c.type === 'text')
  const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim()
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return NextResponse.json({ error: 'Extraction sans JSON exploitable' }, { status: 502 })

  let lots: LotExtrait[] = []
  try { lots = (JSON.parse(m[0]).lots ?? []) as LotExtrait[] } catch {
    return NextResponse.json({ error: 'JSON d\'extraction invalide' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, lots, nb_photos: pages.length })
}
