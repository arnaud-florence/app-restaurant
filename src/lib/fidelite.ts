// Module fidélité — logique serveur.
// - Lit la config depuis `parametres`
// - Crédite les points à l'encaissement
// - Recalcule le niveau de fidélité après mouvement
//
// Le calcul nb_visites/total_depense est dérivé de la table `commandes` filtrée
// par client_id et statut='encaisse'. Donc on n'a pas besoin de stocker un compteur
// dénormalisé : on peut le recalculer à chaque crédit.

import { createClient } from '@/lib/supabase/server'
import { calculerNiveau, type NiveauFidelite } from '@/lib/clients'
import { CONFIG_FIDELITE_DEFAULT, pointsPourMontant, type ConfigFidelite } from '@/lib/fidelite-types'

export async function getConfigFidelite(): Promise<ConfigFidelite> {
  const sb = await createClient()
  const { data } = await sb.from('parametres')
    .select('cle, valeur')
    .in('cle', [
      'fidelite.points_par_euro',
      'fidelite.auto_credit_encaissement',
      'fidelite.points_inscription',
      'fidelite.points_par_euro_remise',
    ])
  const map = new Map((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))

  return {
    points_par_euro: Number(map.get('fidelite.points_par_euro') ?? CONFIG_FIDELITE_DEFAULT.points_par_euro),
    auto_credit_encaissement: (map.get('fidelite.auto_credit_encaissement') ?? 'true').toLowerCase() === 'true',
    points_inscription: Number(map.get('fidelite.points_inscription') ?? CONFIG_FIDELITE_DEFAULT.points_inscription),
    points_par_euro_remise: Number(map.get('fidelite.points_par_euro_remise') ?? CONFIG_FIDELITE_DEFAULT.points_par_euro_remise),
  }
}

export async function setConfigFidelite(c: ConfigFidelite): Promise<void> {
  const sb = await createClient()
  const rows = [
    { cle: 'fidelite.points_par_euro',          valeur: String(c.points_par_euro) },
    { cle: 'fidelite.auto_credit_encaissement', valeur: c.auto_credit_encaissement ? 'true' : 'false' },
    { cle: 'fidelite.points_inscription',       valeur: String(c.points_inscription) },
    { cle: 'fidelite.points_par_euro_remise',   valeur: String(c.points_par_euro_remise) },
  ]
  for (const r of rows) {
    await sb.from('parametres').upsert(r, { onConflict: 'cle' })
  }
}

/**
 * Consomme des points fidélité d'un client (utilisation comme moyen de paiement).
 * Crée un mouvement négatif et décrémente le solde. Idempotent par commande_id.
 *
 * Renvoie null si rien à faire, ou { points } sur succès.
 * Throw si solde insuffisant.
 */
export async function consommerPointsFidelite(p: {
  client_id: string
  points: number          // positif (sera stocké en négatif)
  commande_id: string
  employe_id?: string | null
}): Promise<{ points: number } | null> {
  if (p.points <= 0) return null
  const sb = await createClient()

  // Idempotence : déjà une utilisation pour cette commande ?
  const { count } = await sb.from('mouvements_points')
    .select('id', { count: 'exact', head: true })
    .eq('commande_id', p.commande_id)
    .eq('type', 'utilisation')
  if ((count ?? 0) > 0) return null

  // Vérifie le solde
  const { data: cli } = await sb.from('clients')
    .select('points_fidelite, numero:id').eq('id', p.client_id).maybeSingle()
  const solde = Number(cli?.points_fidelite ?? 0)
  if (solde < p.points) {
    throw new Error(`Solde insuffisant : ${solde} pts dispo, ${p.points} demandés.`)
  }

  // Mouvement utilisation (points négatifs)
  await sb.from('mouvements_points').insert({
    client_id: p.client_id,
    type: 'utilisation',
    points: -p.points,
    motif: `Paiement fidélité commande`,
    commande_id: p.commande_id,
    employe_id: p.employe_id ?? null,
  })

  // Décrément solde
  await sb.from('clients')
    .update({ points_fidelite: Math.max(0, solde - p.points) })
    .eq('id', p.client_id)

  return { points: p.points }
}

/**
 * Recalcule nb_visites + total_depense + niveau_fidelite d'un client à partir
 * de ses commandes encaissées. Renvoie le niveau résultant.
 */
