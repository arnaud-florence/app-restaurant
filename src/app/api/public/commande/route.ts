// POST /api/public/commande
// Création d'une commande ONLINE depuis le site web (outil 2).
// Body : {
//   client_id?: string,                  // optionnel : si client connecté
//   client_nom?: string,                 // sinon : nom + email + tel libres
//   client_email?: string,
//   client_telephone?: string,
//   creneau_retrait: string,             // ISO datetime
//   articles: [{ recette_id, quantite, commentaire? }],
//   code_promo?: string,                 // optionnel
//   pourboire?: number,                  // optionnel
//   notes?: string,
//   mode_retrait?: 'a_emporter' | 'livraison',  // défaut 'a_emporter'
//   adresse_livraison?: string,          // REQUIS si mode_retrait='livraison'
//   honeypot?: string,                   // doit rester vide
//   captcha_token?: string,              // optionnel si HCAPTCHA_SECRET défini
// }
// Headers :
//   Idempotency-Key: <uuid>              // anti-double-création (Stripe webhook)
//
// Renvoie : { id, numero, total_ttc, statut: 'en_attente' }

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const articleSchema = z.object({
  recette_id: z.string().uuid(),
  quantite:   z.coerce.number().int().min(1).max(50),
  commentaire: z.string().max(500).nullable().optional(),
})

