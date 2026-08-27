// Rapprochement quotidien caisse ↔ outil (migration 0139).
//
// Le miroir `encaissements_externes` dit ce qu'on a REÇU de la caisse ; les
// `commandes` disent ce qu'on en a COMPRIS. Entre les deux il y a du code, et
// du code se trompe en silence.
//
// Sans ce contrôle, une ingestion qui perd 3 % des lignes depuis six semaines
// ne se voit nulle part : le chiffre d'affaires reste juste — il vient des
// totaux — et seules les marges dérivent. On finit par accuser les
// fournisseurs d'avoir augmenté leurs prix.
//
// Server-only (accès base).

import { createClient } from '@/lib/supabase/server'

/** Tolérance sur les arrondis d'un jour entier. Au-delà, ce n'est plus un
 *  arrondi : c'est un ticket ou une ligne qui manque. */
const TOLERANCE_EUR = 0.05

export type Rapprochement = {
  date_jour: string
  source_caisse: string
  tickets_recus: number
  montant_recu: number
  commandes_liees: number
  montant_commandes: number
  lignes_posees: number
  ecart_montant: number
  ecart_tickets: number
  tva_recue: Record<string, number>
  tva_commandes: Record<string, number>
  statut: 'ok' | 'ecart' | 'incomplet'
  detail: {
    tickets_sans_commande: string[]
    commandes_sans_ligne: string[]
    ecarts_tva: Array<{ taux: string; recu: number; commande: number }>
  }
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/**
 * Calcule le rapprochement d'une journée pour une caisse donnée.
 * Ne l'écrit pas : `enregistrerRapprochement` s'en charge.
 */
export async function calculerRapprochement(
  dateJour: string,
  sourceCaisse: string,
): Promise<Rapprochement> {
  const sb = await createClient()

  // Bornes de la journée en heure de Paris. On lit large puis on filtre
  // exactement : `encaisse_at` est en UTC, et un ticket de 23 h 40 heure
  // française appartient au jour d'avant en UTC l'été.
  const debut = new Date(`${dateJour}T00:00:00+02:00`)
  const fin = new Date(`${dateJour}T23:59:59.999+02:00`)

  const { data: recus } = await sb
    .from('encaissements_externes')
    .select('ticket_externe, commande_id, montant_ttc, ventilation_tva, encaisse_at')
    .eq('source_caisse', sourceCaisse)
    .gte('encaisse_at', new Date(debut.getTime() - 36 * 3600_000).toISOString())
    .lte('encaisse_at', new Date(fin.getTime() + 36 * 3600_000).toISOString())

  type Recu = {
    ticket_externe: string; commande_id: string | null
    montant_ttc: number | string | null
    ventilation_tva: Record<string, number> | null
    encaisse_at: string | null
  }
  const dansLeJour = ((recus ?? []) as Recu[]).filter(r => {
    if (!r.encaisse_at) return false
    const t = new Date(r.encaisse_at).getTime()
    return t >= debut.getTime() && t <= fin.getTime()
  })

  const tvaRecue: Record<string, number> = {}
  let montantRecu = 0
  const sansCommande: string[] = []
  const idsCommandes: string[] = []
  for (const r of dansLeJour) {
    montantRecu += Number(r.montant_ttc ?? 0)
    for (const [taux, v] of Object.entries(r.ventilation_tva ?? {})) {
      tvaRecue[taux] = arrondi((tvaRecue[taux] ?? 0) + Number(v))
    }
    if (r.commande_id) idsCommandes.push(String(r.commande_id))
    else sansCommande.push(r.ticket_externe)
  }

  // Côté outil : les commandes effectivement liées à ces tickets.
  let montantCommandes = 0
  let lignesPosees = 0
  const tvaCommandes: Record<string, number> = {}
  const sansLigne: string[] = []

  for (let i = 0; i < idsCommandes.length; i += 100) {
    const lot = idsCommandes.slice(i, i + 100)
    const { data: cmds } = await sb
      .from('commandes')
      .select('id, numero, montant_total_ttc, ventilation_tva')
      .in('id', lot)
    for (const c of cmds ?? []) {
      montantCommandes += Number(c.montant_total_ttc ?? 0)
      for (const [taux, v] of Object.entries((c.ventilation_tva ?? {}) as Record<string, number>)) {
        tvaCommandes[taux] = arrondi((tvaCommandes[taux] ?? 0) + Number(v))
      }
    }
    const { data: arts } = await sb
      .from('commande_articles')
      .select('commande_id')
      .in('commande_id', lot)
    lignesPosees += (arts ?? []).length
    // Une commande de caisse sans aucune ligne : son montant est juste, mais
    // ni le stock ni la marge ne sauront jamais ce qui a été vendu.
    const avecLigne = new Set((arts ?? []).map(a => String(a.commande_id)))
    for (const c of cmds ?? []) {
      if (!avecLigne.has(String(c.id))) sansLigne.push(String(c.numero ?? c.id))
    }
  }

  const ecartMontant = arrondi(montantRecu - montantCommandes)
  const ecartTickets = dansLeJour.length - idsCommandes.length

  const ecartsTva: Array<{ taux: string; recu: number; commande: number }> = []
  for (const taux of new Set([...Object.keys(tvaRecue), ...Object.keys(tvaCommandes)])) {
    const a = tvaRecue[taux] ?? 0, b = tvaCommandes[taux] ?? 0
    if (Math.abs(a - b) > TOLERANCE_EUR) ecartsTva.push({ taux, recu: a, commande: b })
  }

  // « incomplet » plutôt que « ecart » quand des lignes manquent : le CA est
  // juste, c'est le détail qui manque. Les deux méritent d'être vus, mais pas
  // avec la même urgence.
  const statut: Rapprochement['statut'] =
    Math.abs(ecartMontant) > TOLERANCE_EUR || ecartTickets !== 0 || ecartsTva.length > 0
      ? 'ecart'
      : sansLigne.length > 0
        ? 'incomplet'
        : 'ok'

  return {
    date_jour: dateJour,
    source_caisse: sourceCaisse,
    tickets_recus: dansLeJour.length,
    montant_recu: arrondi(montantRecu),
    commandes_liees: idsCommandes.length,
    montant_commandes: arrondi(montantCommandes),
    lignes_posees: lignesPosees,
    ecart_montant: ecartMontant,
    ecart_tickets: ecartTickets,
    tva_recue: tvaRecue,
    tva_commandes: tvaCommandes,
    statut,
    detail: {
      tickets_sans_commande: sansCommande.slice(0, 50),
      commandes_sans_ligne: sansLigne.slice(0, 50),
      ecarts_tva: ecartsTva,
    },
  }
}

/** Écrit (ou réécrit) le rapprochement du jour. Rejouable. */
export async function enregistrerRapprochement(r: Rapprochement): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('rapprochements_caisse').upsert({
    ...r,
    calcule_at: new Date().toISOString(),
  }, { onConflict: 'date_jour,source_caisse' })
  if (error) throw new Error(error.message)
}
