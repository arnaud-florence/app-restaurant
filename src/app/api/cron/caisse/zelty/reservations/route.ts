// Synchronisation des réservations, dans les deux sens.
//
//   /api/cron/caisse/zelty/reservations[?dry=1][&jours=14]
//
//   1. MIROIR    caisse → outil : le carnet du comptoir entre dans l'outil
//   2. ÉMISSION  outil → caisse : les demandes du site montent sur la caisse
//
// Deux registres qui ne se parlent pas divergent toujours. Le soir de
// l'inauguration, ça veut dire deux familles à la même table.
//
// ⚠️ `?dry=1` traduit et montre SANS RIEN ÉCRIRE, ni chez nous ni chez eux.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appelZelty, zeltyConfigure } from '@/lib/integrations/zelty/client'
import { journaliser } from '@/lib/integrations/journal'
import {
  reponseBookings, normaliser, versZelty,
} from '@/lib/integrations/zelty/reservations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Les jours à rapprocher, à partir d'aujourd'hui.
 *  ⚠️ `GET /bookings` ne répond QUE jour par jour — il n'existe aucun filtre
 *  par période. Une fenêtre de 14 jours coûte donc 14 appels, et c'est le
 *  prix à payer ; demander sans `?date=` rendrait une liste vide sans erreur,
 *  et le miroir se croirait à jour. */
function joursAVenir(n: number): string[] {
  const out: string[] = []
  const paris = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const base = new Date()
  for (let i = 0; i < n; i++) {
    out.push(paris.format(new Date(base.getTime() + i * 86_400_000)))
  }
  return out
}

export async function POST(req: Request) { return traiter(req) }
export async function GET(req: Request) { return traiter(req) }

