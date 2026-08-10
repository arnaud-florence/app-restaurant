// Arnaud côté SALARIÉ — « Arnaud t'aide aujourd'hui ».
// Assemble, pour LE salarié connecté, ses tâches du jour à ne pas oublier,
// à partir des données déjà présentes (hygiène, DLC, nettoyage, certifs).
// 100% déterministe (pas d'IA), lecture seule. Côté serveur uniquement.

import { createClient } from '@/lib/supabase/server'
import { type RappelSalarie, type RappelsSalarie } from './types'

const CUISINE_POSTES = new Set(['cuisine', 'cuisinier', 'pizzaiolo', 'second', 'cuisinier_snacking', 'plonge'])

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function frDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR') } catch { return iso }
}
/** Une tâche concerne le salarié si elle n'est ciblée sur aucun poste, ou matche le sien.
 *  Les polyvalents / manager / second voient tout. */
function posteMatch(taskPoste: string | null | undefined, empPoste: string | null): boolean {
  const t = String(taskPoste ?? '').toLowerCase().trim()
  if (!t || t === 'tous' || t === 'tout' || t === 'tous postes') return true
  const e = String(empPoste ?? '').toLowerCase().trim()
  if (!e || e === 'manager' || e === 'gerant' || e === 'polyvalent' || e === 'second') return true
  return t.includes(e) || e.includes(t)
}

export async function getRappelsPourEmploye(employeId: string, poste: string | null): Promise<RappelsSalarie> {
  if (!employeId) return { rappels: [] }
  const sb = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const dow = new Date().getUTCDay()   // 0 = dimanche, 1 = lundi
  const estCuisine = CUISINE_POSTES.has(String(poste ?? '').toLowerCase())

  const [procRes, checkRes, tempRes, lotsRes, nettoyageRes, certifRes] = await Promise.all([
    sb.from('procedures_hygiene').select('id, titre, moment, poste_concerne').eq('actif', true).in('moment', ['ouverture', 'fermeture', 'hebdomadaire']),
    sb.from('checklists_hygiene').select('procedure_id').eq('date_realisation', today).eq('valide', true),
    sb.from('releves_temperatures').select('id', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00'),
    sb.from('lots_produits').select('id', { count: 'exact', head: true }).eq('statut', 'en_stock').not('dlc', 'is', null).lte('dlc', addDaysISO(today, 2)),
    sb.from('plan_nettoyage').select('id, zone, equipement, frequence, responsable_poste, derniere_execution').eq('actif', true),
    sb.from('formations_employes').select('formation, titre, date_expiration').eq('employe_id', employeId).not('date_expiration', 'is', null).gte('date_expiration', today).lte('date_expiration', addDaysISO(today, 30)),
  ])

  const rappels: RappelSalarie[] = []
  const faites = new Set((checkRes.data ?? []).map(r => r.procedure_id as string))

  // 1) Checklists hygiène dues (ouverture / fermeture / hebdo), non faites
  for (const p of (procRes.data ?? [])) {
    if (faites.has(p.id as string)) continue
    if (!posteMatch(p.poste_concerne as string, poste)) continue
    const m = p.moment as string
    const lbl = m === 'ouverture' ? 'ouverture' : m === 'fermeture' ? 'fermeture' : 'hebdo'
    rappels.push({
      id: `chk-${p.id}`, emoji: '✅',
      titre: `Checklist ${lbl} : ${p.titre}`,
      detail: "Pas encore cochée aujourd'hui.",
      urgence: m === 'fermeture' ? 'info' : 'orange',
      cta_url: '/admin/hygiene', cta_label: 'Cocher',
    })
  }

  // 2) Relevés de température du jour (cuisine), si aucun encore
  if (estCuisine && (tempRes.count ?? 0) === 0) {
    rappels.push({
      id: 'temp', emoji: '🌡️',
      titre: 'Relevés de température du jour à faire',
      detail: 'Aucun relevé enregistré aujourd\'hui.',
      urgence: 'orange', cta_url: '/admin/hygiene', cta_label: 'Relever',
    })
  }

  // 3) DLC proches (cuisine)
  if (estCuisine && (lotsRes.count ?? 0) > 0) {
    rappels.push({
      id: 'dlc', emoji: '📅',
      titre: `${lotsRes.count} lot(s) proche(s) de la DLC`,
      detail: 'À écouler en priorité ou à vérifier.',
      urgence: 'orange', cta_url: '/admin/hygiene', cta_label: 'Voir',
    })
  }

  // 4) Nettoyage dû aujourd'hui (selon fréquence + poste responsable)
  for (const n of (nettoyageRes.data ?? [])) {
    if (!posteMatch(n.responsable_poste as string, poste)) continue
    const f = n.frequence as string
    const due = f === 'quotidien' || f === 'apres_service' || (f === 'hebdo' && dow === 1)
    if (!due) continue
    if (n.derniere_execution && (n.derniere_execution as string) >= today) continue
    rappels.push({
      id: `net-${n.id}`, emoji: '🧴',
      titre: `Nettoyage : ${n.zone}${n.equipement ? ' — ' + n.equipement : ''}`,
      detail: f === 'apres_service' ? 'À faire après le service.' : 'Prévu aujourd\'hui.',
      urgence: 'info', cta_url: '/admin/hygiene', cta_label: 'Fait',
    })
  }

  // 5) Certif / formation obligatoire qui expire (≤ 30 j)
  for (const c of (certifRes.data ?? [])) {
    rappels.push({
      id: `cert-${c.formation}`, emoji: '🎓',
      titre: `Ta formation « ${c.titre} » expire bientôt`,
      detail: `Échéance le ${frDate(c.date_expiration as string)}. Préviens le gérant pour la renouveler.`,
      urgence: 'orange',
    })
  }

  const rang: Record<string, number> = { rouge: 0, orange: 1, info: 2 }
  rappels.sort((a, b) => (rang[a.urgence] ?? 9) - (rang[b.urgence] ?? 9))
  return { rappels: rappels.slice(0, 12) }
}
