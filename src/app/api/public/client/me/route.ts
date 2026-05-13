// GET /api/public/client/me
// Renvoie les infos du client connecté + son historique commandes + points + avantages.
// Header : Authorization: Bearer <session.access_token>

import { createAdminClient } from '@/lib/supabase/admin'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { getAuthUser, getOrLinkClient } from '@/lib/public-api/auth-client'
import { NIVEAU_INFO, calculerNiveau, type NiveauFidelite } from '@/lib/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'client-me', { windowMs: 60_000, max: 60 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  const auth = await getAuthUser(req)
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status, headers: cors })

  let client_id: string
  try {
    const r = await getOrLinkClient(auth.user_id, auth.email)
    client_id = r.client_id
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500, headers: cors })
  }

  const sb = createAdminClient()
  const [cliRes, cmdsRes, mvtsRes, resaChambresRes] = await Promise.all([
    sb.from('clients')
      .select('id, prenom, nom, email, telephone, points_fidelite, niveau_fidelite, nb_visites, total_depense, derniere_visite, code_parrainage, allergies, opt_in_marketing, date_naissance')
      .eq('id', client_id).single(),
    sb.from('commandes')
      .select('id, numero, source, statut, montant_total_ttc, created_at, creneau_retrait, articles:commande_articles(quantite, recette:recettes(nom))')
      .eq('client_id', client_id)
      .in('statut', ['encaisse','retire_par_client','pret_pour_retrait','pret','en_preparation','en_attente'])
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('mouvements_points')
      .select('id, type, points, motif, created_at')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('reservations_chambres')
      .select('id, statut, date_arrivee, date_depart, nb_personnes, montant_total, created_at, chambre:chambres(nom, numero)')
      .eq('client_id', client_id)
      .order('date_arrivee', { ascending: false })
      .limit(20),
  ])

  if (cliRes.error || !cliRes.data) {
    return Response.json({ error: 'Client introuvable' }, { status: 404, headers: cors })
  }

  const c = cliRes.data
  const niveauKey = (c.niveau_fidelite as NiveauFidelite) ?? calculerNiveau(Number(c.nb_visites ?? 0))
  const ni = NIVEAU_INFO[niveauKey] ?? NIVEAU_INFO.standard

  // Prochain palier
  const ordre: NiveauFidelite[] = ['standard','bronze','argent','or','platine']
  const idx = ordre.indexOf(niveauKey)
  const prochainKey = idx >= 0 && idx < ordre.length - 1 ? ordre[idx + 1] : null
  const prochain = prochainKey ? NIVEAU_INFO[prochainKey] : null
  const visites_pour_prochain = prochain ? Math.max(0, prochain.min_visites - Number(c.nb_visites ?? 0)) : 0

  return Response.json({
    client: {
      id: c.id,
      prenom: c.prenom,
      nom: c.nom,
      email: c.email,
      telephone: c.telephone,
      date_naissance: c.date_naissance,
      allergies: c.allergies ?? [],
      opt_in_marketing: c.opt_in_marketing,
      code_parrainage: c.code_parrainage,
    },
    fidelite: {
      points: Number(c.points_fidelite ?? 0),
      niveau: niveauKey,
      niveau_label: ni.label,
      niveau_emoji: ni.emoji,
      recompenses_actuelles: ni.recompenses,
      nb_visites: Number(c.nb_visites ?? 0),
      total_depense: Number(c.total_depense ?? 0),
      derniere_visite: c.derniere_visite,
      prochain_palier: prochain ? {
        niveau: prochainKey,
        label: prochain.label,
        emoji: prochain.emoji,
        visites_restantes: visites_pour_prochain,
        recompenses: prochain.recompenses,
      } : null,
    },
    commandes_recentes: (cmdsRes.data ?? []).map(c => ({
      id: c.id,
      numero: c.numero,
      source: c.source,
      statut: c.statut,
      montant_ttc: Number(c.montant_total_ttc ?? 0),
      created_at: c.created_at,
      creneau_retrait: c.creneau_retrait,
      articles_count: ((c.articles ?? []) as Array<{ quantite?: number }>).reduce((s, a) => s + (a.quantite ?? 1), 0),
    })),
    mouvements_points: (mvtsRes.data ?? []).map(m => ({
      id: m.id,
      type: m.type,
      points: Number(m.points),
      motif: m.motif,
      created_at: m.created_at,
    })),
    reservations_chambres: ((resaChambresRes.data ?? []) as unknown as Array<{
      id: string; statut: string; date_arrivee: string; date_depart: string;
      nb_personnes: number; montant_total: number; created_at: string;
      chambre: { nom: string; numero: string } | null;
    }>).map(r => ({
      id: r.id,
      statut: r.statut,
      date_arrivee: r.date_arrivee,
      date_depart: r.date_depart,
      nb_personnes: r.nb_personnes,
      montant_total: Number(r.montant_total ?? 0),
      created_at: r.created_at,
      chambre_nom: r.chambre?.nom ?? null,
      chambre_numero: r.chambre?.numero ?? null,
    })),
  }, { headers: cors })
}