async function traiter(req: Request) {
  const attendu = process.env.CRON_SECRET
  if (attendu && req.headers.get('authorization') !== `Bearer ${attendu}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const jours = Math.min(60, Math.max(1, Number(url.searchParams.get('jours') ?? '14') || 14))

  // Une caisse pas encore branchée n'est pas une panne : le monitoring compte
  // tout code ≠ 200 comme une erreur.
  if (!zeltyConfigure()) {
    return NextResponse.json({ configure: false, message: 'Zelty non configuré' })
  }

  const sb = await createClient()
  const avertissements: string[] = []
  const miroir = { lues: 0, creees: 0, majs: 0, ignorees: 0 }
  const emission = { candidates: 0, envoyees: 0, refusees: 0 }

  // ─── 1. MIROIR : la caisse vers nous ────────────────────────────────────
  for (const date of joursAVenir(jours)) {
    const rep = await appelZelty(`/bookings?date=${date}`)
    if (!rep.ok) { avertissements.push(`lecture du ${date} : ${rep.erreur}`); continue }

    const parsed = reponseBookings.safeParse(rep.data)
    if (!parsed.success) {
      avertissements.push(`réponse illisible pour le ${date} : ${parsed.error.issues[0].message}`)
      continue
    }

    for (const brut of parsed.data.bookings) {
      miroir.lues++
      const n = normaliser(brut)
      if (!n.ok) { avertissements.push(n.motif); miroir.ignorees++; continue }
      avertissements.push(...n.avertissements)
      const r = n.resa

      // ⚠️ Une réservation que NOUS avons envoyée revient par le miroir. La
      // réécrire créerait un doublon : son `remote_id` porte notre identifiant,
      // c'est lui qui fait foi.
      const notreId = (brut as { remote_id?: string | null }).remote_id ?? null

      const { data: deja } = await sb.from('reservations_tables')
        .select('id, statut')
        .or(`caisse_externe_id.eq.${r.caisse_externe_id}${notreId ? `,id.eq.${notreId}` : ''}`)
        .limit(1).maybeSingle()

      if (dry) { deja ? miroir.majs++ : miroir.creees++; continue }

      if (deja) {
        // Le statut de la caisse fait foi : c'est là que l'équipe travaille
        // pendant le service. Tout le reste est laissé tel quel — une note
        // prise chez nous ne doit pas disparaître.
        const patch: Record<string, unknown> = {
          statut: r.statut,
          caisse_externe_systeme: 'zelty',
          caisse_externe_id: r.caisse_externe_id,
          caisse_externe_at: new Date().toISOString(),
        }
        if (deja.statut !== r.statut || !notreId) {
          await sb.from('reservations_tables').update(patch).eq('id', deja.id)
          miroir.majs++
        } else miroir.ignorees++
      } else {
        // ⚠️ ON NE CRÉE PAS une ligne pour une réservation DÉJÀ annulée ou
        // terminée. Personne n'ira accueillir ce client, et surtout : une
        // annulée supprimée à la main pour nettoyer le carnet REVIENDRAIT au
        // passage suivant, indéfiniment. Constaté le 24/09/2026 en rejouant
        // la synchronisation après un essai.
        //
        // Une annulation reste bien répercutée sur une réservation qu'on
        // connaît déjà — c'est la branche du dessus, et c'est tout l'intérêt
        // du miroir. Ce qui est écarté ici, c'est la CRÉATION d'un mort-né.
        if (r.statut === 'annulee' || r.statut === 'terminee') { miroir.ignorees++; continue }

        const { error } = await sb.from('reservations_tables').insert({
          client_nom: r.client_nom,
          client_telephone: r.client_telephone,
          client_email: r.client_email,
          nb_personnes: r.nb_personnes,
          date_resa: r.date_resa,
          heure_arrivee: r.heure_arrivee,
          notes: r.notes,
          statut: r.statut,
          canal: r.canal,
          caisse_externe_systeme: r.caisse_externe_systeme,
          caisse_externe_id: r.caisse_externe_id,
          caisse_externe_at: new Date().toISOString(),
        })
        if (error) { avertissements.push(`insert ${r.caisse_externe_id} : ${error.message}`); miroir.ignorees++ }
        else miroir.creees++
      }
    }
  }

  // ─── 2. ÉMISSION : nous vers la caisse ──────────────────────────────────
  // Seulement ce qui n'est jamais parti, et seulement à venir : injecter une
  // réservation passée ne sert personne et brouille le carnet.
  const aujourdhui = joursAVenir(1)[0]
  const { data: aEnvoyer } = await sb.from('reservations_tables')
    .select('id, date_resa, heure_arrivee, nb_personnes, client_nom, client_telephone, client_email, notes, statut')
    .is('caisse_externe_id', null)
    .in('statut', ['demande', 'confirmee'])
    .gte('date_resa', aujourdhui)
    .order('date_resa')
    .limit(50)

  for (const r of aEnvoyer ?? []) {
    emission.candidates++
    const corps = versZelty({
      id: r.id as string,
      date_resa: r.date_resa as string,
      heure_arrivee: String(r.heure_arrivee).slice(0, 5),
      nb_personnes: r.nb_personnes as number,
      client_nom: r.client_nom as string,
      client_telephone: (r.client_telephone as string) ?? null,
      client_email: (r.client_email as string) ?? null,
      notes: (r.notes as string) ?? null,
      statut: r.statut as string,
    })
    if (!corps.ok) { avertissements.push(`résa ${r.id} : ${corps.motif}`); emission.refusees++; continue }
    if (dry) { emission.envoyees++; continue }

    const rep = await appelZelty('/bookings', { method: 'POST', body: corps.corps })
    if (!rep.ok) { avertissements.push(`envoi ${r.id} : ${rep.erreur}`); emission.refusees++; continue }

    const cree = (rep.data as { booking?: { id?: number } }).booking
    if (!cree?.id) {
      // ⚠️ Sans identifiant en retour, on ne marque RIEN : le prochain passage
      // réessaiera. Marquer « parti » sans preuve perdrait la réservation.
      avertissements.push(`envoi ${r.id} : aucun identifiant rendu par la caisse`)
      emission.refusees++
      continue
    }
    await sb.from('reservations_tables').update({
      caisse_externe_systeme: 'zelty',
      caisse_externe_id: String(cree.id),
      caisse_externe_at: new Date().toISOString(),
    }).eq('id', r.id)
    emission.envoyees++
  }

  const resultat = { dry, jours, miroir, emission, avertissements: avertissements.slice(0, 40) }
  // Le journal ne lève jamais : perdre une synchronisation réussie parce que
  // sa trace n'a pas pu s'écrire serait absurde.
  await journaliser({
    sens: 'entrant', systeme: 'zelty', type: 'reservations',
    statut: avertissements.length === 0 ? 'succes' : 'echec',
    resultat, erreur: avertissements[0] ?? null,
  })
  return NextResponse.json(resultat)
}
