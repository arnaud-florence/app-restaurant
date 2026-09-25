// GET /api/public/creneaux-retrait?date=YYYY-MM-DD
// Calcule les créneaux disponibles pour le retrait des commandes ONLINE.
// Logique :
//   1. Lit la config capacite_cuisine_par_creneau pour la zone SNACKING
//      (par défaut — pourra être paramétrable plus tard).
//   2. Découpe en créneaux de duree_creneau_min minutes.
//   3. Pour chaque créneau, compte les commandes ONLINE déjà créées avec
//      creneau_retrait dans cette tranche.
//   4. Renvoie disponible=true s'il reste de la place, sinon false.
//
// ⚠️ LA CAPACITÉ SE COMPTE EN ARTICLES, PAS EN COMMANDES (0153). Le gérant
// tient 4 pizzas par quart d'heure : compter les commandes laisserait passer
// quatre clients de trois pizzas, soit douze pizzas dans le même créneau. Le
// four ne suit pas, et le réglage affiche pourtant bien « 4 ».
//
// Le champ `restant` est rendu au client pour qu'il puisse écarter les
// créneaux trop justes POUR SON panier : un panier de 3 pizzas n'a rien à
// faire sur un créneau où il reste une place.

import { getActivation } from '@/lib/activation/server'
import { getConfigLivraisonSoir } from '@/lib/livraison-soir-server'
import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { creneauxOccupes, tientAPartirDe } from '@/lib/creneaux-duree'

