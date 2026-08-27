// ─── Émission des commandes du site vers la caisse Zelty ─────────────────
//
// C'est le sens qui sauve casatasia.fr : sans lui, il faudrait abandonner
// notre site pour leur module de click & collect.
//
//   GET|POST /api/cron/caisse/zelty/emission[?commande=<uuid>][&dry=1]
//   Authorization: Bearer ${CRON_SECRET}
//
// Deux usages, même route :
//   · appelée juste après un paiement avec `?commande=`, pour l'immédiateté ;
//   · appelée par le cron sans paramètre, elle rattrape tout ce qui n'est pas
//     encore parti. C'est la file d'attente : une commande dont l'envoi a
//     échoué reste `caisse_externe_id IS NULL` et repart au tour suivant.
//
// L'idempotence est native côté Zelty (`remote_id` = notre numéro de
// commande) : un renvoi ne crée jamais une seconde vente.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lireConfig } from '@/lib/integrations/zelty/client'
import { construireCommandeZelty, modeZelty } from '@/lib/integrations/zelty/emission'
import { chargerCorrespondances } from '@/lib/integrations/correspondances'
import { journaliser } from '@/lib/integrations/journal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

/** Libellé EXACT d'un mode de paiement configuré dans Zelty. */
const MODE_EN_LIGNE = process.env.ZELTY_MODE_PAIEMENT_EN_LIGNE ?? 'Paiement en ligne'

type Cmd = {
  id: string; numero: string; statut: string
  montant_total_ttc: number | string | null
  mode_paiement: string | null
  creneau_retrait: string | null
  notes: string | null
  client_nom?: string | null
  client_telephone?: string | null
  mode_retrait?: string | null
}

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const uneSeule = url.searchParams.get('commande')

  const cfg = lireConfig()
  if (!cfg.pret) {
    return NextResponse.json({ ok: true, configure: false, manquants: cfg.manquants })
  }

  const t0 = Date.now()
  const sb = await createClient()

  // Commandes du site pas encore injectées. On borne à 7 jours : au-delà,
  // une commande qui n'est jamais partie relève du diagnostic, pas de la
  // reprise automatique — l'injecter des semaines plus tard fausserait le Z.
  let q = sb.from('commandes')
    .select('id, numero, statut, montant_total_ttc, mode_paiement, creneau_retrait, notes, client_nom, client_telephone, mode_retrait')
    .eq('source', 'ONLINE')
    .is('caisse_externe_id', null)
    .neq('statut', 'annule')
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('created_at')
    .limit(50)
  if (uneSeule) q = sb.from('commandes')
    .select('id, numero, statut, montant_total_ttc, mode_paiement, creneau_retrait, notes, client_nom, client_telephone, mode_retrait')
    .eq('id', uneSeule).is('caisse_externe_id', null)

  const { data: cmds } = await q
  const aTraiter = (cmds ?? []) as unknown as Cmd[]
  if (aTraiter.length === 0) {
    return NextResponse.json({ ok: true, configure: true, a_envoyer: 0, envoyees: 0, refusees: [] })
  }

  const correspondances = await chargerCorrespondances('zelty').catch(() => new Map<string, string>())

  const envoyees: string[] = []
  const refusees: Array<{ numero: string; raisons: string[] }> = []
  const echecs: Array<{ numero: string; erreur: string }> = []
  const apercus: unknown[] = []

  for (const c of aTraiter) {
    const { data: arts } = await sb.from('commande_articles')
      .select('recette_id, quantite, prix_unitaire_ttc, recette:recettes(nom)')
      .eq('commande_id', c.id)

    const lignes = (arts ?? []).map(a => ({
      recette_id: String(a.recette_id),
      nom: (a.recette as { nom?: string } | null)?.nom ?? '—',
      quantite: Number(a.quantite ?? 0),
      prix_unitaire_ttc: Number(a.prix_unitaire_ttc ?? 0),
    }))

    // Un règlement n'est joint que s'il a VRAIMENT eu lieu chez nous. Une
    // commande réglée au comptoir doit rester à encaisser dans la caisse.
    const payeEnLigne = Boolean(c.mode_paiement) && c.mode_paiement !== 'caisse_agreee'

    const res = construireCommandeZelty({
      numero: c.numero,
      mode: modeZelty(c.mode_retrait === 'livraison'),
      lignes,
      montantTotalTtc: Number(c.montant_total_ttc ?? 0),
      correspondances,
      modePaiement: payeEnLigne ? MODE_EN_LIGNE : undefined,
      creneau: c.creneau_retrait,
      commentaire: c.notes,
      prenom: c.client_nom,
      telephone: c.client_telephone,
    })

    if (res.refus) { refusees.push({ numero: c.numero, raisons: res.raisons }); continue }
    if (dry) { apercus.push({ numero: c.numero, commande: res.commande }); continue }

    try {
      const r = await fetch(`${cfg.config.baseUrl.replace(/\/+$/, '')}/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.config.cle}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(res.commande),
      })
      const rep = await r.json().catch(() => null) as { order?: { id?: number }; errmsg?: string; errors?: unknown } | null
      if (!r.ok || !rep?.order?.id) {
        throw new Error(`HTTP ${r.status} ${rep?.errmsg ?? ''} ${JSON.stringify(rep?.errors ?? {})}`.slice(0, 500))
      }
      await sb.from('commandes').update({
        caisse_externe_systeme: 'zelty',
        caisse_externe_id: String(rep.order.id),
        caisse_externe_at: new Date().toISOString(),
      }).eq('id', c.id)
      envoyees.push(c.numero)
    } catch (e) {
      // Rien n'est marqué : la commande repartira au prochain tour, et
      // l'idempotence de `remote_id` empêche la double vente.
      echecs.push({ numero: c.numero, erreur: e instanceof Error ? e.message : String(e) })
    }
  }

  const bilan = {
    configure: true, ecrit: !dry,
    a_envoyer: aTraiter.length,
    envoyees: envoyees.length,
    refusees, echecs,
    ...(dry ? { apercus } : {}),
  }

  if (!dry) {
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'commande',
      reference: `${aTraiter.length} commande(s)`, resultat: bilan,
      statut: refusees.length === 0 && echecs.length === 0 ? 'succes'
        : echecs.length > 0 ? 'en_attente' : 'echec',
      erreur: [
        ...refusees.map(r => `${r.numero} refusée : ${r.raisons.join(' ; ')}`),
        ...echecs.map(e => `${e.numero} : ${e.erreur}`),
      ].join(' | ').slice(0, 2000) || null,
      duree_ms: Date.now() - t0,
    })
  }

  return NextResponse.json({ ok: echecs.length === 0, ...bilan })
}

export const GET = traiter
export const POST = traiter
