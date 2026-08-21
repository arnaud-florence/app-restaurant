// ─── Agent 8 — Scanner de documents ────────────────────────────
// Event-driven (pas cron) : POST /api/agents/scanner avec une image base64
// (ou multipart) d'une facture / bon de livraison / ticket.
//
// Pipeline :
//   1. Reçoit l'image
//   2. Appelle Claude Vision (claude-haiku-4-5) avec prompt structuré
//   3. Extrait : fournisseur, n° facture, date, échéance, lignes, totaux
//   4. Compare prix avec historique → flag hausses inhabituelles
//   5. Émet finding (jaune si OK, rouge si hausse > 15%)
//   6. Renvoie le JSON structuré au frontend (qui pré-remplira le formulaire)
//
// Le frontend (/admin/fournisseurs/factures/scan) peut afficher un drag&drop
// et pousser l'image ici pour pré-remplir le formulaire en 1 clic.
//
// Coût : ~$0.005 par scan (claude-haiku-4-5 + image ~1MB).
//
// Auth : profil manager requis (consume Anthropic credit).

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProfile } from '@/lib/auth'
import { runAgent, emitFinding, type AgentContext } from '@/lib/agents/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'

type FactureExtraite = {
  type: 'facture' | 'avoir' | 'bon_livraison' | 'ticket' | 'inconnu'
  fournisseur_nom: string | null
  numero: string | null
  date_emission: string | null         // YYYY-MM-DD
  date_echeance: string | null         // YYYY-MM-DD
  montant_ht: number | null
  montant_ttc: number | null
  montant_tva: number | null
  lignes: Array<{
    description: string
    quantite: number | null
    unite: string | null
    prix_unitaire_ht: number | null
    total_ht: number | null
  }>
  confiance: number                     // 0..1 estimation OCR
  notes: string | null
}