// Helper : construit un ISO UTC qui, affiché en Europe/Paris, donne HH:MM le jour `dateStr`.
// Évite le décalage de 2h (été) ou 1h (hiver) entre le serveur Vercel UTC et l'heure FR.
function parisIsoFor(dateStr: string, hh: number, mm: number): string {
  const naive = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(naive)
  const parisH = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const parisM = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const diffMin = (parisH * 60 + parisM) - (hh * 60 + mm)
  return new Date(naive.getTime() - diffMin * 60_000).toISOString()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'creneaux-retrait', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const dateStr = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const tag = url.searchParams.get('tag') ?? 'SNACKING'
  // Taille du panier : une grosse commande occupe plusieurs créneaux, et ne
  // peut donc pas commencer n'importe où. Sans ce paramètre on rendrait des
  // horaires que le serveur refuserait ensuite.
  const articles = Math.max(1, Number(url.searchParams.get('articles') ?? '1') || 1)
  // ⚠️ La LIVRAISON du soir n'a pas les mêmes bornes que le retrait : elle
  // s'arrête plus tôt, et sa contrainte n'est pas le four mais la ROUTE.
  const livraison = url.searchParams.get('mode') === 'livraison'

  // Validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return Response.json({ error: 'date invalide (YYYY-MM-DD)' }, { status: 400, headers: corsHeaders(req.headers.get('origin')) })
  }
  if (!['SNACKING', 'PIZZA', 'BAR'].includes(tag)) {
    return Response.json({ error: 'tag invalide' }, { status: 400, headers: corsHeaders(req.headers.get('origin')) })
  }

  const date = new Date(dateStr + 'T00:00:00')
  const jourSemaine = date.getDay()  // 0=dim, 6=sam

  const sb = await createClient()
  const { data: configs } = await sb.from('capacite_cuisine_par_creneau')
    .select('heure_debut, heure_fin, duree_creneau_min, max_articles')
    .eq('jour_semaine', jourSemaine)
    .eq('tag_destination', tag)
    .eq('actif', true)

  if (!configs || configs.length === 0) {
    return Response.json({ items: [], message: `Pas de service ${tag} ce jour` }, {
      headers: {
        ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
        'Cache-Control': 'public, s-maxage=120',
      },
    })
  }

  // Articles DE CE TAG déjà engagés sur la journée, avec l'heure de leur
  // commande. On compte ONLINE *et* COMPTOIR — une commande prise au comptoir
  // charge le même four.
  //
  // ⚠️ Le filtre par TAG est indispensable : sans lui, une baguette à retirer
  // à 19 h occupait un créneau de pizza. Les heures rondes du fournil et les
  // quarts d'heure de la pizzeria se croisent tous les soirs.
  const dayStart = new Date(dateStr + 'T00:00:00').toISOString()
  const dayEnd = new Date(dateStr + 'T23:59:59').toISOString()
  const { data: cmds } = await sb.from('commandes')
    .select('creneau_retrait, commande_articles!inner(quantite, tag_destination)')
    .eq('commande_articles.tag_destination', tag)
    .in('source', ['ONLINE', 'COMPTOIR'])
    .not('statut', 'in', '(annule)')
    .gte('creneau_retrait', dayStart)
    .lte('creneau_retrait', dayEnd)

  const slots: Array<{ heure: string; iso: string; disponible: boolean; restant: number; max: number }> = []
  const now = new Date()

  for (const cfg of configs) {
    const debut = (cfg.heure_debut as string).slice(0, 5)  // HH:MM
    const fin = (cfg.heure_fin as string).slice(0, 5)
    const duree = Number(cfg.duree_creneau_min ?? 15)
    const max = Number(cfg.max_articles ?? 5)

    const [hd, md] = debut.split(':').map(Number)
    const [hf, mf] = fin.split(':').map(Number)
    let curMin = hd * 60 + md
    const endMin = hf * 60 + mf

    while (curMin < endMin) {
      const h = Math.floor(curMin / 60)
      const m = curMin % 60
      const heureStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const slotIso = parisIsoFor(dateStr, h, m)
      const slotStartMs = new Date(slotIso).getTime()
      const slotEndMs = slotStartMs + duree * 60_000

      // Skip si déjà passé (avec marge 15 min)
      if (slotStartMs < now.getTime() + 15 * 60_000) {
        curMin += duree
        continue
      }

      // Somme des ARTICLES de ce tag déjà engagés sur ce créneau.
      const engages = (cmds ?? []).reduce((n, c) => {
        if (!c.creneau_retrait) return n
        const t = new Date(c.creneau_retrait as string).getTime()
        if (t < slotStartMs || t >= slotEndMs) return n
        const lignes = (c.commande_articles ?? []) as Array<{ quantite: number }>
        return n + lignes.reduce((q, l) => q + Number(l.quantite ?? 0), 0)
      }, 0)

      const restant = Math.max(0, max - engages)
      slots.push({ heure: heureStr, iso: slotIso, disponible: restant > 0, restant, max })
      curMin += duree
    }
  }

  // ─── La commande tient-elle À PARTIR d'ici ? ─────────────────────
  //
  // Un créneau libre ne suffit pas : une commande de 12 pizzas occupe une
  // demi-heure, donc CE créneau et le suivant. Et elle ne peut pas commencer
  // à 21h45 — le service ferme à 22h, les créneaux nécessaires n'existent
  // pas. Le dire ici évite de proposer un horaire que la validation refusera,
  // à la dernière étape, après la saisie des coordonnées.
  const restants = slots.map(s => s.restant)
  let items = slots.map((s, i) => ({
    ...s,
    disponible: tientAPartirDe(restants, i, articles),
    creneauxOccupes: creneauxOccupes(articles),
  }))

  // ─── La tournée du SOIR ─────────────────────────────────────────────
  //
  // Deux contraintes se superposent, et elles n'ont rien à voir :
  //   · le FOUR, déjà calculé au-dessus (8 pizzas par quart d'heure) ;
  //   · la ROUTE — un livreur ne fait pas quatre adresses en quinze minutes.
  //
  // ⚠️ Ne garder que la première ferait accepter des commandes que personne
  // ne peut porter, et c'est le client qui l'apprendrait, sur son pas de
  // porte. On compte donc les COMMANDES (un arrêt) et non les articles :
  // trois pizzas à une seule adresse, c'est un seul arrêt.
  // ⚠️ La réponse dit TOUJOURS si la livraison du soir est ouverte, même quand
  // on demande des créneaux de retrait. Sinon le site doit faire un second
  // appel juste pour savoir s'il peut proposer le bouton — et deux sources
  // pour la même information finissent par se contredire.
  const etatAct = await getActivation()
  const cfgSoirInfo = await getConfigLivraisonSoir()
  const livraisonSoir = {
    ouverte: tag === 'PIZZA' && etatAct.pizzeria === true,
    debut: cfgSoirInfo.debut,
    fin: cfgSoirInfo.fin,
    communes: cfgSoirInfo.communes,
    minimumTtc: cfgSoirInfo.minimumTtc,
    fraisTtc: cfgSoirInfo.fraisTtc,
  }

  if (livraison) {
    const cfgSoir = cfgSoirInfo
    const hhmm = (iso: string) => new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)).replace('h', ':')

    const { data: livs } = await sb
      .from('commandes')
      .select('creneau_retrait')
      .eq('mode_retrait', 'livraison')
      .not('statut', 'in', '(annule)')
      .gte('creneau_retrait', `${dateStr}T00:00:00Z`)
      .lt('creneau_retrait', `${dateStr}T23:59:59Z`)

    const prises = new Map<string, number>()
    for (const l of livs ?? []) {
      const k = String(l.creneau_retrait)
      prises.set(k, (prises.get(k) ?? 0) + 1)
    }

    items = items
      .filter(it => {
        const h = hhmm(it.iso)
        return h >= cfgSoir.debut && h <= cfgSoir.fin
      })
      .map(it => ({
        ...it,
        disponible: it.disponible && (prises.get(it.iso) ?? 0) < cfgSoir.capaciteParCreneau,
      }))
  }

  return Response.json({
    date: dateStr, tag, articles, mode: livraison ? 'livraison' : 'retrait',
    livraison_soir: livraisonSoir,
    creneauxOccupes: creneauxOccupes(articles),
    items, count: items.length,
  }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=30',   // cache court car capacités évoluent vite
    },
  })
}
