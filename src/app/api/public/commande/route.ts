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
import { getActivation, getConfigLivraisonFournil } from '@/lib/activation/server'
import { tourneePour, communeLivrable } from '@/lib/activation/config'
import { tauxTvaVente } from '@/lib/tva'
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
  // Commune choisie dans la liste fermée des communes livrées. Vérifiée
  // côté serveur : le client ne décide pas de la zone de livraison.
  commune_livraison: z.string().max(120).nullable().optional(),
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
    // Taux porté par le produit (cf. tauxTvaVente) — le même que /api/public/menu
    // a servi au client et que le comptoir applique en boutique. Un taux figé
    // ici ferait payer autre chose que le prix annoncé.
    const tvaRate = tauxTvaVente(r, 'emporter')
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

  // Code promo — E3 : validation COMPLÈTE (dates, montant min, niveau fidélité)
  // + incrément ATOMIQUE de usage_actuel (compare-and-swap anti-TOCTOU).
  let reductionEur = 0
  if (p.code_promo) {
    const { data: cp } = await sb.from('codes_promo')
      .select('*').eq('code', p.code_promo.toUpperCase()).maybeSingle()
    const today = new Date().toISOString().slice(0, 10)
    const ttcBrut = totalTTC
    const ORDRE_NIVEAU: Record<string, number> = { standard: 0, bronze: 1, argent: 2, or: 3, platine: 4 }

    // Niveau fidélité du client (seulement si le code est réservé à un niveau)
    let niveauClient = 'standard'
    if (cp?.reserve_fidelite_niveau && p.client_id) {
      const { data: cli } = await sb.from('clients').select('niveau_fidelite').eq('id', p.client_id).maybeSingle()
      niveauClient = (cli?.niveau_fidelite as string) ?? 'standard'
    }

    const valide = !!cp
      && cp.actif === true
      && (cp.date_debut as string).slice(0, 10) <= today
      && (!cp.date_fin || (cp.date_fin as string).slice(0, 10) >= today)
      && (cp.usage_max === null || Number(cp.usage_actuel ?? 0) < Number(cp.usage_max))
      && (Number(cp.montant_min ?? 0) <= ttcBrut)
      && (!cp.reserve_fidelite_niveau
          || (ORDRE_NIVEAU[niveauClient] ?? 0) >= (ORDRE_NIVEAU[cp.reserve_fidelite_niveau as string] ?? 0))

    if (valide && cp) {
      // Incrément atomique : n'applique la remise QUE si la CAS réussit (sinon un
      // code « 1 usage » pourrait être consommé N fois en parallèle).
      let okIncrement = true
      if (cp.usage_max !== null) {
        const cur = Number(cp.usage_actuel ?? 0)
        const { data: maj } = await sb.from('codes_promo')
          .update({ usage_actuel: cur + 1 })
          .eq('id', cp.id).eq('usage_actuel', cur)   // CAS : n'incrémente que si inchangé
          .select('id')
        okIncrement = !!(maj && maj.length > 0)
      } else {
        await sb.from('codes_promo')
          .update({ usage_actuel: Number(cp.usage_actuel ?? 0) + 1 }).eq('id', cp.id)
      }

      if (okIncrement) {
        const valeur = Number(cp.valeur)
        reductionEur = cp.type === 'pourcentage'
          ? Math.round(ttcBrut * (valeur / 100) * 100) / 100
          : Math.min(valeur, ttcBrut)
        totalTTC = Math.max(0, Math.round((ttcBrut - reductionEur) * 100) / 100)
        // Prorata HT / TVA / ventilation pour garder TTC = HT + TVA cohérent.
        const factor = ttcBrut > 0 ? totalTTC / ttcBrut : 1
        totalHT = Math.round(totalHT * factor * 100) / 100
        totalTVA = Math.round(totalTVA * factor * 100) / 100
        for (const k of Object.keys(ventilationTva)) {
          ventilationTva[k] = Math.round(ventilationTva[k] * factor * 100) / 100
        }
      }
    }
  }

  // ─── E5 : le créneau doit être une date valide DANS LE FUTUR ───
  // (le schéma n'impose que z.string() → un créneau passé/arbitraire passerait).
  if (p.creneau_retrait) {
    const slot = new Date(p.creneau_retrait)
    if (isNaN(slot.getTime()) || slot.getTime() < Date.now() - 60_000) {
      return Response.json({ error: 'Créneau de retrait invalide ou dans le passé.' }, { status: 400, headers: cors })
    }
  }

  // ─── Livraison Fournil : validation serveur de la zone et de la tournée ───
  // Modèle « tournée » et non « créneaux » : une seule tournée par jour, qui
  // porte AUTANT de commandes que nécessaire. Rien de ce que le client envoie
  // n'est pris pour argent comptant — ni la commune, ni l'horaire.
  let creneauFinal = p.creneau_retrait
  let adresseFinale = p.mode_retrait === 'livraison' ? (p.adresse_livraison ?? null) : null

  if (p.mode_retrait === 'livraison') {
    const [etat, cfgLiv] = await Promise.all([getActivation(), getConfigLivraisonFournil()])

    if (!etat.fournil_livraison) {
      return Response.json(
        { error: 'La livraison à domicile n’est pas disponible actuellement.' },
        { status: 400, headers: cors },
      )
    }

    const commune = (p.commune_livraison ?? '').trim()
    if (!commune || !communeLivrable(commune, cfgLiv)) {
      return Response.json({
        error: `Nous livrons uniquement à ${cfgLiv.communes.join(', ')}.`,
        communes: cfgLiv.communes,
      }, { status: 400, headers: cors })
    }

    if (cfgLiv.minimumTtc > 0 && totalTTC < cfgLiv.minimumTtc) {
      return Response.json({
        error: `Commande minimum de ${cfgLiv.minimumTtc.toFixed(2).replace('.', ',')} € pour la livraison.`,
      }, { status: 400, headers: cors })
    }

    // La tournée est RECALCULÉE ici (heure de Paris). Le créneau envoyé par le
    // client n'est qu'un affichage : s'il a chargé la page à 8h25 et validé à
    // 8h35, c'est la tournée du lendemain qui s'applique, pas celle qu'il a vue.
    const tournee = tourneePour(new Date(), cfgLiv)
    creneauFinal = tournee.creneau
    adresseFinale = `${(p.adresse_livraison ?? '').trim()}, ${commune}`
  }

  // ─── Anti-race : vérifie que le créneau choisi n'est pas déjà pris ───
  // Le cache CDN peut faire afficher un slot dispo pendant max 30s alors qu'il
  // vient d'être réservé. On revérifie au dernier moment, juste avant l'INSERT.
  // Règle : 1 commande max par créneau (cohérent avec listerCreneauxDisponibles).
  //
  // ⚠️ NE S'APPLIQUE PAS à la livraison : toutes les commandes d'une tournée
  // partagent le même `creneau_retrait`. Sans cette exclusion, la 2ᵉ livraison
  // de la journée serait refusée avec « ce créneau vient d'être réservé ».
  if (p.creneau_retrait && p.mode_retrait !== 'livraison') {
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
    creneau_retrait: creneauFinal,
    pourboire_total: p.pourboire,
    client_id: p.client_id || null,
    client_nom: p.client_nom || null,
    client_email: p.client_email || null,
    client_telephone: p.client_telephone || null,
    mode_retrait: p.mode_retrait,
    adresse_livraison: adresseFinale,
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
  //
  // Destinataires : TOUS les employés actifs. L'ancienne liste de postes
  // (manager, cuisine, second, pizzaiolo, barman…) était celle du restaurant :
  // au Fournil, les personnes au comptoir sont en poste « polyvalent » et ne
  // recevaient donc rien. Une commande web qui n'alerte personne est pire
  // qu'une absence de commande — le client attend un pain que personne ne
  // prépare. Tant que l'équipe tient dans une salle, prévenir tout le monde est
  // la bonne réponse ; à segmenter le jour où l'effectif le justifie.
  //
  // url_action : l'écran où la commande est réellement visible. `/emporter` est
  // l'écran du restaurant, en veille jusqu'à sa réouverture — y envoyer l'équipe
  // du Fournil la menait sur une page éteinte.
  try {
    const tags = new Set(articlesEnrichis.map(a => a.tag_destination))
    const urlAction = tags.size === 1 && tags.has('FOURNIL') ? '/comptoir/fournil' : '/emporter'

    const { data: destinataires } = await sb.from('employes')
      .select('id')
      .eq('actif', true)
    if (destinataires && destinataires.length > 0) {
      const lignes = articlesEnrichis
        .map(a => `${a.quantite}× ${recetteMap.get(a.recette_id)?.nom ?? '?'}`)
        .join(', ')
      // On LIT l'erreur : supabase-js la retourne au lieu de la lever, donc le
      // try/catch ci-dessus n'attrape rien. C'est ainsi qu'un type refusé par
      // le check de la 0069 a fait échouer toutes les notifications de
      // commande web pendant des mois, sans une ligne de log.
      const { error: eNotif } = await sb.from('notifications').insert(
        destinataires.map(e => ({
          destinataire_employe_id: e.id,
          type: 'commande_online_recue',
          titre: `🌐 Commande web #${cmd.numero}`,
          // Le contenu dans le message : l'équipe sait quoi préparer sans avoir
          // à ouvrir un écran, ce qui compte quand la notif arrive au four.
          message: `${lignes} — ${Number(cmd.montant_total_ttc ?? totalTTC).toFixed(2)} €`,
          url_action: urlAction,
        }))
      )
      if (eNotif) console.error('[notif-online-public] insert refusé :', eNotif.message)
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
        // Créneau réellement retenu (recalculé côté serveur pour la livraison)
        // et non celui affiché au client — l'email doit dire la vérité.
        creneau_iso: creneauFinal,
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