// PATCH : mise à jour des infos client (édition profil)
import { z } from 'zod'

const patchSchema = z.object({
  prenom:           z.string().max(100).nullable().optional(),
  nom:              z.string().trim().min(1).max(100).optional(),
  telephone:        z.string().max(40).nullable().optional(),
  date_naissance:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  allergies:        z.array(z.string()).optional(),
  opt_in_marketing: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const guard = await guardPublicRoute(req, 'client-me-patch', { windowMs: 60_000, max: 30 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  const auth = await getAuthUser(req)
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status, headers: cors })

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: cors }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: cors })
  }

  const sb = createAdminClient()
  const { data: cli } = await sb.from('clients').select('id').eq('auth_user_id', auth.user_id).maybeSingle()
  if (!cli) return Response.json({ error: 'Client introuvable' }, { status: 404, headers: cors })

  const { error } = await sb.from('clients').update(parsed.data).eq('id', cli.id)
  if (error) return Response.json({ error: error.message }, { status: 500, headers: cors })
  return Response.json({ ok: true }, { headers: cors })
}

// DELETE : suppression compte (RGPD article 17 — droit à l'oubli)
// Anonymise les commandes (set client_id = null) pour préserver la compta,
// supprime mouvements_points + avis + le client + le compte auth Supabase.
export async function DELETE(req: Request) {
  const guard = await guardPublicRoute(req, 'client-me-delete', { windowMs: 60_000, max: 5 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  const auth = await getAuthUser(req)
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status, headers: cors })

  const sb = createAdminClient()
  const { data: cli } = await sb.from('clients').select('id').eq('auth_user_id', auth.user_id).maybeSingle()
  if (!cli) {
    // Pas de client lié, mais on supprime quand même le compte auth
    await sb.auth.admin.deleteUser(auth.user_id).catch(() => {})
    return Response.json({ ok: true }, { headers: cors })
  }
  const cid = cli.id as string

  // Anonymise commandes (préservation compta) + supprime données perso
  await sb.from('commandes').update({
    client_id: null,
    client_nom: null, client_email: null, client_telephone: null,
  }).eq('client_id', cid)

  // Supprime mouvements points + avis + carte cadeau si acheteur
  await sb.from('mouvements_points').delete().eq('client_id', cid)
  await sb.from('avis_publics').update({ client_id: null }).eq('client_id', cid)
  await sb.from('cartes_cadeaux').update({ acheteur_client_id: null }).eq('acheteur_client_id', cid)

  // Supprime client + compte auth
  await sb.from('clients').delete().eq('id', cid)
  await sb.auth.admin.deleteUser(auth.user_id).catch(e => console.error('[delete-auth]', e))

  return Response.json({ ok: true, message: 'Compte supprimé. Vos commandes sont anonymisées (conservation comptable).' }, { headers: cors })
}
