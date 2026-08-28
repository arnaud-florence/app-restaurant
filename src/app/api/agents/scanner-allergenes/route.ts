// ─── Scanner d'allergènes ───────────────────────────────────────────
// POST /api/agents/scanner-allergenes : photos d'emballages (liste
// d'ingrédients au dos d'un carton Gineys, étiquette d'une bouteille) →
// Claude Vision lit la liste et en tire les allergènes parmi les 14 de
// l'UE.
//
// Pourquoi ce scanner et pas une saisie : la composition n'est pas
// devinable. Un croissant contient du gluten par définition, mais qu'il
// contienne du lait, des œufs ou du soja dépend de la recette du
// fournisseur — et cette recette n'est écrite qu'à un seul endroit, le dos
// du carton. Sans lecture, la seule déclaration honnête est « on ne sait
// pas », ce qui n'aide aucun client allergique.
//
// ⚠️ Le règlement UE 1169/2011 impose de METTRE EN ÉVIDENCE les allergènes
// dans la liste d'ingrédients (gras, majuscules, souligné). C'est ce que
// le modèle cherche en priorité — mais il lit AUSSI la liste entière, car
// un emballage mal imprimé perd sa mise en forme.
//
// ⚠️ « Contient » et « peut contenir des traces de » sont deux choses
// différentes, et les confondre est fautif dans les deux sens : déclarer
// une trace comme un ingrédient fait fuir un client sans raison, et taire
// une trace expose un allergique sévère. Les deux listes sont donc rendues
// séparément et ne sont jamais fusionnées ici.
//
// Le résultat est une PROPOSITION : rien n'est écrit en base par cette
// route. C'est un humain qui valide, nominativement.
//
// Coût : ~0,01 $ par scan (claude-haiku-4-5). Auth manager.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProfile } from '@/lib/auth'
import { ALLERGENES_EU, filterAllergenesUE, type Allergene } from '@/lib/allergenes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'

type EtiquetteExtraite = {
  produit: string | null
  marque: string | null
  ingredients: string | null
  presents: Allergene[]
  traces: Allergene[]
  liste_lisible: boolean
  confiance: number
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
    system: `Tu lis des emballages alimentaires français (cartons de surgelés, sachets, bouteilles) pour en extraire les ALLERGÈNES au sens du règlement (UE) 1169/2011.

Méthode, dans cet ordre :
1. Repère la liste d'ingrédients ("Ingrédients :", "Ingredienti", "Zutaten").
2. Les allergènes y sont MIS EN ÉVIDENCE (gras, MAJUSCULES, souligné). Prends-les.
3. Lis aussi la liste entière : un emballage mal imprimé perd sa mise en forme, et un ingrédient comme "beurre" implique le lait même sans gras.
4. Repère séparément la mention de traces ("peut contenir", "traces éventuelles de", "fabriqué dans un atelier utilisant").

Règles strictes :
- "présents" = ingrédients réellement mis en œuvre. "traces" = contamination croisée possible. NE LES MÉLANGE JAMAIS.
- N'INVENTE RIEN. Si la liste d'ingrédients n'est pas lisible sur la photo, mets liste_lisible=false, laisse les tableaux VIDES, et ne déduis rien du nom du produit : une liste vide sera lue comme "aucun allergène" et c'est une affirmation dangereuse.
- Correspondances usuelles : farine de blé/seigle/orge/avoine, malt, semoule, chapelure → gluten ; beurre, crème, lactosérum, caséine, fromage → lait ; noisette, amande, noix, pistache → fruits_a_coque ; lécithine de soja → soja ; anhydride sulfureux, E220-E228 → sulfites.
- Les catégories admises sont exactement : ${ALLERGENES_EU.join(', ')}. Aucune autre valeur.

Réponds en JSON STRICT, sans préambule ni commentaire.`,
    messages: [{
      role: 'user',
      content: [
        ...pages.map(p => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: p.mediaType, data: p.data },
        })),
        {
          type: 'text' as const,
          text: `Lis ces ${pages.length} photo(s) d'emballage. UNE photo = UNE étiquette. Renvoie UNIQUEMENT :
{
  "etiquettes": [
    {
      "produit": string | null,
      "marque": string | null,
      "ingredients": string | null,
      "presents": string[],
      "traces": string[],
      "liste_lisible": boolean,
      "confiance": number
    }
  ]
}
"ingredients" = la liste recopiée telle qu'imprimée (elle sera relue par un humain). "confiance" = 0..1.`,
        },
      ],
    }],
  })

  const textBlock = resp.content.find(c => c.type === 'text')
  const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim()
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return NextResponse.json({ error: 'Extraction sans JSON exploitable' }, { status: 502 })

  let brut: unknown[] = []
  try { brut = (JSON.parse(m[0]).etiquettes ?? []) as unknown[] } catch {
    return NextResponse.json({ error: "JSON d'extraction invalide" }, { status: 502 })
  }

  // Le modèle peut renvoyer une catégorie hors des 14 (« lactose », « noix
  // de coco ») : elle est écartée ici plutôt que de remonter jusqu'à un
  // écran qui l'afficherait comme si elle était réglementaire.
  const etiquettes: EtiquetteExtraite[] = brut.map(e => {
    const o = (e ?? {}) as Record<string, unknown>
    const lisible = o.liste_lisible !== false
    const liste = (v: unknown) => lisible ? filterAllergenesUE((Array.isArray(v) ? v : []).map(String)) : []
    return {
      produit:       o.produit ? String(o.produit) : null,
      marque:        o.marque ? String(o.marque) : null,
      ingredients:   o.ingredients ? String(o.ingredients) : null,
      presents:      liste(o.presents),
      traces:        liste(o.traces),
      liste_lisible: lisible,
      confiance:     Math.max(0, Math.min(1, Number(o.confiance ?? 0))),
    }
  })

  return NextResponse.json({ ok: true, etiquettes, nb_photos: pages.length })
}