export async function POST(req: Request) {
  // Auth : manager only (coût Anthropic)
  const profil = await getProfile()
  if (!profil) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (profil.role !== 'manager') return NextResponse.json({ error: 'Accès manager requis' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  // Lit les pages depuis le body. Une facture fournisseur fait souvent
  // plusieurs pages (Metro, Transgourmet…) : on accepte un tableau `images`
  // et on envoie TOUTES les pages dans le même appel Claude Vision — c'est ce
  // qui permet un total unique et des lignes non dupliquées, là où un appel
  // par page obligerait à fusionner des JSON partiels (totaux répétés,
  // report « suite page 2 » compté deux fois…).
  // `image_base64` seul reste accepté pour compatibilité.
  const contentType = req.headers.get('content-type') ?? ''
  type Page = { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  const pages: Page[] = []
  const normaliser = (b64: string, mt?: string): Page => ({
    data: b64.replace(/^data:image\/[a-z]+;base64,/, ''),
    mediaType: mt === 'image/png' || mt === 'image/webp' ? mt : 'image/jpeg',
  })

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json() as {
        image_base64?: string; media_type?: string
        images?: Array<{ image_base64: string; media_type?: string }>
      }
      if (Array.isArray(body.images) && body.images.length > 0) {
        for (const im of body.images) {
          if (im?.image_base64) pages.push(normaliser(im.image_base64, im.media_type))
        }
      } else if (body.image_base64) {
        pages.push(normaliser(body.image_base64, body.media_type))
      }
      if (pages.length === 0) return NextResponse.json({ error: 'image_base64 ou images[] requis' }, { status: 400 })
    } else if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      // getAll accepte plusieurs champs `image` — une page par fichier
      for (const f of form.getAll('image')) {
        if (!(f instanceof File)) continue
        const buf = Buffer.from(await f.arrayBuffer())
        pages.push(normaliser(buf.toString('base64'), f.type))
      }
      if (pages.length === 0) return NextResponse.json({ error: 'image manquante' }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'Content-Type non supporté (application/json ou multipart/form-data)' }, { status: 415 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Lecture image échouée : ${e instanceof Error ? e.message : 'erreur'}` }, { status: 400 })
  }

  if (pages.length > 8) {
    return NextResponse.json({ error: `${pages.length} pages : maximum 8 par facture.` }, { status: 413 })
  }
  // Taille TOTALE : le front réduit chaque page (~1600 px) avant envoi, la
  // limite serveur n'est qu'un garde-fou.
  const tailleKo = Math.ceil(pages.reduce((s, pg) => s + pg.data.length, 0) / 1024 * 0.75)
  if (tailleKo > 6000) {
    return NextResponse.json({ error: `Pages trop volumineuses (${tailleKo}KB > 6MB au total). Réduis la résolution.` }, { status: 413 })
  }

  // Lance l'agent (loggue dans agents_runs + agent_findings)
  // On capture extracted+analyse pour les renvoyer au frontend via fermeture
  type AnalyseOut = { haussesDetectees: Array<{ description: string; prix_actuel: number; prix_historique_moyen: number; haussePct: number }>; nbHausses: number }
  const captured: { extracted: FactureExtraite | null; analyse: AnalyseOut | null } = { extracted: null, analyse: null }

  const result = await runAgent('scanner', async (ctx) => {
    const extracted = await extraireDocument(apiKey, pages)
    const analyse = await analyserExtraction(ctx, extracted)
    captured.extracted = extracted
    captured.analyse = analyse

    return {
      summary: extracted.fournisseur_nom
        ? `${extracted.type} ${extracted.fournisseur_nom}${extracted.montant_ttc ? ` · ${extracted.montant_ttc.toFixed(2)}€ TTC` : ''}`
        : `${extracted.type} extrait (confiance ${(extracted.confiance * 100).toFixed(0)}%)`,
      data: { extracted, analyse },
    }
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({
    ok: true,
    runId: result.runId,
    extracted: captured.extracted,
    nb_pages: pages.length,
    haussesDetectees: captured.analyse?.haussesDetectees ?? [],
  })
}

// ─────────────────────────────────────────────────────────────
// Extraction via Claude Vision
// ─────────────────────────────────────────────────────────────
async function extraireDocument(
  apiKey: string,
  pages: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }>,
): Promise<FactureExtraite> {
  const client = new Anthropic({ apiKey })

  const systemPrompt = `Tu es un expert en lecture de documents commerciaux français : factures, bons de livraison, tickets de caisse, notes de frais.
Tu analyses l'image et tu extrais les données STRICTEMENT au format JSON ci-dessous. Pas de préambule, pas de commentaire, juste le JSON.

Si une valeur n'est pas lisible ou absente, mets null. Pour les dates, utilise YYYY-MM-DD.
Pour les nombres, utilise des décimaux (12.50 pas "12,50").
Le champ "confiance" est ton estimation 0..1 de la qualité OCR (1 = parfait, 0.5 = lisible mais des doutes, < 0.3 = très flou).

Un AVOIR (note de crédit) porte généralement la mention « AVOIR », « Note de crédit » ou « Credit note » : type="avoir". Renvoie ses montants en VALEUR ABSOLUE (positifs), même si le document les affiche en négatif.`

  const userPrompt = `Analyse cette image et renvoie le JSON suivant :
{
  "type": "facture" | "avoir" | "bon_livraison" | "ticket" | "inconnu",
  "fournisseur_nom": string | null,
  "numero": string | null,
  "date_emission": "YYYY-MM-DD" | null,
  "date_echeance": "YYYY-MM-DD" | null,
  "montant_ht": number | null,
  "montant_ttc": number | null,
  "montant_tva": number | null,
  "lignes": [
    { "description": string, "quantite": number | null, "unite": string | null, "prix_unitaire_ht": number | null, "total_ht": number | null }
  ],
  "confiance": number,
  "notes": string | null
}

Pour les lignes : sois exhaustif (toutes les lignes du document). Pour les tickets de caisse simples, type="ticket" et lignes peut être vide.${pages.length > 1 ? `

IMPORTANT : les ${pages.length} images sont les pages successives d'UN SEUL ET MÊME document. Renvoie UN SEUL JSON couvrant l'ensemble : toutes les lignes de toutes les pages, et les montants totaux UNE seule fois (ceux de la dernière page font foi ; ignore les sous-totaux « report » ou « suite »).` : ''}`

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        ...pages.map(pg => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: pg.mediaType, data: pg.data },
        })),
        { type: 'text' as const, text: userPrompt },
      ],
    }],
  })

  const textBlock = resp.content.find(c => c.type === 'text')
  const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude n\'a pas renvoyé de JSON exploitable')
  const parsed = JSON.parse(jsonMatch[0]) as FactureExtraite
  return parsed
}

// ─────────────────────────────────────────────────────────────
// Analyse post-extraction : compare prix historiques, émet findings
// ─────────────────────────────────────────────────────────────
async function analyserExtraction(ctx: AgentContext, extracted: FactureExtraite) {
  const haussesDetectees: Array<{ description: string; prix_actuel: number; prix_historique_moyen: number; haussePct: number }> = []

  // Pour chaque ligne avec un prix, compare au prix historique via mouvements_stock
  // (matching approximatif sur le nom de l'ingrédient)
  for (const ligne of extracted.lignes) {
    if (!ligne.description || !ligne.prix_unitaire_ht) continue
    // Recherche ingrédient correspondant (LIKE %nom%)
    const { data: ings } = await ctx.supabase
      .from('ingredients')
      .select('id, nom')
      .ilike('nom', `%${ligne.description.slice(0, 20)}%`)
      .limit(1)
    if (!ings || ings.length === 0) continue
    const ingId = ings[0].id as string
    const il90j = new Date(); il90j.setDate(il90j.getDate() - 90)
    const { data: histo } = await ctx.supabase
      .from('mouvements_stock')
      .select('prix_unitaire_ht')
      .eq('ingredient_id', ingId)
      .eq('type', 'entree')
      .gte('created_at', il90j.toISOString())
      .not('prix_unitaire_ht', 'is', null)
    if (!histo || histo.length < 2) continue
    const prixHistMoyen = histo.reduce((s, h) => s + Number(h.prix_unitaire_ht ?? 0), 0) / histo.length
    if (prixHistMoyen <= 0) continue
    const haussePct = ((ligne.prix_unitaire_ht - prixHistMoyen) / prixHistMoyen) * 100
    if (haussePct >= 15) {
      haussesDetectees.push({
        description: ligne.description,
        prix_actuel: ligne.prix_unitaire_ht,
        prix_historique_moyen: prixHistMoyen,
        haussePct,
      })
    }
  }

  // Émet 1 finding par document scanné
  const urgence: 'rouge' | 'jaune' | 'vert' = haussesDetectees.length > 0 ? 'jaune' : 'vert'
  await emitFinding(ctx, {
    urgence,
    type: 'scan_document',
    titre: extracted.fournisseur_nom
      ? `📄 ${extracted.type === 'facture' ? 'Facture' : extracted.type === 'avoir' ? 'Avoir' : extracted.type === 'bon_livraison' ? 'BL' : 'Ticket'} ${extracted.fournisseur_nom} scanné`
      : '📄 Document scanné',
    message: [
      extracted.montant_ttc ? `Montant : ${extracted.montant_ttc.toFixed(2)}€ TTC` : null,
      extracted.numero ? `N° ${extracted.numero}` : null,
      extracted.date_emission ? `Émis le ${extracted.date_emission}` : null,
      haussesDetectees.length > 0 ? `⚠ ${haussesDetectees.length} hausse(s) prix détectée(s)` : null,
      `Confiance OCR : ${(extracted.confiance * 100).toFixed(0)}%`,
    ].filter(Boolean).join(' · '),
    action_label: 'Valider l\'import',
    action_url:   '/admin/fournisseurs?tab=factures',
    data: { extracted, haussesDetectees },
  })

  // Si fortes hausses, finding séparé urgent
  for (const h of haussesDetectees) {
    await emitFinding(ctx, {
      urgence: h.haussePct > 25 ? 'rouge' : 'jaune',
      type: 'hausse_prix_facture',
      titre: `Prix en hausse : ${h.description} (+${h.haussePct.toFixed(0)}%)`,
      message: `Prix moyen 90j : ${h.prix_historique_moyen.toFixed(3)}€. Cette facture : ${h.prix_actuel.toFixed(3)}€. Renégocie ou cherche alternative.`,
      action_label: 'Comparer fournisseurs',
      action_url:   '/admin/ingredients',
      data: { description: h.description, prix_actuel: h.prix_actuel, prix_moyen: h.prix_historique_moyen, hausse_pct: h.haussePct },
    })
  }

  return { haussesDetectees, nbHausses: haussesDetectees.length }
}