async function recalculerStatutsClient(client_id: string): Promise<NiveauFidelite> {
  const sb = await createClient()
  const { data: cmds } = await sb.from('commandes')
    .select('id, montant_total_ht, created_at')
    .eq('client_id', client_id)
    .eq('statut', 'encaisse')

  const visites = (cmds ?? []).length
  const total = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ht ?? 0), 0)
  const derniere = (cmds ?? []).map(c => c.created_at as string).sort().reverse()[0] ?? null
  const niveau = calculerNiveau(visites)

  await sb.from('clients').update({
    nb_visites: visites,
    total_depense: total,
    derniere_visite: derniere,
    niveau_fidelite: niveau,
  }).eq('id', client_id)

  return niveau
}

/**
 * Crédite les points d'une commande encaissée à un client.
 * Idempotent : si un mouvement 'gain' avec ce commande_id existe déjà, on ne re-crédite pas.
 *
 * Retour : null si aucune action (pas de client, déjà crédité, config off, montant nul).
 *          { points, niveau } si crédit effectué.
 */
export async function crediterPointsCommande(
  commande_id: string,
  employe_id?: string | null,
  // Part de l'addition HT éligible aux points (0..1). < 1 quand une partie a été
  // réglée AVEC des points : on ne gagne pas de points sur ses propres points.
  ratioEligible: number = 1,
): Promise<{ points: number; niveau: NiveauFidelite; client_id: string } | null> {
  const sb = await createClient()

  const config = await getConfigFidelite()
  if (!config.auto_credit_encaissement) return null

  const { data: cmd } = await sb.from('commandes')
    .select('id, client_id, montant_total_ht, numero')
    .eq('id', commande_id).maybeSingle()
  if (!cmd?.client_id) return null

  // Idempotence : on ne re-crédite pas si gain déjà existant pour cette commande
  const { count } = await sb.from('mouvements_points')
    .select('id', { count: 'exact', head: true })
    .eq('commande_id', commande_id)
    .eq('type', 'gain')
  if ((count ?? 0) > 0) return null

  const ratio = Math.min(1, Math.max(0, ratioEligible))
  const points = pointsPourMontant(Number(cmd.montant_total_ht ?? 0) * ratio, config.points_par_euro)
  if (points <= 0) return null

  // Insert mouvement
  await sb.from('mouvements_points').insert({
    client_id: cmd.client_id,
    type: 'gain',
    points,
    motif: `Encaissement commande ${cmd.numero ?? ''}`.trim(),
    commande_id,
    employe_id: employe_id ?? null,
  })

  // Update solde
  const { data: cli } = await sb.from('clients')
    .select('points_fidelite').eq('id', cmd.client_id).maybeSingle()
  const nouveauSolde = Number(cli?.points_fidelite ?? 0) + points
  await sb.from('clients')
    .update({ points_fidelite: nouveauSolde })
    .eq('id', cmd.client_id)

  // Recalcul nb_visites + niveau
  const niveau = await recalculerStatutsClient(cmd.client_id as string)

  return { points, niveau, client_id: cmd.client_id as string }
}

/**
 * Ajustement manuel par un manager (gain ou perte de points hors encaissement).
 * Met à jour le solde et historise le mouvement.
 */
export async function ajusterPointsManuel(p: {
  client_id: string
  delta: number             // signé : -50 = retirer 50 ; +30 = ajouter 30
  motif: string
  employe_id?: string | null
}): Promise<{ nouveauSolde: number }> {
  const sb = await createClient()
  if (p.delta === 0) throw new Error('Delta zéro')

  const type = p.delta > 0 ? 'ajustement' : 'utilisation'
  await sb.from('mouvements_points').insert({
    client_id: p.client_id,
    type,
    points: p.delta,
    motif: p.motif,
    employe_id: p.employe_id ?? null,
  })

  const { data: cli } = await sb.from('clients')
    .select('points_fidelite').eq('id', p.client_id).maybeSingle()
  const nouveauSolde = Math.max(0, Number(cli?.points_fidelite ?? 0) + p.delta)
  await sb.from('clients')
    .update({ points_fidelite: nouveauSolde })
    .eq('id', p.client_id)

  return { nouveauSolde }
}
