'use server'

// Server actions pour /mon-espace : pointage rapide arrivée/sortie.
// Sécurité : un employé ne peut pointer que pour SON propre profil
// (verrouillé via getProfile().employe_id).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { detecterEtNotifier } from '@/lib/challenges-notif'
import { creerNotification } from '@/lib/notifications'
import { getRappelsPourEmploye } from '@/lib/co-gerant/rappels-salarie'
import { sendPushToEmployeRateLimited } from '@/lib/push'

function todayISO() { return new Date().toISOString().slice(0, 10) }
function nowTimeISO() { return new Date().toTimeString().slice(0, 8) }

export async function pointerArrivee(): Promise<{ ok: true; heure: string }> {
  const profil = await getProfile()
  if (!profil?.employe_id) throw new Error('Profil non rattaché à un employé.')
  const supabase = await createClient()
  const date  = todayISO()
  const heure = nowTimeISO()

  const { data: exist } = await supabase.from('pointage')
    .select('id')
    .eq('employe_id', profil.employe_id)
    .eq('date_pointage', date)
    .maybeSingle()
  if (exist) throw new Error('Tu as déjà pointé une arrivée aujourd\'hui.')

  const { error } = await supabase.from('pointage').insert({
    employe_id:    profil.employe_id,
    date_pointage: date,
    heure_arrivee: heure,
  })
  if (error) throw new Error(error.message)

  // 🧑‍💼 Arnaud pousse les rappels du jour à la prise de poste (best-effort, plafonné 3/h)
  try {
    const r = await getRappelsPourEmploye(profil.employe_id, profil.poste ?? null)
    if (r.rappels.length) {
      const top = r.rappels.slice(0, 3).map(x => x.titre).join(' · ')
      await sendPushToEmployeRateLimited(profil.employe_id, {
        title: '🧑‍💼 Arnaud — bon service !',
        body: `À ne pas oublier : ${top}`,
        url: '/mon-espace',
        tag: 'arnaud-rappels',
      }, { maxPerHour: 3 })
    }
  } catch { /* push best-effort */ }

  revalidatePath('/mon-espace')
  return { ok: true as const, heure }
}

export async function pointerDepart(): Promise<{ ok: true; heures: number }> {
  const profil = await getProfile()
  if (!profil?.employe_id) throw new Error('Profil non rattaché à un employé.')
  const supabase = await createClient()
  const date = todayISO()

  const { data: row } = await supabase.from('pointage')
    .select('id, heure_arrivee, heure_depart')
    .eq('employe_id', profil.employe_id)
    .eq('date_pointage', date)
    .maybeSingle()
  if (!row) throw new Error('Tu n\'as pas pointé d\'arrivée aujourd\'hui.')
  if (row.heure_depart) throw new Error('Tu as déjà pointé ta sortie aujourd\'hui.')
  if (!row.heure_arrivee) throw new Error('Pointage incomplet — relance ton arrivée.')

  const heureFin = nowTimeISO()
  // Calcul heures travaillées (décimal)
  const [h1, m1] = String(row.heure_arrivee).split(':').map(Number)
  const [h2, m2] = heureFin.split(':').map(Number)
  let diffMin = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (diffMin < 0) diffMin += 24 * 60                // overnight (peu probable mais safe)
  const heures = Math.round((diffMin / 60) * 100) / 100

  const { error } = await supabase.from('pointage')
    .update({ heure_depart: heureFin, heures_travaillees: heures })
    .eq('id', row.id)
  if (error) throw new Error(error.message)

  // Détecte si des challenges viennent d'être atteints + push notif
  try { await detecterEtNotifier(profil.employe_id, profil.poste) }
  catch { /* best-effort */ }

  revalidatePath('/mon-espace')
  return { ok: true as const, heures }
}

// ─── Demande de congé par l'employé ─────────────────────────────
const congeSchema = z.object({
  employe_id: z.string().uuid(),
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:       z.enum(['conge', 'absence', 'maladie', 'formation']),
  notes:      z.string().max(500).optional().nullable(),
})

export async function demanderConge(input: unknown): Promise<{ ok: true }> {
  const p = congeSchema.parse(input)
  const profil = await getProfile()
  if (!profil) throw new Error('Non connecté.')
  // Sécurité : un employé ne peut demander que pour son propre profil (sauf manager)
  if (profil.role !== 'manager' && profil.employe_id !== p.employe_id) {
    throw new Error('Tu ne peux demander qu\'au nom de ton propre profil.')
  }
  if (new Date(p.date_fin) < new Date(p.date_debut)) {
    throw new Error('Date de fin antérieure à la date de début.')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('conges').insert({
    employe_id: p.employe_id,
    date_debut: p.date_debut,
    date_fin:   p.date_fin,
    type:       p.type,
    statut:     'demande',
    notes:      p.notes ?? null,
  })
  if (error) throw new Error(error.message)

  // Notif aux managers
  const { data: emp } = await supabase.from('employes').select('prenom, nom').eq('id', p.employe_id).maybeSingle()
  const nom = emp ? `${emp.prenom} ${emp.nom}` : 'Un employé'
  await creerNotification({
    destinataire_employe_id: null,    // null = managers
    type: 'conge_demande',
    titre: `Nouvelle demande de congé — ${nom}`,
    message: `${p.type} du ${p.date_debut} au ${p.date_fin}${p.notes ? ` · ${p.notes}` : ''}`,
    url_action: '/admin/rh',
  })

  revalidatePath('/mon-espace')
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

export async function corrigerArrivee(input: { heure: string }): Promise<{ ok: true }> {
  // Permet à l'employé de corriger son heure d'arrivée (oubli rare).
  // Restreint : uniquement son pointage du jour, et seulement si départ pas encore saisi.
  const profil = await getProfile()
  if (!profil?.employe_id) throw new Error('Profil non rattaché.')
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.heure)) throw new Error('Heure invalide')

  const supabase = await createClient()
  const date = todayISO()
  const { data: row } = await supabase.from('pointage')
    .select('id, heure_depart')
    .eq('employe_id', profil.employe_id)
    .eq('date_pointage', date)
    .maybeSingle()
  if (!row) throw new Error('Pas de pointage aujourd\'hui.')
  if (row.heure_depart) throw new Error('Service déjà clôturé — demande au manager.')

  const heure = input.heure.length === 5 ? `${input.heure}:00` : input.heure
  const { error } = await supabase.from('pointage')
    .update({ heure_arrivee: heure })
    .eq('id', row.id)
  if (error) throw new Error(error.message)

  revalidatePath('/mon-espace')
  return { ok: true as const }
}