const commandeSchema = z.object({
  client_id:        z.string().uuid().nullable().optional(),
  client_nom:       z.string().max(160).nullable().optional(),
  client_email:     z.string().email().nullable().optional(),
  client_telephone: z.string().max(40).nullable().optional(),
  creneau_retrait:  z.string(),
  articles:         z.array(articleSchema).min(1).max(30),
  code_promo:       z.string().max(40).nullable().optional(),
  pourboire:        z.coerce.number().min(0).max(1000).default(0),
  notes:            z.string().max(1000).nullable().optional(),
  // ─── Mode retrait (migration 0089) ──────────────────────────────
  // 'a_emporter' (défaut) = retrait magasin au créneau choisi
  // 'livraison' = livreur amène à l'adresse → adresse_livraison requise
  mode_retrait:      z.enum(['a_emporter', 'livraison']).default('a_emporter'),
  adresse_livraison: z.string().max(500).nullable().optional(),
  honeypot:         z.string().nullable().optional(),
  captcha_token:    z.string().nullable().optional(),
}).refine(
  d => d.mode_retrait !== 'livraison' || (d.adresse_livraison && d.adresse_livraison.trim().length > 5),
  { message: 'Adresse de livraison requise pour le mode livraison', path: ['adresse_livraison'] },
)

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'commande', { windowMs: 60_000, max: 30 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: cors }) }

  const parsed = commandeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: cors })
  }
  const p = parsed.data

  // Anti-spam
  if (isHoneypotFilled(p as unknown as Record<string, unknown>)) {
    return Response.json({ ok: true, fake: true }, { status: 200, headers: cors })  // bait silently
  }
  const captcha = await verifyHcaptcha(p.captcha_token, getClientIp(req))
  if (!captcha.ok) {
    return Response.json({ error: captcha.reason }, { status: 400, headers: cors })
  }

  // Idempotence : si Idempotency-Key fourni, on stocke un mapping et on renvoie
  // la commande déjà créée si même clé re-soumise (utilisé par Stripe webhook).
  const idempotencyKey = req.headers.get('idempotency-key')
  const sb = await createClient()

  if (idempotencyKey) {
    const { data: existing } = await sb.from('commandes')
      .select('id, numero, montant_total_ttc, statut')
      .eq('notes', `idem:${idempotencyKey}`)   // hack simple : stocker dans notes
      .maybeSingle()
    if (existing) {
      return Response.json({
        id: existing.id, numero: existing.numero,
        total_ttc: existing.montant_total_ttc, statut: existing.statut,
        idempotent: true,
      }, { headers: cors })
    }
  }

  // Récupère les recettes pour vérifier vendable_online + prix + tva
  const recetteIds = p.articles.map(a => a.recette_id)
  const { data: recettes } = await sb.from('recettes')
    .select('id, nom, prix_vente_ht, tva, contient_alcool, tag_destination, vendable_online, actif')
    .in('id', recetteIds)

  if (!recettes || recettes.length !== p.articles.length) {
    return Response.json({ error: 'Une ou plusieurs recettes introuvables' }, { status: 400, headers: cors })
  }

  for (const r of recettes) {
    if (!r.actif || !r.vendable_online) {
      return Response.json({ error: `Recette « ${r.nom} » non disponible en ligne` }, { status: 400, headers: cors })
    }
  }

  // Calcul TVA + total
  const recetteMap = new Map(recettes.map(r => [r.id, r]))
  let totalHT = 0, totalTVA = 0
  const ventilationTva: Record<string, number> = {}
  const articlesEnrichis = p.articles.map(a => {
    const r = recetteMap.get(a.recette_id)!
    // Emporter (ONLINE) → TVA 5,5% (sauf alcool 20%)
    const tvaRate = r.contient_alcool ? 20 : 5.5
    const prixHT = Number(r.prix_vente_ht)
    const prixTVA = prixHT * (tvaRate / 100)
    const prixTTC = prixHT + prixTVA
    const lineHT = prixHT * a.quantite
    const lineTVA = prixTVA * a.quantite
    totalHT += lineHT
    totalTVA += lineTVA
    ventilationTva[String(tvaRate)] = (ventilationTva[String(tvaRate)] ?? 0) + lineTVA
    return {
      recette_id: a.recette_id,
      quantite: a.quantite,
      prix_unitaire_ht: prixHT,
      prix_unitaire_ttc: Math.round(prixTTC * 100) / 100,
      tva_taux: tvaRate,
      tva_eur: Math.round(prixTVA * 100) / 100,
      tag_destination: r.tag_destination,
      commentaire: a.commentaire || null,
      allergenes_a_eviter: [],
      statut: 'en_attente' as const,
    }
  })

  totalHT = Math.round(totalHT * 100) / 100
  totalTVA = Math.round(totalTVA * 100) / 100
  let totalTTC = Math.round((totalHT + totalTVA) * 100) / 100

  // Code promo (validation + calcul réduction si fourni)
  let reductionEur = 0
  if (p.code_promo) {
    const { data: cp } = await sb.from('codes_promo')
      .select('*').eq('code', p.code_promo.toUpperCase()).eq('actif', true).maybeSingle()
    if (cp && (!cp.usage_max || Number(cp.usage_actuel ?? 0) < Number(cp.usage_max))) {
      const valeur = Number(cp.valeur)
      reductionEur = cp.type === 'pourcentage'
        ? Math.round(totalTTC * (valeur / 100) * 100) / 100
        : Math.min(valeur, totalTTC)
      totalTTC = Math.max(0, Math.round((totalTTC - reductionEur) * 100) / 100)
      // Increment usage_actuel
      await sb.from('codes_promo')
        .update({ usage_actuel: Number(cp.usage_actuel ?? 0) + 1 })
        .eq('id', cp.id)
    }
  }

  // ─── Anti-race : vérifie que le créneau choisi n'est pas déjà pris ───
  // Le cache CDN peut faire afficher un slot dispo pendant max 30s alors qu'il
  // vient d'être réservé. On revérifie au dernier moment, juste avant l'INSERT.
  // Règle : 1 commande max par créneau (cohérent avec listerCreneauxDisponibles).
  if (p.creneau_retrait) {
    const slotStart = new Date(p.creneau_retrait)
    // Détermine la durée du créneau via la config (par défaut 15 min si introuvable)
    const jourSemaine = slotStart.getDay()
    const { data: cfg } = await sb.from('capacite_cuisine_par_creneau')
      .select('duree_creneau_min')
      .eq('jour_semaine', jourSemaine)
      .eq('tag_destination', 'SNACKING')  // TODO : adapter si pizza/bar online
      .eq('actif', true)
      .limit(1)
      .maybeSingle()
    const dureeMin = Number(cfg?.duree_creneau_min ?? 15)
    const slotEnd = new Date(slotStart.getTime() + dureeMin * 60_000)

    const { count: dejaPrises } = await sb.from('commandes')
      .select('*', { count: 'exact', head: true })
      .in('source', ['ONLINE', 'COMPTOIR'])
      .not('statut', 'in', '(annule)')
      .gte('creneau_retrait', slotStart.toISOString())
      .lt('creneau_retrait', slotEnd.toISOString())

    if ((dejaPrises ?? 0) >= 1) {
      return Response.json(
        { error: 'Ce créneau vient d\'être réservé. Choisis un autre horaire.' },
        { status: 409, headers: cors },
      )
    }
  }

  // Génère un numéro de commande lisible
  const numero = `WEB-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`

  // Crée la commande
  const notesAvecIdem = idempotencyKey
    ? `idem:${idempotencyKey}${p.notes ? ` | ${p.notes}` : ''}`
    : (p.notes || null)

  const { data: cmd, error } = await sb.from('commandes').insert({
    numero,
    source: 'ONLINE',
    statut: 'en_attente',
    consommation: 'emporter',
    montant_total_ht: totalHT,
    montant_total_ttc: totalTTC,
    tva_total: totalTVA,
    ventilation_tva: ventilationTva,
    creneau_retrait: p.creneau_retrait,
    pourboire_total: p.pourboire,
    client_id: p.client_id || null,
    client_nom: p.client_nom || null,
    client_email: p.client_email || null,
    client_telephone: p.client_telephone || null,
    mode_retrait: p.mode_retrait,
    adresse_livraison: p.mode_retrait === 'livraison' ? p.adresse_livraison : null,
    notes: notesAvecIdem,
  }).select('id, numero, montant_total_ttc, statut').single()

  if (error || !cmd) {
    return Response.json({ error: error?.message ?? 'Erreur création commande' }, { status: 500, headers: cors })
  }

  // Insert articles
  const { error: aErr } = await sb.from('commande_articles').insert(
    articlesEnrichis.map(a => ({ ...a, commande_id: cmd.id }))
  )
  if (aErr) {
    await sb.from('commandes').delete().eq('id', cmd.id)
    return Response.json({ error: `Articles : ${aErr.message}` }, { status: 500, headers: cors })
  }

  // Hook notif interne (best-effort)
  try {
    const { data: destinataires } = await sb.from('employes')
      .select('id')
      .in('poste', ['manager', 'cuisine', 'cuisinier', 'second', 'pizzaiolo', 'barman'])
      .eq('actif', true)
    if (destinataires && destinataires.length > 0) {
      await sb.from('notifications').insert(
        destinataires.map(e => ({
          destinataire_employe_id: e.id,
          type: 'commande_online_recue',
          titre: '📦 Nouvelle commande ONLINE',
          message: `Commande #${cmd.numero} reçue depuis le site web`,
          url_action: '/emporter',
        }))
      )
    }
  } catch (e) {
    console.error('[notif-online-public] erreur :', e)
  }

  // Email confirmation client (best-effort)
  if (p.client_email) {
    try {
      const { sendEmail, emailConfirmationCommande } = await import('@/lib/email')
      const articlesPourEmail = articlesEnrichis.map(a => {
        const recette = recetteMap.get(a.recette_id)
        return {
          nom: recette?.nom ?? 'Article',
          quantite: a.quantite,
          prix_total: Math.round(a.prix_unitaire_ttc * a.quantite * 100) / 100,
        }
      })
      const tpl = emailConfirmationCommande({
        numero: cmd.numero,
        total: Number(cmd.montant_total_ttc),
        creneau_iso: p.creneau_retrait,
        client_nom: p.client_nom ?? '',
        articles: articlesPourEmail,
      })
      await sendEmail({ to: p.client_email, subject: tpl.subject, html: tpl.html, text: tpl.text })
    } catch (e) {
      console.error('[email-commande] erreur :', e)
    }
  }

  return Response.json({
    id: cmd.id,
    numero: cmd.numero,
    total_ttc: cmd.montant_total_ttc,
    statut: cmd.statut,
    reduction_eur: reductionEur,
  }, { headers: cors })
}
